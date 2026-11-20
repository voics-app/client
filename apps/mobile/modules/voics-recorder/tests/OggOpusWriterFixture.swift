import Foundation

@main struct OggOpusWriterFixture {
  static func main() throws {
    let writer = OggOpusWriter(serial: 7, preSkip: 312)
    try writer.append(Data([0xf8, 0xff, 0xfe]), decodedSamples: 960)
    try writer.append(Data([0xf8, 0xff, 0xfe]), decodedSamples: 960, finalTrim: 120)
    do { try writer.append(Data([0xf8]), decodedSamples: 960); fatalError("append after EOS accepted") } catch {}
    FileHandle.standardOutput.write(writer.bytes)
  }
}
