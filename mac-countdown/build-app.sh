#!/usr/bin/env bash
# Builds "Countdown Timer.app" into ./build. Pass --install to also copy it to /Applications.
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Countdown Timer"       # shown in the Dock, menu bar and Finder
EXECUTABLE="Countdown"           # the Swift product name
BUNDLE_ID="com.cai112.countdown" # unchanged, so settings and notification permission carry over
APP="build/${APP_NAME}.app"

echo "==> Building release binary"
swift build -c release
BIN_DIR="$(swift build -c release --show-bin-path)"

if [[ ! -f Resources/AppIcon.icns ]]; then
    echo "==> Rendering app icon"
    scripts/make-icon.sh
fi

if [[ ! -d Resources/Voices ]]; then
    echo "==> Recording voice tones"
    scripts/make-voices.sh
fi

echo "==> Assembling ${APP}"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/$EXECUTABLE" "$APP/Contents/MacOS/$EXECUTABLE"
cp Resources/*.png Resources/AppIcon.icns Resources/Voices/*.aiff "$APP/Contents/Resources/"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>               <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>        <string>${APP_NAME}</string>
    <key>CFBundleExecutable</key>         <string>${EXECUTABLE}</string>
    <key>CFBundleIdentifier</key>         <string>${BUNDLE_ID}</string>
    <key>CFBundleIconFile</key>           <string>AppIcon</string>
    <key>CFBundlePackageType</key>        <string>APPL</string>
    <key>CFBundleShortVersionString</key> <string>1.0</string>
    <key>CFBundleVersion</key>            <string>1</string>
    <key>LSMinimumSystemVersion</key>     <string>14.0</string>
    <key>LSApplicationCategoryType</key>  <string>public.app-category.utilities</string>
    <key>NSHighResolutionCapable</key>    <true/>
</dict>
</plist>
PLIST

echo "==> Signing (ad-hoc)"
codesign --force --sign - "$APP"

if [[ "${1:-}" == "--install" ]]; then
    echo "==> Installing to /Applications"
    rm -rf "/Applications/${APP_NAME}.app" "/Applications/Countdown.app"  # (its name before the rename)
    cp -R "$APP" /Applications/
    echo "Done. Open it with: open \"/Applications/${APP_NAME}.app\""
else
    echo "Done. Open it with: open \"${APP}\""
fi
