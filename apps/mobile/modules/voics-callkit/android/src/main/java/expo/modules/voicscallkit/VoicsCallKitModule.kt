package expo.modules.voicscallkit

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JavaScript face of `CallCoordinator` on Android: the same functions and the same event stream (`onCallEvent`) as the iOS module.
 * src/voice/callkit/nativeCallKit.ts adapts it for the app (the only place that loads it).
 */
class VoicsCallKitModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VoicsCallKit")

    Events("onCallEvent")

    OnCreate {
      CallCoordinator.ensureChannels(context)
    }

    OnStartObserving {
      CallCoordinator.setSink { event -> sendEvent("onCallEvent", event) }
    }

    OnStopObserving {
      CallCoordinator.setSink(null)
    }

    OnActivityEntersForeground {
      CallCoordinator.appForeground = true
    }

    OnActivityEntersBackground {
      CallCoordinator.appForeground = false
    }

    // Android has no PushKit: a call rings through the FCM token registered as the push token.
    AsyncFunction("voipToken") { -> null as String? }

    AsyncFunction("reportIncoming") { channelId: String, callerName: String?, isPrivate: Boolean, ringSeconds: Int ->
      CallCoordinator.reportIncoming(context, channelId, callerName, isPrivate, ringSeconds, fromPush = false)
    }

    AsyncFunction("startOutgoing") { channelId: String, name: String? ->
      CallCoordinator.startOutgoing(context, channelId, name)
    }

    AsyncFunction("reportConnected") { channelId: String ->
      CallCoordinator.reportConnected(channelId)
    }

    AsyncFunction("endCall") { channelId: String, reason: String ->
      CallCoordinator.endCall(channelId, reason)
    }

    AsyncFunction("setMuted") { channelId: String, muted: Boolean ->
      CallCoordinator.setMuted(channelId, muted)
    }
  }
}
