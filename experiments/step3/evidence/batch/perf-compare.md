# Same-conditions performance comparison (package, macOS Apple Silicon, 3 cold launches per pass; medians of the pass, range in brackets)

Order of the passes on one machine, nothing else running: base-1, new (trial, not shown), new-2, base-2, new-3. **base** = main `4ce31e1` (code of step3-candidate-3), **new** = `cd0fc0b` (the batch). The two base passes show the run-to-run variation of the machine; a single pass is not proof of anything.

| metric | base-1 | new-2 | base-2 | new-3 |
|---|---|---|---|---|
| cold start: launch -> plugins loaded (ms) | 816 [767–4508] | 769 [685–822] | 782 [745–1316] | 941 [770–1004] |
| cold start: launch -> map ready (ms) | 1856 [1799–7221] | 1827 [1711–1858] | 1817 [1796–2369] | 1960 [1818–2040] |
| first battle: session create (ms) | 16 [14.7–17.2] | 15.2 [15.1–17.4] | 15.7 [14.4–18] | 16.5 [16.2–17.2] |
| first battle: event start -> first menu (ms) | 581.8 [566.5–618.5] | 551.5 [550–566.5] | 549.8 [532.6–583.3] | 566.6 [533.4–581.2] |
| later battles: event start -> first menu, median (ms) | 132.4 [131.6–132.7] | 132.5 [131.9–133.3] | 132.5 [132.2–132.8] | 132.5 [131.6–132.6] |
| action latency p50 move (ms) | 6.4 [5.6–6.6] | 6 [5.6–6.6] | 5.7 [4.9–6.7] | 6.3 [5.5–6.8] |
| action latency p50 run (ms) | 4.1 [3.9–4.2] | 3.5 [3.2–4.3] | 4.3 [3–4.5] | 3.2 [2.9–4.4] |
| action latency p50 item (ms) | 7 [5.9–7.3] | 5.7 [4.5–5.9] | 6.8 [6–6.9] | 7.2 [6.2–7.3] |
| action latency p50 ball (ms) | 5.3 [4.4–5.5] | 5.4 [5.4–5.7] | 5.3 [4.5–5.7] | 4.7 [3.5–5] |
| frames in battle scene: p50 (ms) | 16.7 [16.7–16.7] | 16.7 [16.7–16.7] | 16.7 [16.7–16.7] | 16.7 [16.7–16.7] |
| frames in battle scene: p95 (ms) | 18.7 [18.6–18.7] | 18.6 [18.6–18.6] | 18.7 [18.4–18.7] | 18.6 [18.5–18.6] |
| frames on map (idle/event): p95 (ms) | 18.8 [18.7–19.1] | 18.7 [18.7–18.7] | 18.7 [18.6–18.8] | 18.8 [18.7–18.8] |
| memory: app RSS at map ready (MB) | 1129 [1123–1132] | 1130 [1130–1132] | 1133 [1132–1138] | 1134 [1130–1137] |
| memory: app RSS after 24 battles (MB) | 1228 [1227–1233] | 1233 [1232–1248] | 1231 [1229–1245] | 1232 [1228–1236] |
| memory: JS heap after 24 battles (MB) | 36 [33–36] | 36 [36–36] | 36 [36–36] | 36 [36–36] |

Errors: base-1 0, new-2 0, base-2 0, new-3 0.

Reading: the batch moves no metric outside the spread between the two base passes, except that one new pass (new-3) had a slower cold start (941 ms median, range 770–1004) while new-2 did not (769); cold-start rows are the noisiest (the first launch after a build is slower: base-1 had a 4508 ms outlier). This is a same-conditions baseline and comparison, not a proof of no regression: three launches per pass, one machine, no budget thresholds.
