package expo.modules.voicscallkit

import android.content.Context
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/** One Telecom connection of a self-managed call. Telecom only arbitrates (audio focus, other calls, headset buttons); the UI is ours. */
class VoicsConnection(private val context: Context, val channelId: String, name: String, ringing: Boolean) : Connection() {
  /** Set when the app ends the connection itself, so Telecom's `onDisconnect` is not reported back as a hang-up. */
  @Volatile
  var endedByApp = false

  init {
    setConnectionProperties(PROPERTY_SELF_MANAGED)
    setAudioModeIsVoip(true)
    setAddress(CallCoordinator.addressOf(channelId), TelecomManager.PRESENTATION_ALLOWED)
    setCallerDisplayName(name, TelecomManager.PRESENTATION_ALLOWED)
    if (ringing) setRinging() else setDialing()
  }

  override fun onShowIncomingCallUi() {
    CallCoordinator.showRingingUiFor(channelId)
  }

  override fun onAnswer() {
    CallCoordinator.answer(context, channelId)
  }

  override fun onAnswer(videoState: Int) {
    CallCoordinator.answer(context, channelId)
  }

  override fun onReject() {
    CallCoordinator.decline(context, channelId)
  }

  override fun onDisconnect() {
    if (endedByApp) return
    CallCoordinator.systemEnded(channelId, this)
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
  }

  override fun onAbort() {
    onDisconnect()
  }
}

class VoicsConnectionService : ConnectionService() {
  private fun channelOf(request: ConnectionRequest): String? =
    request.extras?.getString(CallCoordinator.EXTRA_CHANNEL) ?: request.address?.schemeSpecificPart

  private fun connect(request: ConnectionRequest, ringing: Boolean): Connection {
    val channelId = channelOf(request)
    val call = channelId?.let { CallCoordinator.callInfo(it) }
    if (channelId == null || call == null) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
    val connection = VoicsConnection(applicationContext, channelId, call.displayName, ringing)
    if (!CallCoordinator.connectionFor(channelId, connection)) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
    return connection
  }

  override fun onCreateIncomingConnection(connectionManagerPhoneAccount: PhoneAccountHandle?, request: ConnectionRequest): Connection = connect(request, true)

  override fun onCreateIncomingConnectionFailed(connectionManagerPhoneAccount: PhoneAccountHandle?, request: ConnectionRequest?) {
    request?.let { channelOf(it) }?.let { CallCoordinator.connectionFailed(it) }
  }

  override fun onCreateOutgoingConnection(connectionManagerPhoneAccount: PhoneAccountHandle?, request: ConnectionRequest): Connection = connect(request, false)
}
