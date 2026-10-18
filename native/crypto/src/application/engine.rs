//! The crypto engine: device identity, MLS groups (one per channel) and the
//! local encrypted history. Every state-changing MLS operation is followed by a
//! persist step that mirrors the OpenMLS storage into the secure store.

use std::collections::HashMap;

use openmls::prelude::tls_codec::{Deserialize as TlsDeserialize, Serialize as TlsSerialize};
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;

use crate::application::ports::SecureStore;
use crate::domain::error::CryptoError;
use crate::domain::identity::DeviceIdentity;
use crate::domain::message::{AddMembersOutcome, RemoveMembersOutcome, Incoming, LocalMessage};
use crate::infrastructure::mls_provider::{diff_state, PersistentProvider};

pub const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

pub struct CryptoEngine<S: SecureStore> {
    store: S,
    provider: PersistentProvider,
    persisted: HashMap<Vec<u8>, Vec<u8>>,
    identity: Option<DeviceIdentity>,
    credential_label: Vec<u8>,
}

fn mls_err(e: impl std::fmt::Debug) -> CryptoError {
    CryptoError::Mls(format!("{e:?}"))
}

impl<S: SecureStore> CryptoEngine<S> {
    /// `credential_label` identifies this device inside MLS groups, e.g. `"<user_id>:<device_id>"`.
    pub fn open(store: S, credential_label: &str) -> Result<Self, CryptoError> {
        let persisted = store.load_mls_state()?;
        let provider = PersistentProvider::with_state(persisted.clone());
        let identity = store
            .load_identity()?
            .map(|secret| DeviceIdentity::from_secret(&secret))
            .transpose()?;
        Ok(Self {
            store,
            provider,
            persisted,
            identity,
            credential_label: credential_label.as_bytes().to_vec(),
        })
    }

    pub fn ensure_identity(&mut self) -> Result<[u8; 32], CryptoError> {
        if self.identity.is_none() {
            let identity = DeviceIdentity::generate();
            self.store.save_identity(&identity.secret_bytes())?;
            self.identity = Some(identity);
        }
        let public = self.identity()?.public_bytes();
        self.signer()?.store(self.provider.storage()).map_err(mls_err)?;
        self.persist()?;
        Ok(public)
    }

    pub fn sign(&self, data: &[u8]) -> Result<[u8; 64], CryptoError> {
        Ok(self.identity()?.sign(data))
    }

    pub fn generate_key_packages(&mut self, count: u32) -> Result<Vec<Vec<u8>>, CryptoError> {
        let signer = self.signer()?;
        let credential = self.credential_with_key(&signer);
        let packages = (0..count)
            .map(|_| {
                let bundle = KeyPackage::builder()
                    .build(CIPHERSUITE, &self.provider, &signer, credential.clone())
                    .map_err(mls_err)?;
                bundle
                    .key_package()
                    .tls_serialize_detached()
                    .map_err(mls_err)
            })
            .collect::<Result<Vec<_>, _>>()?;
        self.persist()?;
        Ok(packages)
    }

    pub fn has_group(&self, group_id: &[u8]) -> Result<bool, CryptoError> {
        Ok(self.load_group(group_id)?.is_some())
    }

    pub fn create_group(&mut self, group_id: &[u8]) -> Result<u64, CryptoError> {
        if let Some(group) = self.load_group(group_id)? {
            return Ok(group.epoch().as_u64());
        }
        let signer = self.signer()?;
        let config = MlsGroupCreateConfig::builder()
            .ciphersuite(CIPHERSUITE)
            .use_ratchet_tree_extension(true)
            .build();
        let group = MlsGroup::new_with_group_id(
            &self.provider,
            &signer,
            &config,
            GroupId::from_slice(group_id),
            self.credential_with_key(&signer),
        )
        .map_err(mls_err)?;
        self.persist()?;
        Ok(group.epoch().as_u64())
    }

