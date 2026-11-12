package expo.modules.voicscallkit

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/** What the native side tells JavaScript: `type` is one of `incoming`, `answer`, `end`. Same shape as the iOS module (src/voice/callkit/nativeCallKit.ts). */
typealias CallEvent = Map<String, Any?>

/** A call this module shows: ringing, or answered / started from the app. */
class TrackedCall(val channelId: String, val outgoing: Boolean, var displayName: String, val isPrivate: Boolean) {
  var answered = outgoing
  var connection: VoicsConnection? = null
  var ringTimeout: Runnable? = null
  var ringTimeoutSeconds = 30
  var uiShown = false
  var muted = false
  val notificationId: Int = 0x5000 + (channelId.hashCode() and 0x0fff)
}

/**
 * Owns the Android side of calls for the whole app: Telecom (a self-managed connection per call), the incoming-call notification with its full-screen
 * intent and Accept / Decline actions, and the foreground service that keeps a call's audio alive in the background.
 *
 * It lives in the process, not in the JavaScript runtime: a data-only FCM `call` push starts the process and rings (VoicsMessagingService) before
 * React Native exists. Events for JavaScript queue up until a listener exists, which is how an answer given on the lock screen of a closed app
 * reaches the app once it has started (the same pattern as the iOS CallCoordinator).
 */
object CallCoordinator {
  const val CALLS_CHANNEL = "calls"
  const val ONGOING_CHANNEL = "call_ongoing"
  const val ACCOUNT_ID = "voics"
  const val ACTION_DECLINE = "expo.modules.voicscallkit.DECLINE"
  const val ACTION_HANGUP = "expo.modules.voicscallkit.HANGUP"
  const val EXTRA_CHANNEL = "voics.channelId"

  private const val DEFAULT_RING_SECONDS = 30
  private const val MIN_RING_SECONDS = 5
  private const val MAX_RING_SECONDS = 60
  private const val MAX_QUEUED_EVENTS = 50

  /** Telecom normally calls back within milliseconds; if it has not, the notification is shown anyway so a call is never silent. */
  private const val TELECOM_GRACE_MS = 1500L

  private val main = Handler(Looper.getMainLooper())
  private val calls = LinkedHashMap<String, TrackedCall>()
  private val queued = ArrayList<CallEvent>()
  private var sink: ((CallEvent) -> Unit)? = null
  private var accountRegistered = false
  private lateinit var app: Context

  /** True while the app has a resumed activity; a ring the app reports itself then stays in the app's own call card. */
  @Volatile
  var appForeground = false

  // JavaScript side

  @Synchronized
  fun setSink(newSink: ((CallEvent) -> Unit)?) {
    sink = newSink
    val listener = newSink ?: return
    val pending = ArrayList(queued)
    queued.clear()
    pending.forEach(listener)
  }

  /** Shows an incoming call. False when it is refused (already shown, notifications off, or the app is in front and the in-app card covers it). */
  @Synchronized
  fun reportIncoming(context: Context, channelId: String, callerName: String?, isPrivate: Boolean, ringSeconds: Int?, fromPush: Boolean): Boolean {
    init(context)
    if (calls.containsKey(channelId)) return false
    if (!fromPush && (appForeground || !notificationsAllowed())) return false
    ensureChannels()
    val call = TrackedCall(channelId, false, displayName(callerName, isPrivate), isPrivate)
    calls[channelId] = call
    scheduleRingTimeout(call, ringSeconds)
    if (registerWithTelecom(call)) {
      main.postDelayed({ synchronized(this) { if (calls[channelId] === call) showRingingUi(call) } }, TELECOM_GRACE_MS)
    } else {
      showRingingUi(call)
    }
    emit(mapOf("type" to "incoming", "channelId" to channelId, "private" to isPrivate))
    return true
  }

  /** Shows a call the person started or joined in the app, and keeps the app alive in the background for it. */
  @Synchronized
  fun startOutgoing(context: Context, channelId: String, name: String?): Boolean {
    init(context)
    if (calls.containsKey(channelId)) return false
    val call = TrackedCall(channelId, true, displayName(name, false), false)
    calls[channelId] = call
    placeOutgoing(call)
    startService(call)
    return true
  }

  @Synchronized
  fun reportConnected(channelId: String) {
    val call = calls[channelId] ?: return
    call.connection?.setActive()
  }

  /** The app ended the call (or it ended on the far side): nothing is reported back. */
  @Synchronized
  fun endCall(channelId: String, reason: String) {
    val call = calls[channelId] ?: return
    val cause = when (reason) {
      "unanswered" -> DisconnectCause.MISSED
      "answeredElsewhere" -> DisconnectCause.ANSWERED_ELSEWHERE
      "declinedElsewhere" -> DisconnectCause.REJECTED
      "failed" -> DisconnectCause.ERROR
      "remoteEnded" -> DisconnectCause.REMOTE
      else -> DisconnectCause.LOCAL
    }
    finish(call, cause)
  }

  @Synchronized
  fun setMuted(channelId: String, muted: Boolean) {
    calls[channelId]?.muted = muted
  }

