//! SQLCipher-backed `SecureStore`. The database key is supplied by the Electron
//! main process, which keeps it wrapped by the OS keychain (safeStorage).

use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};

use crate::application::ports::SecureStore;
use crate::domain::error::CryptoError;
use crate::domain::message::LocalMessage;

pub struct SqlCipherStore {
    conn: Mutex<Connection>,
}

fn storage_err(e: rusqlite::Error) -> CryptoError {
    CryptoError::Storage(e.to_string())
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS identity (id INTEGER PRIMARY KEY CHECK (id = 1), secret BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS mls_kv (k BLOB PRIMARY KEY, v BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sort_key INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (channel_id, message_id)
);
CREATE INDEX IF NOT EXISTS messages_by_channel ON messages (channel_id, sort_key DESC);
";

impl SqlCipherStore {
    /// Opens (or creates) an encrypted database. `key_hex` must be 64 hex characters (256-bit raw key).
    pub fn open(path: &str, key_hex: &str) -> Result<Self, CryptoError> {
        if key_hex.len() != 64 || !key_hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(CryptoError::InvalidKey("database key must be 64 hex characters".into()));
        }
        let conn = Connection::open(path).map_err(storage_err)?;
        Self::initialise(conn, key_hex)
    }

    pub fn open_in_memory(key_hex: &str) -> Result<Self, CryptoError> {
        let conn = Connection::open_in_memory().map_err(storage_err)?;
        Self::initialise(conn, key_hex)
    }

    fn initialise(conn: Connection, key_hex: &str) -> Result<Self, CryptoError> {
        conn.pragma_update(None, "key", format!("x'{key_hex}'"))
            .map_err(storage_err)?;
        // Fails with "file is not a database" when the key is wrong.
        conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
            .map_err(|_| CryptoError::InvalidKey("wrong database key".into()))?;
        conn.execute_batch(SCHEMA).map_err(storage_err)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn with_conn<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T, CryptoError>) -> Result<T, CryptoError> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| CryptoError::Storage("store mutex poisoned".into()))?;
        f(&mut guard)
    }

    pub fn cipher_version(&self) -> Result<String, CryptoError> {
        self.with_conn(|c| {
            c.query_row("PRAGMA cipher_version", [], |r| r.get::<_, String>(0))
                .map_err(storage_err)
        })
    }
}

impl SecureStore for SqlCipherStore {
    fn load_identity(&self) -> Result<Option<Vec<u8>>, CryptoError> {
        self.with_conn(|c| {
            c.query_row("SELECT secret FROM identity WHERE id = 1", [], |r| r.get(0))
                .optional()
                .map_err(storage_err)
        })
    }

    fn save_identity(&self, secret: &[u8]) -> Result<(), CryptoError> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO identity (id, secret) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET secret = excluded.secret",
                params![secret],
            )
            .map(|_| ())
            .map_err(storage_err)
        })
    }

    fn load_mls_state(&self) -> Result<HashMap<Vec<u8>, Vec<u8>>, CryptoError> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT k, v FROM mls_kv").map_err(storage_err)?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, Vec<u8>>(1)?)))
                .map_err(storage_err)?;
            rows.collect::<Result<HashMap<_, _>, _>>().map_err(storage_err)
        })
    }

    fn apply_mls_changes(
        &self,
        upserts: &[(Vec<u8>, Vec<u8>)],
        deletions: &[Vec<u8>],
    ) -> Result<(), CryptoError> {
        self.with_conn(|c| {
            let tx = c.transaction().map_err(storage_err)?;
            for (k, v) in upserts {
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
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO messages (channel_id, message_id, sort_key, json) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(channel_id, message_id) DO UPDATE SET json = excluded.json, sort_key = excluded.sort_key",
                params![m.channel_id, m.message_id, m.sort_key, m.json],
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
        self.with_conn(|c| {
            let mut stmt = c
                .prepare(
                    "SELECT channel_id, message_id, sort_key, json FROM messages
                     WHERE channel_id = ?1 AND sort_key < ?2
                     ORDER BY sort_key DESC LIMIT ?3",
                )
                .map_err(storage_err)?;
            let rows = stmt
                .query_map(
                    params![channel_id, before_sort_key.unwrap_or(i64::MAX), limit],
                    |r| {
                        Ok(LocalMessage {
                            channel_id: r.get(0)?,
                            message_id: r.get(1)?,
                            sort_key: r.get(2)?,
                            json: r.get(3)?,
                        })
                    },
                )
                .map_err(storage_err)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(storage_err)
        })
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

    #[test]
    fn is_really_sqlcipher() {
        let store = SqlCipherStore::open_in_memory(KEY).unwrap();
        assert!(!store.cipher_version().unwrap().is_empty());
    }

    #[test]
    fn rejects_malformed_key() {
        assert!(SqlCipherStore::open("ignored.db", "abc").is_err());
    }

    #[test]
    fn file_is_unreadable_with_wrong_key() {
        let dir = std::env::temp_dir().join(format!("discordy-crypto-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("wrong-key.db");
        let path_str = path.to_str().unwrap();
        {
            let store = SqlCipherStore::open(path_str, KEY).unwrap();
            store.save_identity(&[7; 32]).unwrap();
        }
        let other = "ff".repeat(32);
        assert!(SqlCipherStore::open(path_str, &other).is_err());
        let reopened = SqlCipherStore::open(path_str, KEY).unwrap();
        assert_eq!(reopened.load_identity().unwrap(), Some(vec![7; 32]));
        drop(reopened);
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.starts_with(b"SQLite format 3"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn messages_page_newest_first() {
        let store = SqlCipherStore::open_in_memory(KEY).unwrap();
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
        let store = SqlCipherStore::open_in_memory(KEY).unwrap();
        store
            .apply_mls_changes(&[(vec![1], vec![1]), (vec![2], vec![2])], &[])
            .unwrap();
        store.apply_mls_changes(&[(vec![1], vec![5])], &[vec![2]]).unwrap();
        let state = store.load_mls_state().unwrap();
        assert_eq!(state, HashMap::from([(vec![1], vec![5])]));
    }
}
