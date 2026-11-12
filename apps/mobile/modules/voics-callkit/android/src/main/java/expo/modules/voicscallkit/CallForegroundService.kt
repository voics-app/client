package expo.modules.voicscallkit

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder

/**
 * Keeps the process, and so the call's microphone and audio, alive while the person is in a call and the app is in the background or the screen is
 * locked (Android 14 foreground service types phoneCall and microphone). It exists only while a call is answered or started.
 */
class CallForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val channelId = intent?.getStringExtra(CallCoordinator.EXTRA_CHANNEL)
    val name = intent?.getStringExtra("name") ?: "Call"
    if (channelId == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      CallCoordinator.ensureChannels(applicationContext)
      val notification = ongoingNotification(channelId, name)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        val microphone = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (microphone && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        startForeground(NOTIFICATION_ID, notification, type)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (_: Throwable) {
      // The system refused a foreground service (permission, background start limits): the call runs without this protection.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun ongoingNotification(channelId: String, name: String): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val hangUp = CallCoordinator.actionIntent(channelId, CallCoordinator.ACTION_HANGUP)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CallCoordinator.ONGOING_CHANNEL) else Notification.Builder(this)
    builder
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setContentTitle(name)
      .setContentText("Call in progress")
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setContentIntent(open)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val person = android.app.Person.Builder().setName(name).build()
      builder.setStyle(Notification.CallStyle.forOngoingCall(person, hangUp))
    } else {
      builder.addAction(Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "Hang up", hangUp).build())
    }
    return builder.build()
  }

  companion object {
    private const val NOTIFICATION_ID = 0x4f00
  }
}
