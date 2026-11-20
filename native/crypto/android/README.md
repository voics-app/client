# Android crypto package

`build-package.sh` cross-compiles the existing UniFFI crypto engine for arm64, armv7 and x86_64, and generates matching Kotlin bindings. Run it in an isolated build job with preinstalled Rust targets and Android NDK; set `CARGO_TARGET_DIR` and `CARGO_HOME` to job-local paths. Pass a new output directory and package that directory as a short-lived build artifact.

The generated binding and every `.so` must come from the same commit. UniFFI's Kotlin runtime requires JNA 5.12 or newer (`net.java.dev.jna:jna` Android AAR). The Android Expo bridge, Android Keystore-backed store key, Gradle integration, MLS interoperability tests and device verification are still required before this package can enable private messaging. A missing package must leave private delivery unavailable; it must never send plaintext instead.
