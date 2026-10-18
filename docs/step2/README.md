# Step 2 — Battle integration experiment

Status of 2.1 (environment and loading gate): **partial**. See `.handoff/STATUS.md` in the workspace root for the live hand-off and `baseline.json` for pinned versions.

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

## Not verified yet

- MZ editor Playtest (needs the user to run it).
- Deployed package from MZ's Deploy command (needs the user); risks to watch: whether Deploy copies `js/engine/**` including the `node_modules/ts-chacha20` folder, and whether `save/` is writable (plugin falls back to NW's dataPath).
- Windows, Intel Mac, signing.
- No Ruby reference was run; golden is an engine regression baseline, not a rules oracle.
