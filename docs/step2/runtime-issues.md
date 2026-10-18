# Runtime issues pass (after C2): memory growth, save location, test-run ergonomics

State: tag `step2.runtime-pass` (branch merged into `main`). All measurements are inside the packaged app (NW.js 0.117.0 / Node 26.7.0 / Chromium 154, RPGReactor 0.98.8, Apple M1 Max) unless stated.

## 1. Scene memory growth — fixed (two upstream bugs, worked around in `PS_RuntimeFixes`)

**Symptom (2.5):** app RSS grew ~1.7–4 MB per battle with no plateau (1,216 → 1,610 MB over 100 battles, also with forced GC). The engine/session layer was already cleared (Node, 100 battles: heap and RSS flat).

**Diagnosis.** *(The heap-snapshot object counts below were read from snapshots that were not kept; the tools to reproduce them are in `scripts/`. The 100-battle memory curve was re-measured after the review: `evidence/memory-100/`.)* Bisect with forced GC: a bare scene with three windows and no engine leaked; scenes without windows barely did. Heap snapshots over the DevTools protocol (`scripts/cdp-heap-snapshot.cjs`, diff with `scripts/heap-diff.cjs`, retainer paths with `scripts/heap-analyze.cjs`) after 3 vs 40 battles showed `Texture`, `Rectangle`, `Events`/`EE` objects growing by ~10–20k and ~7 canvases per battle, while no `Scene_*`/`Window_*` instance survived (scenes themselves were collected). Retaining paths:

1. **Texture leak (JS heap).** `Sprite.initialize`/`TilingSprite.initialize` give each sprite its own 1×1 stub `Texture` on a session-long shared `TextureSource`; PixiJS 8 textures subscribe to the source's `resize` event, so the source keeps every stub alive. `Sprite._refresh` replaces the stub with a real texture but destroys the old one only if it is `__rrSpriteOwned` — the initial stub never is. Windows build ~22 sprites → ~300 leaked textures per scene (11,024 retained via `Sprite._emptyBaseTexture` after 40 battles). Confirmed with a counter on the source's listener list (26 → 253 after ten scene changes; a window adds 22 and `Window.destroy()` removes none).
2. **Batcher leak (native canvases).** `renderer.renderPipes.batch._batchersByInstructionSet` keeps one batcher per render-group instruction set and never drops it when the scene is gone; each stale entry keeps its last batches/sprites and through them textures and canvases (3,288 `BatchableSprite`, 977 `Batch`, ~300 `CanvasSource` after 40 battles; +2 entries per scene change). Destroying scenes explicitly makes no difference (measured).

**Fix (`src/plugins/PS_RuntimeFixes.ts`, loaded early):** (1) wrap `Sprite`/`TilingSprite._refresh` and destroy the replaced stub when it sits on the shared empty source (destroying a Texture does not destroy its source); (2) a few frames after each scene change, drop batcher entries whose instruction set belongs to no live render group under the stage (PixiJS internals, guarded; no-op if the shape differs). `--ps-fix=no-texture,no-batcher,scene` switch things for experiments.

