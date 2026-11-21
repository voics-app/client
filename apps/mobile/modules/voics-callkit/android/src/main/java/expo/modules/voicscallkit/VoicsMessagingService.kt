package expo.modules.voicscallkit

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * The app's one FCM service. A data-only, high-priority message `{type: "call", channel_id, caller_name?, private?, ring_seconds?}` (the Android
 * counterpart of the iOS VoIP push) rings the call here, in the process the push started, before React Native exists. Every other message,
 * and token refreshes, go to expo-notifications unchanged.
 *
 * `{type: "call_end", channel_id}` stops a ring the server ended (answered on another device, caller hung up).
 */
class VoicsMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    val channelId = data["channel_id"]
    when (data["type"]) {
      "call" -> {
        if (!channelId.isNullOrEmpty()) {
          CallCoordinator.reportIncoming(
            applicationContext,
            channelId,
            data["caller_name"],
            data["private"] != "false",
            data["ring_seconds"]?.toIntOrNull(),
            fromPush = true,
          )
        }
      }
      "call_end" -> if (!channelId.isNullOrEmpty()) CallCoordinator.endCall(channelId, "unanswered")
      else -> super.onMessageReceived(remoteMessage)
    }
  }
}
