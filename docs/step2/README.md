# Step 2 — Battle integration experiment

Status of 2.1 (environment and loading gate): **conditional pass** — Node, direct NW.js, MZ Playtest and a deployed package (repaired shell, see below) all pass; MZ's own Deploy output does not open without repair. See `.handoff/STATUS.md` in the workspace root for the live hand-off and `baseline.json` for pinned versions.

## What exists

| Piece | Path |
|---|---|
| Pinned Showdown fetch/build/stage | `scripts/build-showdown.sh`, `scripts/showdown.env` → `js/engine/showdown/` (git-ignored) |
| Thin async gateway (JSON messages in/out, engine snapshot/restore) | `js/engine/gateway.cjs` |
| Scripted harness shared by Node and NW.js | `js/engine/harness.cjs`, `js/engine/fixtures/` |
| Node gate | `node --test experiments/step2/test-headless.cjs` |
| In-game smoke plugin | `src/plugins/PS_BattleSmoke.ts` → `js/plugins/PS_BattleSmoke.js` (built by `pnpm --dir src build`) |
| Evidence | `experiments/step2/evidence/` |

## Reproduce

```bash
./scripts/build-showdown.sh            # fetch pinned SHA, npm ci, build, stage
pnpm --dir src build                   # builds both plugins
node --test experiments/step2/test-headless.cjs
```

NW.js direct launch (same NW.js binary the MZ editor uses; **not** the MZ Playtest button, **not** a deployed package):

```bash
NW="$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app/Contents/Resources/nwjs-mac/nwjs.app/Contents/MacOS/nwjs"
"$NW" "$PWD" --ps-smoke-quit --ps-smoke-out=/abs/path/report.json
```

## Findings so far

- Engine API shape that worked: construct `Battle` directly with a `send` callback (no text stream); output arrives as `update` (public events, `|t:|` wall-clock line must be normalized), `sideupdate` (requests/errors per side), `end`.
- Stable identity: using the fixture ID as the Showdown nickname makes every request/event ident carry it (`p1: A-0001`). This is a diagnostic convenience; a real design should map IDs outside the nickname.
- Scripted choices must read `disabled` flags from the request (Cursed Body disabled a move in the fixture and a blind `move 1` stalled the battle).
- `Battle.toJSON()/fromJSON()` round-trips; `side.activeRequest` is serialized, so a restored battle can resume from `pendingRequests()`. Restored runs matched the original tail line-for-line (2 restores). This is an **engine** snapshot only, not business save.
- Fixed seed `[1,2,3,4]` is deterministic across runs and across Node 22.21.1 / NW.js's Node 26.7.0 (same normalized hash). Default path uses the real sodium/ChaCha20 PRNG; 5 runs gave 5 distinct seeds and all finished. Random-path logs are not compared.
- Bundler pitfall: a bare `require("path")` in a Vite IIFE plugin is rewritten to a browser-external shim. The plugin takes `require` from `globalThis` instead.
- NW.js page URL is `chrome-extension://…`, so game dir cannot come from `location`; the plugin uses `require.resolve` relative to `index.html`.

## Playtest and deployment results (2026-10-18)

- **MZ Playtest** (run by the user): PASS, 4/4 checks. NW.js 0.117.0, Node 26.7.0, Chromium 154.0.8037.58. Evidence: `evidence/mz-playtest.json`.
- **MZ Deploy → macOS**: the produced `Game.app` fails to open ("无法打开"). Diagnosis: MZ's copy flattens the symlinks inside `nwjs Framework.framework` (`Helpers`, `Libraries`, `Resources`, `Versions/Current`, top-level `nwjs Framework` become real files/dirs/missing) and the bundle ends up unsigned, so macOS on Apple Silicon rejects it (`codesign`: "embedded framework contains modified or invalid version"). This is MZ's packaging, not our plugin.
- **Workaround** `scripts/repair-deployed-app-mac.sh Game.app`: rebuilds `Game-repaired.app` from the pristine host `nwjs.app` (via `ditto`) + the deployed `app.nw`/`Info.plist`/icon, then ad-hoc signs. Launched via `open` (double-click path): PASS 4/4, same NW/Node/Chromium. Evidence: `evidence/deployed-package-repaired-shell.json`. Ad-hoc only: **not** Developer ID signing or notarization, not a distribution answer.
- The deployed `app.nw` contained `js/engine/**` including `showdown/node_modules/ts-chacha20`, so that risk did not materialize.
- MZ Deploy copies the whole project root (it shipped `src/`, `docs/`, `experiments/`, `scripts/`, `save/`, and earlier 400 MB of Showdown sources). Showdown sources now live outside the project (`~/Library/Caches/pokemon-framework/showdown-src`, override `SHOWDOWN_SRC`). A proper deploy allow-list is still to do.

## Not verified yet

- A deployed package whose native shell comes straight from MZ Deploy (it cannot open; only the repaired shell was run).
- Whether `save/` inside the .app is the right/writable place for a signed, translocated package (it worked unsigned/ad-hoc locally).
- Windows, Intel Mac, signing.
- No Ruby reference was run; golden is an engine regression baseline, not a rules oracle.
