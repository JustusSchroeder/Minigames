#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if pgrep -q SpotifyBar; then
  killall SpotifyBar 2>/dev/null || true
  sleep 0.4
fi

swift build -c release --product SpotifyBar
BIN="$(swift build -c release --show-bin-path)/SpotifyBar"
APP="$ROOT/dist/SpotifyBar.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
COPYFILE_DISABLE=1 cp "$BIN" "$APP/Contents/MacOS/SpotifyBar"
COPYFILE_DISABLE=1 cp "$ROOT/Info.plist" "$APP/Contents/Info.plist"
echo -n "APPL????" > "$APP/Contents/PkgInfo"

find "$APP" -exec xattr -c {} \; 2>/dev/null || true
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "$APP/Contents/MacOS/SpotifyBar"
  codesign --force --sign - "$APP"
fi

echo "Built $APP"
echo "Open it with:  open \"$APP\""
