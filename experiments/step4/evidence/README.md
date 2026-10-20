# Step 4 evidence

Reports written by the in-game test driver (`src/plugins/PS_BattleFlowTest.ts`) through `scripts/run-flow-test-mac.sh`; the
user's home folder is replaced by `~`. Screenshots, the test save folder and the raw logs stay outside the repository in
the workspace (`.verify/step4-<batch>/`).

| Folder | Code commit under test | What | Result |
|---|---|---|---|
| `a/` | `5fe6abd4934d6c5bbb2eb4658174838c6c4fa23b` (clean tree) | dev tree: T1–T14, T15, T15b, T8 in one process; V1, V2 in a second process (real restart) | all pass |

`identity.txt` in each folder lists the commit and the SHA-256 of every engine/plugin/content artifact the run loaded.
