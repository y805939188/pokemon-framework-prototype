# Independent review of step 2 — what was done about it

Review: Opus 5.5, read-only, baseline tag `step2-review-baseline` (`2e5f2e5`). Verdict: **conditional go to step 3** — 2 blockers, 18 important, 12 minor, 6 questions. The report itself lives in the workspace hand-off folder (`.handoff/reviews/step2-review-report.md`, not in git). This file records, per finding, what changed, what was only partly done, and what needs a decision. Reproduction first: findings 2, 4, 5, 6, 8 and the mutation results were re-run before anything was changed.

State after the fixes: code commit `e666bba` (engine rules, session guards, tests, scripts) plus the commit that holds this file, the corrected reports and the regenerated evidence. `main` and the tag `step2-review-fixes` (at `c2a3e29`) were pushed to GitHub on 2026-10-18 with the user's approval (plain push).

## 1. Decisions needed from the user

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | ~~`statusCount`~~ | — | **decided 2026-10-18 (your approval of my recommendation): additive field in protocol v1.** Implemented the same day: write set and result carry it, battle start seeds from it, poison counters are cleared after a battle (bad poison stored as plain poison, WP39), sleep keeps remaining turns; legacy records without it still get a fresh sleep draw. |
| D2 | ~~Trainer-battle ball~~ | — | **decided 2026-10-18: follow the spec.** Implemented for singles and doubles: the ball can be thrown, is spent and is blocked by the trainer; `trainer` stays the refusal reason for running. |
| D3 | ~~Item eligibility before registration; certain escape~~ | — | **confirmed 2026-10-18** (kept as implemented). |
| D4 | Principle for conflicts between Showdown mechanics and Essentials mechanics inside battles (the route means Showdown wins by default; mega/dynamax order, escape timing, exp timing are already examples). And which data source the content pipeline uses in step 3. | default Showdown + a per-work-package difference list / default Essentials where observable | default Showdown, list differences per work package |
| D5 | Escape timing (decided in the turn vs. when chosen) matters for doubles (CM-26). | decide before the doubles UI | later, with the doubles batch |
| D6 | ~~Push the updated `main` and a tag?~~ | — | done: pushed on 2026-10-18 with your approval |

## 2. Findings — disposition

Legend: **fixed** = changed and covered by a test or a run; **partial**; **deferred** = recorded for a later step; **decision** = waits for section 1; **answered** = a question.

### Blockers

| # | Finding | Disposition |
|---|---|---|
| 1 | Package suite wrote to / deleted the player's slot 1 and `global.rmmzsave` | **fixed.** The save-location check writes the first free slot from 99 down, restores `global.rmmzsave`, removes only what it wrote, refuses an occupied slot; the pass condition is "written by this run, `saveGame` code 0, cleaned up"; the script refuses to start while a packaged app is running. Verified by the package suite below. |
| 2 | `HP rule mismatch` thrown when an HP EV crosses a multiple of 4 | **fixed.** `applyExp` takes the record before the EV gain as the old-max baseline; EV-only gains also recalculate HP (`test-growth`: HP-EV cases, probe P1 reproduced first). |

### Important

