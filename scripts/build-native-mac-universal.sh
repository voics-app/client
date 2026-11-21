#!/usr/bin/env bash
# Builds the native crypto module for macOS arm64 and x64 and merges both into universal binaries, so one
# universal Voics.app (electron-builder --universal) loads it on either CPU. Run on a Mac (CI: macos-14).
# Both file names native/crypto/index.js looks up (darwin-arm64, darwin-x64) get the same universal file.
set -euo pipefail
cd "$(dirname "$0")/../native/crypto"
rustup target add aarch64-apple-darwin x86_64-apple-darwin
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  pnpm exec napi build --platform --release --no-js --dts native.d.ts --target "$target"
done
lipo -create discordy-crypto.darwin-arm64.node discordy-crypto.darwin-x64.node -output discordy-crypto.universal.node
mv discordy-crypto.universal.node discordy-crypto.darwin-arm64.node
cp discordy-crypto.darwin-arm64.node discordy-crypto.darwin-x64.node
lipo -archs discordy-crypto.darwin-arm64.node
