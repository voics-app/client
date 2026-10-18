//! Ports the engine depends on. Implemented in `infrastructure`.

use std::collections::HashMap;

use crate::domain::error::CryptoError;
use crate::domain::message::LocalMessage;

/// Device-local encrypted persistence (SQLCipher in production, memory in tests).
pub trait SecureStore: Send {
    fn load_identity(&self) -> Result<Option<Vec<u8>>, CryptoError>;
    fn save_identity(&self, secret: &[u8]) -> Result<(), CryptoError>;

    /// Full snapshot of the MLS key/value storage.
    fn load_mls_state(&self) -> Result<HashMap<Vec<u8>, Vec<u8>>, CryptoError>;
    /// Applies upserts and deletions to the persisted MLS key/value storage atomically.
    fn apply_mls_changes(
        &self,
        upserts: &[(Vec<u8>, Vec<u8>)],
        deletions: &[Vec<u8>],
    ) -> Result<(), CryptoError>;

    fn put_message(&self, message: &LocalMessage) -> Result<(), CryptoError>;
    fn list_messages(
        &self,
        channel_id: &str,
        before_sort_key: Option<i64>,
        limit: u32,
    ) -> Result<Vec<LocalMessage>, CryptoError>;
    fn delete_message(&self, channel_id: &str, message_id: &str) -> Result<(), CryptoError>;
}
