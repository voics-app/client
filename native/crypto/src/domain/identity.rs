//! Device identity: an Ed25519 key pair that signs MLS leaf credentials and the
//! DTLS fingerprint of P2P sessions. Pure domain logic, no IO.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand_core::OsRng;

use crate::domain::error::CryptoError;

pub struct DeviceIdentity {
    signing_key: SigningKey,
}

impl DeviceIdentity {
    pub fn generate() -> Self {
        Self {
            signing_key: SigningKey::generate(&mut OsRng),
        }
    }

    pub fn from_secret(secret: &[u8]) -> Result<Self, CryptoError> {
        let bytes: [u8; 32] = secret
            .try_into()
            .map_err(|_| CryptoError::InvalidKey("identity secret must be 32 bytes".into()))?;
        Ok(Self {
            signing_key: SigningKey::from_bytes(&bytes),
        })
    }

    pub fn secret_bytes(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }

    pub fn public_bytes(&self) -> [u8; 32] {
        self.signing_key.verifying_key().to_bytes()
    }

    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        self.signing_key.sign(message).to_bytes()
    }
}

pub fn verify_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, CryptoError> {
    let key_bytes: [u8; 32] = public_key
        .try_into()
        .map_err(|_| CryptoError::InvalidKey("public key must be 32 bytes".into()))?;
    let verifying_key =
        VerifyingKey::from_bytes(&key_bytes).map_err(|e| CryptoError::InvalidKey(e.to_string()))?;
    let sig_bytes: [u8; 64] = signature
        .try_into()
        .map_err(|_| CryptoError::InvalidKey("signature must be 64 bytes".into()))?;
    Ok(verifying_key
        .verify(message, &Signature::from_bytes(&sig_bytes))
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_round_trips() {
        let identity = DeviceIdentity::generate();
        let sig = identity.sign(b"fingerprint");
        assert!(verify_signature(&identity.public_bytes(), b"fingerprint", &sig).unwrap());
    }

    #[test]
    fn tampered_message_fails_verification() {
        let identity = DeviceIdentity::generate();
        let sig = identity.sign(b"fingerprint");
        assert!(!verify_signature(&identity.public_bytes(), b"fingerprinT", &sig).unwrap());
    }

    #[test]
    fn identity_restores_from_secret() {
        let identity = DeviceIdentity::generate();
        let restored = DeviceIdentity::from_secret(&identity.secret_bytes()).unwrap();
        assert_eq!(identity.public_bytes(), restored.public_bytes());
    }

    #[test]
    fn rejects_malformed_keys() {
        assert!(verify_signature(&[1, 2, 3], b"x", &[0; 64]).is_err());
        assert!(DeviceIdentity::from_secret(&[0; 5]).is_err());
    }
}
