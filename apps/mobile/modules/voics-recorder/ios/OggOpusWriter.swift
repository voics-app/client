import Foundation

enum OggOpusError: Error { case invalidPacket, invalidDuration, finished }

/// One packet per page, mono Opus at 48 kHz. Granules are in decoded 48 kHz samples.
final class OggOpusWriter {
  private(set) var bytes = Data()
  private let serial: UInt32
  private let preSkip: UInt16
  private var sequence: UInt32 = 0
  private var samples: UInt64 = 0
  private var ended = false

  init(serial: UInt32, preSkip: UInt16) {
    self.serial = serial
    self.preSkip = preSkip
    var head = Data("OpusHead".utf8)
    head.append(contentsOf: [1, 1])
    head.appendLE(preSkip)
    head.appendLE(UInt32(48_000))
    head.appendLE(UInt16(0)) // output gain
    head.append(0) // channel mapping family
    page(head, granule: 0, flags: 2)
    var tags = Data("OpusTags".utf8)
    let vendor = Data("Voics".utf8)
    tags.appendLE(UInt32(vendor.count))
    tags.append(vendor)
    tags.appendLE(UInt32(0))
    page(tags, granule: 0, flags: 0)
  }

  func append(_ packet: Data, decodedSamples: UInt32, finalTrim: UInt32? = nil) throws {
    guard !ended else { throw OggOpusError.finished }
    guard !packet.isEmpty, packet.count <= 1275 else { throw OggOpusError.invalidPacket }
    guard decodedSamples > 0, decodedSamples <= 5760, (finalTrim ?? 0) < decodedSamples else { throw OggOpusError.invalidDuration }
    let nextSamples = samples + UInt64(decodedSamples)
    let finalSamples = nextSamples - UInt64(finalTrim ?? 0)
    guard finalSamples > UInt64(preSkip) else { throw OggOpusError.invalidDuration }
    samples = nextSamples
    ended = finalTrim != nil
    page(packet, granule: finalSamples, flags: ended ? 4 : 0)
  }

  private func page(_ packet: Data, granule: UInt64, flags: UInt8) {
    var segments = [UInt8](repeating: 255, count: packet.count / 255)
    segments.append(UInt8(packet.count % 255))
    var page = Data("OggS".utf8)
    page.append(contentsOf: [0, flags])
    page.appendLE(granule)
    page.appendLE(serial)
    page.appendLE(sequence)
    page.appendLE(UInt32(0))
    page.append(UInt8(segments.count))
    page.append(contentsOf: segments)
    page.append(packet)
    var crc: UInt32 = 0
    for byte in page {
      crc ^= UInt32(byte) << 24
      for _ in 0..<8 { crc = (crc & 0x8000_0000) != 0 ? (crc << 1) ^ 0x04c1_1db7 : crc << 1 }
    }
    for i in 0..<4 { page[22 + i] = UInt8(truncatingIfNeeded: crc >> (8 * i)) }
    bytes.append(page)
    sequence &+= 1
  }
}

private extension Data {
  mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
    var little = value.littleEndian
    Swift.withUnsafeBytes(of: &little) { append(contentsOf: $0) }
  }
}