**Result — first measurement (author's numbers; raw output not stored):** app RSS 1,213 → 1,540 MB over 100 battles without the fixes; 1,134 → 1,221 (4 battles) → 1,231 (12) → 1,235 MB (100) with both; JS heap 19 → 46 MB (was 19 → 63); standard 3-launch measurement RSS after 4 / 12 / 24 battles 1,228 / 1,234 / 1,236 MB (was 1,307 / 1,334 / 1,371).

**Result — re-measured after the independent review (stored: `evidence/memory-100/before|after/`, 100 battles = 25 rounds × 4 kinds, `--js-flags=--expose-gc` so every sample follows a forced GC, same hardened package built from `e666bba`, one launch each):**

| after N battles | 0 | 4 | 12 | 40 | 100 |
|---|---|---|---|---|---|
| fixes off (`--ps-fix=no-texture,no-batcher`), app RSS MB | 1,141 | 1,232 | 1,268 | 1,369 | **1,538** |
| fixes on, app RSS MB | 1,135 | 1,227 | 1,230 | 1,231 | **1,229** |

Without the fixes RSS grows linearly (≈ +4 MB per battle); with them it is flat after the first four battles. The renderer JS heap read 28 MB at every sample in **both** runs, so the earlier "JS heap 19 → 46 / 63 MB" figures are **not reproduced** by this measurement and should be treated as unverified; the growth that this evidence supports is native memory (canvases kept alive by stale batchers). The two fixes were only measured together (off/on), not one by one. The standard 3-launch run (24 battles) after the fixes: RSS after 4 / 12 / 24 battles = 1,234 / 1,238 / 1,229 MB (median of 3; C2: 1,307 / 1,334 / 1,371).

**Decision (user, 2026-10-18):** upstream is slow to accept pull requests; we wait for them and keep `PS_RuntimeFixes` meanwhile. If they stop accepting PRs or release too slowly, we patch RPGReactor ourselves, and later may clone it and maintain our own copy (then `scripts/versions.env`, `setup-reactor.sh` and the signing/packaging docs must point at our copy).

**Where it belongs:** upstream in RPGReactor (`reactor_core.js` `_refresh` for the stub; the batcher entry is a PixiJS-side lifecycle gap that Reactor's scene switching should clean up). Remove the plugin when the pinned Reactor contains the fixes. Risks: relies on PixiJS internals (re-run the 100-battle check on any Pixi/Reactor bump: `scripts/run-package-perf-mac.sh` with `--ps-perf-rounds=25`, or the leak modes below).

## 2. Save location — fixed (`PS_SaveLocation`)

Stock behaviour writes to `<app.nw>/save`, inside the signed bundle: it modifies the sealed bundle (breaks the signature Developer ID/notarization rely on), fails on read-only or translocated installs, and loses saves when the app is replaced. **Now:** in a packaged macOS app saves go to `~/Library/Application Support/<manifest name>/save/` (the packaging script sets the manifest name per game, e.g. `PokemonFrameworkPrototype`); development and the editor's Playtest keep `<project>/save/` (mode `auto`; `project`/`user` force one; `--ps-save-dir=` overrides for tests). The folder is shared with NW.js' own profile (`Default`, caches), so the game name must be unique and clearing browser data must not be pointed at the parent folder.

Verified in the package suite: saves written outside the bundle; the signature seal still verifies after all runs (`codesign --verify --deep --strict`); the save written by the first process loads after the app was **rebuilt/replaced** in between (V1); with no override the default location is used and the file appears there. macOS only; other platforms keep the project folder until they are in scope.

## 3. Test-run ergonomics (asked by the user)

- **Focus:** scripted runs no longer need the game window focused. Causes were (a) MZ/Reactor only update scenes while `document.hasFocus()` (`SceneManager.isGameActive`), (b) `Input` clears keys on `blur`, (c) Chromium throttles hidden windows. The test driver overrides (a), swallows `blur` before `Input` sees it, and the scripts pass `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion`. Proof (author's statement; the raw output of that run was **not stored**): the full package suite passed (exit 0, 28 checks) while another app stole focus every 2 s (20 focus-loss events observed by the page). Stored evidence since: every full package suite run (`evidence/package/`, `flow/`) is executed with the window unfocused/muted by the driver and passes. This is test-driver-only; normal play still pauses when unfocused, as stock MZ does.
- **Sound:** scripted runs are silent: the driver swallows `AudioManager.playBgm/playBgs/playMe/playSe/playStaticSe` (a flow run suppresses 1 BGM + 68 UI sounds) and the scripts add `--mute-audio` (also lowered the baseline RSS by ~75 MB). Opt back in with `--ps-sound`.
- Other tools added: `scripts/cdp-eval.cjs` (evaluate JS in a running page), leak/heap modes in the test driver (`--ps-flow-test=leak|leakhunt|heap`).

## 4. Findings kept but not solved

- First launch of a freshly (re)built package is slow (6–28 s to plugins loaded in every fresh-build run; 0.8 s afterwards) — consistent with a macOS first-run check; not diagnosed. Notarization + stapling is the expected cure for distribution builds.
- RSS at idle ≈1.1–1.2 GB (Reactor + NW.js baseline, not our code).
