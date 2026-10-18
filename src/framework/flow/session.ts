/**
 * BattleSession: the game-side owner of one battle.
 *
 * Ownership during a battle:
 *   engine  -> hp, persistent status, pp, temporary battle state (boosts, volatiles ...)
 *   session -> bag ledger, participants, exp/EV/level/learned moves, captured record
 *   game state (persistent) -> NOT touched until `result()` is committed through the store
 * Sync points: (1) battle start: persistent -> engine (seedState); (2) between turns when growth
 * happened: session -> engine (applyGrowth) + refreshed requests; (3) battle end: engine -> result.
 */
import { BattleGateway } from "../battle/gateway.ts";
import type { GatewayMessage, MemberState } from "../battle/gateway.ts";
import * as G from "../rules/growth.ts";
import { HEAL_ITEMS, STAT_ITEMS, STATUS_ITEMS, itemEligibility } from "../rules/rules.ts";
import * as S from "../rules/state.ts";
import type { BattleResult, GameState } from "../rules/state.ts";
import type { Content, Member } from "../rules/types.ts";
import type { BattleEvent, SessionMessage } from "../battle/protocol.ts";

/** Frozen protocol vocabulary (protocol-v1.md); the freeze test checks observed values against these. */
export const END_REASONS = ["caught", "run", "tie", "win"] as const;
export const REFUSAL_REASONS = ["ballsdisabled", "choice-rejected", "invulnerable", "item-no-effect", "multiplefoes", "noactive", "none-left", "norun", "not-registered", "notfirst", "trainer", "trapped", "unknown-item", "unknown-target"] as const;

type Req = Record<string, any>;

/**
 * Persistent form of an engine status at battle end (WP20 statusCount, WP39 after_battle): poison counters are
 * cleared (bad poison becomes plain poison), sleep keeps its remaining turns, everything else has no counter.
 */
function persistentStatus(status: string | undefined, count: number | undefined): { status: string; statusCount: number } {
  if (status === "tox" || status === "psn") return { status: "psn", statusCount: 0 };
  return { status: status || "", statusCount: status === "slp" ? count || 0 : 0 };
}

const ITEM_IDS = new Set([...Object.keys(HEAL_ITEMS), ...Object.keys(STATUS_ITEMS), ...Object.keys(STAT_ITEMS)]);

function toSet(m: Member, moveName: (id: string) => string): Record<string, unknown> {
  return {
    name: m.id, species: m.species, item: m.item || "", ability: m.ability, nature: m.nature, gender: m.gender,
    level: m.level, evs: { ...m.evs }, ivs: { ...m.ivs }, moves: m.moves.map((x) => moveName(x.id)),
  };
}

export interface FoeSpec {
  kind: "wild" | "trainer";
  team: Member[];
  noRun?: boolean;
  noBall?: boolean;
}

export type FoeAi = (request: Req) => string | null | undefined;

export interface CreateOptions {
  game: GameState;
  battleId: string;
  foe: FoeSpec;
  content: Content;
  seed?: number[] | string;
  doubles?: boolean;
  formatid?: string;
  ai?: FoeAi;
  rules?: G.ExpRules;
}

export type Refusal = { ok: false; reason: string };
export type TurnResult = { ok: true; messages: SessionMessage[] } | { ok: true; staged: true } | Refusal;

export interface DoublesSpec {
  move?: number;
  target?: number | string;
  switch?: number;
  kind?: "item" | "ball" | "run";
  item?: string;
  ball?: string;
  catchRate?: number;
  ctx?: Record<string, unknown>;
  [k: string]: unknown;
}

interface LedgerEntry {
  kind: string;
  itemId: string;
  target: unknown;
  state: "reserved" | "consumed" | "refunded";
  why?: string;
}

type GrowthTask =
  | { kind: "award"; foeId: string }
  | { kind: "learn"; memberId: string; move: { id: string; name: string; pp: number } };

export class BattleSession {
  content!: Content;
  rules!: G.ExpRules;
  battleId!: string;
  foe!: FoeSpec;
  party!: Member[];
  foeTeam!: Member[];
  startBag!: Record<string, number>;
  bag!: Record<string, number>;
  startDexOwned!: string[];
  ledger: LedgerEntry[] = [];
  out: SessionMessage[] = [];
  held: GatewayMessage[] = [];
  growthQueue: GrowthTask[] = [];
  pendingLearn: { memberId: string; move: { id: string; name: string; pp: number } } | null = null;
  participants: Record<string, Set<string>> = {};
  activeNow: Record<string, (string | null)[]> = { p1: [], p2: [] };
  doubles = false;
  ended: Extract<GatewayMessage, { kind: "end" }> | null = null;
  finished = false;
  ai!: FoeAi;
  gw!: BattleGateway;
  requests?: Record<string, Req>;
  grew = false;
  _caughtAwarded = false;
  _result?: BattleResult;

