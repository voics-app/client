//! Voics crypto engine: OpenMLS groups, the Ed25519 device identity and the encrypted local store.
//! One Rust core with two thin interface layers: Node-API (`napi` feature, desktop) and
//! uniffi (`uniffi` feature, iOS through an XCFramework).
#![deny(clippy::all)]

pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interface;

#[cfg(feature = "uniffi")]
uniffi::setup_scaffolding!("voics_crypto");
