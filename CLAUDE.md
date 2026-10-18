# pokemon-framework-prototype

Step 2 experiment repo (battle integration on RPG Maker MZ + RPGReactor + Pokémon Showdown).

- Live hand-off: `../.handoff/STATUS.md` — read first, then check `git status`.
- Experiment notes and findings: `docs/step2/README.md`; pinned versions: `docs/step2/baseline.json`.
- Clean-room spec lives in `../pokemon-framework-reference`; read its specs/test vectors, never port Ruby.
- Do not modify global MZ/NW.js (`--skip-nwjs` only). Showdown is built into `js/engine/showdown` by `scripts/build-showdown.sh` (git-ignored).
- In-game flow test: `scripts/run-flow-test-mac.sh` (NW.js direct launch, real keys/events/save).
- Packaged app: `scripts/package-mac.sh [--with-tests]`, `scripts/run-package-tests-mac.sh`, `scripts/run-package-perf-mac.sh` (never MZ Deploy on macOS).
- Runtime fixes live in `src/plugins/PS_RuntimeFixes.ts` and `PS_SaveLocation.ts` (see `docs/step2/runtime-issues.md`); signing: `docs/step2/signing-plan.md`.
- Verify with: `pnpm --dir src typecheck && pnpm --dir src build && node --test experiments/step2/test-headless.cjs`.
- No push/merge to main without user approval.
