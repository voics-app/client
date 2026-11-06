import ExpoModulesCore
import Foundation

/// The JavaScript face of `CallCoordinator`: report and end calls, mirror mute, and one event stream (`onCallEvent`).
/// src/voice/callkit/nativeCallKit.ts adapts it for the app (the only place that loads it).
public class VoicsCallKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VoicsCallKit")

    Events("onCallEvent")

    OnStartObserving {
      DispatchQueue.main.async {
        CallCoordinator.shared.setSink { [weak self] event in
          self?.sendEvent("onCallEvent", event)
        }
      }
    }

    OnStopObserving {
      DispatchQueue.main.async { CallCoordinator.shared.setSink(nil) }
    }

    AsyncFunction("voipToken") { () -> String? in
      CallCoordinator.shared.voipToken
    }.runOnQueue(.main)

    AsyncFunction("reportIncoming") { (channelId: String, callerName: String?, isPrivate: Bool, ringSeconds: Int, promise: Promise) in
      CallCoordinator.shared.reportIncoming(channelId: channelId, callerName: callerName, isPrivate: isPrivate, ringSeconds: ringSeconds) { shown in
        promise.resolve(shown)
      }
    }.runOnQueue(.main)

    AsyncFunction("startOutgoing") { (channelId: String, name: String?, promise: Promise) in
      CallCoordinator.shared.startOutgoing(channelId: channelId, name: name) { started in
        promise.resolve(started)
      }
    }.runOnQueue(.main)

    AsyncFunction("reportConnected") { (channelId: String) in
      CallCoordinator.shared.reportConnected(channelId: channelId)
    }.runOnQueue(.main)

    AsyncFunction("endCall") { (channelId: String, reason: String) in
      CallCoordinator.shared.endCall(channelId: channelId, reason: reason)
    }.runOnQueue(.main)

    AsyncFunction("setMuted") { (channelId: String, muted: Bool) in
      CallCoordinator.shared.setMuted(channelId: channelId, muted: muted)
    }.runOnQueue(.main)
  }
}
