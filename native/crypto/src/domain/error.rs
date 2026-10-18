use thiserror::Error;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("invalid key: {0}")]
    InvalidKey(String),
    #[error("no device identity; call ensureIdentity first")]
    NoIdentity,
    #[error("unknown MLS group {0}")]
    UnknownGroup(String),
    #[error("MLS error: {0}")]
    Mls(String),
    #[error("storage error: {0}")]
    Storage(String),
    #[error("decode error: {0}")]
    Decode(String),
}
