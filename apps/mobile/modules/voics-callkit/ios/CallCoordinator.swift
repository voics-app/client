import AVFoundation
import CallKit
import Foundation
import PushKit

/// What the native side tells JavaScript: `type` is one of `token`, `incoming`, `answer`, `end`, `mute`, `audio`.
typealias CallEvent = [String: Any?]

/// A call CallKit shows.
private final class TrackedCall {
  let uuid: UUID
  let channelId: String
  let outgoing: Bool
  var answered: Bool
  var displayName: String?
  /// Set when the app ends the call itself, so the system's end action is not reported back as a hang-up by the person.
  var endedByApp = false
  var ringTimeout: DispatchWorkItem?

  init(uuid: UUID, channelId: String, outgoing: Bool, displayName: String?) {
    self.uuid = uuid
    self.channelId = channelId
    self.outgoing = outgoing
    self.answered = outgoing
    self.displayName = displayName
  }
}

/// Owns CallKit and PushKit for the whole app.
///
/// Apple's rule, and the reason this lives in native code that starts with the app: every VoIP push must be
/// reported to CallKit (`reportNewIncomingCall`) before its completion handler runs, even when the payload is
/// unusable, or iOS stops delivering VoIP pushes and ends the app. The PushKit registry is created at launch
/// (`VoicsCallKitAppDelegate`), so a push that wakes a closed app is reported here before JavaScript exists.
///
/// Everything runs on the main queue. Events for JavaScript queue up until a listener exists, which is how an
/// answer given on the lock screen of a closed app reaches the app once it has started.
final class CallCoordinator: NSObject, CXProviderDelegate, PKPushRegistryDelegate {
  static let shared = CallCoordinator()

  /// A ring lasts as long as the gateway rings; the payload says how long, within these bounds.
  private static let defaultRingSeconds = 30
  private static let maxRingSeconds = 60
  private static let maxQueuedEvents = 50

  private let provider: CXProvider
  private let controller = CXCallController()
  private var registry: PKPushRegistry?
  private var calls: [UUID: TrackedCall] = [:]
  private var queued: [CallEvent] = []
  private var sink: ((CallEvent) -> Void)?
  private var started = false
  private(set) var voipToken: String?

