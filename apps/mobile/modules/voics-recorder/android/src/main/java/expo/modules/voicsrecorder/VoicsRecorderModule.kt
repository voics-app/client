package expo.modules.voicsrecorder

import android.media.MediaRecorder
import android.media.MediaExtractor
import android.media.MediaFormat
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
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class VoicsRecorderModule : Module() {
  @Volatile private var recorder: MediaRecorder? = null
  private var output: File? = null
  private var started = 0L
  private val attachmentFiles = mutableMapOf<String, File>()
  private val attachmentLock = Any()
  private val maxAttachment = 64 * 1024 * 1024
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
    OnCreate {
      appContext.reactContext?.let { context ->
        File(context.cacheDir, "voice-private").listFiles()?.forEach { if (it.isFile) it.delete() }
      }
    }
    AsyncFunction("readAttachment") { uri: String ->
      val file = File(android.net.Uri.parse(uri).path ?: throw IllegalArgumentException("Invalid local attachment"))
      require(android.net.Uri.parse(uri).scheme == "file" && file.length() in 1..maxAttachment.toLong())
      Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
    }
    AsyncFunction("encryptAttachment") { plaintext: String ->
      val plain = Base64.decode(plaintext, Base64.NO_WRAP)
      require(plain.isNotEmpty() && plain.size <= maxAttachment)
      val key = ByteArray(32).also { SecureRandom().nextBytes(it) }
      val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
      fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
      mapOf("ciphertext" to b64(cipher.doFinal(plain)), "key_b64" to b64(key), "nonce_b64" to b64(nonce), "sha256_b64" to b64(MessageDigest.getInstance("SHA-256").digest(plain)))
    }
    AsyncFunction("decryptAttachment") { ciphertext: String, keyB64: String, nonceB64: String, hashB64: String, size: Int ->
      val encrypted = Base64.decode(ciphertext, Base64.NO_WRAP)
      val key = Base64.decode(keyB64, Base64.NO_WRAP)
      val nonce = Base64.decode(nonceB64, Base64.NO_WRAP)
      val hash = Base64.decode(hashB64, Base64.NO_WRAP)
      require(size in 1..maxAttachment && encrypted.size.toLong() == size.toLong() + 16 && key.size == 32 && nonce.size == 12 && hash.size == 32)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
      val plain = cipher.doFinal(encrypted)
      require(MessageDigest.isEqual(MessageDigest.getInstance("SHA-256").digest(plain), hash))
      Base64.encodeToString(plain, Base64.NO_WRAP)
    }
    AsyncFunction("uploadAttachment") { address: String, ciphertext: String ->
      val data = Base64.decode(ciphertext, Base64.NO_WRAP)
      require(data.size in 17..(maxAttachment + 16))
      val url = URL(address)
      require(url.protocol == "https" || url.protocol == "http")
      val connection = url.openConnection() as HttpURLConnection
      try {
        connection.instanceFollowRedirects = false
        connection.requestMethod = "PUT"
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/octet-stream")
        connection.setFixedLengthStreamingMode(data.size)
        connection.outputStream.use { it.write(data) }
        require(connection.responseCode in 200..299)
      } finally { connection.disconnect() }
    }
    AsyncFunction("downloadAttachment") { address: String ->
      val url = URL(address)
      require(url.protocol == "https" || url.protocol == "http")
      val connection = url.openConnection() as HttpURLConnection
      try {
        connection.instanceFollowRedirects = false
        require(connection.responseCode in 200..299)
        val output = java.io.ByteArrayOutputStream()
        connection.inputStream.use { input ->
          val buffer = ByteArray(8192)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(output.size().toLong() + count <= maxAttachment.toLong() + 16)
            output.write(buffer, 0, count)
          }
        }
        Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
      } finally { connection.disconnect() }
    }
    AsyncFunction("storeAttachment") { id: String, plaintext: String ->
      val plain = Base64.decode(plaintext, Base64.NO_WRAP)
      require(plain.isNotEmpty() && plain.size <= maxAttachment)
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val folder = File(context.cacheDir, "voice-private")
      require(folder.isDirectory || folder.mkdirs())
      val file = File(folder, "${UUID.randomUUID()}.ogg")
      try {
        file.writeBytes(plain)
        synchronized(attachmentLock) { attachmentFiles.put(id, file)?.delete() }
        "file://${file.absolutePath}"
      } catch (error: Exception) { file.delete(); throw error }
    }
    AsyncFunction("removeAttachment") { id: String ->
      synchronized(attachmentLock) { attachmentFiles.remove(id)?.delete() }
      Unit
    }
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
      else {
        val isOgg = file.inputStream().use { input -> val header = ByteArray(4); input.read(header) == 4 && header.contentEquals(byteArrayOf(79, 103, 103, 83)) }
        if (!isOgg) false else {
          val extractor = MediaExtractor()
          try {
            extractor.setDataSource(file.absolutePath)
            (0 until extractor.trackCount).any { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME) == "audio/opus" }
          } finally { extractor.release() }
        }
      }
    }
    OnActivityEntersBackground { release(true) }
    OnDestroy { release(true) }
  }
}
