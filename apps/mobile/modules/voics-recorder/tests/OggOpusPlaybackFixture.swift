import AVFoundation
import Foundation

@main struct OggOpusPlaybackFixture {
  static func main() throws {
    let writer = OggOpusWriter(serial: 7, preSkip: 312)
    try writer.append(Data([0xf8, 0xff, 0xfe]), decodedSamples: 960)
    try writer.append(Data([0xf8, 0xff, 0xfe]), decodedSamples: 960, finalTrim: 120)
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("voics-play-test-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: folder) }
    let file = try OggOpusPlayback.makeFile(writer.bytes, in: folder)
    let audio = try AVAudioFile(forReading: file)
    precondition(audio.length == 1488, "unexpected decoded duration")
  }
}
