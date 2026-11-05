//! uniffi interface over the Voics crypto engine, for iOS.
//!
//! The surface mirrors the TypeScript `CryptoBridge` port: every binary value is a base64 string,
//! group ids are UTF-8 strings, and the same limits as the desktop host apply, so the Swift
//! module only forwards calls. The store key never reaches JavaScript: the Swift module keeps it
//! in the iOS Keychain and passes it to `MobileCrypto::open`.

use std::sync::{Arc, Mutex};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;

use crate::application::engine::CryptoEngine;
use crate::domain::error::CryptoError;
use crate::domain::identity::verify_signature;
use crate::domain::message::{Incoming, LocalMessage};
use crate::infrastructure::encrypted_sqlite_store::EncryptedSqliteStore;

const MAX_KEY_PACKAGES: u32 = 100;
const MAX_EXPORT_BYTES: u32 = 64;
const MAX_LIST_LIMIT: u32 = 200;

#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum MobileCryptoError {
    #[error("{0}")]
    Failed(String),
}

impl From<CryptoError> for MobileCryptoError {
    fn from(e: CryptoError) -> Self {
        Self::Failed(e.to_string())
    }
}

type Result<T> = std::result::Result<T, MobileCryptoError>;

fn decode(value: &str) -> Result<Vec<u8>> {
    B64.decode(value)
        .map_err(|_| MobileCryptoError::Failed("invalid base64 input".into()))
}

fn encode(bytes: impl AsRef<[u8]>) -> String {
    B64.encode(bytes)
}

fn group_key(group_id: &str) -> &[u8] {
    group_id.as_bytes()
}

#[derive(uniffi::Record)]
pub struct AddMembersOutput {
    pub commit_b64: String,
    pub welcome_b64: String,
    pub epoch: i64,
}

#[derive(uniffi::Record)]
pub struct RemoveMembersOutput {
    pub commit_b64: String,
    pub epoch: i64,
}

#[derive(uniffi::Record)]
pub struct JoinOutput {
    pub group_id: String,
    pub epoch: i64,
}

#[derive(uniffi::Record)]
pub struct EncryptOutput {
    pub ciphertext_b64: String,
    pub epoch: i64,
}

#[derive(uniffi::Record)]
pub struct IncomingOutput {
    /// "application" | "commit" | "proposal" | "ignored"
    pub kind: String,
    pub plaintext_b64: Option<String>,
    pub sender_identity: Option<String>,
    pub epoch: Option<i64>,
}

#[derive(uniffi::Record)]
pub struct StoredRecord {
    pub channel_id: String,
    pub message_id: String,
    pub sort_key: i64,
    pub json: String,
}

/// Checks an Ed25519 signature; false for a well-formed signature that does not match.
#[uniffi::export]
pub fn verify_signature_b64(
    public_key_b64: String,
    data_b64: String,
    signature_b64: String,
) -> Result<bool> {
    Ok(verify_signature(
        &decode(&public_key_b64)?,
        &decode(&data_b64)?,
        &decode(&signature_b64)?,
    )?)
}

#[derive(uniffi::Object)]
pub struct MobileCrypto {
    engine: Mutex<CryptoEngine<EncryptedSqliteStore>>,
}

impl MobileCrypto {
    fn from_store(store: EncryptedSqliteStore, credential_label: &str) -> Result<Arc<Self>> {
        let engine = CryptoEngine::open(store, credential_label)?;
        Ok(Arc::new(Self {
            engine: Mutex::new(engine),
        }))
    }

    fn with<T>(
        &self,
        f: impl FnOnce(&mut CryptoEngine<EncryptedSqliteStore>) -> std::result::Result<T, CryptoError>,
    ) -> Result<T> {
        let mut guard = self
            .engine
            .lock()
            .map_err(|_| MobileCryptoError::Failed("engine mutex poisoned".into()))?;
        Ok(f(&mut guard)?)
    }
}

#[uniffi::export]
impl MobileCrypto {
    /// Opens the encrypted store at `path` with a 256-bit hex key and the MLS credential label.
    #[uniffi::constructor]
    pub fn open(path: String, key_hex: String, credential_label: String) -> Result<Arc<Self>> {
        Self::from_store(
            EncryptedSqliteStore::open(&path, &key_hex)?,
            &credential_label,
        )
    }

    /// Creates the device identity when missing; returns its public key (base64).
    pub fn ensure_identity(&self) -> Result<String> {
        self.with(|e| e.ensure_identity().map(encode))
    }

    pub fn sign(&self, data_b64: String) -> Result<String> {
        let data = decode(&data_b64)?;
        self.with(|e| e.sign(&data).map(encode))
    }

