import ReplayKit

/// Runs in ReplayKit's extension process. Only video crosses the app-group socket; the call owns audio.
final class SampleHandler: RPBroadcastSampleHandler {
  private var signals: BroadcastSignals?
  private var uploader: FrameUploader?
  private var previousFrame = CMTime.invalid
  private var finished = false

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
      let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      finish("Screen sharing is not configured.")
      return
    }
    signals = BroadcastSignals(group: group) { [weak self] event in
      if event == "stop" { DispatchQueue.main.async { self?.finish("Screen sharing stopped.") } }
    }
    uploader = FrameUploader(path: container.appendingPathComponent("rtc_SSFD").path) { [weak self] in
      DispatchQueue.main.async { self?.finish("The call stopped sharing your screen.") }
    }
    signals?.post("started")
  }

  override func broadcastFinished() {
    finished = true
    uploader?.close()
    uploader = nil
    signals?.post("stopped")
    signals = nil
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard !finished, sampleBufferType == .video else { return }
    let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    // Ten frames per second keeps text readable without overrunning the extension's memory budget.
    if previousFrame.isValid && CMTimeGetSeconds(time - previousFrame) < 0.1 { return }
    previousFrame = time
    uploader?.send(sampleBuffer)
  }

  private func finish(_ message: String) {
    guard !finished else { return }
    broadcastFinished()
    finishBroadcastWithError(NSError(domain: RPRecordingErrorDomain, code: 10001,
      userInfo: [NSLocalizedDescriptionKey: message]))
  }
}
