import Foundation
import Security

/// Holds the 256-bit key of the encrypted local store in the iOS Keychain, one item per user.
/// The key is generated here, never leaves the device (ThisDeviceOnly: not in backups, not migrated)
/// and is never passed to JavaScript. AfterFirstUnlock lets incoming messages be stored while the phone is locked.
struct StoreKeyVault {
  private let service = "nl.voics.app.crypto.store-key"
  private let keyBytes = 32

  /// The store key of `userId` as 64 hex characters, created on first use.
  func hexKey(for userId: String) throws -> String {
    if let existing = try read(userId) { return hex(existing) }
    var fresh = Data(count: keyBytes)
    let count = keyBytes
    let status = fresh.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
    guard status == errSecSuccess else { throw VaultError.random(status) }
    switch SecItemAdd(addQuery(userId, fresh) as CFDictionary, nil) {
    case errSecSuccess:
      return hex(fresh)
    case errSecDuplicateItem:
      // Another call stored a key between the read and the add: use that one.
      guard let existing = try read(userId) else { throw VaultError.keychain(errSecItemNotFound) }
      return hex(existing)
    case let failure:
      throw VaultError.keychain(failure)
    }
  }

  private func identity(_ userId: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: userId]
  }

  private func addQuery(_ userId: String, _ key: Data) -> [String: Any] {
    var query = identity(userId)
    query[kSecValueData as String] = key
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return query
  }

  private func read(_ userId: String) throws -> Data? {
    var query = identity(userId)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    switch SecItemCopyMatching(query as CFDictionary, &result) {
    case errSecSuccess:
      guard let data = result as? Data, data.count == keyBytes else { throw VaultError.corrupt }
      return data
    case errSecItemNotFound:
      return nil
    case let failure:
      throw VaultError.keychain(failure)
    }
  }

  private func hex(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }
}

enum VaultError: Error, CustomStringConvertible {
  case keychain(OSStatus)
  case random(OSStatus)
  case corrupt

  var description: String {
    switch self {
    case .keychain(let status): return "keychain error \(status)"
    case .random(let status): return "secure random failed \(status)"
    case .corrupt: return "the stored store key is damaged"
    }
  }
}