    pub fn generate_key_packages(&self, count: u32) -> Result<Vec<String>> {
        self.with(|e| {
            e.generate_key_packages(count.clamp(1, MAX_KEY_PACKAGES))
                .map(|v| v.into_iter().map(encode).collect())
        })
    }

    pub fn has_group(&self, group_id: String) -> Result<bool> {
        self.with(|e| e.has_group(group_key(&group_id)))
    }

    pub fn delete_group(&self, group_id: String) -> Result<bool> {
        self.with(|e| e.delete_group(group_key(&group_id)))
    }

    pub fn create_group(&self, group_id: String) -> Result<i64> {
        self.with(|e| e.create_group(group_key(&group_id)).map(|x| x as i64))
    }

    pub fn add_members(
        &self,
        group_id: String,
        key_packages_b64: Vec<String>,
    ) -> Result<AddMembersOutput> {
        let packages = key_packages_b64
            .iter()
            .map(|p| decode(p))
            .collect::<Result<Vec<_>>>()?;
        self.with(|e| {
            e.add_members(group_key(&group_id), &packages)
                .map(|o| AddMembersOutput {
                    commit_b64: encode(o.commit),
                    welcome_b64: encode(o.welcome),
                    epoch: o.epoch as i64,
                })
        })
    }

    /// Identity public keys (base64) of every device currently in the group, own device included.
    pub fn member_keys(&self, group_id: String) -> Result<Vec<String>> {
        self.with(|e| {
            e.member_keys(group_key(&group_id))
                .map(|keys| keys.into_iter().map(encode).collect())
        })
    }

    /// Commits the removal of the devices owning `identity_keys_b64`; `None` when none is a member.
    pub fn remove_members(
        &self,
        group_id: String,
        identity_keys_b64: Vec<String>,
    ) -> Result<Option<RemoveMembersOutput>> {
        let keys = identity_keys_b64
            .iter()
            .map(|k| decode(k))
            .collect::<Result<Vec<_>>>()?;
        self.with(|e| {
            e.remove_members(group_key(&group_id), &keys)
                .map(|outcome| {
                    outcome.map(|o| RemoveMembersOutput {
                        commit_b64: encode(o.commit),
                        epoch: o.epoch as i64,
                    })
                })
        })
    }

    pub fn join_from_welcome(&self, welcome_b64: String) -> Result<JoinOutput> {
        let welcome = decode(&welcome_b64)?;
        self.with(|e| {
            e.join_from_welcome(&welcome)
                .map(|(group_id, epoch)| JoinOutput {
                    group_id: String::from_utf8_lossy(&group_id).into_owned(),
                    epoch: epoch as i64,
                })
        })
    }

    pub fn encrypt(&self, group_id: String, plaintext_b64: String) -> Result<EncryptOutput> {
        let plaintext = decode(&plaintext_b64)?;
        self.with(|e| {
            e.encrypt(group_key(&group_id), &plaintext)
                .map(|(ciphertext, epoch)| EncryptOutput {
                    ciphertext_b64: encode(ciphertext),
                    epoch: epoch as i64,
                })
        })
    }

    pub fn process_incoming(
        &self,
        group_id: String,
        message_b64: String,
    ) -> Result<IncomingOutput> {
        let message = decode(&message_b64)?;
        self.with(|e| {
            e.process_incoming(group_key(&group_id), &message)
                .map(|incoming| match incoming {
                    Incoming::Application {
                        plaintext,
                        sender_identity,
                    } => IncomingOutput {
                        kind: "application".into(),
                        plaintext_b64: Some(encode(plaintext)),
                        sender_identity: Some(
                            String::from_utf8_lossy(&sender_identity).into_owned(),
                        ),
                        epoch: None,
                    },
                    Incoming::Commit { epoch } => IncomingOutput {
                        kind: "commit".into(),
                        plaintext_b64: None,
                        sender_identity: None,
                        epoch: Some(epoch as i64),
                    },
                    Incoming::Proposal => IncomingOutput {
                        kind: "proposal".into(),
                        plaintext_b64: None,
                        sender_identity: None,
                        epoch: None,
                    },
                    Incoming::Ignored => IncomingOutput {
                        kind: "ignored".into(),
                        plaintext_b64: None,
                        sender_identity: None,
                        epoch: None,
                    },
                })
        })
    }

    pub fn export_secret(&self, group_id: String, label: String, length: u32) -> Result<String> {
        self.with(|e| {
            e.export_secret(
                group_key(&group_id),
                &label,
                &[],
                length.min(MAX_EXPORT_BYTES) as usize,
            )
            .map(encode)
        })
    }

