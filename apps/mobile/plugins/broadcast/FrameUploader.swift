import ReplayKit
import Darwin

/// LiveKit WebRTC's ScreenCapturer consumes HTTP-framed JPEGs over the rtc_SSFD Unix socket.
/// A single in-flight frame bounds memory and drops frames instead of queuing screen content.
final class FrameUploader {
  private let queue = DispatchQueue(label: "nl.voics.broadcast.frames")
  private let permit = DispatchSemaphore(value: 1)
  private let context = CIContext(options: [.cacheIntermediates: false])
  private let path: String
  private let onClosed: () -> Void
  private var socket: Int32 = -1
  private var closed = false

  init(path: String, onClosed: @escaping () -> Void) {
    self.path = path
    self.onClosed = onClosed
  }

  func send(_ sample: CMSampleBuffer) {
    guard permit.wait(timeout: .now()) == .success else { return }
    queue.async { [self] in
      defer { permit.signal() }
      autoreleasepool {
        guard !closed else { return }
        guard connect(), let data = encode(sample), write(data) else {
          shutdown()
          onClosed()
          return
        }
      }
    }
  }

  func close() { queue.async { [self] in shutdown() } }

  private func shutdown() {
    closed = true
    if socket >= 0 { Darwin.shutdown(socket, SHUT_RDWR); Darwin.close(socket); socket = -1 }
  }

  private func connect() -> Bool {
    if socket >= 0 { return true }
    socket = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard socket >= 0 else { return false }
    var noSignal: Int32 = 1
    setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
    var timeout = timeval(tv_sec: 2, tv_usec: 0)
    setsockopt(socket, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = path.utf8CString
    guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { return false }
    withUnsafeMutableBytes(of: &address.sun_path) { destination in
      bytes.withUnsafeBytes { source in destination.copyMemory(from: source) }
    }
    return withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) == 0
      }
    }
  }

  private func write(_ data: Data) -> Bool {
    data.withUnsafeBytes { raw in
      guard let base = raw.baseAddress else { return false }
      var offset = 0
      while offset < raw.count {
        let written = Darwin.send(socket, base.advanced(by: offset), raw.count - offset, 0)
        if written < 0 && errno == EINTR { continue }
        guard written > 0 else { return false }
        offset += written
      }
      return true
    }
  }

  private func encode(_ sample: CMSampleBuffer) -> Data? {
    guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return nil }
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let scale = min(1, 1280.0 / Double(max(width, height)))
    let image = CIImage(cvPixelBuffer: buffer).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let color = CGColorSpaceCreateDeviceRGB()
    let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
    guard let jpeg = context.jpegRepresentation(of: image, colorSpace: color, options: [quality: 0.8]) else { return nil }
    let orientation = (CMGetAttachment(sample, key: RPVideoSampleOrientationKey as CFString,
      attachmentModeOut: nil) as? NSNumber)?.intValue ?? 1
    let header = "HTTP/1.1 200 OK\r\nContent-Length: \(jpeg.count)\r\nBuffer-Width: \(Int(image.extent.width))\r\nBuffer-Height: \(Int(image.extent.height))\r\nBuffer-Orientation: \(orientation)\r\n\r\n"
    var message = Data(header.utf8)
    message.append(jpeg)
    return message
  }
}
