import Foundation
import CryptoKit

enum AttachmentCipherError: Error { case invalid, integrity }

/// Wire-compatible with WebCrypto: AES-256-GCM ciphertext followed by its 16-byte tag.
enum AttachmentCipher {
  static func encrypt(_ plain: Data) throws -> [String: String] {
    guard !plain.isEmpty, plain.count <= 64 * 1024 * 1024 else { throw AttachmentCipherError.invalid }
    let key = SymmetricKey(size: .bits256)
    let sealed = try AES.GCM.seal(plain, using: key)
    return ["ciphertext": (sealed.ciphertext + sealed.tag).base64EncodedString(),
            "key_b64": key.withUnsafeBytes { Data($0) }.base64EncodedString(),
            "nonce_b64": Data(sealed.nonce).base64EncodedString(),
            "sha256_b64": Data(SHA256.hash(data: plain)).base64EncodedString()]
  }

  static func decrypt(_ data: Data, key: Data, nonce: Data, hash: Data, size: Int) throws -> Data {
    guard size > 0, size <= 64 * 1024 * 1024, data.count == size + 16,
          key.count == 32, nonce.count == 12, hash.count == 32 else { throw AttachmentCipherError.invalid }
    let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: data.dropLast(16), tag: data.suffix(16))
    let plain = try AES.GCM.open(box, using: SymmetricKey(data: key))
    guard Data(SHA256.hash(data: plain)) == hash else { throw AttachmentCipherError.integrity }
    return plain
  }
}
