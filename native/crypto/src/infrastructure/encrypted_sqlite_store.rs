//! SQLite-backed `SecureStore`. Every stored payload is sealed with ChaCha20-Poly1305
//! (see `payload_cipher`); index columns hold only opaque ids and timestamps. The key is
//! supplied by the host, which keeps it wrapped by the OS keychain (Electron safeStorage on desktop,
//! the iOS Keychain on mobile).

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};

use crate::application::ports::SecureStore;
use crate::domain::error::CryptoError;
use crate::domain::message::LocalMessage;
use crate::infrastructure::payload_cipher::PayloadCipher;

pub struct EncryptedSqliteStore {
    conn: Mutex<Connection>,
    cipher: PayloadCipher,
}

fn storage_err(e: rusqlite::Error) -> CryptoError {
    CryptoError::Storage(e.to_string())
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), canary BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS identity (id INTEGER PRIMARY KEY CHECK (id = 1), secret BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS mls_kv (k BLOB PRIMARY KEY, v BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sort_key INTEGER NOT NULL,
  payload BLOB NOT NULL,
  PRIMARY KEY (channel_id, message_id)
);
CREATE INDEX IF NOT EXISTS messages_by_channel ON messages (channel_id, sort_key DESC);
";

const CANARY: &[u8] = b"discordy-store-v1";
const AAD_CANARY: &[u8] = b"meta";
const AAD_IDENTITY: &[u8] = b"identity";
const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";

fn message_aad(channel_id: &str, message_id: &str) -> Vec<u8> {
    format!("message:{channel_id}:{message_id}").into_bytes()
}

/// Earlier builds stored an SQLCipher database, which needs OpenSSL to read. Such a file has no
/// plain SQLite header, so it is renamed aside and a fresh database is created.
fn quarantine_legacy_database(path: &Path) -> Result<(), CryptoError> {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return Ok(());
    };
    let mut header = [0u8; 16];
    let read = file.read(&mut header).map_err(|e| CryptoError::Storage(e.to_string()))?;
    drop(file);
    if read == 0 || header == SQLITE_HEADER {
        return Ok(());
    }
    let mut aside = path.as_os_str().to_owned();
    aside.push(".legacy-sqlcipher");
    std::fs::rename(path, &aside).map_err(|e| CryptoError::Storage(e.to_string()))?;
    eprintln!(
        "discordy-crypto: legacy SQLCipher database moved to {}; starting with a fresh local store",
        Path::new(&aside).display()
    );
    Ok(())
}

impl EncryptedSqliteStore {
    /// Opens (or creates) the store. `key_hex` must be 64 hex characters (256-bit key).
    pub fn open(path: &str, key_hex: &str) -> Result<Self, CryptoError> {
        let cipher = PayloadCipher::from_hex(key_hex)?;
        quarantine_legacy_database(Path::new(path))?;
        let conn = Connection::open(path).map_err(storage_err)?;
        Self::initialise(conn, cipher)
    }

    pub fn open_in_memory(key_hex: &str) -> Result<Self, CryptoError> {
        let cipher = PayloadCipher::from_hex(key_hex)?;
        let conn = Connection::open_in_memory().map_err(storage_err)?;
        Self::initialise(conn, cipher)
    }

    fn initialise(conn: Connection, cipher: PayloadCipher) -> Result<Self, CryptoError> {
        conn.execute_batch(SCHEMA).map_err(storage_err)?;
        let canary: Option<Vec<u8>> = conn
            .query_row("SELECT canary FROM meta WHERE id = 1", [], |r| r.get(0))
            .optional()
            .map_err(storage_err)?;
        match canary {
            Some(sealed) => {
                cipher
                    .open(&sealed, AAD_CANARY)
                    .map_err(|_| CryptoError::InvalidKey("wrong database key".into()))?;
            }
            None => {
                conn.execute(
                    "INSERT INTO meta (id, canary) VALUES (1, ?1)",
                    params![cipher.seal(CANARY, AAD_CANARY)?],
                )
                .map_err(storage_err)?;
            }
        }
        Ok(Self { conn: Mutex::new(conn), cipher })
    }

