/**
 * Thin async battle gateway over a pinned Pokemon Showdown build.
 *
 * - Everything crossing the boundary is JSON-serializable: messages out, choice strings in, snapshots as JSON strings.
 * - Callers never hold Battle/Pokemon objects. `_debugBattle()` is the single diagnostic escape hatch.
 * - Members are addressed by stable id (= the Showdown nickname we assigned), never by slot.
 */
import { loadFormatExtension, loadSim } from "./showdown-loader.ts";
import type { LoadedSim } from "./showdown-loader.ts";
import type { ShowdownBattle, ShowdownPokemon } from "./showdown-types.ts";
import type { BattleEvent } from "./protocol.ts";
import type { MonView } from "../rules/rules.ts";
import type { PartialStats, Stats } from "../rules/types.ts";

/** Version tag of the engine-level message stream used by the 2.2 harness only; NOT the game protocol (state.ts PROTOCOL_VERSION = 1). */
export const PROTOCOL_VERSION = 0;

export interface PlayerSpec {
  name: string;
  team: unknown[];
}

export interface GatewayOptions {
  formatid?: string;
  seed?: number[] | string;
  players?: PlayerSpec[];
  engineRoot?: string;
  wild?: boolean;
  noBall?: boolean;
  noRun?: boolean;
  restored?: boolean;
}

export type GatewayMessage =
  | { kind: "events"; seq: number; events: BattleEvent[] }
  | { kind: "request"; seq: number; side: string; request: Record<string, any> }
  | { kind: "error"; seq: number; side: string; message: string; choice?: string; payload?: unknown }
  | { kind: "end"; seq: number; winner: string | null; turn: number; reason: string; outcome?: Record<string, unknown> };

/** A message before it gets its sequence number. */
type Unsequenced = GatewayMessage extends infer M ? (M extends GatewayMessage ? Omit<M, "seq"> : never) : never;

export interface SlotSpec {
  kind?: string;
  move?: number;
  target?: number | string;
  switch?: number;
  [k: string]: unknown;
}

export interface StateRecord {
  id: string;
  hp: number;
  status?: string;
  statusCount?: number;
  moves?: { id: string; pp: number; maxpp?: number }[];
}

export interface MemberState extends MonView {
  level: number;
  statusCount: number;
  pp: Record<string, number>;
  stats: Stats;
}

function parseLine(raw: string): BattleEvent {
  if (!raw.startsWith("|")) return { type: "text", args: [raw], raw };
  const parts = raw.slice(1).split("|");
  return { type: parts[0] ?? "", args: parts.slice(1), raw };
}

/**
 * Opaque in-memory rollback point of one gateway (engine state incl. PRNG, undelivered messages, sequence counter).
 * It has no readable fields: only `BattleGateway.fromCheckpoint` can open it. Not a save file and not serializable.
 */
export class GatewayCheckpoint { constructor() { Object.freeze(this); } }
interface CheckpointData { snapshot: string; engineRoot: string; queue: GatewayMessage[]; seq: number; closed: boolean }
const CHECKPOINTS = new WeakMap<GatewayCheckpoint, CheckpointData>();

export class BattleGateway {
  _env: LoadedSim;
  _queue: GatewayMessage[] = [];
  _waiters: ((m: GatewayMessage | null) => void)[] = [];
  _seq = 0;
  _battle: ShowdownBattle = null;
  _opts: GatewayOptions;
  _closed = false;

  constructor(opts: GatewayOptions, internal?: LoadedSim) {
    this._env = internal ?? loadSim(opts.engineRoot);
    this._opts = opts;
  }

