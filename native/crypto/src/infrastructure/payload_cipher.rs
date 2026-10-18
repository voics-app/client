//! Application-level payload encryption: ChaCha20-Poly1305 with a fresh random
//! nonce per sealed value. Sealed layout: `nonce (12 bytes) || ciphertext || tag`.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use rand_core::{OsRng, RngCore};

use crate::domain::error::CryptoError;

const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

pub struct PayloadCipher {
    cipher: ChaCha20Poly1305,
}

impl PayloadCipher {
    /// `key_hex` must be 64 hex characters (256-bit key).
    pub fn from_hex(key_hex: &str) -> Result<Self, CryptoError> {
        let invalid = || CryptoError::InvalidKey("database key must be 64 hex characters".into());
        if key_hex.len() != KEY_LEN * 2 || !key_hex.is_ascii() {
            return Err(invalid());
        }
        let mut key = [0u8; KEY_LEN];
        for (i, byte) in key.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&key_hex[i * 2..i * 2 + 2], 16).map_err(|_| invalid())?;
        }
        Ok(Self { cipher: ChaCha20Poly1305::new(Key::from_slice(&key)) })
    }

    /// `aad` binds the ciphertext to its row so values cannot be swapped between rows.
    pub fn seal(&self, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        let ciphertext = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext, aad })
            .map_err(|_| CryptoError::Storage("encryption failed".into()))?;
        let mut sealed = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        sealed.extend_from_slice(&nonce);
        sealed.extend_from_slice(&ciphertext);
        Ok(sealed)
    }

    pub fn open(&self, sealed: &[u8], aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
        if sealed.len() < NONCE_LEN {
            return Err(CryptoError::Decode("sealed payload too short".into()));
        }
        let (nonce, ciphertext) = sealed.split_at(NONCE_LEN);
        self.cipher
            .decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad })
            .map_err(|_| CryptoError::InvalidKey("payload authentication failed (wrong key or tampered data)".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    #[test]
    fn round_trips() {
        let c = PayloadCipher::from_hex(KEY).unwrap();
        let sealed = c.seal(b"hello", b"row").unwrap();
        assert_ne!(&sealed[NONCE_LEN..], b"hello");
        assert_eq!(c.open(&sealed, b"row").unwrap(), b"hello");
    }

    #[test]
    fn nonce_is_random_per_seal() {
        let c = PayloadCipher::from_hex(KEY).unwrap();
        assert_ne!(c.seal(b"x", b"").unwrap(), c.seal(b"x", b"").unwrap());
    }

    #[test]
    fn detects_tampering() {
        let c = PayloadCipher::from_hex(KEY).unwrap();
        let mut sealed = c.seal(b"hello", b"row").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert!(c.open(&sealed, b"row").is_err());
    }

    #[test]
    fn rejects_wrong_aad() {
        let c = PayloadCipher::from_hex(KEY).unwrap();
        let sealed = c.seal(b"hello", b"row-a").unwrap();
        assert!(c.open(&sealed, b"row-b").is_err());
    }

    #[test]
    fn wrong_key_fails() {
        let c = PayloadCipher::from_hex(KEY).unwrap();
        let sealed = c.seal(b"hello", b"row").unwrap();
        let other = PayloadCipher::from_hex(&"ff".repeat(32)).unwrap();
        assert!(matches!(other.open(&sealed, b"row"), Err(CryptoError::InvalidKey(_))));
    }

    #[test]
    fn rejects_malformed_key_and_short_payload() {
        assert!(PayloadCipher::from_hex("abc").is_err());
        assert!(PayloadCipher::from_hex(&"zz".repeat(32)).is_err());
        let c = PayloadCipher::from_hex(KEY).unwrap();
        assert!(c.open(&[1, 2, 3], b"").is_err());
    }
}