  // The person (notification, lock-screen screen, Telecom)

  /** Accept: the call is answered, the app opens and JavaScript is told so it can join. */
  @Synchronized
  fun answer(context: Context, channelId: String): Boolean {
    init(context)
    val call = calls[channelId] ?: return false
    if (call.answered) return true
    call.answered = true
    cancelRingTimeout(call)
    cancelNotification(call)
    call.connection?.setActive()
    closeRingScreen(channelId)
    startService(call)
    emit(mapOf("type" to "answer", "channelId" to channelId))
    launchApp(context)
    return true
  }

  /** Decline a ringing call. */
  @Synchronized
  fun decline(context: Context, channelId: String) {
    init(context)
    val call = calls[channelId] ?: return
    if (call.answered) return
    finish(call, DisconnectCause.REJECTED)
    emit(mapOf("type" to "end", "channelId" to channelId, "reason" to "decline"))
  }

  /** The person hung up in the system UI (the ongoing notification). */
  @Synchronized
  fun hangUp(context: Context, channelId: String) {
    init(context)
    val call = calls[channelId] ?: return
    finish(call, DisconnectCause.LOCAL)
    emit(mapOf("type" to "end", "channelId" to channelId, "reason" to "hangup"))
  }

  /** Telecom ended the connection by itself (another call took over, the system reset): the app hears it as a hang-up. */
  @Synchronized
  fun systemEnded(channelId: String, connection: VoicsConnection) {
    val call = calls[channelId] ?: return
    if (call.connection !== connection) return
    call.connection = null
    finish(call, DisconnectCause.LOCAL)
    emit(mapOf("type" to "end", "channelId" to channelId, "reason" to "hangup"))
  }

  // Telecom

  @Synchronized
  fun connectionFor(channelId: String, connection: VoicsConnection): Boolean {
    val call = calls[channelId] ?: return false
    call.connection = connection
    return true
  }

  @Synchronized
  fun connectionFailed(channelId: String) {
    val call = calls[channelId] ?: return
    // Telecom refused (another call, an unsupported device): the call still rings, on the notification alone.
    if (!call.outgoing) showRingingUi(call)
  }

  @Synchronized
  fun showRingingUiFor(channelId: String) {
    val call = calls[channelId] ?: return
    showRingingUi(call)
  }

  @Synchronized
  fun callInfo(channelId: String): TrackedCall? = calls[channelId]

  private fun init(context: Context) {
    if (!::app.isInitialized) app = context.applicationContext
  }

  private fun telecom(): TelecomManager? =
    if (app.packageManager.hasSystemFeature(PackageManager.FEATURE_TELECOM)) app.getSystemService(TelecomManager::class.java) else null

  private fun accountHandle() = PhoneAccountHandle(ComponentName(app, VoicsConnectionService::class.java), ACCOUNT_ID)

  fun addressOf(channelId: String): Uri = Uri.fromParts(PhoneAccount.SCHEME_SIP, channelId, null)

  private fun registerAccount(telecom: TelecomManager) {
    if (accountRegistered) return
    val account = PhoneAccount.builder(accountHandle(), appName())
      .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
      .addSupportedUriScheme(PhoneAccount.SCHEME_SIP)
      .build()
    telecom.registerPhoneAccount(account)
    accountRegistered = true
  }