  static async create(opts: GatewayOptions): Promise<BattleGateway> {
    const gw = new BattleGateway(opts);
    const { sim } = gw._env;
    const battle = new sim.Battle({
      formatid: opts.formatid,
      seed: opts.seed,
      send: (type: string, data: string | string[]) => gw._onSend(type, data),
    });
    gw._battle = battle;
    for (const [i, p] of (opts.players ?? []).entries()) {
      battle.setPlayer(`p${i + 1}`, { name: p.name, team: sim.Teams.pack(p.team) });
    }
    // The format's onBegin creates battle.rpg when the second player joins, so flags go after.
    if (opts.wild !== undefined || opts.noBall !== undefined || opts.noRun !== undefined) {
      if (!battle.rpg) throw new Error("wild/noBall/noRun need the RPG format (gen8rpgcustomgame)");
      battle.rpg.wild = !!opts.wild;
      if (opts.noBall) battle.rpg.noBall = true;
      if (opts.noRun) battle.rpg.noRun = true;
    }
    gw._pump();
    return gw;
  }

  /** Restore from a snapshot string produced by snapshot(). Emits no events until the next choice. */
  static async restore(snapshot: string, opts: GatewayOptions = {}): Promise<BattleGateway> {
    const gw = new BattleGateway(opts);
    gw._battle = gw._env.sim.Battle.fromJSON(snapshot);
    gw._battle.restart((type: string, data: string | string[]) => gw._onSend(type, data));
    gw._opts = { ...opts, restored: true };
    return gw;
  }

  snapshot(): string {
    return JSON.stringify(this._battle.toJSON());
  }

  /** An opaque rollback point of everything this gateway owns (see GatewayCheckpoint). */
  checkpoint(): GatewayCheckpoint {
    const token = new GatewayCheckpoint();
    CHECKPOINTS.set(token, {
      snapshot: this.snapshot(), engineRoot: this._env.root,
      queue: JSON.parse(JSON.stringify(this._queue)) as GatewayMessage[], seq: this._seq, closed: this._closed,
    });
    return token;
  }

  /** A new gateway in exactly the state of the checkpoint; the token stays valid and can be opened again. */
  static async fromCheckpoint(token: GatewayCheckpoint): Promise<BattleGateway> {
    const data = CHECKPOINTS.get(token);
    if (!data) throw new Error("not a gateway checkpoint");
    const gw = await BattleGateway.restore(data.snapshot, { engineRoot: data.engineRoot });
    gw._queue = JSON.parse(JSON.stringify(data.queue)) as GatewayMessage[];
    gw._seq = data.seq; gw._closed = data.closed;
    return gw;
  }

  /** Stable id (the nickname we assigned) of the member currently in a side's slot, or null. */
  activeId(sideId: string, slot = 0): string | null {
    const side = this._battle.sides.find((x: { id: string }) => x.id === sideId);
    const mon = side && side.active[slot];
    return mon ? String(mon.name) : null;
  }

  /** A copy of the side's pending move/switch request while it still has to choose, else null. */
  awaitingChoice(sideId: string): Record<string, any> | null {
    const side = this._battle.sides.find((x: { id: string }) => x.id === sideId);
    const req = side && side.activeRequest;
    if (!req || req.wait || side.isChoiceDone()) return null;
    return JSON.parse(JSON.stringify(req)) as Record<string, any>;
  }

  /** Take every queued message (each is handed out once). */
  drain(): GatewayMessage[] {
    return this._queue.splice(0);
  }

  /** Drop queued messages nobody will read (requests are re-issued by refreshRequests). */
  discardQueued(): void {
    this._queue.length = 0;
  }

  /** Next structured message, or null if the battle has ended and the queue is empty. */
  next(): Promise<GatewayMessage | null> {
    const head = this._queue.shift();
    if (head) return Promise.resolve(head);
    if (this._closed) return Promise.resolve(null);
    return new Promise((resolve) => this._waiters.push(resolve));
  }

  /** Submit a choice string (Showdown choice syntax) for side 'p1'|'p2'. */
  async choose(side: string, choice: string): Promise<boolean> {
    const ok = this._battle.choose(side, choice);
    this._pump();
    if (!ok) {
      this._emit({ kind: "error", side, message: "choice rejected by engine", choice });
    }
    return ok;
  }

