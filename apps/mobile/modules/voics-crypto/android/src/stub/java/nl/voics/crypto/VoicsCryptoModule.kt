package nl.voics.crypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Ordinary Android builds without the optional matching Rust package remain fail-closed. */
class VoicsCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VoicsCrypto")
    Function("isAvailable") { false }
  }
}