    pub fn add_members(
        &mut self,
        group_id: &[u8],
        key_packages: &[Vec<u8>],
    ) -> Result<AddMembersOutcome, CryptoError> {
        let mut group = self.require_group(group_id)?;
        let signer = self.signer()?;
        let packages = key_packages
            .iter()
            .map(|bytes| {
                let message = KeyPackageIn::tls_deserialize(&mut bytes.as_slice()).map_err(mls_err)?;
                message
                    .validate(self.provider.crypto(), ProtocolVersion::Mls10)
                    .map_err(mls_err)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let (commit, welcome, _group_info) = group
            .add_members(&self.provider, &signer, &packages)
            .map_err(mls_err)?;
        group.merge_pending_commit(&self.provider).map_err(mls_err)?;
        self.persist()?;
        Ok(AddMembersOutcome {
            commit: commit.tls_serialize_detached().map_err(mls_err)?,
            welcome: welcome.tls_serialize_detached().map_err(mls_err)?,
            epoch: group.epoch().as_u64(),
        })
    }

    /// Signature (identity) public keys of every current leaf, own device included.
    pub fn member_keys(&self, group_id: &[u8]) -> Result<Vec<Vec<u8>>, CryptoError> {
        let group = self.require_group(group_id)?;
        Ok(group.members().map(|m| m.signature_key).collect())
    }

    /// Commits the removal of the leaves owning `signature_keys` and advances the epoch.
    /// Keys that are not (or no longer) in the group are skipped; if none match, nothing is committed.
    pub fn remove_members(
        &mut self,
        group_id: &[u8],
        signature_keys: &[Vec<u8>],
    ) -> Result<Option<RemoveMembersOutcome>, CryptoError> {
        let mut group = self.require_group(group_id)?;
        let signer = self.signer()?;
        let own = self.identity()?.public_bytes().to_vec();
        let targets: Vec<LeafNodeIndex> = group
            .members()
            .filter(|m| m.signature_key != own && signature_keys.contains(&m.signature_key))
            .map(|m| m.index)
            .collect();
        if targets.is_empty() {
            return Ok(None);
        }
        let (commit, _welcome, _group_info) = group
            .remove_members(&self.provider, &signer, &targets)
            .map_err(mls_err)?;
        group.merge_pending_commit(&self.provider).map_err(mls_err)?;
        self.persist()?;
        Ok(Some(RemoveMembersOutcome {
            commit: commit.tls_serialize_detached().map_err(mls_err)?,
            epoch: group.epoch().as_u64(),
        }))
    }

    /// Joins a group from a Welcome and returns `(group_id, epoch)`.
    pub fn join_from_welcome(&mut self, welcome_bytes: &[u8]) -> Result<(Vec<u8>, u64), CryptoError> {
        let message = MlsMessageIn::tls_deserialize(&mut &welcome_bytes[..]).map_err(mls_err)?;
        let welcome = match message.extract() {
            MlsMessageBodyIn::Welcome(w) => w,
            _ => return Err(CryptoError::Mls("expected a Welcome message".into())),
        };
        let config = MlsGroupJoinConfig::builder()
            .use_ratchet_tree_extension(true)
            .build();
        let group = StagedWelcome::new_from_welcome(&self.provider, &config, welcome, None)
            .map_err(mls_err)?
            .into_group(&self.provider)
            .map_err(mls_err)?;
        self.persist()?;
        Ok((group.group_id().as_slice().to_vec(), group.epoch().as_u64()))
    }

    pub fn encrypt(&mut self, group_id: &[u8], plaintext: &[u8]) -> Result<(Vec<u8>, u64), CryptoError> {
        let mut group = self.require_group(group_id)?;
        let signer = self.signer()?;
        let out = group
            .create_message(&self.provider, &signer, plaintext)
            .map_err(mls_err)?;
        self.persist()?;
        Ok((out.tls_serialize_detached().map_err(mls_err)?, group.epoch().as_u64()))
    }

    pub fn process_incoming(&mut self, group_id: &[u8], bytes: &[u8]) -> Result<Incoming, CryptoError> {
        let mut group = self.require_group(group_id)?;
        let message = MlsMessageIn::tls_deserialize(&mut &bytes[..]).map_err(mls_err)?;
        let protocol = message.try_into_protocol_message().map_err(mls_err)?;
        let processed = group.process_message(&self.provider, protocol).map_err(mls_err)?;
        let sender_identity = processed.credential().serialized_content().to_vec();
        let outcome = match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(app) => Incoming::Application {
                plaintext: app.into_bytes(),
                sender_identity: BasicCredential::try_from(
                    Credential::new(CredentialType::Basic, sender_identity.clone()),
                )
                .map(|c| c.identity().to_vec())
                .unwrap_or(sender_identity),
            },
            ProcessedMessageContent::StagedCommitMessage(staged) => {
                group
                    .merge_staged_commit(&self.provider, *staged)
                    .map_err(mls_err)?;
                Incoming::Commit { epoch: group.epoch().as_u64() }
            }
            ProcessedMessageContent::ProposalMessage(proposal) => {
                group
                    .store_pending_proposal(self.provider.storage(), *proposal)
                    .map_err(mls_err)?;
                Incoming::Proposal
            }
            _ => Incoming::Ignored,
        };
        self.persist()?;
        Ok(outcome)
    }

    pub fn export_secret(
        &self,
        group_id: &[u8],
        label: &str,
        context: &[u8],
        length: usize,
    ) -> Result<Vec<u8>, CryptoError> {
        let group = self.require_group(group_id)?;
        group
            .export_secret(self.provider.crypto(), label, context, length)
            .map_err(mls_err)
    }

    pub fn epoch(&self, group_id: &[u8]) -> Result<u64, CryptoError> {
        Ok(self.require_group(group_id)?.epoch().as_u64())
    }

    pub fn put_message(&self, message: &LocalMessage) -> Result<(), CryptoError> {
        self.store.put_message(message)
    }

    pub fn list_messages(
        &self,
        channel_id: &str,
        before_sort_key: Option<i64>,
        limit: u32,
    ) -> Result<Vec<LocalMessage>, CryptoError> {
        self.store.list_messages(channel_id, before_sort_key, limit)
    }

    pub fn delete_message(&self, channel_id: &str, message_id: &str) -> Result<(), CryptoError> {
        self.store.delete_message(channel_id, message_id)
    }

    fn identity(&self) -> Result<&DeviceIdentity, CryptoError> {
        self.identity.as_ref().ok_or(CryptoError::NoIdentity)
    }

    fn signer(&self) -> Result<SignatureKeyPair, CryptoError> {
        let identity = self.identity()?;
        Ok(SignatureKeyPair::from_raw(
            SignatureScheme::ED25519,
            identity.secret_bytes().to_vec(),
            identity.public_bytes().to_vec(),
        ))
    }

    fn credential_with_key(&self, signer: &SignatureKeyPair) -> CredentialWithKey {
        CredentialWithKey {
            credential: BasicCredential::new(self.credential_label.clone()).into(),
            signature_key: signer.public().into(),
        }
    }

    fn load_group(&self, group_id: &[u8]) -> Result<Option<MlsGroup>, CryptoError> {
        MlsGroup::load(self.provider.storage(), &GroupId::from_slice(group_id)).map_err(mls_err)
    }

    fn require_group(&self, group_id: &[u8]) -> Result<MlsGroup, CryptoError> {
        self.load_group(group_id)?
            .ok_or_else(|| CryptoError::UnknownGroup(String::from_utf8_lossy(group_id).into_owned()))
    }

    fn persist(&mut self) -> Result<(), CryptoError> {
        let current = self.provider.snapshot();
        let (upserts, deletions) = diff_state(&self.persisted, &current);
        if !upserts.is_empty() || !deletions.is_empty() {
            self.store.apply_mls_changes(&upserts, &deletions)?;
            self.persisted = current;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::encrypted_sqlite_store::EncryptedSqliteStore;

    const KEY: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    fn engine(label: &str) -> CryptoEngine<EncryptedSqliteStore> {
        let mut e = CryptoEngine::open(EncryptedSqliteStore::open_in_memory(KEY).unwrap(), label).unwrap();
        e.ensure_identity().unwrap();
        e
    }

    #[test]
    fn two_devices_exchange_an_encrypted_message() {
        let mut alice = engine("alice:1");
        let mut bob = engine("bob:2");
        let bob_package = bob.generate_key_packages(1).unwrap().remove(0);

        alice.create_group(b"channel-42").unwrap();
        let added = alice.add_members(b"channel-42", &[bob_package]).unwrap();
        assert_eq!(added.epoch, 1);

        let (group_id, epoch) = bob.join_from_welcome(&added.welcome).unwrap();
        assert_eq!(group_id, b"channel-42");
        assert_eq!(epoch, 1);

        let (ciphertext, _) = alice.encrypt(b"channel-42", b"hello bob").unwrap();
        assert!(!ciphertext.windows(9).any(|w| w == b"hello bob"));
        match bob.process_incoming(b"channel-42", &ciphertext).unwrap() {
            Incoming::Application { plaintext, sender_identity } => {
                assert_eq!(plaintext, b"hello bob");
                assert_eq!(sender_identity, b"alice:1");
            }
            other => panic!("unexpected {other:?}"),
        }

        let a = alice.export_secret(b"channel-42", "dave-media", b"", 32).unwrap();
        let b = bob.export_secret(b"channel-42", "dave-media", b"", 32).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn removed_device_cannot_read_after_the_removal_commit() {
        let mut alice = engine("alice:1");
        let mut bob = engine("bob:2");
        let mut carol = engine("carol:3");
        let bob_key = bob.ensure_identity().unwrap().to_vec();
        let packages = [
            bob.generate_key_packages(1).unwrap().remove(0),
            carol.generate_key_packages(1).unwrap().remove(0),
        ];
        alice.create_group(b"g").unwrap();
        let added = alice.add_members(b"g", &packages).unwrap();
        bob.join_from_welcome(&added.welcome).unwrap();
        carol.join_from_welcome(&added.welcome).unwrap();
        assert_eq!(alice.member_keys(b"g").unwrap().len(), 3);

        let removal = alice.remove_members(b"g", std::slice::from_ref(&bob_key)).unwrap().unwrap();
        assert_eq!(removal.epoch, added.epoch + 1);
        assert_eq!(alice.member_keys(b"g").unwrap().len(), 2);
        assert!(!alice.member_keys(b"g").unwrap().contains(&bob_key));
        // Already removed: nothing left to commit.
        assert!(alice.remove_members(b"g", &[bob_key]).unwrap().is_none());

        let carol_before = carol.export_secret(b"g", "dave-media", b"", 32).unwrap();
        assert!(matches!(carol.process_incoming(b"g", &removal.commit).unwrap(), Incoming::Commit { .. }));
        bob.process_incoming(b"g", &removal.commit).ok();

        let (ciphertext, _) = alice.encrypt(b"g", b"after removal").unwrap();
        assert!(matches!(
            carol.process_incoming(b"g", &ciphertext).unwrap(),
            Incoming::Application { .. }
        ));
        assert!(bob.process_incoming(b"g", &ciphertext).is_err());

        let alice_secret = alice.export_secret(b"g", "dave-media", b"", 32).unwrap();
        assert_eq!(alice_secret, carol.export_secret(b"g", "dave-media", b"", 32).unwrap());
        assert_ne!(alice_secret, carol_before, "media key must rotate on the epoch change");
    }

    #[test]
    fn group_state_survives_reopen() {
        let dir = std::env::temp_dir().join(format!("discordy-engine-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("engine.db");
        let path = path.to_str().unwrap();
        let public = {
            let mut e = CryptoEngine::open(EncryptedSqliteStore::open(path, KEY).unwrap(), "a:1").unwrap();
            let public = e.ensure_identity().unwrap();
            e.create_group(b"g").unwrap();
            public
        };
        let mut reopened = CryptoEngine::open(EncryptedSqliteStore::open(path, KEY).unwrap(), "a:1").unwrap();
        assert_eq!(reopened.ensure_identity().unwrap(), public);
        assert!(reopened.has_group(b"g").unwrap());
        assert_eq!(reopened.epoch(b"g").unwrap(), 0);
        drop(reopened);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unknown_group_is_an_error() {
        let mut e = engine("a:1");
        assert!(matches!(e.encrypt(b"nope", b"x"), Err(CryptoError::UnknownGroup(_))));
    }

    #[test]
    fn operations_require_identity() {
        let mut e = CryptoEngine::open(EncryptedSqliteStore::open_in_memory(KEY).unwrap(), "a:1").unwrap();
        assert!(matches!(e.generate_key_packages(1), Err(CryptoError::NoIdentity)));
    }
}