  /**
   * Register a non-move action (item / ball / run) as the whole choice of one active slot.
   * Singles shorthand for chooseSlots(side, [payload]) (slot 0). See chooseSlots.
   */
  async act(side: string, payload: SlotSpec, slot = 0): Promise<boolean> {
    const specs = slot === 0 ? [payload] : [null, payload];
    return this.chooseSlots(side, specs);
  }

  /**
   * Register this side's choice for every active slot in one go. Each spec is either
   *   { move: n, target?: loc } | { switch: n }                    -> ordinary engine choice
   *   { kind: 'item'|'ball'|'run', ... } (JSON payload)           -> RPG action
   *   null                                                        -> slot is fainted / auto-pass
   * RPG actions are queued as engine 'event' actions (priority 99: after switches, before every
   * move) and resolved inside the turn by the RPG format's `onRpgAction`. Nothing is applied
   * until the turn runs, so cancelling before the other side commits changes no state.
   */
  async chooseSlots(side: string, specs: (SlotSpec | null)[]): Promise<boolean> {
    const b = this._battle;
    const s = b.getSide(side);
    if (!b.rpg) throw new Error("battle format has no RPG extension (use gen8rpgcustomgame / gen8rpgdoublescustomgame)");
    if (b.requestState !== "move" || !s.activeRequest || s.activeRequest.wait) {
      this._emit({ kind: "error", side, message: "no move request pending", payload: specs });
      return false;
    }
    s.clearChoice();
    for (const k of Object.keys(b.rpg.pending)) if (k.startsWith(side + ":")) delete b.rpg.pending[k];
    let ok = true;
    for (let i = 0; i < specs.length && ok; i++) {
      const spec = specs[i];
      const idx = s.getChoiceIndex(); // skips fainted slots like the engine does
      if (idx >= s.active.length) break;
      if (spec && spec.kind) {
        b.rpg.pending[`${side}:${idx}`] = JSON.parse(JSON.stringify(spec));
        s.choice.actions.push({ choice: "event", event: "RpgAction", pokemon: s.active[idx], priority: 99 });
      } else if (spec && spec.move !== undefined) {
        ok = !!s.chooseMove(spec.move, spec.target || 0);
      } else if (spec && spec.switch !== undefined) {
        ok = !!s.chooseSwitch(spec.switch);
      }
    }
    if (!ok || !s.isChoiceDone()) {
      for (const k of Object.keys(b.rpg.pending)) if (k.startsWith(side + ":")) delete b.rpg.pending[k];
      s.clearChoice();
      this._pump();
      if (ok) this._emit({ kind: "error", side, message: "incomplete choice", payload: specs });
      return false;
    }
    if (b.allChoicesDone()) b.commitChoices();
    this._pump();
    return true;
  }

  /**
   * Menu-layer legality (read-only, nothing consumed). Mirrors the spec's "refuse without
   * consuming" checks for the cases step 2.2 covers. Returns { allowed, reason }.
   */
  query(side: string, what: "run" | "ball" | string, slot = 0): { allowed: boolean; reason?: string } {
    const b = this._battle;
    const s = b.getSide(side);
    const active: ShowdownPokemon = s.active[slot];
    const foes = s.foe.pokemon.filter((p: ShowdownPokemon) => !p.fainted);
    if (!b.rpg || !b.rpg.wild) {
      if (what === "run") return { allowed: false, reason: "trainer" };
      if (what === "ball") {
        // WP38 2 / CP16: in a trainer battle the ball CAN be thrown; it is spent and the trainer blocks it when it
        // resolves (custom-formats resolveBall). Only the "balls disabled" flag and an absent active refuse here.
        if (b.rpg && b.rpg.noBall) return { allowed: false, reason: "ballsdisabled" };
        if (!active || active.fainted) return { allowed: false, reason: "noactive" };
      }
      return { allowed: true };
    }
    if (!active || active.fainted) return { allowed: false, reason: "noactive" };
    if (what === "run") {
      if (b.rpg.noRun) return { allowed: false, reason: "norun" };
      if (active.hasType("Ghost") || active.hasAbility("runaway") || active.hasItem("smokeball")) return { allowed: true }; // before trapping (WP41 7.1)
      if (active.trapped || active.volatiles["partiallytrapped"]) return { allowed: false, reason: "trapped" };
      return { allowed: true };
    }
    if (what === "ball") {
      if (b.rpg.noBall) return { allowed: false, reason: "ballsdisabled" };
      if (foes.length > 1) return { allowed: false, reason: "multiplefoes" };
      const target = s.foe.active.find((p: ShowdownPokemon) => p && !p.fainted);
      if (target && target.isSemiInvulnerable && target.isSemiInvulnerable()) return { allowed: false, reason: "invulnerable" };
      return { allowed: true };
    }
    return { allowed: true };
  }

