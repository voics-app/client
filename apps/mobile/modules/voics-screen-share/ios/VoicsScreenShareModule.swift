import ExpoModulesCore
import ReplayKit
import UIKit

public class VoicsScreenShareModule: Module {
  private var signals: BroadcastSignals?
  private var pending: Promise?
  private var picker: RPSystemBroadcastPickerView?
  private var timeout: DispatchWorkItem?
  private var activeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("VoicsScreenShare")
    AsyncFunction("requestBroadcast") { (promise: Promise) in
      self.request(promise)
    }.runOnQueue(.main)
    AsyncFunction("stopBroadcast") {
      self.signals?.post("stop")
      self.finish(false)
    }.runOnQueue(.main)
    OnDestroy {
      DispatchQueue.main.async {
        self.signals?.post("stop")
        self.finish(false)
        self.signals = nil
      }
    }
  }

  private func request(_ promise: Promise) {
    guard pending == nil,
      let group = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
      let extensionId = Bundle.main.object(forInfoDictionaryKey: "RTCScreenSharingExtension") as? String,
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil,
      let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else {
      promise.reject("SCREEN_SHARE_UNAVAILABLE", "Screen sharing is not configured in this build.")
      return
    }
    signals = BroadcastSignals(group: group) { [weak self] event in
      DispatchQueue.main.async {
        if event == "started" { self?.finish(true) }
        if event == "stopped" { self?.finish(false) }
      }
    }
    pending = promise
    let view = RPSystemBroadcastPickerView(frame: CGRect(x: -100, y: -100, width: 44, height: 44))
    view.preferredExtension = extensionId
    view.showsMicrophoneButton = false // Call audio already owns the microphone.
    window.addSubview(view)
    picker = view
    guard let button = view.subviews.compactMap({ $0 as? UIButton }).first else {
      finish(false)
      return
    }
    // ReplayKit has no picker-dismiss callback. Allow its three-second countdown after returning
    // active, then release a dismissed request. A hard limit also covers a sheet left open.
    activeObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification,
      object: nil, queue: .main) { [weak self] _ in self?.scheduleTimeout(seconds: 5) }
    scheduleTimeout(seconds: 60)
    button.sendActions(for: .touchUpInside)
  }

  private func scheduleTimeout(seconds: TimeInterval) {
    timeout?.cancel()
    let work = DispatchWorkItem { [weak self] in
      self?.signals?.post("stop")
      self?.finish(false)
    }
    timeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func finish(_ started: Bool) {
    timeout?.cancel()
    timeout = nil
    if let observer = activeObserver { NotificationCenter.default.removeObserver(observer) }
    activeObserver = nil
    picker?.removeFromSuperview()
    picker = nil
    let promise = pending
    pending = nil
    promise?.resolve(started)
  }
}
