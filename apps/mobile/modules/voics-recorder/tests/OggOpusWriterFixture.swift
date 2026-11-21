import Foundation

@main struct OggOpusWriterFixture {
  static func main() throws {
    let writer = OggOpusWriter(serial: 7, preSkip: 312)
    try writer.append(Data([0xf8, 0xff, 0xfe]), decodedSamples: 960)
    try writer.append(Data([0xf8, 0xff, 0xfe]), decodedSamples: 960, finalTrim: 120)
    let parsed = try OggOpusReader.read(writer.bytes)
    precondition(parsed.packets.count == 2 && parsed.preSkip == 312 && parsed.finalGranule == 1800)
    var corrupt = writer.bytes
    corrupt[corrupt.count - 1] ^= 1
    do { _ = try OggOpusReader.read(corrupt); fatalError("corrupt page accepted") } catch {}
    do { try writer.append(Data([0xf8]), decodedSamples: 960); fatalError("append after EOS accepted") } catch {}
    FileHandle.standardOutput.write(writer.bytes)
  }
}