  // ------------------------------------------------------------------------------------------
  // State exchange with the game layer. Members are addressed by stable id.
  // ------------------------------------------------------------------------------------------

  _mon(sideId: string, id: string): ShowdownPokemon {
    const p = this._battle.getSide(sideId).pokemon.find((x: ShowdownPokemon) => x.name === id);
    if (!p) throw new Error(`no pokemon with stable id ${id} on ${sideId}`);
    return p;
  }

  /** Seed persistent dynamic state (hp/status/pp) from game records into the fresh battle. */
  seedState(sideId: string, records: StateRecord[]): void {
    // Resolve every cap before changing any state. Showdown defaults to three PP Ups, whereas persistent
    // records carry their own total PP. Keep both slot copies and the simulator's PP-Up counters coherent.
    const prepared = records.map((r) => {
      const p = this._mon(sideId, r.id);
      const moves = (r.moves ?? []).map((m) => {
        const index = p.baseMoveSlots.findIndex((slot: { id: string }) => slot.id === m.id);
        if (index < 0) throw new Error(`unknown PP slot ${r.id}.${m.id}`);
        const slot = p.baseMoveSlots[index];
        const maxpp = m.maxpp ?? slot.maxpp; // low-level legacy callers may seed only current PP
        const move = this._battle.dex.moves.get(m.id);
        const possible = move.noPPBoosts || move.id === "trumpcard" ? [0] : [0, 1, 2, 3];
        const ppUps = possible.find((ups) => this._battle.calculatePP(move, ups) === maxpp);
        if (!Number.isInteger(maxpp) || ppUps === undefined) throw new Error(`invalid PP maximum for ${r.id}.${m.id}: ${maxpp}`);
        if (!Number.isInteger(m.pp) || m.pp < 0 || m.pp > maxpp) throw new Error(`invalid current PP for ${r.id}.${m.id}: ${m.pp}/${maxpp}`);
        return { index, id: m.id, pp: m.pp, maxpp, ppUps };
      });
      return { r, p, moves };
    });
    for (const { r, p, moves } of prepared) {
      p.hp = Math.min(r.hp, p.maxhp);
      if (p.hp <= 0) { p.hp = 0; p.fainted = true; p.status = "fnt"; }
      else if (r.status) {
        // statusCount (WP20): sleep = remaining turns; poison = 0 normal / 1 badly poisoned. The toxic accumulation
        // counter is battle-only and starts at 0. Legacy records without statusCount: a carried-in sleep gets a
        // fresh duration (same draw as the engine's own sleep start); before that, it never ended.
        const count = r.statusCount;
        const status = (r.status === "psn" && count === 1) ? "tox" : r.status;
        p.status = status;
        p.statusState = { id: status, target: p };
        if (status === "slp") {
          const t = Number.isInteger(count) && (count as number) >= 0 ? (count as number) : this._battle.random(2, 5);
          p.statusState.startTime = t; p.statusState.time = t;
        }
        if (status === "tox") p.statusState.stage = 0;
      }
      for (const m of moves) {
        const base = p.baseMoveSlots[m.index];
        base.pp = m.pp; base.maxpp = m.maxpp;
        const live = p.moveSlots.find((slot: { id: string }) => slot.id === m.id);
        if (live) { live.pp = m.pp; live.maxpp = m.maxpp; }
        p.ppUps[m.index] = m.ppUps;
      }
    }
  }

