//! OpenMLS provider whose key/value storage can be snapshotted and restored, so
//! group state survives restarts by being mirrored into the SQLCipher store.

use std::collections::HashMap;

use openmls_rust_crypto::{MemoryStorage, RustCrypto};
use openmls_traits::OpenMlsProvider;

#[derive(Default)]
pub struct PersistentProvider {
    crypto: RustCrypto,
    storage: MemoryStorage,
}

impl PersistentProvider {
    pub fn with_state(state: HashMap<Vec<u8>, Vec<u8>>) -> Self {
        let provider = Self::default();
        if let Ok(mut values) = provider.storage.values.write() {
            *values = state;
        }
        provider
    }

    pub fn snapshot(&self) -> HashMap<Vec<u8>, Vec<u8>> {
        self.storage
            .values
            .read()
            .map(|v| v.clone())
            .unwrap_or_default()
    }
}

impl OpenMlsProvider for PersistentProvider {
    type CryptoProvider = RustCrypto;
    type RandProvider = RustCrypto;
    type StorageProvider = MemoryStorage;

    fn storage(&self) -> &Self::StorageProvider {
        &self.storage
    }

    fn crypto(&self) -> &Self::CryptoProvider {
        &self.crypto
    }

    fn rand(&self) -> &Self::RandProvider {
        &self.crypto
    }
}

/// Computes the minimal set of changes turning `before` into `after`.
pub fn diff_state(
    before: &HashMap<Vec<u8>, Vec<u8>>,
    after: &HashMap<Vec<u8>, Vec<u8>>,
) -> (Vec<(Vec<u8>, Vec<u8>)>, Vec<Vec<u8>>) {
    let upserts = after
        .iter()
        .filter(|(k, v)| before.get(*k) != Some(*v))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let deletions = before
        .keys()
        .filter(|k| !after.contains_key(*k))
        .cloned()
        .collect();
    (upserts, deletions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_reports_upserts_and_deletions() {
        let before = HashMap::from([(vec![1], vec![1]), (vec![2], vec![2])]);
        let after = HashMap::from([(vec![1], vec![9]), (vec![3], vec![3])]);
        let (mut upserts, deletions) = diff_state(&before, &after);
        upserts.sort();
        assert_eq!(upserts, vec![(vec![1], vec![9]), (vec![3], vec![3])]);
        assert_eq!(deletions, vec![vec![2]]);
    }
}
