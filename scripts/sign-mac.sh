#!/usr/bin/env bash
# Sign a packaged app inside-out (every nested Mach-O, helper apps, framework, then the app).
#   scripts/sign-mac.sh <App.app> [--identity "Developer ID Application: Name (TEAMID)"] [--hardened] [--timestamp]
# Default identity "-" = ad-hoc. With --hardened the hardened runtime is enabled (--options runtime) and the
# entitlements in scripts/entitlements/ are applied: nwjs.plist for a real identity, nwjs-adhoc.plist (adds
# disable-library-validation, needed only because ad-hoc code has no Team ID) for "-".
# Notarization is a separate step (docs/step2/signing-plan.md); it needs an Apple Developer account.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${1:?usage: $0 App.app [--identity ID] [--hardened] [--timestamp]}"; shift
ID="-"; HARD=0; TS=0
while [[ $# -gt 0 ]]; do case "$1" in --identity) ID="$2"; shift ;; --hardened) HARD=1 ;; --timestamp) TS=1 ;; *) echo "unknown arg $1" >&2; exit 2 ;; esac; shift; done
ENT="$ROOT/scripts/entitlements/nwjs.plist"; [[ "$ID" == "-" ]] && ENT="$ROOT/scripts/entitlements/nwjs-adhoc.plist"
ENT="${PF_ENTITLEMENTS:-$ENT}"   # override for experiments
FLAGS=(--force)
[[ "$HARD" -eq 1 ]] && FLAGS+=(--options runtime --entitlements "$ENT")
[[ "$TS" -eq 1 ]] && FLAGS+=(--timestamp)
sign() { codesign "${FLAGS[@]}" -s "$ID" "$1" >/dev/null 2>&1 || { echo "codesign failed: $1" >&2; codesign "${FLAGS[@]}" -s "$ID" "$1"; exit 1; }; }
xattr -cr "$APP"
FW="$APP/Contents/Frameworks/nwjs Framework.framework"
# 1) loose libraries inside the framework
while IFS= read -r f; do sign "$f"; done < <(find "$FW" -type f \( -name '*.dylib' -o -name '*.so' \) -not -path '*/Helpers/*.app/*')
# 2) helper apps: their libraries/executables first, then the app bundle (deepest bundles first)
while IFS= read -r h; do
  while IFS= read -r f; do sign "$f"; done < <(find "$h" -type f \( -name '*.dylib' -o -perm -111 \) -not -path '*/Resources/*' | sort -r)
  sign "$h"
done < <(find "$FW" -type d -name '*.app' | awk '{print length, $0}' | sort -rn | cut -d' ' -f2-)
# 3) executables sitting directly in Helpers (crashpad handler, app_mode_loader)
while IFS= read -r f; do sign "$f"; done < <(find "$FW/Versions" -maxdepth 3 -path '*/Helpers/*' -type f -perm -111 -not -path '*.app/*')
# 4) framework (main binary, then the bundle) and the app
sign "$FW/Versions/Current/nwjs Framework"
sign "$FW"
sign "$APP/Contents/MacOS/nwjs"
sign "$APP"
codesign --verify --deep --strict "$APP" && echo "signed ($([ "$HARD" -eq 1 ] && echo hardened-runtime || echo plain), identity $ID)"
codesign -dv "$APP" 2>&1 | grep -E "flags|Authority|TeamIdentifier|Signature" | head -4