| # | Finding | Disposition |
|---|---|---|
| 3 | Sleep counters not seeded / `statusCount` missing from protocol | **fixed** after decision D1: `statusCount` is an additive protocol-v1 field (sleep = remaining turns, poison 0/1); seeding, read-back and the end-of-battle clearing of poison counters are tested; mutations (seed ignores the count; bad poison kept) are caught. |
| 4 | Unexecuted reservation never refunded when the battle ends first (doubles) | **fixed.** `_buildResult` refunds still-reserved entries (`why: unexecuted`); `test-writeback` + matrix S7; mutation M3d (a second refund) is now caught. |
| 5 | `chooseDoubles` did not guard balls | **fixed.** All specs are validated before anything is reserved (ball only first and only for the last living foe, run, item known + eligible); a refusal consumes nothing; tests assert the *call*, not only `query`. |
| 6 | Ball menu guards | (a) trainer ball **fixed** after decision D2 (thrown, spent, blocked — singles and doubles); (b) "not the first action" (`notfirst`) and "target semi-invulnerable" (`invulnerable`) **fixed**; "party and boxes full" **deferred** (needs the box/receive policy, step 5); (c) redirect to a living companion **on the field only** — **fixed** (tested through the engine handler). |
| 7 | Items not eligibility-checked before registration | **fixed** (`canUseItem`, `item-no-effect`, `unknown-target`; menu greys out targets; flow test asserts it). Confirmed by the user (D3). |
| 8 | Master Ball not certain against Ultra Beasts | **fixed** (`captureNumbers`), test. |
| 9 | Escape lacked Ghost / Run Away / Smoke Ball and the no-run gate | **fixed**: certain escape before the trapped check, no attempt counted; `noRun` encounters (`norun`); constants 100 / 130 / 160 / 158 and the +30 per attempt are pinned in tests. |
| 10 | Protocol freeze file was typed in | **fixed.** Shapes come from singles win / capture / run / defeat / refusals / doubles; observed reasons ⊆ declared and every declared reason except `tie` is provoked (`tie` is only a Showdown draw; listed with its reason). Mutation of the `trainer` reason is caught. The file was regenerated **on purpose**, additively (see `protocol-v1.md`). |
| 11 | "Refund once" not guarded at the result level | **fixed** (same as 4; M3d caught). |
| 12 | Matrix fingerprints had no baseline | **fixed.** `js/engine/fixtures/matrix-fingerprints.json`, compared by `test-matrix.cjs`; update only with `update-matrix-baseline.cjs`. The package run compares package vs Node on top of that. |
| 13 | 2.5 table no longer matched the evidence files | **fixed.** C2 files restored as `evidence/history/c2-perf-*.json`; the 2.5 report states which state its tables describe. |
| 14 | `package-info` had a line count and a fixed signing string | **fixed.** `diffSha256` (code state, docs/evidence excluded), real signing mode (`adhoc` / `adhoc+hardened-runtime` / `identity:…`). |
| 15 | Conclusions without evidence files | **partial.** Regenerated: 100-battle memory with and without the fixes, with forced GC (`evidence/memory-100/`), focus-independent full runs (every package suite since the runtime pass). **Not stored, and now marked so:** the heap-snapshot object counts, the "28 checks while focus is stolen every 2 s" run, the "10 runs, 4 failed" count — they remain the author's statements; the tools to reproduce exist (`scripts/cdp-heap-snapshot.cjs`, …). The flow/package 05–07 screenshots are byte-identical because the same deterministic placeholder scene renders to identical pixels at 816×624 in both hosts, not because a file was copied (each run deletes and rewrites its images); the dev-tree run captured 01–04 at 2× (1632×1248) for a reason not investigated. |
| 16 | `ps-saveloc.json` stale → SL1 could pass without running | **fixed.** Removed before the run; `builtAt` of the four reports is compared (flow run = build 1, the rest = build 2). |
| 17 | `versions.env` said 0.98.7 | **fixed.** 0.98.8 / `2dc2e10e` / 20260927.34; local checkouts verified with `git rev-parse` (`doctor` uses `setup-reactor.sh --check`); `REACTOR_ALLOW_OTHER_COMMIT=1` to override. Download mode is **not verified** for this commit (the local checkout's remote is a fork). |
| 18 | Showdown internal interfaces under-listed | **fixed.** Complete list in the 2.3 report; `test-engine-contract.cjs` checks they exist with the expected shape. |
| 19 | Staged copies vs sources | **fixed** (same test compares the two files and the staged SHA with `showdown.env`). |
| 20 | No list of Showdown-vs-spec differences | **decision D4**; the known items are in `deviations.md` #5–#11. A per-work-package list starts with step 3. |

### Minor

| # | Finding | Disposition |
|---|---|---|
| 21 | CP vectors / boundaries untested | **mostly fixed:** CP09, CP11, CP12, CP13 (c = 12), crit tier boundaries (M7 caught), escape constants, redirect. CP15, CP16, CP19 still without a test (CP16 depends on D2). |
| 22 | Flow script deleted the dev save / broad `pkill` | **fixed** (`--ps-save-dir`, own PID). |
| 23 | Batcher prune could delete live batchers | **fixed:** only when a live uid is among the keys (otherwise counted in `batcherSkipped`). Still relies on PixiJS internals: re-run the 100-battle check on Pixi/Reactor bumps. |
| 24 | `test-quick.sh` hid the failing suite / depended on the default reporter | **fixed** (`--test-reporter=tap`, names the suite and the first failing tests). |
| 25 | bootstrap replaced MZ's NW.js by default | **fixed:** default leaves it alone; `--install-nwjs` is explicit; `--skip-nwjs` kept as a no-op. |
| 26 | Stale docs | **fixed:** gateway `PROTOCOL_VERSION` comment, "user decision pending", `friendship` in the write set, `baseline.json` fields, sizes (KB/MiB), baseline-tag references, quick-check duration, perf-script focus note, `package-mac.sh` usage. |
| 27 | Leftovers outside the repo | **partial.** Test temp dirs are removed by the tests; the locations that remain by design (NW.js profile under `~/Library/Application Support/PokemonFrameworkPrototype`, `~/Library/Caches/PokemonFrameworkPrototype`, `~/Library/Caches/rmmz-game`, the Showdown source cache) are listed in the hand-off file. Old `pf-wb-*` directories from before the review were left alone. |
| 28 | Fixtures in the shipping plugin, `dex.seen` semantics, negative money clamp, unbounded `appliedBattles` | **deferred** to step 3/4 (content pipeline, save design). |
| 29 | Doubles with a single foe crash in `BattleSession.create` | **deferred** to the doubles-UI batch (tests use two foes). |
| 30 | Mega/dynamax run before RPG items | **deferred** (`deviations.md` #8). |
| 31 | SDK build of NW.js ships DevTools | **deferred** to step 7. |
| 32 | `process.mainModule`, dead code | **partial:** dead code removed; `process.mainModule` remains (works in 0.117.0, deprecated) — replace when NW.js is bumped. |

### Questions

| # | Answer |
|---|---|
| 33 | Were the final package tests run with `--harden`? The old evidence cannot show it (the `signing` field was a constant). The new evidence records the mode in `package-info.json`: `adhoc+hardened-runtime`. |
| 34 | Which 35 uncommitted changes? Not recoverable beyond "they became commit `135cd7a`"; whether code changed between the 08:05 build and the 08:08 commit is unknown. The new evidence is built from a **committed** state (`gitHead e666bba`, empty diff hash `e3b0c442…`). |
| 35 | Raw outputs of the 100-battle curve, heap snapshots, the focus-stealing run: not stored at the time. The 100-battle runs were repeated (section 3); the other two were not. |
| 36 | `scripts/tests/reactor-install.test.cjs` outside `test-quick`: not intended; it is in the quick suite now (it passes, ≈2 s). |
| 37 | Escape timing in doubles: **D5**. |
| 38 | "Extra" meant the reasoning level above High: use `xhigh` (or `max`) for reviews; the guide says so now. |

## 3. What was run after the fixes (and what was not)

All on this machine (Apple M1 Max, macOS 25.6, Node 22.21.1 for the Node suites; NW.js 0.117.0 / Node 26.7.0 inside the app). Results are what the commands printed; none of this is CI.

| What | Result |
|---|---|
| **Follow-up change set (D1–D3, same day):** quick suite 10 suites / 68 tests | **pass**; new mutations caught: trainer ball refused again (actions, doubles, matrix fail), seed ignores the stored sleep count (actions fails), bad poison kept after battle (actions, write-back fail). The matrix check found a real reproducibility bug in my own S6 change (raw messages carry the wall-clock `\|t:\|` line, so fingerprints differed between seconds/processes) — S6 now returns normalized lines, 6 consecutive runs across seconds are stable. Package suite and dev-tree flow were re-run for this change set (next rows); the perf and 100-battle memory evidence below are from the earlier build `e666bba` and were not repeated (the change does not touch what they measure) |
| `scripts/test-quick.sh` (type check + 10 Node suites, 66 tests: headless 6, actions 16, growth 12, write-back 10, doubles 11, describe 2, matrix 1, protocol freeze 3, engine contract 2, reactor install 3) | **pass**, 7 s |
| Mutation checks ("break the code, does a test fail?") | `trainer` refusal reason renamed → protocol freeze fails; M3d (second refund at the end) → write-back and matrix fail; M7 (crit tier `>=30`) → actions fails; a change to `js/engine/rpg/rules.cjs` that is not staged → the engine-contract test fails (before, such a source-only mutation went unnoticed because the engine runs the staged copy) |
| `PF_PACKAGE_ARGS=--harden scripts/run-package-tests-mac.sh` (package built from `e666bba`, empty diff hash, `adhoc+hardened-runtime`; first run = build 1, then the app was replaced, verify/matrix/saveloc = build 2) | **pass**, exit 0: T1–T7, V1 (save written by the previous process, app replaced in between), matrix S1–S10 **identical fingerprints in the package and in plain Node and equal to the committed baseline** (checked one by one), SL1 (slot 99 written by the run, cleaned up), bundle seal still valid after the runs |
| `scripts/run-flow-test-mac.sh` (dev tree, saves in the evidence folder) | **pass**: T1–T7, V1; the project `save/` was not touched |
| Greyed-out item targets (new assertion in T2) | **pass** in both hosts |
| `scripts/run-package-perf-mac.sh 3`, two attempts | attempt 1: one scripted-action timeout in launch 1 (`potion+run#2`, window unfocused for ~2,000 frames), launches 2 and 3 clean; attempt 2: 3 launches, 24 battles each, no errors. **1 failed launch out of 6**, kept in `evidence/history/post-review-perf-attempt1-*`. Cold start launch → plugins 874 ms (872–1,005), → map 1,954 ms; first battle → menu 567 ms, later ≈133 ms; RSS after 4/12/24 battles 1,234 / 1,238 / 1,229 MB (C2 build, before the memory fix: 1,307 / 1,334 / 1,371) |
| 100-battle memory, forced GC, fixes off vs on (`evidence/memory-100/`) | off: 1,141 → 1,232 → 1,268 → 1,369 → **1,538 MB** (linear); on: 1,135 → 1,227 → 1,230 → 1,231 → **1,229 MB** (flat); JS heap 28 MB in both. The earlier "JS heap 19 → 46/63 MB" claim is not reproduced (see `runtime-issues.md`) |

Provenance: the package under test was built from `e666bba`. After it, only documents, evidence and three script lines changed: the evidence path of the run scripts is made absolute (the first memory attempt used a relative path, the game process could not write there, and the attempt was discarded and repeated — nothing from it was kept).

Not run: Windows / Intel, a real Developer ID signature or notarization, any CI, the original Ruby reference. Spec vectors remain derived expectations. The in-game flow was re-run only through the scripted driver; the user's own manual Playtest of the changed menus (grey-out of item targets, new messages) has **not** been repeated.
