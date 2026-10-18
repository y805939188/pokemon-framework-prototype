# Battle protocol — v1 FROZEN for the validated scope (2026-10-18)

Implemented in `js/engine/gateway.cjs` (engine boundary) and `js/engine/game/session.cjs` (game boundary). Everything crossing either boundary is a plain JSON value; UI/business code never holds Showdown objects. **Frozen** at 2.5 after the packaged-app matrix: the message kinds and their field sets, the `BattleResult` shape, the write set, the session call names, end reasons and refusal reasons are recorded in `protocol-v1.frozen.json` and guarded by `experiments/step2/s5/test-protocol-freeze.cjs` (observed shapes must equal the file; changing them requires a version bump and regenerating the file on purpose).

**Additive revision after the independent review (2026-10-18).** v1 stays v1: only additions were made, nothing was removed or renamed (`protocol-v1.frozen.json` was regenerated on purpose; see `review-followups.md`): `outcome.winner` in `BattleResult` (a defeat used to be indistinguishable from a win); refusal reasons `item-no-effect`, `unknown-target`, `norun`, `notfirst`, `invulnerable`; session calls `canUseItem` and `currentRequest`; foe descriptor flags `noRun` / `noBall`. The freeze test now *observes* shapes and reasons from several scenarios instead of repeating typed-in lists. **Still open:** persistent sleep/toxic counters (`statusCount`, WP20) are not part of the write set; the engine seeds them with fresh counters on battle start as an interim measure (decision needed, see `review-followups.md`).

**Validated scope of the freeze:** singles through the text-UI flow in NW.js 0.117.0 / RPGReactor 0.98.8 on Apple Silicon macOS, S1–S10 fixed-input outcomes identical in Node and in the packaged app, doubles at engine/session level (no doubles UI).
**Not frozen / unverified:** doubles UI and its request shape handling, player forced-switch UI (implemented, not scripted), nicknames/receive menus, battle-time save and recordings, Windows/Intel, any non-Gen-8 rule set, mid-turn exp hook (`setFaintHook` exists but is not part of the protocol).

## Layers and owners

| Layer | Owns while a battle runs | Reads | Never does |
|---|---|---|---|
| Persistent game state (`state.cjs`) | party/boxes/bag/money/dex/`appliedBattles` | — | is modified during a battle |
| BattleSession (`session.cjs`) | bag ledger, participants, exp/EV/level/learned moves, captured record | engine via `readState` | writes the save |
| Engine (Showdown via gateway) | hp, persistent status, pp, all temporary battle state (boosts, volatiles, field) | seeded state | knows items, exp, bag, saves |
| Store (`store.cjs`) | the single save file | `BattleResult` | applies a result twice |

Stable identity: every member has a string `id` (= Showdown nickname in the engine). Slots/order are engine-private; results are keyed by `id`.

## Sync points

1. **Start** persistent → engine: `seedState` (hp/status/pp); stats derive from the set (level, IV, EV, nature).
2. **Between turns, only if growth happened**: session → engine `applyGrowth` (level/EV/stats/learned moves; cross-checked against the game rules, mismatch throws) then `refreshRequests` so the *next* request already shows new stats/moves. Learn prompts and the next requests are withheld until decided.
3. **End** engine → `BattleResult`; the session never mutates the input game object.
4. **Commit** result → store (atomic, idempotent). Mid-turn growth (inside the turn, after a KO) is *not* the default; a faint hook exists and is proven (`probe-midturn-growth`) if the spec requires it for doubles.

## Messages out of the session (`take()` / return values)

| kind | payload | meaning |
|---|---|---|
| `events` | `events:[{type,args,raw}]` | public battle log lines (wall-clock `\|t:\|` must be ignored when comparing) |
| `request` | `side, request` | the engine's move/switch/wait request for that side (player = `p1`); only issued once growth is settled |
| `growth` | `member, foe, exp, level, levelUps[], hp` | exp/EV paid for a defeated foe |
| `learn-prompt` | `member, move{id,name,pp}, slots[]` | full move set: answer with `decideLearn(slot\|null)` |
| `learned` | `member, move, replaced` | applied move change |
| `error` | `side, message` | engine refused something (nothing was applied) |
| `end` | `reason: win\|run\|caught\|tie, outcome, winner` | `winner` is `null` for run/caught: engine tie/win is never the business meaning. For `win` it names the winning side (`Player` = the player); **`reason: win` with another winner is a defeat** (a separate `lose` reason is a v2 candidate) |

## Calls into the session

`chooseMove(i)`, `chooseSwitch(id)`, `chooseDoubles([spec])`, `useItem(item, target, {commit})`, `throwBall(ball)`, `run()`, `commitTurn()`, `cancel()`, `decideLearn(slot|null)`, `result()`; helpers `canUseItem(item, targetId)` (same eligibility the call applies; the menu greys targets out with it) and `currentRequest()`. Doubles specs: `{move,target}` | `{switch}` | `{kind:'item'|'ball'|'run',...}` | `null`. The foe descriptor given to `BattleSession.create` is `{kind:'wild'|'trainer', team, noRun?, noBall?}`.
Refusal reasons (`{ok:false, reason}`; the full list is `REFUSAL_REASONS` in `session.cjs` and the freeze test checks it against what the scenarios provoke): `ballsdisabled, choice-rejected, invulnerable, item-no-effect, multiplefoes, noactive, none-left, norun, not-registered, notfirst, trainer, trapped, unknown-item, unknown-target`.
Query (read-only, consumes nothing): `gw.query(side, 'run'|'ball', slot)` → `{allowed, reason?}`.

Failure semantics: a refused call returns `{ok:false, reason}` (or an `error` message) and leaves state unchanged — a reserved item is refunded, no payload stays parked. `cancel()` before the turn runs drops the staged action and refunds the reservation; a second cancel cannot refund twice.

## Ledger rules implemented

Item/ball: an item that could do nothing (fainted or full-HP target, no status to cure, stat already maxed, inactive target for a stat item) is refused **before** registration (`item-no-effect`, WP28 §3.5): nothing is consumed and no turn is used. Otherwise it is reserved (deducted from the *session's* working bag) at registration; at execution `ok` → consumed, `noeffect|invalid` (the target changed in between) → refunded once, ball → consumed whatever the outcome; cancel → refunded; a reservation whose action never ran because the battle ended first (e.g. a catch in the other doubles slot) is refunded when the result is built. A doubles choice is validated as a whole before anything is reserved. (The reference's "refunded but identity kept" anomaly is deliberately not copied: decided 2026-10-18, `deviations.md` #1.)

## BattleResult (protocol 1)

```
{ protocol: 1, battleId, outcome:{kind, winner, target?, ball?},   // target/ball only for `caught`
  members:{ <id>:{ level, exp, hp, status, moves:[{id,pp,maxpp}], evs } },   // write set only
  bag:{ <item>: delta }, captured:[member], dex:{seen:[],owned:[]} }
```
`applyBattleResult` refuses: other protocol versions, unknown members, fields outside the write set (`level, exp, hp, status, moves, evs, friendship`), negative bag, duplicate captured ids, a second result for the same `battleId` with a different hash. Same `battleId` + same hash → `already-applied` (no change).

## Durability claim (only what is implemented and tested)

Single JSON file, write temp → fsync → rename. Any throw or real process kill at `start / beforeSave / afterTmpWrite / beforeRename / afterRename` leaves either the whole old file or the whole new one; a leftover temp file is discarded on load; re-submitting the result applies it exactly once. Not claimed: power-loss beyond fsync+rename semantics, multi-file saves, battle-in-progress saves (engine snapshots exist but are not business saves).
