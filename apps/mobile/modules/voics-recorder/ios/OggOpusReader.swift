import Foundation

enum OggOpusReadError: Error { case malformed, unsupported }

struct OggOpusStream {
  let packets: [Data]
  let channels: UInt32
  let preSkip: UInt16
  let finalGranule: UInt64
}

/// Parses page lacing and verifies checksums before passing untrusted packets to the codec.
enum OggOpusReader {
  static func read(_ data: Data) throws -> OggOpusStream {
    guard data.count <= 25 * 1024 * 1024 else { throw OggOpusReadError.unsupported }
    var position = 0, expectedSequence: UInt32 = 0
    var serial: UInt32?
    var packets: [Data] = [], partial = Data()
    var finalGranule: UInt64?
    while position < data.count {
      guard finalGranule == nil, data.count - position >= 27, data[position..<(position + 4)] == Data("OggS".utf8), data[position + 4] == 0 else { throw OggOpusReadError.malformed }
      let flags = data[position + 5]
      let granule: UInt64 = integer(data, position + 6)
      let pageSerial: UInt32 = integer(data, position + 14)
      let sequence: UInt32 = integer(data, position + 18)
      let expectedCrc: UInt32 = integer(data, position + 22)
      let count = Int(data[position + 26])
      guard data.count - position >= 27 + count, sequence == expectedSequence,
            serial == nil || serial == pageSerial,
            flags & 0xf8 == 0, (expectedSequence == 0) == ((flags & 2) != 0),
            ((flags & 1) != 0) == !partial.isEmpty,
            count > 0 else { throw OggOpusReadError.malformed }
      serial = pageSerial
      let laces = data[(position + 27)..<(position + 27 + count)]
      let bodyLength = laces.reduce(0) { $0 + Int($1) }
      let pageLength = 27 + count + bodyLength
      guard data.count - position >= pageLength else { throw OggOpusReadError.malformed }
      var crc: UInt32 = 0
      for index in 0..<pageLength {
        let byte = (22..<26).contains(index) ? UInt8(0) : data[position + index]
        crc ^= UInt32(byte) << 24
        for _ in 0..<8 { crc = (crc & 0x8000_0000) != 0 ? (crc << 1) ^ 0x04c1_1db7 : crc << 1 }
      }
      guard crc == expectedCrc else { throw OggOpusReadError.malformed }
      var body = position + 27 + count
      for lace in laces {
        let size = Int(lace)
        partial.append(data[body..<(body + size)])
        guard partial.count <= 65_536 else { throw OggOpusReadError.unsupported }
        body += size
        if lace < 255 { packets.append(partial); partial = Data() }
      }
      if flags & 4 != 0 { guard partial.isEmpty else { throw OggOpusReadError.malformed }; finalGranule = granule }
      expectedSequence &+= 1
      position += pageLength
    }
    guard packets.count >= 3, let end = finalGranule,
          packets[0].count >= 19, packets[0].prefix(8) == Data("OpusHead".utf8),
          packets[0][8] == 1, (1...2).contains(packets[0][9]), packets[0][18] == 0,
          packets[1].starts(with: Data("OpusTags".utf8)),
          packets.dropFirst(2).allSatisfy({ !$0.isEmpty && $0.count <= 1275 }) else { throw OggOpusReadError.unsupported }
    let skip: UInt16 = integer(packets[0], 10)
    guard end > UInt64(skip), end - UInt64(skip) <= 600 * 48_000 else { throw OggOpusReadError.unsupported }
    return OggOpusStream(packets: Array(packets.dropFirst(2)), channels: UInt32(packets[0][9]), preSkip: skip, finalGranule: end)
  }

  private static func integer<T: FixedWidthInteger>(_ data: Data, _ offset: Int) -> T {
    var result: T = 0
    for index in 0..<MemoryLayout<T>.size { result |= T(data[offset + index]) << (index * 8) }
    return result
  }
}
