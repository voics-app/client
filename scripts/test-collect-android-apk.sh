#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin" "$tmp/old-attempt"
printf 'old artifact\n' > "$tmp/old-attempt/Voics-0.1.0.apk"
cat > "$tmp/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
while [[ $# -gt 0 ]]; do
  if [[ "$1" == '-o' ]]; then printf 'fixture' > "$2"; exit 0; fi
  shift
done
exit 1
EOF
cat > "$tmp/bin/unzip" <<'EOF'
#!/usr/bin/env bash
printf 'AndroidManifest.xml\n'
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/unzip"
for attempt in 1 2; do
  out="$tmp/run-123-$attempt"
  PATH="$tmp/bin:$PATH" APK_URL='https://expo.dev/artifacts/eas/fixture.apk' VERSION=1.2.3 OUT_DIR="$out" bash scripts/collect-android-apk.sh
  [[ "$(find "$out" -maxdepth 1 -type f | wc -l)" -eq 2 ]]
  [[ -f "$out/Voics-1.2.3.apk" && -f "$out/Voics-latest.apk" && ! -e "$out/Voics-0.1.0.apk" ]]
done
[[ -f "$tmp/old-attempt/Voics-0.1.0.apk" ]]
echo 'Android artifact collection is isolated across attempts.'
