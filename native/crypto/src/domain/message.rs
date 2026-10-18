//! Values crossing the engine boundary.

use serde::{Deserialize, Serialize};

/// A decrypted message kept in the device-local encrypted history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalMessage {
    pub channel_id: String,
    pub message_id: String,
    /// Snowflake as a number, used for ordering.
    pub sort_key: i64,
    /// Opaque JSON document owned by the renderer (a Message-shaped object).
    pub json: String,
}

/// Outcome of feeding an incoming MLS message into a group.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Incoming {
    Application { plaintext: Vec<u8>, sender_identity: Vec<u8> },
    Commit { epoch: u64 },
    Proposal,
    Ignored,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AddMembersOutcome {
    pub commit: Vec<u8>,
    pub welcome: Vec<u8>,
    pub epoch: u64,
}
