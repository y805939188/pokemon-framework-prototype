# Battle protocol — v1 DRAFT (not frozen)

Implemented in `js/engine/gateway.cjs` (engine boundary) and `js/engine/game/session.cjs` (game boundary). Everything crossing either boundary is a plain JSON value; UI/business code never holds Showdown objects. Freezing happens in 2.5 after the packaged-runtime matrix; until then treat shapes as changeable.

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
| `end` | `reason: win\|run\|caught\|tie, outcome, winner` | `winner` is `null` for run/caught: engine tie/win is never the business meaning |

## Calls into the session

`chooseMove(i)`, `chooseSwitch(id)`, `chooseDoubles([spec])`, `useItem(item, target, {commit})`, `throwBall(ball)`, `run()`, `commitTurn()`, `cancel()`, `decideLearn(slot|null)`, `result()`. Doubles specs: `{move,target}` | `{switch}` | `{kind:'item'|'ball'|'run',...}` | `null`.
Query (read-only, consumes nothing): `gw.query(side, 'run'|'ball', slot)` → `{allowed, reason?}`.

Failure semantics: a refused call returns `{ok:false, reason}` (or an `error` message) and leaves state unchanged — a reserved item is refunded, no payload stays parked. `cancel()` before the turn runs drops the staged action and refunds the reservation; a second cancel cannot refund twice.

## Ledger rules implemented

Item/ball: reserved (deducted from the *session's* working bag) at registration; at execution `ok` → consumed, `noeffect|invalid` → refunded once, ball → consumed whatever the outcome; cancel → refunded. (The reference's "refunded but identity kept" anomaly is deliberately not copied: user decision pending, see 2.3 report.)

## BattleResult (protocol 1)

```
{ protocol: 1, battleId, outcome:{kind, target?, ball?},
  members:{ <id>:{ level, exp, hp, status, moves:[{id,pp,maxpp}], evs } },   // write set only
  bag:{ <item>: delta }, captured:[member], dex:{seen:[],owned:[]} }
```
`applyBattleResult` refuses: other protocol versions, unknown members, fields outside the write set (`level, exp, hp, status, moves, evs, friendship`), negative bag, duplicate captured ids, a second result for the same `battleId` with a different hash. Same `battleId` + same hash → `already-applied` (no change).

## Durability claim (only what is implemented and tested)

Single JSON file, write temp → fsync → rename. Any throw or real process kill at `start / beforeSave / afterTmpWrite / beforeRename / afterRename` leaves either the whole old file or the whole new one; a leftover temp file is discarded on load; re-submitting the result applies it exactly once. Not claimed: power-loss beyond fsync+rename semantics, multi-file saves, battle-in-progress saves (engine snapshots exist but are not business saves).
