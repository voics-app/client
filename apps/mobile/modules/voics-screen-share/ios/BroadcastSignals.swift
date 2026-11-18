import Foundation

/// Darwin notifications carry lifecycle only, never captured content or credentials.
final class BroadcastSignals {
  private let group: String
  private let receive: (String) -> Void

  init(group: String, receive: @escaping (String) -> Void) {
    self.group = group
    self.receive = receive
    for event in ["started", "stopped", "stop"] {
      CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),
        Unmanaged.passUnretained(self).toOpaque(), { _, observer, name, _, _ in
          guard let observer = observer, let name = name else { return }
          let signals = Unmanaged<BroadcastSignals>.fromOpaque(observer).takeUnretainedValue()
          signals.receive((name.rawValue as String).components(separatedBy: ".").last ?? "")
        }, notification(event).rawValue, nil, .deliverImmediately)
    }
  }

  deinit {
    CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque())
  }

  func post(_ event: String) {
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), notification(event), nil, nil, true)
  }

  private func notification(_ event: String) -> CFNotificationName {
    CFNotificationName(rawValue: "\(group).broadcast.\(event)" as CFString)
  }
}
