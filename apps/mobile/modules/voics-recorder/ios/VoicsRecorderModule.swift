import AVFoundation
import ExpoModulesCore
import Foundation
import UIKit

/// Captures PCM and encodes Opus using the platform codec. Ogg packaging is performed at stop.
public final class VoicsRecorderModule: Module {
  private let lock = NSLock()
  private var engine: AVAudioEngine?
  private var converter: AVAudioConverter?
  private var packets: [Data] = []
  private var levels: [UInt8] = []
  private var frames: Double = 0
  private var failed = false
  private let playbackDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("voics-voice-playback", isDirectory: true)
  private var backgroundObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("VoicsRecorder")
    OnCreate {
      try? FileManager.default.removeItem(at: self.playbackDirectory)
      self.backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.cancel() }
    }
    AsyncFunction("start") { try self.start() }
    AsyncFunction("stop") { try self.stop() }
    AsyncFunction("cancel") { self.cancel() }
    AsyncFunction("discard") { (uri: String) in
      guard let url = URL(string: uri), url.isFileURL else { return }
      let folder = FileManager.default.temporaryDirectory.standardizedFileURL
      let file = url.standardizedFileURL
      if file.deletingLastPathComponent() == folder && file.lastPathComponent.hasPrefix("voice-") && file.pathExtension == "ogg" { try? FileManager.default.removeItem(at: file) }
    }
    AsyncFunction("preparePlayback") { (uri: String) async throws -> String in
      guard let url = URL(string: uri) else { throw RecorderError.unavailable }
      let data: Data
      if url.isFileURL { data = try Data(contentsOf: url, options: .mappedIfSafe) }
      else {
        guard ["https", "http"].contains(url.scheme ?? "") else { throw RecorderError.unavailable }
        var request = URLRequest(url: url); request.httpShouldHandleCookies = false
        let (downloaded, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw RecorderError.unavailable }
        data = downloaded
      }
      return try OggOpusPlayback.makeFile(data, in: self.playbackDirectory).absoluteString
    }
    AsyncFunction("discardPlayback") { (uri: String) in
      guard let url = URL(string: uri), url.isFileURL, url.standardizedFileURL.deletingLastPathComponent() == self.playbackDirectory.standardizedFileURL, url.pathExtension == "caf" else { return }
      try? FileManager.default.removeItem(at: url)
    }
    OnDestroy {
      self.cancel()
      if let observer = self.backgroundObserver { NotificationCenter.default.removeObserver(observer); self.backgroundObserver = nil }
    }
  }

  private func start() throws {
    guard engine == nil else { throw RecorderError.busy }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
    try session.setActive(true)
    let next = AVAudioEngine()
    let input = next.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else { throw RecorderError.unavailable }
    var description = AudioStreamBasicDescription()
    description.mSampleRate = 48_000
    description.mFormatID = kAudioFormatOpus
    description.mChannelsPerFrame = 1
    description.mFramesPerPacket = 960
    guard let opus = AVAudioFormat(streamDescription: &description), let encoder = AVAudioConverter(from: inputFormat, to: opus) else { throw RecorderError.unavailable }
    encoder.bitRate = 64_000
    lock.lock()
    packets.removeAll(); levels.removeAll(); frames = 0; failed = false; converter = encoder; engine = next
    lock.unlock()
    input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in self?.consume(buffer, opus: opus) }
    do { try next.start() } catch { cancel(); throw error }
  }

  private func consume(_ buffer: AVAudioPCMBuffer, opus: AVAudioFormat) {
    lock.lock(); defer { lock.unlock() }
    guard !failed, let encoder = converter else { return }
    frames += Double(buffer.frameLength) * 48_000 / buffer.format.sampleRate
    if frames > 301 * 48_000 { failed = true; return }
    if let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 {
      var peak: Float = 0
      for i in 0..<Int(buffer.frameLength) { peak = max(peak, abs(channel[i])) }
      levels.append(peak.isFinite ? UInt8(min(255, max(0, Int(peak * 255)))) : 0)
    }
    var offset: AVAudioFrameCount = 0
    while offset < buffer.frameLength {
      let before = offset
      let output = AVAudioCompressedBuffer(format: opus, packetCapacity: 1, maximumPacketSize: encoder.maximumOutputPacketSize)
      var conversionError: NSError?
      let status = encoder.convert(to: output, error: &conversionError) { requested, inputStatus in
        let count = min(AVAudioFrameCount(requested), buffer.frameLength - offset)
        guard count > 0, let slice = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: count) else { inputStatus.pointee = .noDataNow; return nil }
        slice.frameLength = count
        let source = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        let destination = UnsafeMutableAudioBufferListPointer(slice.mutableAudioBufferList)
        let stride = Int(buffer.format.streamDescription.pointee.mBytesPerFrame)
        for index in 0..<min(source.count, destination.count) {
          guard let src = source[index].mData, let dst = destination[index].mData else { inputStatus.pointee = .noDataNow; return nil }
          memcpy(dst, src.advanced(by: Int(offset) * stride), Int(count) * stride)
        }
        offset += count
        inputStatus.pointee = .haveData
        return slice
      }
      if conversionError != nil || status == .error { failed = true; return }
      if output.packetCount > 0 && output.byteLength > 0 { packets.append(Data(bytes: output.data, count: Int(output.byteLength))) }
      if status == .inputRanDry && offset < buffer.frameLength { failed = true; return }
      if offset == before { failed = true; return }
    }
  }

  private func stop() throws -> [String: Any] {
    guard let current = engine else { throw RecorderError.unavailable }
    current.inputNode.removeTap(onBus: 0)
    current.stop()
    lock.lock(); defer { lock.unlock() }
    defer { engine = nil; converter = nil; packets.removeAll(); levels.removeAll(); frames = 0 }
    guard !failed, let encoder = converter, frames > 0 else { throw RecorderError.failed }
    let format = encoder.outputFormat
    // Drain the encoder so the final Opus frame and codec delay are retained.
    for _ in 0..<8 {
      let output = AVAudioCompressedBuffer(format: format, packetCapacity: 1, maximumPacketSize: encoder.maximumOutputPacketSize)
      var error: NSError?
      let status = encoder.convert(to: output, error: &error) { _, inputStatus in inputStatus.pointee = .endOfStream; return nil }
      if error != nil || status == .error { throw RecorderError.failed }
      if output.packetCount > 0 && output.byteLength > 0 { packets.append(Data(bytes: output.data, count: Int(output.byteLength))) }
      if status == .endOfStream || status == .inputRanDry { break }
    }
    let delay = UInt64(encoder.primeInfo.leadingFrames)
    let realSamples = UInt64(frames.rounded())
    let encodedSamples = UInt64(packets.count) * 960
    guard !packets.isEmpty, delay <= UInt64(UInt16.max), encodedSamples >= delay + realSamples, encodedSamples - delay - realSamples < 960 else { throw RecorderError.failed }
    let writer = OggOpusWriter(serial: UInt32.random(in: 1...UInt32.max), preSkip: UInt16(delay))
    for (index, packet) in packets.enumerated() {
      let trim = index == packets.count - 1 ? UInt32(encodedSamples - delay - realSamples) : nil
      try writer.append(packet, decodedSamples: 960, finalTrim: trim)
    }
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).ogg")
    try writer.bytes.write(to: file, options: [.atomic, .completeFileProtection])
    let waveform = Data((0..<64).map { levels.isEmpty ? 0 : levels[min(levels.count - 1, $0 * levels.count / 64)] }).base64EncodedString()
    return ["uri": file.absoluteString, "size": writer.bytes.count, "duration_secs": Double(realSamples) / 48_000, "waveform": waveform]
  }

  private func cancel() {
    let current = engine
    current?.inputNode.removeTap(onBus: 0); current?.stop()
    lock.lock(); defer { lock.unlock() }
    engine = nil; converter = nil; packets.removeAll(); levels.removeAll(); frames = 0
  }
}

private enum RecorderError: Error { case busy, unavailable, failed }
