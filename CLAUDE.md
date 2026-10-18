# pokemon-framework-prototype

Step 2 experiment repo (battle integration on RPG Maker MZ + RPGReactor + Pokémon Showdown).

- Live hand-off: `../.handoff/STATUS.md` — read first, then check `git status`.
- Experiment notes and findings: `docs/step2/README.md`; pinned versions: `docs/step2/baseline.json`.
- Clean-room spec lives in `../pokemon-framework-reference`; read its specs/test vectors, never port Ruby.
- Do not modify global MZ/NW.js (`--skip-nwjs` only). Showdown is built into `js/engine/showdown` by `scripts/build-showdown.sh` (git-ignored).
- Verify with: `pnpm --dir src typecheck && pnpm --dir src build && node --test experiments/step2/test-headless.cjs`.
- No push/merge to main without user approval.
