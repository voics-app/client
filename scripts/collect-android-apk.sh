#!/usr/bin/env bash
set -euo pipefail
: "${APK_URL:?APK_URL is required}" "${VERSION:?VERSION is required}" "${OUT_DIR:?OUT_DIR is required}"
[[ "$APK_URL" == https://expo.dev/artifacts/eas/* ]] || { echo "::error::apk_url must be an expo.dev EAS artifact"; exit 1; }
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "::error::version must look like 1.0.0"; exit 1; }
# A run/attempt-specific directory prevents leftovers from a previous job entering the artifact.
mkdir "$OUT_DIR"
curl -fsSL "$APK_URL" -o "$OUT_DIR/Voics-${VERSION}.apk"
unzip -l "$OUT_DIR/Voics-${VERSION}.apk" | grep -q AndroidManifest.xml || { echo "::error::not an APK"; exit 1; }
cp "$OUT_DIR/Voics-${VERSION}.apk" "$OUT_DIR/Voics-latest.apk"
ls -la "$OUT_DIR"
