# Signing and notarization plan (macOS)

## State today (verified on this machine, 2026-10-18)

- `security find-identity -v -p codesigning`: **0 valid identities**. No Developer ID certificate, so nothing can be Developer-ID-signed or notarized from here yet. `xcrun notarytool` 1.1.2 and `stapler` are installed.
- Our package is signed **ad-hoc**: runs locally, `codesign --verify --deep --strict` passes, Gatekeeper `spctl --assess` says **rejected** (expected). Downloaded copies (quarantined) would be blocked or need a manual override.
- **Hardened runtime proven with an ad-hoc identity.** `scripts/package-mac.sh --harden` (inside-out signing by `scripts/sign-mac.sh`: every dylib/helper executable, 8 helper apps, the framework, the app) produces `flags=0x10002(adhoc,runtime)` and passes the *whole* package suite (flow T1–T7, restart, matrix S1–S10, save location) — i.e. NW.js 0.117 + our plugins run under the hardened runtime.
- Entitlements (probed by launching variants): `com.apple.security.cs.allow-jit` is required (app does not start without it); `allow-unsigned-executable-memory` is **not** needed. With ad-hoc signing `disable-library-validation` is also required (ad-hoc code has no Team ID, so the runtime rejects our own libraries) — that is why `scripts/entitlements/nwjs-adhoc.plist` has it and `nwjs.plist` (for a real identity) does not.

## Not verified (needs an Apple Developer account)

1. With one Team ID on every nested binary, library validation should pass without `disable-library-validation` — **unverified**.
2. Notarization acceptance (the service also scans for hardened runtime, secure timestamp, no `get-task-allow`) — **unverified**; `scripts/notarize-mac.sh` is written but never run.
3. Stapling/Gatekeeper behaviour of the final artefact, and whether the first-launch delay disappears.

## Steps when you have an account

1. Enrol in the Apple Developer Program; create a **Developer ID Application** certificate in Xcode/developer.apple.com and import it into the login keychain.
2. `scripts/notarize-mac.sh --check` should now report the identity.
3. `scripts/package-mac.sh --identity "Developer ID Application: <Name> (<TEAMID>)"` (implies hardened runtime + secure timestamp; use `nwjs.plist`).
4. Store notary credentials once with `xcrun notarytool store-credentials <profile>` (you do this; credentials never go through me or into the repo).
5. `scripts/notarize-mac.sh build/package/<App>.app --keychain-profile <profile>` (submit, wait, staple, `stapler validate`, `spctl --assess`).
6. Distribute as a zip or dmg of the stapled app. If step 3 fails to launch without `disable-library-validation`, add it back and note the reason.

## Other release conditions to keep in mind

- MZ stock assets (`img/`, `audio/`, …) are copied from the local MZ install: not redistributable beyond the MZ licence. The demo is planned to use user-made assets.
- Saves live outside the bundle (`PS_SaveLocation`), so signing is not broken by play.
- Signing/notarization does not touch the game code: it only wraps the package. Windows signing is out of scope for now.
