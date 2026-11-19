package expo.modules.voicsrecorder

import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

class VoicsRecorderModule : Module() {
  @Volatile private var recorder: MediaRecorder? = null
  private var output: File? = null
  private var started = 0L
  private val samples = mutableListOf<Int>()
  private val handler = Handler(Looper.getMainLooper())
  private val sample = object : Runnable {
    override fun run() {
      val current = recorder ?: return
      try { synchronized(samples) { samples.add((current.maxAmplitude * 255L / 32767L).toInt().coerceIn(0, 255)) } } catch (_: IllegalStateException) { return }
      handler.postDelayed(this, 100)
    }
  }

  private fun release(discard: Boolean) {
    handler.removeCallbacks(sample)
    recorder?.release()
    recorder = null
    if (discard) output?.delete()
    output = null
  }

  override fun definition() = ModuleDefinition {
    Name("VoicsRecorder")
    AsyncFunction("start") {
      if (Build.VERSION.SDK_INT < 29) throw IllegalStateException("Ogg/Opus recording requires Android 10 or later")
      if (recorder != null) throw IllegalStateException("Recording already in progress")
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = File(context.cacheDir, "voice-${UUID.randomUUID()}.ogg")
      @Suppress("DEPRECATION")
      val next = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
      try {
        next.setAudioSource(MediaRecorder.AudioSource.MIC)
        next.setOutputFormat(MediaRecorder.OutputFormat.OGG)
        next.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
        next.setAudioSamplingRate(48000)
        next.setAudioEncodingBitRate(64000)
        next.setAudioChannels(1)
        // The JS timer normally stops at five minutes. This native limit is a
        // safety net if the JS runtime is stalled.
        next.setMaxDuration(301000)
        next.setOutputFile(file.absolutePath)
        next.prepare()
        next.start()
        synchronized(samples) { samples.clear() }
        output = file
        recorder = next
        started = SystemClock.elapsedRealtime()
        handler.post(sample)
      } catch (error: Exception) {
        next.release()
        file.delete()
        throw error
      }
    }
    AsyncFunction("stop") {
      val current = recorder ?: throw IllegalStateException("No recording in progress")
      val file = output ?: throw IllegalStateException("Recording file is unavailable")
      val duration = (SystemClock.elapsedRealtime() - started).coerceAtLeast(1).toDouble() / 1000.0
      try {
        current.stop()
        val waveform = synchronized(samples) { ByteArray(64) { index -> (samples.getOrNull(index * samples.size / 64) ?: 0).toByte() } }
        val result = mapOf("uri" to "file://${file.absolutePath}", "size" to file.length(), "duration_secs" to duration, "waveform" to Base64.encodeToString(waveform, Base64.NO_WRAP))
        release(false)
        result
      } catch (error: Exception) {
        release(true)
        throw error
      }
    }
    AsyncFunction("cancel") { release(true) }
    AsyncFunction("discard") { uri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = File(android.net.Uri.parse(uri).path ?: "")
      if (file.parentFile?.canonicalFile == context.cacheDir.canonicalFile && file.name.startsWith("voice-") && file.name.endsWith(".ogg")) file.delete()
    }
    AsyncFunction("isOgg") { uri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = File(android.net.Uri.parse(uri).path ?: "")
      if (file.parentFile?.canonicalFile != context.cacheDir.canonicalFile || !file.name.startsWith("voice-") || !file.name.endsWith(".ogg")) false
      else file.inputStream().use { input -> val header = ByteArray(4); input.read(header) == 4 && header.contentEquals(byteArrayOf(79, 103, 103, 83)) }
    }
    OnActivityEntersBackground { release(true) }
    OnDestroy { release(true) }
  }
}