    pub fn put_message(&self, record: StoredRecord) -> Result<()> {
        self.with(|e| {
            e.put_message(&LocalMessage {
                channel_id: record.channel_id,
                message_id: record.message_id,
                sort_key: record.sort_key,
                json: record.json,
            })
        })
    }

    pub fn list_messages(
        &self,
        channel_id: String,
        before_sort_key: Option<i64>,
        limit: u32,
    ) -> Result<Vec<StoredRecord>> {
        self.with(|e| {
            e.list_messages(&channel_id, before_sort_key, limit.min(MAX_LIST_LIMIT))
                .map(|rows| {
                    rows.into_iter()
                        .map(|m| StoredRecord {
                            channel_id: m.channel_id,
                            message_id: m.message_id,
                            sort_key: m.sort_key,
                            json: m.json,
                        })
                        .collect()
                })
        })
    }

    pub fn delete_message(&self, channel_id: String, message_id: String) -> Result<()> {
        self.with(|e| e.delete_message(&channel_id, &message_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    fn device(label: &str) -> Arc<MobileCrypto> {
        let device =
            MobileCrypto::from_store(EncryptedSqliteStore::open_in_memory(KEY).unwrap(), label)
                .unwrap();
        device.ensure_identity().unwrap();
        device
    }

    fn joined_pair(group: &str) -> (Arc<MobileCrypto>, Arc<MobileCrypto>) {
        let alice = device("1:alice");
        let bob = device("2:bob");
        let package = bob.generate_key_packages(1).unwrap().remove(0);
        alice.create_group(group.into()).unwrap();
        let added = alice.add_members(group.into(), vec![package]).unwrap();
        assert_eq!(
            bob.join_from_welcome(added.welcome_b64).unwrap().group_id,
            group
        );
        (alice, bob)
    }

    #[test]
    fn two_devices_exchange_a_message_through_the_bridge_shape() {
        let (alice, bob) = joined_pair("channel-42");
        let sealed = alice
            .encrypt("channel-42".into(), encode("hello bob"))
            .unwrap();
        assert!(!sealed.ciphertext_b64.contains(&encode("hello bob")));
        let opened = bob
            .process_incoming("channel-42".into(), sealed.ciphertext_b64)
            .unwrap();
        assert_eq!(opened.kind, "application");
        assert_eq!(
            decode(&opened.plaintext_b64.unwrap()).unwrap(),
            b"hello bob"
        );
        assert_eq!(opened.sender_identity.as_deref(), Some("1:alice"));
        assert_eq!(alice.member_keys("channel-42".into()).unwrap().len(), 2);
    }

    #[test]
    fn signatures_verify_and_tampering_is_rejected() {
        let alice = device("1:alice");
        let public = alice.ensure_identity().unwrap();
        let signature = alice.sign(encode("payload")).unwrap();
        assert!(
            verify_signature_b64(public.clone(), encode("payload"), signature.clone()).unwrap()
        );
        assert!(!verify_signature_b64(public, encode("other"), signature).unwrap());
    }

    #[test]
    fn exported_secret_is_capped_and_matches_between_members() {
        let (alice, bob) = joined_pair("g");
        let a = alice
            .export_secret("g".into(), "voics-test".into(), 1000)
            .unwrap();
        let b = bob
            .export_secret("g".into(), "voics-test".into(), 1000)
            .unwrap();
        assert_eq!(a, b);
        assert_eq!(decode(&a).unwrap().len(), 64);
    }

    #[test]
    fn local_messages_round_trip_and_page() {
        let alice = device("1:alice");
        for n in 1..=3 {
            alice
                .put_message(StoredRecord {
                    channel_id: "c".into(),
                    message_id: n.to_string(),
                    sort_key: n,
                    json: format!("{{\"n\":{n}}}"),
                })
                .unwrap();
        }
        let newest = alice.list_messages("c".into(), None, 2).unwrap();
        assert_eq!(
            newest.iter().map(|m| m.sort_key).collect::<Vec<_>>(),
            vec![3, 2]
        );
        alice.delete_message("c".into(), "3".into()).unwrap();
        assert_eq!(alice.list_messages("c".into(), None, 10).unwrap().len(), 2);
    }

    #[test]
    fn bad_input_fails_without_echoing_it() {
        assert!(MobileCrypto::open(":memory:".into(), "abcd".into(), "1:x".into()).is_err());
        let alice = device("1:alice");
        let error = alice.sign("not base64 !!".into()).unwrap_err();
        assert_eq!(error.to_string(), "invalid base64 input");
    }
}
