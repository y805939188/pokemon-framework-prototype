#!/usr/bin/env bash
# MZ's macOS Deploy flattens the symlinks inside nwjs Framework.framework and drops the code
# signature, so the deployed Game.app refuses to open on Apple Silicon. This rebuilds a working
# app next to it: pristine nwjs.app (copied with ditto, symlinks intact) + the deployed app.nw,
# Info.plist and icon, then ad-hoc signs it. Local/testing only: NOT Developer ID signing or
# notarization, so it is not a distribution fix. Does not modify MZ, the NW.js host, or the input.
#
# Usage: scripts/repair-deployed-app-mac.sh /path/to/Game.app [/path/to/output/Game.app]
set -euo pipefail

IN="${1:?usage: $0 /path/to/Game.app [output.app]}"
OUT="${2:-${IN%.app}-repaired.app}"
MZ_APP="${MZ_APP:-$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app}"
NWAPP="$MZ_APP/Contents/Resources/nwjs-mac/nwjs.app"

[[ -d "$IN/Contents/Resources/app.nw" ]] || { echo "not a deployed app: $IN" >&2; exit 1; }
[[ -d "$NWAPP" ]] || { echo "NW.js host not found: $NWAPP" >&2; exit 1; }
[[ ! -e "$OUT" ]] || { echo "refusing to overwrite existing $OUT" >&2; exit 1; }

ditto "$NWAPP" "$OUT"
rm -rf "$OUT/Contents/Resources/app.nw"
ditto "$IN/Contents/Resources/app.nw" "$OUT/Contents/Resources/app.nw"
cp "$IN/Contents/Info.plist" "$OUT/Contents/Info.plist"
[[ ! -f "$IN/Contents/Resources/app.icns" ]] || cp "$IN/Contents/Resources/app.icns" "$OUT/Contents/Resources/app.icns"
xattr -cr "$OUT"
codesign --force --deep -s - "$OUT"
codesign -vv "$OUT"
echo "Repaired app: $OUT"