  static async create({ game, battleId, foe, content, seed, doubles = false, formatid = doubles ? "gen8rpgdoublescustomgame" : "gen8rpgcustomgame", ai, rules }: CreateOptions): Promise<BattleSession> {
    const probe = await BattleGateway.create({ formatid, seed, players: [{ name: "p", team: [{ name: "x", species: "Pidgey", moves: ["Tackle"] }] }, { name: "q", team: [{ name: "y", species: "Pidgey", moves: ["Tackle"] }] }] });
    const moveName = (id: string): string => probe.moveInfo(id).name;
    // Showdown keeps the nickname (our stable id) truncated to 20 characters and strips separators,
    // so ids must survive that round trip untouched or results could not be mapped back.
    for (const m of [...game.party, ...foe.team]) {
      if (!/^[A-Za-z0-9#._:-]{1,18}$/.test(m.id)) throw new Error(`member id "${m.id}" is not usable as a battle id (1-18 chars of A-Z a-z 0-9 # . _ : -)`);
    }
    const party = S.clone(game.party).slice(0, 6);
    const lead = [...party.filter((m) => m.hp > 0), ...party.filter((m) => m.hp <= 0)];
    const s = new BattleSession();
    s.content = content; s.rules = rules || G.DEFAULT_RULES; s.battleId = battleId; s.foe = foe;
    s.party = party; s.foeTeam = S.clone(foe.team);
    s.startBag = S.clone(game.bag); s.bag = S.clone(game.bag);
    s.startDexOwned = game.dex.owned.slice();
    s.doubles = doubles;
    s.ai = ai || (doubles ? BattleSession.defaultAiDoubles : BattleSession.defaultAi);
    s.gw = await BattleGateway.create({
      formatid, seed, wild: foe.kind === "wild", noRun: !!foe.noRun, noBall: !!foe.noBall, // encounter flags: scripted battles that forbid running / balls
      players: [{ name: "Player", team: lead.map((m) => toSet(m, moveName)) }, { name: foe.kind === "wild" ? "Wild" : "Trainer", team: s.foeTeam.map((m) => toSet(m, moveName)) }],
    });
    await s.gw.choose("p1", "team " + lead.map((_, i) => i + 1).join(""));
    await s.gw.choose("p2", "team " + s.foeTeam.map((_, i) => i + 1).join(""));
    s.gw.seedState("p1", lead);
    s.gw.seedState("p2", s.foeTeam);
    s.gw.refreshRequests();
    s._ingest();
    s._finishTurn();
    return s;
  }

  static defaultAi(request: Req): string {
    if (request.forceSwitch) {
      const i = request.side.pokemon.findIndex((p: Req) => !p.active && !/ fnt$/.test(p.condition));
      return "switch " + (i + 1);
    }
    const i = request.active[0].moves.findIndex((m: Req) => !m.disabled && m.pp > 0);
    return "move " + (i + 1);
  }

  /** Doubles foe AI: first usable move per live slot, aimed at foe slot 1 when a target is needed. */
  static defaultAiDoubles(request: Req): string {
    const needsTarget = (t: string): boolean => ["normal", "any", "adjacentFoe"].includes(t);
    if (request.forceSwitch) {
      const bench = request.side.pokemon.map((p: Req, i: number) => ({ p, i })).filter(({ p, i }: { p: Req; i: number }) => i >= request.forceSwitch.length && !/ fnt$/.test(p.condition));
      return request.forceSwitch.map((f: unknown) => { if (!f) return "pass"; const b = bench.shift(); return b ? `switch ${b.i + 1}` : "pass"; }).join(", ");
    }
    return request.active.map((a: Req, i: number) => {
      if (/ fnt$/.test(request.side.pokemon[i].condition)) return "pass";
      const mi = a.moves.findIndex((m: Req) => !m.disabled && m.pp > 0);
      return `move ${mi + 1}` + (needsTarget(a.moves[mi].target) ? " 1" : "");
    }).join(", ");
  }

  // ------------------------------------------------------------------ public actions
  /** Returns and clears everything the UI should show since the last call. */
  take(): SessionMessage[] { return this.out.splice(0); }

  currentRequest(): Req | undefined { return this.requests && this.requests["p1"]; }

  async chooseMove(index: number): Promise<TurnResult> { return this._turn(async () => this.gw.choose("p1", `move ${index}`)); }
  async chooseSwitch(memberId: string): Promise<TurnResult> {
    const i = (this.requests!["p1"]!["side"].pokemon as Req[]).findIndex((p) => p["ident"] === `p1: ${memberId}`);
    return this._turn(async () => this.gw.choose("p1", `switch ${i + 1}`));
  }
  async chooseForcedSwitch(memberId: string): Promise<TurnResult> { return this.chooseSwitch(memberId); }

  /** Reserve the item (deduct now), register the action; refunded on cancel/no-effect. */
  async useItem(itemId: string, targetId: string, { commit = true }: { commit?: boolean } = {}): Promise<TurnResult> {
    if (!ITEM_IDS.has(itemId)) return { ok: false, reason: "unknown-item" };
    if ((this.bag[itemId] || 0) < 1) return { ok: false, reason: "none-left" };
    const el = this.canUseItem(itemId, targetId);
    if (!el.ok) return { ok: false, reason: el.reason }; // refused before registration: nothing consumed, no turn used
    const entry = this._reserve("item", itemId, targetId);
    const ok = await this.gw.act("p1", { kind: "item", item: itemId, target: targetId });
    if (!ok) { this._refund(entry, "not-registered"); return { ok: false, reason: "not-registered" }; }
    return commit ? this._resolveTurn() : { ok: true, staged: true };
  }

  /** Registration-time eligibility of an item for a party member (same rule the menu uses to grey out targets). */
  canUseItem(itemId: string, targetId: unknown): ReturnType<typeof itemEligibility> {
    const mon = this.gw.readState("p1").find((x: MemberState) => x.id === targetId);
    return itemEligibility(itemId, mon);
  }

  /**
   * Doubles: register one spec per active slot ({move,target}|{switch}|{kind:'item'|'ball'|'run',...}|null)
   * and resolve the turn. Items/balls are reserved in the ledger first and refunded if the choice is refused.
   */
  async chooseDoubles(specs: (DoublesSpec | null)[], { commit = true }: { commit?: boolean } = {}): Promise<TurnResult> {
    // validate every spec BEFORE reserving anything: a refusal consumes nothing (WP38 2 / WP28 3.5)
    let acted = false;
    for (let i = 0; i < specs.length; i++) {
      const sp = specs[i];
      if (sp && sp.kind === "ball") {
        if (acted) return { ok: false, reason: "notfirst" }; // a ball must be the first action of the round (WP38 2)
        const q = this.gw.query("p1", "ball", i);
        if (!q.allowed) return { ok: false, reason: q.reason ?? "refused" };
      } else if (sp && sp.kind === "run") {
        const q = this.gw.query("p1", "run", i);
        if (!q.allowed) return { ok: false, reason: q.reason ?? "refused" };
      } else if (sp && sp.kind === "item") {
        if (!ITEM_IDS.has(sp.item as string)) return { ok: false, reason: "unknown-item" };
        const el = this.canUseItem(sp.item as string, sp.target);
        if (!el.ok) return { ok: false, reason: el.reason };
      }
      if (sp) acted = true;
    }
    const entries: LedgerEntry[] = [];
    for (const sp of specs) {
      if (!sp || !sp.kind || sp.kind === "run") continue;
      const id = (sp.kind === "item" ? sp.item : sp.ball) as string;
      if ((this.bag[id] || 0) < 1) { entries.forEach((e) => this._refund(e, "not-registered")); return { ok: false, reason: "none-left" }; }
      if (sp.kind === "ball") {
        const rec = this.foeTeam.find((m) => m.id === sp.target);
        if (!rec) { entries.forEach((e) => this._refund(e, "not-registered")); return { ok: false, reason: "unknown-target" }; }
        sp.catchRate = this.content.species[rec.species]!.catchRate;
        sp.ctx = { ownedCount: this.startDexOwned.length, speciesOwned: this.startDexOwned.includes(rec.species) };
      }
      entries.push(this._reserve(sp.kind, id, sp.target));
    }
    const ok = await this.gw.chooseSlots("p1", specs);
    if (!ok) { entries.forEach((e) => this._refund(e, "not-registered")); return { ok: false, reason: "choice-rejected" }; }
    return commit ? this._resolveTurn() : { ok: true, staged: true };
  }

  /** Resolve the turn with whatever the player registered (use after a staged action). */
  async commitTurn(): Promise<TurnResult> { return this._resolveTurn(); }

  async throwBall(ballId: string): Promise<TurnResult> {
    const q = this.gw.query("p1", "ball");
    if (!q.allowed) return { ok: false, reason: q.reason ?? "refused" };
    if ((this.bag[ballId] || 0) < 1) return { ok: false, reason: "none-left" };
    const foeActive = this.gw._debugBattle().getSide("p2").active[0];
    const foeRec = this.foeTeam.find((m) => m.id === foeActive.name)!;
    const entry = this._reserve("ball", ballId, foeRec.id);
    const ctx = { ownedCount: this.startDexOwned.length, speciesOwned: this.startDexOwned.includes(foeRec.species) };
    const ok = await this.gw.act("p1", { kind: "ball", ball: ballId, target: foeRec.id, catchRate: this.content.species[foeRec.species]!.catchRate, ctx });
    if (!ok) { this._refund(entry, "not-registered"); return { ok: false, reason: "not-registered" }; }
    return this._resolveTurn();
  }

  async run(): Promise<TurnResult> {
    const q = this.gw.query("p1", "run");
    if (!q.allowed) return { ok: false, reason: q.reason ?? "refused" };
    await this.gw.act("p1", { kind: "run" });
    return this._resolveTurn();
  }

  /** Cancel the registered (not yet executed) choice; reserved items return to the bag. */
  async cancel(): Promise<void> {
    await this.gw.cancel("p1");
    for (const e of this.ledger.filter((x) => x.state === "reserved")) this._refund(e, "cancelled");
  }

  async decideLearn(slotOrNull: number | null | undefined): Promise<SessionMessage[]> {
    const p = this.pendingLearn;
    if (!p) throw new Error("no learn decision pending");
    this.pendingLearn = null;
    if (slotOrNull !== null && slotOrNull !== undefined) this._learn(p.memberId, p.move, slotOrNull);
    await this._continueGrowth();
    return this.take();
  }

  /** The BattleResult (protocol v1). Only valid after the battle ended and growth finished. */
  result(): BattleResult {
    if (!this.finished) throw new Error("battle not finished");
    return this._result!;
  }

  // ------------------------------------------------------------------ ledger
  _reserve(kind: string, itemId: string, target: unknown): LedgerEntry {
    this.bag[itemId] = (this.bag[itemId] as number) - 1;
    const e: LedgerEntry = { kind, itemId, target, state: "reserved" };
    this.ledger.push(e);
    return e;
  }
  _refund(entry: LedgerEntry, why: string): void {
    if (entry.state === "refunded") return;
    entry.state = "refunded"; entry.why = why;
    this.bag[entry.itemId] = (this.bag[entry.itemId] || 0) + 1;
  }

  // ------------------------------------------------------------------ turn handling
  async _turn(playerAction: () => Promise<boolean>): Promise<TurnResult> {
    const ok = await playerAction();
    if (!ok) return { ok: false, reason: "choice-rejected" };
    return this._resolveTurn();
  }

  async _resolveTurn(): Promise<TurnResult> {
    // auto-choose the foe from its own pending request, then process whatever the engine produced
    const b = this.gw._debugBattle();
    const foeSide = b.getSide("p2");
    if (foeSide.activeRequest && !foeSide.activeRequest.wait && !foeSide.isChoiceDone()) {
      const c = this.ai(foeSide.activeRequest);
      if (c) await this.gw.choose("p2", c);
    }
    this._ingest();
    await this._continueGrowth();
    return { ok: true, messages: this.take() };
  }

  _ingest(): void {
    const gw = this.gw;
    while (gw._queue.length) {
      const m = gw._queue.shift()!;
      if (m.kind === "events") {
        for (const e of m.events) this._onEvent(e);
        this.out.push(m);
      } else if (m.kind === "request") {
        this.held.push(m);
      } else if (m.kind === "end") {
        this.ended = m;
      } else if (m.kind === "error") {
        this.out.push(m);
      }
    }
  }

  _onEvent(e: BattleEvent): void {
    const idOf = (s: string): string => s.replace(/^p\d[a-z]?: /, "");
    const arg0 = e.args[0] ?? "";
    if (e.type === "switch" || e.type === "drag") {
      const side = arg0.slice(0, 2); const id = idOf(arg0);
      const slot = arg0.charCodeAt(2) - 97; // 'a' -> 0, 'b' -> 1
      (this.activeNow[side] ??= [])[slot] = id;
      const ours = (this.activeNow["p1"] ?? []).filter(Boolean) as string[], theirs = (this.activeNow["p2"] ?? []).filter(Boolean) as string[];
      if (side === "p2") this.participants[id] = new Set(ours);
      else for (const foe of theirs) (this.participants[foe] ??= new Set()).add(id);
    } else if (e.type === "faint") {
      const side = arg0.slice(0, 2); const id = idOf(arg0);
      (this.activeNow[side] ??= [])[arg0.charCodeAt(2) - 97] = null; // off the field: not a participant for later arrivals
      if (side === "p2") this.growthQueue.push({ kind: "award", foeId: id });
    } else if (e.type === "rpg") {
      const [what, side, itemId, , res] = e.args;
      if (side !== "p1") return;
      if (what === "item") {
        const entry = this.ledger.find((l) => l.kind === "item" && l.state === "reserved" && l.itemId === itemId);
        if (entry) { if (res === "ok") entry.state = "consumed"; else this._refund(entry, res ?? "invalid"); }
      } else if (what === "ball") {
        const entry = this.ledger.find((l) => l.kind === "ball" && l.state === "reserved" && l.itemId === itemId);
        if (entry) entry.state = "consumed"; // a thrown ball is spent whatever the outcome (WP38)
      }
    }
  }

  // ------------------------------------------------------------------ growth
  _syncWorkingFromEngine(): void {
    const st = Object.fromEntries(this.gw.readState("p1").map((x) => [x.id, x]));
    for (const m of this.party) {
      const e = st[m.id]; if (!e) continue;
      m.hp = e.hp; m.status = e.status; m.statusCount = e.statusCount;
      for (const mv of m.moves) if (e.pp[mv.id] !== undefined) mv.pp = e.pp[mv.id]!;
    }
  }

  async _continueGrowth(): Promise<void> {
    for (;;) {
      if (this.pendingLearn) return; // blocked on a UI decision
      // a caught battle awards exp for the caught target before the result is built (WP38 step 3)
      if (this.ended && this.ended.reason === "caught" && !this._caughtAwarded) {
        this._caughtAwarded = true;
        this.growthQueue.push({ kind: "award", foeId: (this.ended.outcome as { target: string }).target });
      }
      while (this.growthQueue.length) {
        const task = this.growthQueue.shift()!;
        if (task.kind === "award") { this._award(task.foeId); continue; }
        const m = this.party.find((x) => x.id === task.memberId)!;
        if (m.moves.some((x) => x.id === task.move.id)) continue;
        if (m.moves.length < 4) { this._learn(task.memberId, task.move, null); continue; }
        this.pendingLearn = { memberId: task.memberId, move: task.move };
        this.out.push({ kind: "learn-prompt", member: task.memberId, move: task.move, slots: m.moves.map((x) => x.id) });
        return;
      }
      // growth is settled: now let the foe side fill its own forced replacement, then look again
      if (!this.ended && this._autoFoeReplacement()) { this._ingest(); continue; }
      break;
    }
    this._finishTurn();
  }

  /** After growth: a defeated foe member is replaced by the foe AI (it is not a player decision). */
  _autoFoeReplacement(): boolean {
    const side = this.gw._debugBattle().getSide("p2");
    const req = side.activeRequest;
    if (!req || req.wait || !req.forceSwitch || side.isChoiceDone()) return false;
    void this.gw.choose("p2", this.ai(req) as string);
    return true;
  }

  _award(foeId: string): void {
    this._syncWorkingFromEngine();
    const foe = this.foeTeam.find((m) => m.id === foeId)!;
    const foeC = this.content.species[foe.species]!;
    const parts = [...(this.participants[foeId] || [])];
    const alive = new Set(this.gw.readState("p1").filter((x) => !x.fainted).map((x) => x.id));
    const receivers = this.party.filter((m) => parts.includes(m.id) && alive.has(m.id));
    const learns: GrowthTask[] = [];
    for (const m of receivers) {
      const evs = G.gainEvs(m.evs ?? {}, foeC.evYield);
      const withEv: Member = { ...m, evs };
      const amount = G.battleExp({ foe: { level: foe.level, baseExp: foeC.baseExp }, receiver: withEv, participants: receivers.length, rules: this.rules, trainer: this.foe.kind === "trainer" });
      const res = G.applyExp(withEv, amount, this.content, m);
      const idx = this.party.indexOf(m);
      this.party[idx] = res.member;
      const changed = amount > 0 || JSON.stringify(evs) !== JSON.stringify(m.evs);
      if (changed) {
        const eng = this.gw.applyGrowth("p1", m.id, { level: res.member.level, evs, expect: { stats: res.after.stats } });
        if (eng.after.hp !== res.member.hp && m.hp > 0) throw new Error(`HP rule mismatch for ${m.id}: engine ${eng.after.hp} vs game ${res.member.hp}`);
        this.grew = true;
      }
      this.out.push({ kind: "growth", member: m.id, foe: foeId, exp: amount, level: res.member.level, levelUps: res.log.levels.map((l) => l.level), hp: res.member.hp });
      for (const pm of res.log.pendingMoves) learns.push({ kind: "learn", memberId: m.id, move: this.gw.moveInfo(pm.move) });
    }
    this.growthQueue.unshift(...learns);
    this.participants[foeId] = new Set(); // paid once per foe
  }

  _learn(memberId: string, move: { id: string; name: string; pp: number }, replaceSlot: number | null | undefined): void {
    const m = this.party.find((x) => x.id === memberId)!;
    const rec = { id: move.id, pp: move.pp, maxpp: move.pp };
    if (replaceSlot === null || replaceSlot === undefined) m.moves.push(rec); else m.moves[replaceSlot] = rec;
    this.gw.applyGrowth("p1", memberId, { level: m.level, evs: m.evs, newMoves: [move.name], replaceSlot });
    this.grew = true;
    this.out.push({ kind: "learned", member: memberId, move: move.id, replaced: replaceSlot ?? null });
  }

  _finishTurn(): void {
    if (this.ended) {
      this._buildResult(); this.finished = true;
      this.out.push({ kind: "end", reason: this.ended.reason, outcome: this.ended.outcome || null, winner: this.ended.winner });
      return;
    }
    let reqs = this.held.splice(0).filter((m) => !(m.kind === "request" && m.side === "p2" && m.request["forceSwitch"])); // foe replacements are internal
    if (this.grew) { this.grew = false; reqs = this.gw.refreshRequests(); this.gw._queue.length = 0; }
    this.requests = {};
    for (const m of reqs) if (m.kind === "request") { this.requests[m.side] = m.request; this.out.push(m); }
  }

  _buildResult(): void {
    // A choice that was registered (and deducted) but never executed because the battle ended first (e.g. a catch
    // in another slot) goes back to the bag exactly once (WP40 4.2.1 / WP42 6; our "refund once" decision).
    for (const e of this.ledger) if (e.state === "reserved") this._refund(e, "unexecuted");
    this._syncWorkingFromEngine();
    const members: BattleResult["members"] = {};
    for (const m of this.party) members[m.id] = { level: m.level, exp: m.exp, hp: m.hp, ...persistentStatus(m.status, m.statusCount), moves: m.moves, evs: m.evs! };
    const bag: Record<string, number> = {};
    for (const k of new Set([...Object.keys(this.startBag), ...Object.keys(this.bag)])) {
      const d = (this.bag[k] || 0) - (this.startBag[k] || 0);
      if (d) bag[k] = d;
    }
    const out = this.ended!;
    const outcomeInfo = out.outcome as { target: string; ball: string } | undefined;
    const result: BattleResult = {
      protocol: S.PROTOCOL_VERSION, battleId: this.battleId,
      outcome: { kind: out.reason, winner: out.winner || null, ...(out.reason === "caught" ? { target: outcomeInfo!.target, ball: outcomeInfo!.ball } : {}) },
      members, bag, captured: [], dex: { seen: [...new Set(this.foeTeam.map((m) => m.species))], owned: [] },
    };
    if (out.reason === "caught") {
      const c = this.foeTeam.find((m) => m.id === outcomeInfo!.target)!;
      const eng = this.gw.readState("p2").find((x) => x.id === c.id)!;
      const curve = this.content.species[c.species]!.growth;
      result.captured.push(S.newMember({
        ...c, exp: G.minExp(curve, c.level), hp: eng.hp, ...persistentStatus(eng.status, eng.statusCount),
        moves: c.moves.map((mv) => ({ id: mv.id, pp: eng.pp[mv.id] ?? mv.pp, maxpp: mv.maxpp })), ball: outcomeInfo!.ball,
      }));
      result.dex.owned.push(c.species);
    }
    this._result = result;
  }
}
