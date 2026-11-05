#!/usr/bin/env bash
# Builds the iOS package of the crypto engine: a static XCFramework (device and simulator, arm64) plus
# the uniffi Swift binding. Needs macOS with Xcode and rustup. Run by .github/workflows/crypto-ios.yml;
# it cannot run on Windows or Linux.
#
#   ios/build-xcframework.sh [output-dir]      (default: target/ios-package)
#
# Output, laid out as the Expo module expects it (apps/mobile/modules/voics-crypto/ios):
#   Frameworks/VoicsCryptoFFI.xcframework
#   Generated/voics_crypto.swift, voics_cryptoFFI.h, module.modulemap
set -euo pipefail

cd "$(dirname "$0")/.."
out="$(cd "$(dirname "${1:-target/ios-package}")" && pwd)/$(basename "${1:-target/ios-package}")"
lib=libdiscordy_crypto
targets=(aarch64-apple-ios aarch64-apple-ios-sim)

rm -rf "$out"
mkdir -p "$out/Frameworks" "$out/Generated"

rustup target add "${targets[@]}"

# Static libraries for the phone and for the simulator on Apple silicon. Only the uniffi layer is
# built (--no-default-features drops the Node-API layer, which has no iOS target).
for target in "${targets[@]}"; do
  cargo rustc --release --lib --locked --no-default-features --features uniffi \
    --target "$target" --crate-type staticlib
done

# The Swift binding is generated from the metadata inside a host build of the same library.
cargo build --release --lib --locked --no-default-features --features uniffi-cli
cargo run --release --locked --no-default-features --features uniffi-cli --bin uniffi-bindgen -- \
  generate --library "target/release/$lib.dylib" --language swift --out-dir "$out/Generated"

# The C module is found through SWIFT_INCLUDE_PATHS (see the podspec), so the XCFramework carries no headers.
mv "$out/Generated/voics_cryptoFFI.modulemap" "$out/Generated/module.modulemap"

xcodebuild -create-xcframework \
  -library "target/aarch64-apple-ios/release/$lib.a" \
  -library "target/aarch64-apple-ios-sim/release/$lib.a" \
  -output "$out/Frameworks/VoicsCryptoFFI.xcframework"

echo "Wrote $out"
