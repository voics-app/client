#!/usr/bin/env bash
# Produce Android UniFFI bindings and native libraries in a new job-local directory.
# Requires preinstalled Rust targets and an Android NDK; never modifies the host toolchain.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:?pass a new job-local output directory}"
if [ -e "$out" ]; then echo "Output already exists: $out" >&2; exit 1; fi
: "${ANDROID_NDK_HOME:?set ANDROID_NDK_HOME to an existing NDK}"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) host=linux-x86_64 ;;
  Darwin-arm64|Darwin-x86_64) host=darwin-x86_64 ;;
  *) echo "Unsupported NDK host" >&2; exit 1 ;;
esac
toolchain="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$host/bin"
test -x "$toolchain/aarch64-linux-android24-clang"
mkdir -p "$out/Generated" "$out/jniLibs"
for item in 'aarch64-linux-android:arm64-v8a:aarch64-linux-android24' 'armv7-linux-androideabi:armeabi-v7a:armv7a-linux-androideabi24' 'x86_64-linux-android:x86_64:x86_64-linux-android24'; do
  IFS=: read -r target abi clang <<< "$item"
  export "CC_${target//-/_}=$toolchain/$clang-clang"
  linker="CARGO_TARGET_${target^^}_LINKER"; linker="${linker//-/_}"
  export "$linker=$toolchain/$clang-clang"
  cargo build --release --lib --locked --no-default-features --features uniffi --target "$target"
  mkdir -p "$out/jniLibs/$abi"
  cp "${CARGO_TARGET_DIR:-target}/$target/release/libdiscordy_crypto.so" "$out/jniLibs/$abi/"
done
cargo build --release --lib --locked --no-default-features --features uniffi-cli
case "$host" in linux-*) library=libdiscordy_crypto.so ;; darwin-*) library=libdiscordy_crypto.dylib ;; esac
cargo run --release --locked --no-default-features --features uniffi-cli --bin uniffi-bindgen -- \
  generate --library "${CARGO_TARGET_DIR:-target}/release/$library" --language kotlin --config android/uniffi.toml --out-dir "$out/Generated"
echo "Android crypto package written to $out"
