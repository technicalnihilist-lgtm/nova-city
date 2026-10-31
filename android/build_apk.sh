#!/usr/bin/env bash
# Builds a signed, installable APK from android/app + game/dist/game.html
#
# Required environment:
#   ANDROID_SDK  - path to an Android SDK (platforms/android-34, build-tools/34.0.0)
#   JAVA_HOME    - JDK 17
#   KEYSTORE     - path to a keystore (defaults to android/app/debug.keystore, created if missing)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SDK="${ANDROID_SDK:?set ANDROID_SDK}"
BT="$SDK/build-tools/34.0.0"
AJ="$SDK/platforms/android-34/android.jar"
OUT="$HERE/out"
mkdir -p "$OUT"/{gen,classes,dex}
rm -f "$OUT"/*.apk "$OUT/dex"/*.dex

# 1. bundle the game
python3 "$ROOT/game/build.py"
cp "$ROOT/game/dist/game.html" "$HERE/app/assets/game.html" 2>/dev/null || {
  mkdir -p "$HERE/app/assets"; cp "$ROOT/game/dist/game.html" "$HERE/app/assets/game.html"; }

# 2. resources
"$BT/aapt2" compile --dir "$HERE/app/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$AJ" \
  --manifest "$HERE/app/AndroidManifest.xml" -R "$OUT/res.zip" \
  -A "$HERE/app/assets" --java "$OUT/gen" --auto-add-overlay

# 3. java -> dex
javac -source 8 -target 8 -bootclasspath "$AJ" -classpath "$AJ" -d "$OUT/classes" \
  "$HERE/app/src/com/novacity/game/MainActivity.java" "$OUT/gen/com/novacity/game/R.java"
"$BT/d8" --release --min-api 24 --lib "$AJ" --output "$OUT/dex" \
  $(find "$OUT/classes" -name '*.class')

# 4. package + align
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -u ../unsigned.apk classes.dex)
"$BT/zipalign" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# 5. sign
KS="${KEYSTORE:-$HERE/app/debug.keystore}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias novacity -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Nova City, OU=Game, O=NovaCity, L=India, C=IN"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias novacity --out "$OUT/nova-city.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs "$OUT/nova-city.apk"
echo "APK: $OUT/nova-city.apk"