  /** Read back the engine-owned dynamic state per member: hp, persistent status, pp per move. */
  readState(sideId: string): MemberState[] {
    return this._battle.getSide(sideId).pokemon.map((p: ShowdownPokemon): MemberState => ({
      id: p.name, hp: p.hp, maxhp: p.maxhp, level: p.level, fainted: !!p.fainted,
      status: p.fainted ? "" : p.status || "",
      // persistent counter (WP20): remaining sleep turns, 1 for badly poisoned, else 0
      statusCount: p.fainted ? 0 : p.status === "slp" ? Math.max(0, (p.statusState && p.statusState.time) || 0) : p.status === "tox" ? 1 : 0,
      pp: Object.fromEntries(p.baseMoveSlots.map((m: { id: string; pp: number }) => [m.id, m.pp])),
      stats: { ...p.baseStoredStats }, active: !!p.isActive,
      confused: !!(p.volatiles && p.volatiles["confusion"]), boosts: { ...p.boosts },
    }));
  }

  /**
   * Push a growth result into the engine: new level/EVs, recomputed stats, HP rule and learned
   * moves. `expect.stats` (from the game rules) is cross-checked against the engine's own
   * computation; a mismatch throws instead of silently diverging.
   */
  applyGrowth(sideId: string, id: string, { level, evs, expect, newMoves = [], replaceSlot }: {
    level: number; evs?: PartialStats; expect?: { stats?: Partial<Stats> }; newMoves?: string[]; replaceSlot?: number | null;
  }): { before: { level: number; maxhp: number; hp: number }; after: { level: number; maxhp: number; hp: number }; stats: Stats } {
    const b = this._battle;
    const p = this._mon(sideId, id);
    const before = { level: p.level, maxhp: p.maxhp, hp: p.hp };
    p.set.level = level; p.level = level;
    if (evs) p.set.evs = { ...evs };
    const stats: Stats = b.spreadModify(p.species.baseStats, p.set);
    p.baseStoredStats = stats;
    for (const k of Object.keys(p.storedStats)) p.storedStats[k] = stats[k as keyof Stats];
    p.speed = p.storedStats.spe;
    p.updateMaxHp(); // engine's own HP rule: current HP keeps its distance from max
    p.details = p.getUpdatedDetails ? p.getUpdatedDetails() : p.details;
    if (expect && expect.stats) {
      for (const k of Object.keys(expect.stats) as (keyof Stats)[]) {
        if (stats[k] !== expect.stats[k]) throw new Error(`stat mismatch for ${id}.${k}: engine ${stats[k]} vs game ${expect.stats[k]}`);
      }
    }
    for (const mv of newMoves) {
      const dm = b.dex.moves.get(mv);
      const slot = { move: dm.name, id: dm.id, pp: dm.pp, maxpp: dm.pp, target: dm.target, disabled: false, disabledSource: "", used: false };
      if (replaceSlot !== undefined && replaceSlot !== null) {
        p.baseMoveSlots[replaceSlot] = slot; p.moveSlots[replaceSlot] = { ...slot }; p.set.moves[replaceSlot] = dm.name;
        p.ppUps[replaceSlot] = 0;
      } else {
        p.baseMoveSlots.push(slot); p.moveSlots.push({ ...slot }); p.set.moves.push(dm.name);
        p.ppUps.push(0);
      }
    }
    return { before, after: { level: p.level, maxhp: p.maxhp, hp: p.hp }, stats };
  }

  /**
   * Attach a synchronous callback fired inside the turn when a Pokemon faints (mid-turn sync point).
   * Not serialized: re-attach after restore(). The callback may call applyGrowth(); it must not
   * choose or commit anything.
   */
  setFaintHook(fn: (e: unknown) => void): void {
    loadFormatExtension(this._env.root).hooks.set(this._battle, fn);
  }

