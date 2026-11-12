package expo.modules.voicscallkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The Decline button of the ring notification and the Hang up button of the ongoing-call notification. Neither needs the app to open. */
class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val channelId = intent.getStringExtra(CallCoordinator.EXTRA_CHANNEL) ?: return
    when (intent.action) {
      CallCoordinator.ACTION_DECLINE -> CallCoordinator.decline(context, channelId)
      CallCoordinator.ACTION_HANGUP -> CallCoordinator.hangUp(context, channelId)
    }
  }
}
