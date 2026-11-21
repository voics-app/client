package nl.voics.crypto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Wraps the local database key with a non-exportable Android Keystore key; neither is backed up. */
class StoreKeyVault(private val context: Context) {
  private val alias = "nl.voics.crypto.store-wrap"
  @Synchronized fun hexKey(userId: String): String {
    require(userId.matches(Regex("^[0-9]{1,20}$")))
    val folder = File(context.noBackupFilesDir, "voics-crypto-keys")
    check(folder.isDirectory || folder.mkdirs())
    val file = AtomicFile(File(folder, "$userId.key"))
    val wrappingKey = key()
    val plain = if (file.baseFile.exists()) {
      val encoded = file.readFully()
      require(encoded.size == 12 + 32 + 16)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, wrappingKey, GCMParameterSpec(128, encoded.copyOfRange(0, 12)))
      cipher.doFinal(encoded.copyOfRange(12, encoded.size))
    } else {
      val generated = ByteArray(32).also { SecureRandom().nextBytes(it) }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, wrappingKey)
      val wrapped = cipher.iv + cipher.doFinal(generated)
      val stream = file.startWrite()
      try { stream.write(wrapped); file.finishWrite(stream) } catch (error: Exception) { file.failWrite(stream); throw error }
      generated
    }
    require(plain.size == 32)
    return plain.joinToString("") { "%02x".format(it.toInt() and 0xff) }.also { plain.fill(0) }
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256).setRandomizedEncryptionRequired(true).build())
    return generator.generateKey()
  }
}