  /** Static move facts the game layer needs (name/id/pp) without holding engine objects. */
  moveInfo(nameOrId: string): { id: string; name: string; pp: number } {
    const m = this._battle.dex.moves.get(nameOrId);
    if (!m.exists) throw new Error(`unknown move ${nameOrId}`);
    return { id: m.id, name: m.name, pp: m.pp };
  }

  /**
   * Re-issue move/switch requests after state changes between turns (growth). Returns the
   * fresh requests per side and queues nothing else.
   */
  refreshRequests(): GatewayMessage[] {
    const b = this._battle;
    const saved = this._queue.splice(0);
    b.makeRequest(b.requestState);
    // sendUpdates() only flushes requests when the log grew; a growth step may add no log line
    if (!b.sentRequests) { for (const side of b.sides) side.emitRequest(); b.sentRequests = true; }
    b.sendUpdates();
    const fresh = this._queue.splice(0);
    this._queue.push(...saved.filter((m) => m.kind !== "request"), ...fresh);
    return fresh.filter((m) => m.kind === "request");
  }

  /** Drop this side's registered choice (engine undo) and any pending RPG payload. */
  async cancel(side: string): Promise<void> {
    const b = this._battle;
    if (b.rpg) for (const k of Object.keys(b.rpg.pending)) if (k.startsWith(side + ":")) delete b.rpg.pending[k];
    b.undoChoice(side);
    this._pump();
  }

  _pump(): void {
    // Showdown batches output until sendUpdates(); BattleStream does this after each write.
    this._battle.sendUpdates();
  }

  _emit(msg: Unsequenced): void {
    const full = { ...msg, seq: this._seq++ } as GatewayMessage;
    const w = this._waiters.shift();
    if (w) w(full);
    else this._queue.push(full);
  }

  _onSend(type: string, data: string | string[]): void {
    const text = Array.isArray(data) ? data.join("\n") : data;
    if (type === "update") {
      const { extractChannelMessages } = this._env;
      const ch = extractChannelMessages(text, [0]);
      const lines = (ch[0] ?? []).filter((l) => l !== "");
      this._emit({ kind: "events", events: lines.map(parseLine) });
    } else if (type === "sideupdate") {
      const nl = text.indexOf("\n");
      const side = text.slice(0, nl);
      const body = text.slice(nl + 1);
      for (const line of body.split("\n")) {
        if (line.startsWith("|request|")) {
          this._emit({ kind: "request", side, request: JSON.parse(line.slice("|request|".length)) });
        } else if (line.startsWith("|error|")) {
          this._emit({ kind: "error", side, message: line.slice("|error|".length) });
        }
      }
    } else if (type === "end") {
      const b = this._battle;
      const outcome = b.rpg && b.rpg.outcome; // RPG outcomes (run/caught) are not engine wins
      this._emit({
        kind: "end",
        winner: outcome ? null : b.winner || null,
        turn: b.turn,
        reason: outcome ? outcome.kind : b.winner ? "win" : "tie",
        ...(outcome ? { outcome } : {}),
      });
      this._closed = true;
      for (const w of this._waiters.splice(0)) w(null);
    }
  }

  /** Active (non-wait) requests per side; lets a restored session resume without replaying. */
  pendingRequests(): { side: string; request: Record<string, any> }[] {
    return this._battle.sides
      .map((side: { id: string; activeRequest: Record<string, any> | null }) => ({ side: side.id, request: side.activeRequest }))
      .filter((r: { request: Record<string, any> | null }) => r.request && !r.request.wait);
  }

  /** Seed the PRNG was created with (string or array), for reproducing a default-random run. */
  prngSeed(): number[] | string {
    return this._battle.prngSeed;
  }

  get ended(): boolean {
    return this._battle.ended;
  }

  /** Diagnostic-only access for tools and experiments. Production flow must not use it (scripts/check-boundaries.cjs). */
  _debugBattle(): ShowdownBattle {
    return this._battle;
  }
}
