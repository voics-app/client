package expo.modules.voicscallkit

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference

/**
 * The incoming-call screen over the lock screen (the notification's full-screen intent) and the Accept action of the notification (`accept` extra:
 * no screen, the call is answered and the app opens). It is a separate activity so the app itself is never shown over the lock screen.
 */
class IncomingCallActivity : Activity() {
  private var channelId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val channel = intent.getStringExtra(CallCoordinator.EXTRA_CHANNEL)
    if (channel == null) {
      finish()
      return
    }
    channelId = channel
    if (intent.getBooleanExtra(EXTRA_ACCEPT, false)) {
      CallCoordinator.answer(this, channel)
      finish()
      return
    }
    if (CallCoordinator.callInfo(channel) == null) {
      finish()
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    screens[channel] = WeakReference(this)
    setContentView(buildView(channel, intent.getStringExtra(EXTRA_NAME) ?: ""))
  }

  override fun onDestroy() {
    channelId?.let { if (screens[it]?.get() === this) screens.remove(it) }
    super.onDestroy()
  }

  private fun buildView(channel: String, name: String): LinearLayout {
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    fun button(label: String, color: Int, onClick: () -> Unit) = Button(this).apply {
      text = label
      setTextColor(Color.WHITE)
      isAllCaps = false
      textSize = 18f
      background = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(32).toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(0, dp(64), 1f).apply { setMargins(dp(12), 0, dp(12), 0) }
      setOnClickListener { onClick() }
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(Color.parseColor("#0c0d12"))
      setPadding(dp(24), dp(96), dp(24), dp(64))
      layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }
    root.addView(TextView(this).apply {
      text = name
      setTextColor(Color.WHITE)
      textSize = 32f
      gravity = Gravity.CENTER
    })
    root.addView(TextView(this).apply {
      text = "Incoming call"
      setTextColor(Color.parseColor("#a0a4b8"))
      textSize = 18f
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, 0)
    })
    root.addView(android.view.View(this), LinearLayout.LayoutParams(0, 0, 1f))
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    row.addView(button("Decline", Color.parseColor("#e5484d")) {
      CallCoordinator.decline(this, channel)
      finish()
    })
    row.addView(button("Answer", Color.parseColor("#2fb344")) {
      CallCoordinator.answer(this, channel)
      finish()
    })
    root.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    return root
  }

  companion object {
    private const val EXTRA_ACCEPT = "voics.accept"
    private const val EXTRA_NAME = "voics.name"
    private val screens = HashMap<String, WeakReference<IncomingCallActivity>>()

    fun intent(context: Context, channelId: String, name: String, accept: Boolean): Intent =
      Intent(context, IncomingCallActivity::class.java)
        .setData(Uri.fromParts("voics-call", channelId + if (accept) "-accept" else "", null))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
        .putExtra(CallCoordinator.EXTRA_CHANNEL, channelId)
        .putExtra(EXTRA_NAME, name)
        .putExtra(EXTRA_ACCEPT, accept)

    /** The call is over (answered elsewhere, timed out, declined): the screen goes away. Main thread. */
    fun close(channelId: String) {
      screens.remove(channelId)?.get()?.finish()
    }
  }
}