  /** Hands the incoming call to Telecom; it answers with `onCreateIncomingConnection` and then `onShowIncomingCallUi`. False when Telecom cannot be used. */
  private fun registerWithTelecom(call: TrackedCall): Boolean {
    return try {
      val telecom = telecom() ?: return false
      registerAccount(telecom)
      val extras = Bundle().apply {
        putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, accountHandle())
        putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, addressOf(call.channelId))
        putString(EXTRA_CHANNEL, call.channelId)
      }
      telecom.addNewIncomingCall(accountHandle(), extras)
      true
    } catch (_: Throwable) {
      false
    }
  }

  private fun placeOutgoing(call: TrackedCall) {
    try {
      val telecom = telecom() ?: return
      registerAccount(telecom)
      val extras = Bundle().apply {
        putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, accountHandle())
        putString(EXTRA_CHANNEL, call.channelId)
      }
      telecom.placeCall(addressOf(call.channelId), extras)
    } catch (_: Throwable) {
      // The call still runs, protected by the foreground service alone.
    }
  }

  // Notifications

  private fun notificationsAllowed(): Boolean = app.getSystemService(NotificationManager::class.java).areNotificationsEnabled()

  fun ensureChannels(context: Context? = null) {
    if (context != null) init(context)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = app.getSystemService(NotificationManager::class.java)
    val ring = NotificationChannel(CALLS_CHANNEL, "Calls", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Incoming voice and video calls"
      setSound(
        Settings.System.DEFAULT_RINGTONE_URI,
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIC).build(),
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 600, 400, 600, 400)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    val ongoing = NotificationChannel(ONGOING_CHANNEL, "Ongoing call", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shown while you are in a call"
      setShowBadge(false)
    }
    manager.createNotificationChannel(ring)
    manager.createNotificationChannel(ongoing)
  }

  private fun callIntent(call: TrackedCall, accept: Boolean): PendingIntent {
    val intent = IncomingCallActivity.intent(app, call.channelId, call.displayName, accept)
    return PendingIntent.getActivity(app, if (accept) 1 else 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun actionIntent(channelId: String, action: String): PendingIntent {
    val intent = Intent(app, CallActionReceiver::class.java).setAction(action).setData(addressOf(channelId)).putExtra(EXTRA_CHANNEL, channelId)
    return PendingIntent.getBroadcast(app, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun showRingingUi(call: TrackedCall) {
    if (call.uiShown || call.answered) return
    call.uiShown = true
    try {
      ensureChannels()
      val open = callIntent(call, false)
      val answer = callIntent(call, true)
      val decline = actionIntent(call.channelId, ACTION_DECLINE)
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(app, CALLS_CHANNEL) else Notification.Builder(app)
      builder
        .setSmallIcon(android.R.drawable.sym_call_incoming)
        .setContentTitle(call.displayName)
        .setContentText("Incoming call")
        .setCategory(Notification.CATEGORY_CALL)
        .setOngoing(true)
        .setAutoCancel(false)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setContentIntent(open)
        .setFullScreenIntent(open, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.setTimeoutAfter(call.ringTimeoutSeconds * 1000L)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val person = android.app.Person.Builder().setName(call.displayName).setImportant(true).build()
        builder.setStyle(Notification.CallStyle.forIncomingCall(person, decline, answer))
      } else {
        builder.addAction(Notification.Action.Builder(Icon.createWithResource(app, android.R.drawable.ic_menu_close_clear_cancel), "Decline", decline).build())
        builder.addAction(Notification.Action.Builder(Icon.createWithResource(app, android.R.drawable.ic_menu_call), "Answer", answer).build())
      }
      app.getSystemService(NotificationManager::class.java).notify(call.notificationId, builder.build())
    } catch (_: Throwable) {
      // No notification permission or a system refusal: the call stays tracked and times out; the app's own card covers an open app.
    }
  }

  private fun cancelNotification(call: TrackedCall) {
    try {
      app.getSystemService(NotificationManager::class.java).cancel(call.notificationId)
    } catch (_: Throwable) {
      // Nothing to cancel.
    }
  }

  // Foreground service

  private fun startService(call: TrackedCall) {
    try {
      val intent = Intent(app, CallForegroundService::class.java).putExtra(EXTRA_CHANNEL, call.channelId).putExtra("name", call.displayName)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(intent) else app.startService(intent)
    } catch (_: Throwable) {
      // The system refused a foreground service now; the call goes on without background protection.
    }
  }

  private fun stopServiceIfIdle() {
    if (calls.values.any { it.answered }) return
    try {
      app.stopService(Intent(app, CallForegroundService::class.java))
    } catch (_: Throwable) {
      // Already stopped.
    }
  }

  // Helpers

  private fun finish(call: TrackedCall, cause: Int) {
    cancelRingTimeout(call)
    cancelNotification(call)
    calls.remove(call.channelId)
    closeRingScreen(call.channelId)
    call.connection?.let {
      call.connection = null
      it.endedByApp = true
      it.setDisconnected(DisconnectCause(cause))
      it.destroy()
    }
    stopServiceIfIdle()
  }

  private fun scheduleRingTimeout(call: TrackedCall, seconds: Int?) {
    val limit = (seconds ?: DEFAULT_RING_SECONDS).coerceIn(MIN_RING_SECONDS, MAX_RING_SECONDS)
    call.ringTimeoutSeconds = limit
    val work = Runnable {
      synchronized(this) {
        val current = calls[call.channelId]
        if (current != null && current === call && !current.answered) {
          finish(current, DisconnectCause.MISSED)
          emit(mapOf("type" to "end", "channelId" to call.channelId, "reason" to "timeout"))
        }
      }
    }
    call.ringTimeout = work
    main.postDelayed(work, limit * 1000L)
  }

  private fun cancelRingTimeout(call: TrackedCall) {
    call.ringTimeout?.let { main.removeCallbacks(it) }
    call.ringTimeout = null
  }

  private fun closeRingScreen(channelId: String) {
    main.post { IncomingCallActivity.close(channelId) }
  }

  private fun emit(event: CallEvent) {
    val listener = sink
    if (listener != null) {
      listener(event)
      return
    }
    queued.add(event)
    if (queued.size > MAX_QUEUED_EVENTS) queued.removeAt(0)
  }

  private fun launchApp(context: Context) {
    try {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      context.startActivity(intent)
    } catch (_: Throwable) {
      // Started from the background where the system forbids it: the answered call waits in the notification.
    }
  }

  private fun appName(): String = app.applicationInfo.loadLabel(app.packageManager).toString().ifEmpty { "Call" }

  /** A private call (an encrypted conversation) shows the app's name, never the caller's. */
  private fun displayName(callerName: String?, isPrivate: Boolean): String =
    if (isPrivate || callerName.isNullOrEmpty()) appName() else callerName
}
