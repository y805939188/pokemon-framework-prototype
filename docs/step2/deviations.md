# Deliberate differences from the reference (user decisions)

| # | Topic | Reference | Ours | Decided | Status |
|---|---|---|---|---|---|
| 1 | Failed-item refund (WP40 §4.2.1, WP42 §6.0) | refunded at execution, identity kept, refunded again at battle end (net +1) | refund exactly once; ledger states reserved → consumed / refunded | 2026-10-18 | implemented (`session.cjs`); optional compat switch only if asked later |
| 2 | Level-up on a fainted member (WP19 §5.5) | 0-HP member revived with the max-HP delta | stays fainted; `hpAfterRecalc(..., {reviveFainted})` keeps the reference behind a switch (default off) | 2026-10-18 | implemented; re-confirm when the item-use family (level-setting items) is built |
| 3 | Held item at battle end (WP42 §6) | player members' items reset from a restore record (temporary losses come back, consumed items do not) | `item` outside the write set: unchanged by battles | 2026-10-18 | deferred to the held-item batch; needs engine-side "consumed vs knocked off" evidence |
| 4 | Exp timing (WP42 §4) | immediately after the KO inside the turn | after the turn (identical in singles; differs only for a later same-turn action in doubles); faint hook proven but not wired | 2026-10-18 | revisit only if per-action fidelity in doubles is required |
