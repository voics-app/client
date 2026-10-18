//! Node-API interface (napi-rs) over the Discordy crypto engine.
//! Loaded only by the Electron main process; the sandboxed renderer reaches it
//! through the typed IPC bridge.
#![deny(clippy::all)]

pub mod application;
pub mod domain;
pub mod infrastructure;

use std::sync::Mutex;

use napi::bindgen_prelude::Buffer;
use napi::{Error, Result, Status};
use napi_derive::napi;

use application::engine::CryptoEngine;
use domain::error::CryptoError;
use domain::identity::verify_signature;
use domain::message::{Incoming, LocalMessage};
use infrastructure::encrypted_sqlite_store::EncryptedSqliteStore;

fn to_napi(e: CryptoError) -> Error {
    Error::new(Status::GenericFailure, e.to_string())
}

#[napi(object)]
pub struct AddMembersResult {
    pub commit: Buffer,
    pub welcome: Buffer,
    pub epoch: i64,
}

#[napi(object)]
pub struct RemoveMembersResult {
    pub commit: Buffer,
    pub epoch: i64,
}

#[napi(object)]
pub struct JoinResult {
    pub group_id: Buffer,
    pub epoch: i64,
}

#[napi(object)]
pub struct EncryptResult {
    pub ciphertext: Buffer,
    pub epoch: i64,
}

#[napi(object)]
pub struct IncomingResult {
    /// "application" | "commit" | "proposal" | "ignored"
    pub kind: String,
    pub plaintext: Option<Buffer>,
    pub sender_identity: Option<String>,
    pub epoch: Option<i64>,
}

#[napi(object)]
pub struct StoredMessage {
    pub channel_id: String,
    pub message_id: String,
    pub sort_key: i64,
    pub json: String,
}

#[napi]
pub fn verify(public_key: Buffer, message: Buffer, signature: Buffer) -> Result<bool> {
    verify_signature(&public_key, &message, &signature).map_err(to_napi)
}

#[napi]
pub struct NativeCrypto {
    engine: Mutex<CryptoEngine<EncryptedSqliteStore>>,
}

#[napi]
impl NativeCrypto {
    /// Opens the encrypted store at `path` with a 256-bit hex key and the MLS credential label.
    #[napi(factory)]
    pub fn open(path: String, key_hex: String, credential_label: String) -> Result<Self> {
        let store = EncryptedSqliteStore::open(&path, &key_hex).map_err(to_napi)?;
        let engine = CryptoEngine::open(store, &credential_label).map_err(to_napi)?;
        Ok(Self { engine: Mutex::new(engine) })
    }

    fn with<T>(&self, f: impl FnOnce(&mut CryptoEngine<EncryptedSqliteStore>) -> std::result::Result<T, CryptoError>) -> Result<T> {
        let mut guard = self
            .engine
            .lock()
            .map_err(|_| Error::new(Status::GenericFailure, "engine mutex poisoned"))?;
        f(&mut guard).map_err(to_napi)
    }

    #[napi]
    pub fn ensure_identity(&self) -> Result<Buffer> {
        self.with(|e| e.ensure_identity().map(|k| k.to_vec().into()))
    }

    #[napi]
    pub fn sign(&self, data: Buffer) -> Result<Buffer> {
        self.with(|e| e.sign(&data).map(|s| s.to_vec().into()))
    }

    #[napi]
    pub fn generate_key_packages(&self, count: u32) -> Result<Vec<Buffer>> {
        self.with(|e| e.generate_key_packages(count).map(|v| v.into_iter().map(Buffer::from).collect()))
    }

    #[napi]
    pub fn has_group(&self, group_id: Buffer) -> Result<bool> {
        self.with(|e| e.has_group(&group_id))
    }

    #[napi]
    pub fn create_group(&self, group_id: Buffer) -> Result<i64> {
        self.with(|e| e.create_group(&group_id).map(|x| x as i64))
    }

    #[napi]
    pub fn add_members(&self, group_id: Buffer, key_packages: Vec<Buffer>) -> Result<AddMembersResult> {
        let packages: Vec<Vec<u8>> = key_packages.iter().map(|b| b.to_vec()).collect();
        self.with(|e| {
            e.add_members(&group_id, &packages).map(|o| AddMembersResult {
                commit: o.commit.into(),
                welcome: o.welcome.into(),
                epoch: o.epoch as i64,
            })
        })
    }