  private override init() {
    let configuration = CXProviderConfiguration()
    configuration.supportsVideo = true
    configuration.maximumCallGroups = 1
    configuration.maximumCallsPerCallGroup = 1
    configuration.supportedHandleTypes = [.generic]
    configuration.includesCallsInRecents = false
    provider = CXProvider(configuration: configuration)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  /// Registers for VoIP pushes. Called from the app delegate at launch; safe to call again.
  func start() {
    guard !started else { return }
    started = true
    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    self.registry = registry
  }

  // MARK: JavaScript side

  func setSink(_ newSink: ((CallEvent) -> Void)?) {
    sink = newSink
    guard let newSink = newSink else { return }
    let waiting = queued
    queued.removeAll()
    for event in waiting { newSink(event) }
  }

  /// Reports a ringing call from JavaScript (the app is open and the gateway rang). `false` when CallKit refused it
  /// (Do Not Disturb, a blocked caller) or the call is already shown.
  func reportIncoming(channelId: String, callerName: String?, isPrivate: Bool, ringSeconds: Int?, completion: @escaping (Bool) -> Void) {
    guard call(forChannel: channelId) == nil else {
      completion(false)
      return
    }
    report(channelId: channelId, callerName: callerName, isPrivate: isPrivate, ringSeconds: ringSeconds, completion: completion)
  }

  /// The person starts or joins a call from the app: it appears in the system call UI (and keeps the audio session alive).
  func startOutgoing(channelId: String, name: String?, completion: @escaping (Bool) -> Void) {
    if call(forChannel: channelId) != nil {
      completion(true)
      return
    }
    let uuid = UUID()
    calls[uuid] = TrackedCall(uuid: uuid, channelId: channelId, outgoing: true, displayName: Self.displayName(callerName: name, isPrivate: false))
    let action = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: channelId))
    action.isVideo = false
    controller.request(CXTransaction(action: action)) { [weak self] error in
      DispatchQueue.main.async {
        if error != nil { self?.calls[uuid] = nil }
        completion(error == nil)
      }
    }
  }

  /// The call the person started is connected to the others.
  func reportConnected(channelId: String) {
    guard let call = call(forChannel: channelId), call.outgoing else { return }
    provider.reportOutgoingCall(with: call.uuid, connectedAt: Date())
  }

  /// Ends a call. `local` is the person leaving from inside the app (CallKit records a normal end); every other reason is the
  /// call ending on the far side: `unanswered`, `answeredElsewhere`, `declinedElsewhere`, `failed` or anything else (`remoteEnded`).
  func endCall(channelId: String, reason: String) {
    guard let call = call(forChannel: channelId) else { return }
    call.ringTimeout?.cancel()
    if reason == "local" {
      call.endedByApp = true
      controller.request(CXTransaction(action: CXEndCallAction(call: call.uuid))) { [weak self] error in
        guard error != nil else { return }
        DispatchQueue.main.async { self?.finish(call, reason: .remoteEnded) }
      }
      return
    }
    finish(call, reason: Self.endedReason(reason))
  }

  /// Mirrors the app's mute to the system call UI.
  func setMuted(channelId: String, muted: Bool) {
    guard let call = call(forChannel: channelId) else { return }
    controller.request(CXTransaction(action: CXSetMutedCallAction(call: call.uuid, muted: muted)), completion: { _ in })
  }

  // MARK: Reporting

  private func report(channelId: String, callerName: String?, isPrivate: Bool, ringSeconds: Int?, completion: @escaping (Bool) -> Void) {
    let uuid = UUID()
    let name = Self.displayName(callerName: callerName, isPrivate: isPrivate)
    let tracked = TrackedCall(uuid: uuid, channelId: channelId, outgoing: false, displayName: name)
    calls[uuid] = tracked
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: channelId)
    update.localizedCallerName = name
    update.hasVideo = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
      DispatchQueue.main.async {
        guard let self = self else {
          completion(false)
          return
        }
        if error != nil {
          self.calls[uuid] = nil
          completion(false)
          return
        }
        self.scheduleRingTimeout(tracked, seconds: ringSeconds)
        self.emit(["type": "incoming", "channelId": channelId, "private": isPrivate])
        completion(true)
      }
    }
  }

  /// A push that cannot be used still has to be reported; the call is ended at once.
  private func reportUnusable(completion: @escaping (Bool) -> Void) {
    let uuid = UUID()
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "unknown")
    update.localizedCallerName = Self.appName
    provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
      DispatchQueue.main.async {
        if error == nil { self?.provider.reportCall(with: uuid, endedAt: Date(), reason: .failed) }
        completion(error == nil)
      }
    }
  }

  private func scheduleRingTimeout(_ call: TrackedCall, seconds: Int?) {
    let limit = min(max(seconds ?? Self.defaultRingSeconds, 5), Self.maxRingSeconds)
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, let current = self.calls[call.uuid], !current.answered else { return }
      self.finish(current, reason: .unanswered)
      self.emit(["type": "end", "channelId": current.channelId, "reason": "timeout"])
    }
    call.ringTimeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(limit), execute: work)
  }

  private func finish(_ call: TrackedCall, reason: CXCallEndedReason) {
    call.ringTimeout?.cancel()
    calls[call.uuid] = nil
    provider.reportCall(with: call.uuid, endedAt: Date(), reason: reason)
  }

  private func call(forChannel channelId: String) -> TrackedCall? {
    calls.values.first { $0.channelId == channelId }
  }

  private func emit(_ event: CallEvent) {
    if let sink = sink {
      sink(event)
      return
    }
    queued.append(event)
    if queued.count > Self.maxQueuedEvents { queued.removeFirst() }
  }

  private static var appName: String {
    (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
      ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String)
      ?? "Call"
  }

  /// A private call (an encrypted conversation) shows the app's name, never the caller's.
  private static func displayName(callerName: String?, isPrivate: Bool) -> String {
    if isPrivate { return appName }
    if let name = callerName, !name.isEmpty { return name }
    return appName
  }

  private static func endedReason(_ reason: String) -> CXCallEndedReason {
    switch reason {
    case "unanswered": return .unanswered
    case "answeredElsewhere": return .answeredElsewhere
    case "declinedElsewhere": return .declinedElsewhere
    case "failed": return .failed
    default: return .remoteEnded
    }
  }

  // MARK: PKPushRegistryDelegate

  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let hex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    voipToken = hex
    emit(["type": "token", "token": hex])
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    voipToken = nil
    emit(["type": "token", "token": nil])
  }

  /// Every VoIP push ends in `reportNewIncomingCall` before `completion` runs.
  func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    guard type == .voIP else {
      completion()
      return
    }
    let body = payload.dictionaryPayload
    guard (body["type"] as? String) == "call", let channelId = body["channel_id"] as? String, !channelId.isEmpty else {
      reportUnusable { _ in completion() }
      return
    }
    // A call that is already shown (the app was open and the gateway rang first) is reported once more because Apple
    // requires it, and ended at once, so the person sees one call.
    if call(forChannel: channelId) != nil {
      reportUnusable { _ in completion() }
      return
    }
    report(
      channelId: channelId,
      callerName: body["caller_name"] as? String,
      isPrivate: (body["private"] as? Bool) ?? true,
      ringSeconds: body["ring_seconds"] as? Int
    ) { _ in completion() }
  }

  // MARK: CXProviderDelegate

  func providerDidReset(_ provider: CXProvider) {
    for call in calls.values {
      call.ringTimeout?.cancel()
      emit(["type": "end", "channelId": call.channelId, "reason": "reset"])
    }
    calls.removeAll()
  }

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    guard let call = calls[action.callUUID] else {
      action.fail()
      return
    }
    let update = CXCallUpdate()
    update.remoteHandle = action.handle
    update.localizedCallerName = call.displayName
    update.hasVideo = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    provider.reportCall(with: action.callUUID, updated: update)
    provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard let call = calls[action.callUUID] else {
      action.fail()
      return
    }
    call.answered = true
    call.ringTimeout?.cancel()
    emit(["type": "answer", "channelId": call.channelId])
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    if let call = calls.removeValue(forKey: action.callUUID) {
      call.ringTimeout?.cancel()
      if !call.endedByApp {
        emit(["type": "end", "channelId": call.channelId, "reason": call.answered ? "hangup" : "decline"])
      }
    }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    if let call = calls[action.callUUID] {
      emit(["type": "mute", "channelId": call.channelId, "muted": action.isMuted])
    }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
    // Holding is switched off in every call update; a system that asks anyway gets a plain yes.
    action.fulfill()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    emit(["type": "audio", "active": true])
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    emit(["type": "audio", "active": false])
  }
}
