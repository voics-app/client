import AVFoundation
import Foundation

/// Decodes a validated Ogg/Opus stream into a protected temporary CAF for AVAudioPlayer.
enum OggOpusPlayback {
  static func makeFile(_ data: Data, in folder: URL) throws -> URL {
    let stream = try OggOpusReader.read(data)
    var description = AudioStreamBasicDescription()
    description.mSampleRate = 48_000
    description.mFormatID = kAudioFormatOpus
    description.mChannelsPerFrame = stream.channels
    description.mFramesPerPacket = 960
    guard let opus = AVAudioFormat(streamDescription: &description),
          let pcm = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: stream.channels),
          let decoder = AVAudioConverter(from: opus, to: pcm) else { throw OggOpusReadError.unsupported }
    decoder.primeMethod = .none
    #if os(iOS)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    #else
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    #endif
    let url = folder.appendingPathComponent(UUID().uuidString + ".caf")
    do {
      let output = try AVAudioFile(forWriting: url, settings: pcm.settings, commonFormat: .pcmFormatFloat32, interleaved: false)
      var index = 0
      var skip = Int(stream.preSkip)
      var remaining = Int(stream.finalGranule - UInt64(stream.preSkip))
      var loops = 0
      while remaining > 0 && loops < stream.packets.count * 4 + 16 {
        loops += 1
        guard let buffer = AVAudioPCMBuffer(pcmFormat: pcm, frameCapacity: 5760) else { throw OggOpusReadError.unsupported }
        var conversionError: NSError?
        let status = decoder.convert(to: buffer, error: &conversionError) { _, inputStatus in
          guard index < stream.packets.count else { inputStatus.pointee = .endOfStream; return nil }
          let packet = stream.packets[index]
          index += 1
          let compressed = AVAudioCompressedBuffer(format: opus, packetCapacity: 1, maximumPacketSize: 1275)
          packet.copyBytes(to: compressed.data.assumingMemoryBound(to: UInt8.self), count: packet.count)
          compressed.byteLength = UInt32(packet.count)
          compressed.packetCount = 1
          compressed.packetDescriptions?[0] = AudioStreamPacketDescription(mStartOffset: 0, mVariableFramesInPacket: 0, mDataByteSize: UInt32(packet.count))
          inputStatus.pointee = .haveData
          return compressed
        }
        if conversionError != nil || status == .error { throw OggOpusReadError.malformed }
        let length = Int(buffer.frameLength)
        let discarded = min(skip, length)
        skip -= discarded
        let count = min(remaining, length - discarded)
        if count > 0 {
          guard let slice = AVAudioPCMBuffer(pcmFormat: pcm, frameCapacity: AVAudioFrameCount(count)) else { throw OggOpusReadError.unsupported }
          slice.frameLength = AVAudioFrameCount(count)
          let input = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
          let destination = UnsafeMutableAudioBufferListPointer(slice.mutableAudioBufferList)
          let stride = Int(pcm.streamDescription.pointee.mBytesPerFrame)
          for channel in 0..<min(input.count, destination.count) {
            guard let src = input[channel].mData, let dst = destination[channel].mData else { throw OggOpusReadError.malformed }
            memcpy(dst, src.advanced(by: discarded * stride), count * stride)
          }
          try output.write(from: slice)
          remaining -= count
        }
        if status == .endOfStream { break }
        if status == .inputRanDry && index >= stream.packets.count && length == 0 { break }
      }
      guard skip == 0, remaining == 0 else { throw OggOpusReadError.malformed }
      return url
    } catch {
      try? FileManager.default.removeItem(at: url)
      throw error
    }
  }
}
