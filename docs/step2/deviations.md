# Deliberate differences from the reference (user decisions)

| # | Topic | Reference | Ours | Decided | Status |
|---|---|---|---|---|---|
| 1 | Failed-item refund (WP40 §4.2.1, WP42 §6.0) | refunded at execution, identity kept, refunded again at battle end (net +1) | refund exactly once; ledger states reserved → consumed / refunded | 2026-10-18 | implemented (`session.cjs`); optional compat switch only if asked later |
| 2 | Level-up on a fainted member (WP19 §5.5) | 0-HP member revived with the max-HP delta | stays fainted; `hpAfterRecalc(..., {reviveFainted})` keeps the reference behind a switch (default off) | 2026-10-18 | implemented; re-confirm when the item-use family (level-setting items) is built |
| 3 | Held item at battle end (WP42 §6) | player members' items reset from a restore record (temporary losses come back, consumed items do not) | `item` outside the write set: unchanged by battles | 2026-10-18 | deferred to the held-item batch; needs engine-side "consumed vs knocked off" evidence |
| 4 | Exp timing (WP42 §4) | immediately after the KO inside the turn | after the turn (identical in singles; differs only for a later same-turn action in doubles); faint hook proven but not wired | 2026-10-18 | revisit only if per-action fidelity in doubles is required |

## Differences found by the independent review that are **not decided yet** (2026-10-18)

None of these was a user decision; each is either a conscious interim or an open question. Items marked "needs decision" are listed again, with the options, in [`review-followups.md`](review-followups.md).

| # | Topic | Spec (clean-room catalog) | Ours now | Status |
|---|---|---|---|---|
| 5 | Ball in a **trainer** battle, singles (WP38 §2, CP16) | the ball is thrown and consumed, the trainer blocks it, no failure statistics | refused at the menu (`trainer`), nothing consumed; doubles already follow the spec (consumed and blocked) — the two paths disagree | **needs decision** (follow the spec, or record as intended) |
| 6 | Escape timing (WP41 7.2, CM-26) | the reference decides when the choice is made | decided inside the turn (engine `event` action, priority 99); differs in doubles (what happens to the other slot's choice on failure, PRNG order) | **needs decision** before the doubles UI |
| 7 | Persistent sleep / toxic counters (WP20 `statusCount`) | remaining sleep turns and the toxic counter are part of the persistent state | not in the write set / protocol v1; on battle start the engine seeds a fresh sleep roll (`random(2,5)` turns) and toxic stage 0 so a saved sleeper wakes up (interim; before this a saved sleeper never woke) | **needs decision**: additive `statusCount` in protocol v1, or a version bump |
| 8 | Mega Evolution / Dynamax order against RPG items (WP40 §5.1) | items before mega evolution | Showdown runs mega (order 104) and dynamax (105) before the RPG `event` action (order 200) | deferred to the mega/dynamax batch (long-tail) |
| 9 | Defeat in the result | — | `reason: win` with `winner` ≠ `Player` is a defeat; `outcome.winner` added in the additive v1 revision | a separate `lose` reason is a v2 candidate |
| 10 | Showdown behaviour vs. Essentials behaviour inside the battle | the spec is Essentials | by default Showdown's mechanics decide (that is what the route means); no catalog of the differences exists beyond the items above | **needs a principle from the user at the start of step 3** (default Showdown; list per work package) |
| 11 | Capture/escape/item rules not covered by an Essentials-derived test vector | — | implemented from the spec text (CP09, CP11–CP13, escape constants, Master Ball vs Ultra Beast, item eligibility); vectors are derived expectations, the reference was never run | recorded; revisit if a mismatch is observed in play |
