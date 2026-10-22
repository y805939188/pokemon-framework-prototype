# Step 5 evidence

Reports written by the in-game test driver (`src/plugins/PS_BattleFlowTest.ts`); the user's home folder is replaced by
`~`. Screenshots, the test save folder, packaged-app runs and raw logs stay outside the repository in the workspace
(`.verify/step5-<batch>/`), so that a package's `gitHead` can equal the commit under test.

| Folder | Code commit under test | What | Result |
|---|---|---|---|
| `5.0/flow/` | `b3177c9b1b07e941c111bda498ee0f23481dcac1` (clean tree) | dev tree: T1–T32 (incl. T15b) and T8 in one process; V1–V4 after a real restart | all 37 pass |

`identity.txt` in each folder lists the commit and the SHA-256 of every engine/plugin/content artifact the run loaded.

Packaged-app runs of 5.0 (package `gitHead` `171c882`, working-tree changes 0): full package suite, 3-launch perf and the
100-battle memory run, in the workspace `.verify/step5-5.0/package-171c882/`, `perf-171c882/`, `memory100-171c882/`;
the budget comparison in `.verify/step5-5.0/perf-budget-171c882.json`.
