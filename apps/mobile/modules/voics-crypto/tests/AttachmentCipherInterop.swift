import Foundation

// Run on macOS: swiftc ios/AttachmentCipher.swift tests/AttachmentCipherInterop.swift -o "$TMPDIR/voics-cipher-test" && "$TMPDIR/voics-cipher-test"
@main struct AttachmentCipherInterop {
  static func main() throws {
    func b64(_ value: String) -> Data { Data(base64Encoded: value)! }
    // Node's AES-256-GCM and SHA-256 output, with a fixed key/nonce and plaintext.
    let key = b64("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
    let nonce = b64("AAECAwQFBgcICQoL")
    let plain = b64("dm9pY3Mtb3B1cy1maXh0dXJl")
    let ciphertext = b64("MW2/eLbIrWv4Mrrt2JEMGPGzw4ZlzZRmouTlgRT4u4UOJg==")
    let hash = b64("1+vXh8wn6s9PYfBnx2jcSL8yMehzog2tvC7epCiRtYg=")
    let decoded = try AttachmentCipher.decrypt(ciphertext, key: key, nonce: nonce, hash: hash, size: plain.count)
    precondition(decoded == plain)
    var tampered = ciphertext
    tampered[0] ^= 1
    do { _ = try AttachmentCipher.decrypt(tampered, key: key, nonce: nonce, hash: hash, size: plain.count); fatalError("tampered data accepted") } catch {}
    let generated = try AttachmentCipher.encrypt(plain)
    let roundTrip = try AttachmentCipher.decrypt(b64(generated["ciphertext"]!), key: b64(generated["key_b64"]!), nonce: b64(generated["nonce_b64"]!), hash: b64(generated["sha256_b64"]!), size: plain.count)
    precondition(roundTrip == plain)
    let json = try JSONSerialization.data(withJSONObject: generated, options: [.sortedKeys])
    print(String(decoding: json, as: UTF8.self))
  }
}