    fn with_conn<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T, CryptoError>) -> Result<T, CryptoError> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| CryptoError::Storage("store mutex poisoned".into()))?;
        f(&mut guard)
    }
}

impl SecureStore for EncryptedSqliteStore {
    fn load_identity(&self) -> Result<Option<Vec<u8>>, CryptoError> {
        let sealed = self.with_conn(|c| {
            c.query_row("SELECT secret FROM identity WHERE id = 1", [], |r| r.get::<_, Vec<u8>>(0))
                .optional()
                .map_err(storage_err)
        })?;
        sealed.map(|s| self.cipher.open(&s, AAD_IDENTITY)).transpose()
    }

    fn save_identity(&self, secret: &[u8]) -> Result<(), CryptoError> {
        let sealed = self.cipher.seal(secret, AAD_IDENTITY)?;
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO identity (id, secret) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET secret = excluded.secret",
                params![sealed],
            )
            .map(|_| ())
            .map_err(storage_err)
        })
    }

    fn load_mls_state(&self) -> Result<HashMap<Vec<u8>, Vec<u8>>, CryptoError> {
        let rows = self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT k, v FROM mls_kv").map_err(storage_err)?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, Vec<u8>>(1)?)))
                .map_err(storage_err)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(storage_err)
        })?;
        rows.into_iter()
            .map(|(k, sealed)| self.cipher.open(&sealed, &k).map(|v| (k, v)))
            .collect()
    }

    fn apply_mls_changes(
        &self,
        upserts: &[(Vec<u8>, Vec<u8>)],
        deletions: &[Vec<u8>],
    ) -> Result<(), CryptoError> {
        let sealed = upserts
            .iter()
            .map(|(k, v)| self.cipher.seal(v, k).map(|s| (k, s)))
            .collect::<Result<Vec<_>, _>>()?;
        self.with_conn(|c| {
            let tx = c.transaction().map_err(storage_err)?;
            for (k, v) in &sealed {
                tx.execute(
                    "INSERT INTO mls_kv (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
                    params![k, v],
                )
                .map_err(storage_err)?;
            }
            for k in deletions {
                tx.execute("DELETE FROM mls_kv WHERE k = ?1", params![k])
                    .map_err(storage_err)?;
            }
            tx.commit().map_err(storage_err)
        })
    }

    fn put_message(&self, m: &LocalMessage) -> Result<(), CryptoError> {
        let sealed = self
            .cipher
            .seal(m.json.as_bytes(), &message_aad(&m.channel_id, &m.message_id))?;
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO messages (channel_id, message_id, sort_key, payload) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(channel_id, message_id) DO UPDATE SET payload = excluded.payload, sort_key = excluded.sort_key",
                params![m.channel_id, m.message_id, m.sort_key, sealed],
            )
            .map(|_| ())
            .map_err(storage_err)
        })
    }

    fn list_messages(
        &self,
        channel_id: &str,
        before_sort_key: Option<i64>,
        limit: u32,
    ) -> Result<Vec<LocalMessage>, CryptoError> {
        let rows = self.with_conn(|c| {
            let mut stmt = c
                .prepare(
                    "SELECT channel_id, message_id, sort_key, payload FROM messages
                     WHERE channel_id = ?1 AND sort_key < ?2
                     ORDER BY sort_key DESC LIMIT ?3",
                )
                .map_err(storage_err)?;
            let rows = stmt
                .query_map(
                    params![channel_id, before_sort_key.unwrap_or(i64::MAX), limit],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, i64>(2)?,
                            r.get::<_, Vec<u8>>(3)?,
                        ))
                    },
                )
                .map_err(storage_err)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(storage_err)
        })?;
        rows.into_iter()
            .map(|(channel_id, message_id, sort_key, sealed)| {
                let plain = self.cipher.open(&sealed, &message_aad(&channel_id, &message_id))?;
                let json = String::from_utf8(plain).map_err(|e| CryptoError::Decode(e.to_string()))?;
                Ok(LocalMessage { channel_id, message_id, sort_key, json })
            })
            .collect()
    }

    fn delete_message(&self, channel_id: &str, message_id: &str) -> Result<(), CryptoError> {
        self.with_conn(|c| {
            c.execute(
                "DELETE FROM messages WHERE channel_id = ?1 AND message_id = ?2",
                params![channel_id, message_id],
            )
            .map(|_| ())
            .map_err(storage_err)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("discordy-crypto-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn rejects_malformed_key() {
        assert!(EncryptedSqliteStore::open("ignored.db", "abc").is_err());
    }

    #[test]
    fn wrong_key_fails_and_file_holds_no_plaintext() {
        let dir = temp_dir("wrong-key");
        let path = dir.join("store.db");
        let path_str = path.to_str().unwrap();
        {
            let store = EncryptedSqliteStore::open(path_str, KEY).unwrap();
            store.save_identity(&[7; 32]).unwrap();
            store
                .put_message(&LocalMessage {
                    channel_id: "c".into(),
                    message_id: "m".into(),
                    sort_key: 1,
                    json: "{\"secret\":\"plaintext-marker\"}".into(),
                })
                .unwrap();
        }
        let other = "ff".repeat(32);
        assert!(matches!(
            EncryptedSqliteStore::open(path_str, &other),
            Err(CryptoError::InvalidKey(_))
        ));
        let reopened = EncryptedSqliteStore::open(path_str, KEY).unwrap();
        assert_eq!(reopened.load_identity().unwrap(), Some(vec![7; 32]));
        assert_eq!(
            reopened.list_messages("c", None, 10).unwrap()[0].json,
            "{\"secret\":\"plaintext-marker\"}"
        );
        drop(reopened);
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.windows(16).any(|w| w == b"plaintext-marker"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn tampered_row_is_rejected() {
        let dir = temp_dir("tamper");
        let path = dir.join("store.db");
        let path_str = path.to_str().unwrap();
        {
            let store = EncryptedSqliteStore::open(path_str, KEY).unwrap();
            store.save_identity(&[7; 32]).unwrap();
        }
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute("UPDATE identity SET secret = X'00' || substr(secret, 2)", [])
                .unwrap();
        }
        let store = EncryptedSqliteStore::open(path_str, KEY).unwrap();
        assert!(store.load_identity().is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn legacy_sqlcipher_file_is_renamed_aside() {
        let dir = temp_dir("legacy");
        let path = dir.join("store.db");
        std::fs::write(&path, [0xAB; 4096]).unwrap();
        let store = EncryptedSqliteStore::open(path.to_str().unwrap(), KEY).unwrap();
        assert!(store.load_identity().unwrap().is_none());
        assert!(dir.join("store.db.legacy-sqlcipher").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn messages_page_newest_first() {
        let store = EncryptedSqliteStore::open_in_memory(KEY).unwrap();
        for i in 1..=5 {
            store
                .put_message(&LocalMessage {
                    channel_id: "c".into(),
                    message_id: i.to_string(),
                    sort_key: i,
                    json: format!("{{\"n\":{i}}}"),
                })
                .unwrap();
        }
        let page = store.list_messages("c", Some(4), 2).unwrap();
        let ids: Vec<_> = page.iter().map(|m| m.message_id.as_str()).collect();
        assert_eq!(ids, vec!["3", "2"]);
        store.delete_message("c", "3").unwrap();
        assert_eq!(store.list_messages("c", None, 10).unwrap().len(), 4);
    }

    #[test]
    fn mls_changes_apply_atomically() {
        let store = EncryptedSqliteStore::open_in_memory(KEY).unwrap();
        store
            .apply_mls_changes(&[(vec![1], vec![1]), (vec![2], vec![2])], &[])
            .unwrap();
        store.apply_mls_changes(&[(vec![1], vec![5])], &[vec![2]]).unwrap();
        let state = store.load_mls_state().unwrap();
        assert_eq!(state, HashMap::from([(vec![1], vec![5])]));
    }
}