    /// Identity (signature) public keys of every device currently in the group, own device included.
    #[napi]
    pub fn member_keys(&self, group_id: Buffer) -> Result<Vec<Buffer>> {
        self.with(|e| e.member_keys(&group_id).map(|keys| keys.into_iter().map(Buffer::from).collect()))
    }

    /// Commits the removal of the devices owning `identity_keys`; `None` when none of them is a member.
    #[napi]
    pub fn remove_members(&self, group_id: Buffer, identity_keys: Vec<Buffer>) -> Result<Option<RemoveMembersResult>> {
        let keys: Vec<Vec<u8>> = identity_keys.iter().map(|b| b.to_vec()).collect();
        self.with(|e| {
            e.remove_members(&group_id, &keys).map(|outcome| {
                outcome.map(|o| RemoveMembersResult { commit: o.commit.into(), epoch: o.epoch as i64 })
            })
        })
    }

    #[napi]
    pub fn join_from_welcome(&self, welcome: Buffer) -> Result<JoinResult> {
        self.with(|e| {
            e.join_from_welcome(&welcome).map(|(group_id, epoch)| JoinResult {
                group_id: group_id.into(),
                epoch: epoch as i64,
            })
        })
    }

    #[napi]
    pub fn encrypt(&self, group_id: Buffer, plaintext: Buffer) -> Result<EncryptResult> {
        self.with(|e| {
            e.encrypt(&group_id, &plaintext).map(|(c, epoch)| EncryptResult {
                ciphertext: c.into(),
                epoch: epoch as i64,
            })
        })
    }

    #[napi]
    pub fn process_incoming(&self, group_id: Buffer, message: Buffer) -> Result<IncomingResult> {
        self.with(|e| {
            e.process_incoming(&group_id, &message).map(|incoming| match incoming {
                Incoming::Application { plaintext, sender_identity } => IncomingResult {
                    kind: "application".into(),
                    plaintext: Some(plaintext.into()),
                    sender_identity: Some(String::from_utf8_lossy(&sender_identity).into_owned()),
                    epoch: None,
                },
                Incoming::Commit { epoch } => IncomingResult {
                    kind: "commit".into(),
                    plaintext: None,
                    sender_identity: None,
                    epoch: Some(epoch as i64),
                },
                Incoming::Proposal => IncomingResult {
                    kind: "proposal".into(),
                    plaintext: None,
                    sender_identity: None,
                    epoch: None,
                },
                Incoming::Ignored => IncomingResult {
                    kind: "ignored".into(),
                    plaintext: None,
                    sender_identity: None,
                    epoch: None,
                },
            })
        })
    }

    #[napi]
    pub fn export_secret(&self, group_id: Buffer, label: String, context: Buffer, length: u32) -> Result<Buffer> {
        self.with(|e| {
            e.export_secret(&group_id, &label, &context, length as usize)
                .map(Buffer::from)
        })
    }

    #[napi]
    pub fn epoch(&self, group_id: Buffer) -> Result<i64> {
        self.with(|e| e.epoch(&group_id).map(|x| x as i64))
    }

    #[napi]
    pub fn put_message(&self, message: StoredMessage) -> Result<()> {
        self.with(|e| {
            e.put_message(&LocalMessage {
                channel_id: message.channel_id,
                message_id: message.message_id,
                sort_key: message.sort_key,
                json: message.json,
            })
        })
    }

    #[napi]
    pub fn list_messages(&self, channel_id: String, before_sort_key: Option<i64>, limit: u32) -> Result<Vec<StoredMessage>> {
        self.with(|e| {
            e.list_messages(&channel_id, before_sort_key, limit).map(|rows| {
                rows.into_iter()
                    .map(|m| StoredMessage {
                        channel_id: m.channel_id,
                        message_id: m.message_id,
                        sort_key: m.sort_key,
                        json: m.json,
                    })
                    .collect()
            })
        })
    }

    #[napi]
    pub fn delete_message(&self, channel_id: String, message_id: String) -> Result<()> {
        self.with(|e| e.delete_message(&channel_id, &message_id))
    }
}
