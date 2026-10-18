#!/usr/bin/env bash
# Notarize and staple a Developer-ID-signed app (NOT RUN YET: needs an Apple Developer Program account).
#   scripts/notarize-mac.sh <App.app> --keychain-profile <profile>      (profile made once with: xcrun notarytool store-credentials)
#   scripts/notarize-mac.sh --check                                      (prerequisite check only; safe to run anywhere)
# Credentials are never passed on the command line or stored in this repo.
set -euo pipefail
if [[ "${1:-}" == "--check" ]]; then
  echo "codesigning identities:"; security find-identity -v -p codesigning || true
  echo "notarytool: $(xcrun --find notarytool 2>&1)"; echo "stapler:    $(xcrun --find stapler 2>&1)"
  ids="$(security find-identity -v -p codesigning | grep -c 'Developer ID Application' || true)"
  [[ "$ids" -ge 1 ]] && echo "OK: a Developer ID Application identity is present" || { echo "MISSING: no 'Developer ID Application' identity in the keychain"; exit 1; }
  exit 0
fi
APP="${1:?usage: $0 App.app --keychain-profile NAME}"; shift
[[ "${1:-}" == "--keychain-profile" ]] || { echo "need --keychain-profile NAME" >&2; exit 2; }
PROFILE="${2:?profile name}"
codesign --verify --deep --strict "$APP"
codesign -dv "$APP" 2>&1 | grep -q "flags=.*runtime" || { echo "app is not signed with the hardened runtime" >&2; exit 1; }
codesign -dv "$APP" 2>&1 | grep -q "Authority=Developer ID Application" || { echo "app is not signed with a Developer ID Application identity" >&2; exit 1; }
ZIP="$(mktemp -d)/$(basename "${APP%.app}").zip"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=4 "$APP"
