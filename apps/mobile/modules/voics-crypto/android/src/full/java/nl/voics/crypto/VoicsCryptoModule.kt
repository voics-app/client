package nl.voics.crypto

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import nl.voics.crypto.generated.MobileCrypto
import nl.voics.crypto.generated.StoredRecord
import nl.voics.crypto.generated.verifySignatureB64

/** Expo bridge to the same Rust/UniFFI engine used by iOS and desktop. */
class VoicsCryptoModule : Module() {
  private var engine: MobileCrypto? = null
  private val mutex = Any()
  private fun current(): MobileCrypto = engine ?: throw IllegalStateException("Private crypto is not initialised")
  private fun <T> guarded(body: () -> T): T = synchronized(mutex) {
    try { body() } catch (_: Exception) { throw IllegalStateException("Private crypto operation failed") }
  }

  override fun definition() = ModuleDefinition {
    Name("VoicsCrypto")
    Function("isAvailable") { try { System.loadLibrary("discordy_crypto"); true } catch (_: LinkageError) { false } }
    AsyncFunction("initialise") { userId: String, label: String -> guarded {
      require(userId.matches(Regex("^[0-9]{1,20}$")))
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val folder = File(context.noBackupFilesDir, "voics-crypto")
      check(folder.isDirectory || folder.mkdirs())
      val opened = MobileCrypto.open(File(folder, "$userId.db").absolutePath, StoreKeyVault(context).hexKey(userId), "$userId:$label")
      val identity = opened.ensureIdentity()
      engine?.close()
      engine = opened
      identity
    } }
    AsyncFunction("sign") { data: String -> guarded { current().sign(data) } }
    AsyncFunction("verify") { key: String, data: String, signature: String -> guarded { verifySignatureB64(key, data, signature) } }
    AsyncFunction("generateKeyPackages") { count: Int -> guarded { current().generateKeyPackages(count.coerceIn(1, 100).toUInt()) } }
    AsyncFunction("hasGroup") { id: String -> guarded { current().hasGroup(id) } }
    AsyncFunction("deleteGroup") { id: String -> guarded { current().deleteGroup(id) } }
    AsyncFunction("createGroup") { id: String -> guarded { current().createGroup(id).toDouble() } }
    AsyncFunction("addMembers") { id: String, keys: List<String> -> guarded {
      val out = current().addMembers(id, keys)
      mapOf("commitB64" to out.commitB64, "welcomeB64" to out.welcomeB64, "epoch" to out.epoch.toDouble())
    } }
    AsyncFunction("memberKeys") { id: String -> guarded { current().memberKeys(id) } }
    AsyncFunction("removeMembers") { id: String, keys: List<String> -> guarded {
      current().removeMembers(id, keys)?.let { mapOf("commitB64" to it.commitB64, "epoch" to it.epoch.toDouble()) }
    } }
    AsyncFunction("joinFromWelcome") { welcome: String -> guarded {
      val out = current().joinFromWelcome(welcome)
      mapOf("groupId" to out.groupId, "epoch" to out.epoch.toDouble())
    } }
    AsyncFunction("encrypt") { id: String, plaintext: String -> guarded {
      val out = current().encrypt(id, plaintext)
      mapOf("ciphertextB64" to out.ciphertextB64, "epoch" to out.epoch.toDouble())
    } }
    AsyncFunction("processIncoming") { id: String, message: String -> guarded {
      val out = current().processIncoming(id, message)
      buildMap<String, Any> {
        put("kind", out.kind)
        out.plaintextB64?.let { put("plaintextB64", it) }
        out.senderIdentity?.let { put("senderIdentity", it) }
        out.epoch?.let { put("epoch", it.toDouble()) }
      }
    } }
    AsyncFunction("exportSecret") { id: String, label: String, length: Int -> guarded { current().exportSecret(id, label, length.coerceAtLeast(0).toUInt()) } }
    AsyncFunction("putMessage") { channel: String, message: String, sort: Double, json: String -> guarded {
      current().putMessage(StoredRecord(channel, message, sort.toLong(), json))
    } }
    AsyncFunction("listMessages") { channel: String, before: Double?, limit: Int -> guarded {
      current().listMessages(channel, before?.toLong(), limit.coerceAtLeast(0).toUInt()).map {
        mapOf("channelId" to it.channelId, "messageId" to it.messageId, "sortKey" to it.sortKey.toDouble(), "json" to it.json)
      }
    } }
    AsyncFunction("deleteMessage") { channel: String, message: String -> guarded { current().deleteMessage(channel, message) } }
    OnDestroy { synchronized(mutex) { engine?.close(); engine = null } }
  }
}
