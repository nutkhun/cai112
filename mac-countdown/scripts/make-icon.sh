#!/usr/bin/env bash
# Renders the app icon: Resources/AppIcon.icns (all sizes) from scripts/make-icon.swift.
# A 1024px preview is written to build/AppIcon-1024.png.
set -euo pipefail
cd "$(dirname "$0")/.."

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

swift scripts/make-icon.swift "$WORK/icon-1024.png"

ICONSET="$WORK/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$WORK/icon-1024.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$WORK/icon-1024.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

mkdir -p Resources build
iconutil -c icns "$ICONSET" -o Resources/AppIcon.icns
cp "$WORK/icon-1024.png" build/AppIcon-1024.png
echo "Wrote Resources/AppIcon.icns"
