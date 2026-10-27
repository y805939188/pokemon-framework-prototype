import { battleBag } from "../rules/inventory";
import { catalogOf } from "../rules/item-catalog";
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
import { showdownDriverFactory } from "../battle/gateway";
import type { BattleDriver, BattleDriverFactory } from "../battle/driver";
import { isSelectableMove } from "../battle/move-requests";
import type { GatewayMessage, MemberState } from "../battle/gateway";
import * as G from "../rules/growth";
import { HEAL_ITEMS, STAT_ITEMS, STATUS_ITEMS, itemEligibility } from "../rules/rules";
import * as S from "../rules/state";
import type { BattleResult, GameState } from "../rules/state";
import type { Content, Member } from "../rules/types";
import type { BattleEvent, SessionMessage } from "../battle/protocol";
import type { LogLevel, LogSink } from "./log";
import { EvidenceRecorder } from "./battle-evidence";
import { BattleEffectsRecorder } from "./battle-effects";
import type { EffectsBindingV2, EffectsSealV2 } from "../rules/battle-consumption";
import { battleFriendshipValue } from "../rules/battle-evidence";
import type { BattleEvidenceContext, EvidenceBinding, BattleEvidence, FriendEvidence, BattleObservation } from "../rules/battle-evidence";
import { resolveConfig } from "../rules/config";
import { own, setOwn } from "../rules/own";

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

/** Factory companion access, deliberately outside the frozen BattleSession prototype. */
export function sealBattleEvidence(session: BattleSession, binding: EvidenceBinding): BattleEvidence | null {
  if (!session.finished || session.broken || !session._evidence) return null;
  const sealed = session._evidence.seal(session.result(), binding);
  if (sealed && session._pendingFriendFaints.length) {
    sealed.friendship = {};
    if (sealed.issues.length < 128) sealed.issues.push({ group: "friendship", reason: "unpaired-faint-control" });
  }
  return sealed;
}
/** Internal factory companion, deliberately outside the frozen BattleSession prototype. */
export function sealBattleEffects(session: BattleSession, binding: EffectsBindingV2): EffectsSealV2 | null {
  if (!session.finished || session.broken || !session._effects) return null;
  if (session._pendingFriendFaints.length) session._effects.controlFaintFailed("unpaired-faint-control");
  return session._effects.seal(session.result(), binding, session._pendingFriendFaints.length ? session.party.map(m => m.id) : session._friendUnavailable);
}

const ITEM_IDS = new Set([...Object.keys(HEAL_ITEMS), ...Object.keys(STATUS_ITEMS), ...Object.keys(STAT_ITEMS)]);

function toSet(m: Member, moveName: (id: string) => string): Record<string, unknown> {
  return {
    name: m.id, species: m.species, item: m.item || "", ability: m.ability, nature: m.nature, gender: m.gender,
    // Engine calculation domain only; persistent friendship is never read back from this bounded field.
    happiness: Math.min(255, Math.max(0, m.friendship ?? 70)), shiny: m.shiny ?? false,
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
  /** Explicit controlled test/developer path; held-item write-back is incomplete. Never a player/save setting. */
  experimentalHeldBattle?: boolean;
  formatid?: string;
  ai?: FoeAi;
  rules?: G.ExpRules;
  /** Optional diagnostics sink (see flow/log.ts); the session never depends on it. */
  logger?: LogSink;
  /** The battle engine behind the session; Pokemon Showdown unless a test supplies a scripted driver. */
  driver?: BattleDriverFactory;
  /** App-owned companion authority, not a player flag or protocol-v1 field. */
  evidence?: BattleEvidenceContext;
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

/**
 * The operation failed and so did the rollback: the engine and the ledger may disagree, so the session is closed for
 * good. Both errors are kept; nothing from this session may be settled into the persistent game.
 */
export class SessionBrokenError extends Error {
  readonly original: unknown;
  readonly restoreError: unknown;
  constructor(original: unknown, restoreError: unknown) {
    const text = (e: unknown): string => (e instanceof Error ? e.message : String(e));
    super(`battle session is unusable: the operation failed (${text(original)}) and its rollback failed (${text(restoreError)})`);
    this.name = "SessionBrokenError";
    this.original = original;
    this.restoreError = restoreError;
  }
}

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
  gw!: BattleDriver;
  _driver!: BattleDriverFactory;
  requests?: Record<string, Req>;
  grew = false;
  _caughtAwarded = false;
  _result?: BattleResult;
  logger?: LogSink;
  _operation = false;
  _staged = false;
  _broken: SessionBrokenError | null = null;
  _evidence: EvidenceRecorder | null = null;
  _effects: BattleEffectsRecorder | null = null;
  _friendUnavailable: string[] = [];
  _pendingFriendFaints: Extract<BattleObservation, { kind: "faint" }>[] = [];

  static async create({ game, battleId, foe, content, seed, doubles = false, formatid = doubles ? "gen8rpgdoublescustomgame" : "gen8rpgcustomgame", ai, rules, logger, driver = showdownDriverFactory, experimentalHeldBattle = false, evidence }: CreateOptions): Promise<BattleSession> {
    if (!experimentalHeldBattle && [...game.party, ...foe.team].some((m) => !!m.item)) throw new Error("held-item-battle-disabled: 战后持物写回未完成");
    // Dangling references fail here, with the member and the thing that is missing, not deep inside a battle.
    for (const m of [...game.party, ...foe.team]) {
      if (!content.species[m.species]) throw new Error(`battle content: species "${m.species}" (member ${m.id}) is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
    }
    const moveName = await driver.moveNames(formatid, seed);
    for (const m of [...game.party, ...foe.team]) {
      for (const mv of m.moves) { try { moveName(mv.id); } catch { throw new Error(`battle content: move "${mv.id}" of member ${m.id} is not known to the battle engine`); } }
    }
    // Showdown keeps the nickname (our stable id) truncated to 20 characters and strips separators,
    // so ids must survive that round trip untouched or results could not be mapped back.
    for (const m of [...game.party, ...foe.team]) {
      if (!/^[A-Za-z0-9#._:-]{1,18}$/.test(m.id)) throw new Error(`member id "${m.id}" is not usable as a battle id (1-18 chars of A-Z a-z 0-9 # . _ : -)`);
    }
    const party = S.clone(game.party).filter((m) => !m.isEgg).slice(0, 6);
    const lead = [...party.filter((m) => m.hp > 0), ...party.filter((m) => m.hp <= 0)];
    const s = new BattleSession();
    s.content = content; s.rules = rules || G.DEFAULT_RULES; s.battleId = battleId; s.foe = foe;
    s.party = party; s.foeTeam = S.clone(foe.team);
    s.startBag = battleBag(game.inventory, catalogOf(content)); s.bag = S.clone(s.startBag);
    s.startDexOwned = game.dex.owned.slice();
    s.doubles = doubles;
    s.logger = logger;
    s._driver = driver;
    if (evidence) {
      s._evidence = new EvidenceRecorder(evidence, [...party, ...foe.team].map(m => m.id));
      s._effects = new BattleEffectsRecorder({ battleId, generation: evidence.generation, contentIdentity: evidence.contentIdentity }, evidence, party, s.foeTeam);
      if (doubles) { s._evidence.issue("friendship", "doubles-friendship-not-supported"); s._friendUnavailable = party.map(m => m.id); }
    }
    s.ai = ai || (doubles ? BattleSession.defaultAiDoubles : BattleSession.defaultAi);
    s.gw = await driver.create({
      formatid, seed, wild: foe.kind === "wild", noRun: !!foe.noRun, noBall: !!foe.noBall, // encounter flags: scripted battles that forbid running / balls
      players: [{ name: "Player", team: lead.map((m) => toSet(m, moveName)) }, { name: foe.kind === "wild" ? "Wild" : "Trainer", team: s.foeTeam.map((m) => toSet(m, moveName)) }],
    });
    s._effects?.startControl(!doubles && !!s.gw.drainFriendshipFaints && !!s.gw.validateFriendshipFaints && !!s.gw.applyFriendship && !!s.gw.checkpointFriendship && !!s.gw.restoreFriendship);
    await s.gw.choose("p1", "team " + lead.map((_, i) => i + 1).join(""));
    await s.gw.choose("p2", "team " + s.foeTeam.map((_, i) => i + 1).join(""));
    s.gw.seedState("p1", lead);
    s.gw.seedState("p2", s.foeTeam);
    s.gw.refreshRequests();
    s._ingest();
    s._finishTurn();
    s._log("info", "session.create", { content: content.meta ? { kind: content.meta.kind, id: content.meta.id, hash: content.meta.inputsHash?.slice(0, 12) } : null, format: formatid, doubles, foe: { kind: foe.kind, members: foe.team.length }, party: party.map((m) => m.id), seed: seed ?? null });
    return s;
  }

  _refuse(reason: string): Refusal {
    this._log("warn", "refusal", { reason });
    return { ok: false, reason };
  }

  /** Diagnostics: correlated by battle id, redacted, never throws into the battle. */
  _log(level: LogLevel, kind: string, data: Record<string, unknown> = {}): void {
    if (!this.logger) return;
    try { this.logger({ battleId: this.battleId, level, kind, data }); } catch { /* diagnostics must not affect play */ }
  }

  /** One mutation owns the engine and ledger until its promise settles. Readers still see plain snapshots. */
  get broken(): SessionBrokenError | null { return this._broken; }

  _assertUsable(): void { if (this._broken) throw this._broken; }

  async _exclusive<T>(action: () => Promise<T>): Promise<T> {
    this._assertUsable();
    if (this._operation) throw new Error("battle session operation already in progress");
    this._operation = true;
    try {
      const checkpoint = this._checkpoint();
      try { return await action(); }
      catch (error) {
        try { await this._restoreCheckpoint(checkpoint); }
        catch (restoreError) {
          this._broken = new SessionBrokenError(error, restoreError);
          this._log("error", "session.broken", { original: error instanceof Error ? error.message : String(error), rollback: restoreError instanceof Error ? restoreError.message : String(restoreError) });
          throw this._broken;
        }
        throw error;
      }
    } finally { this._operation = false; }
  }

  /** Protocol-v1 action refusal; no new reason or request-id semantics are introduced. */
  async _action(action: () => Promise<TurnResult>, replace = true): Promise<TurnResult> {
    this._assertUsable();
    if (this._operation || this.finished || this.pendingLearn) return this._refuse("choice-rejected");
    return this._exclusive(async () => {
      if (replace && this._staged) {
        await this.gw.cancel("p1");
        for (const entry of this.ledger) if (entry.state === "reserved") this._refund(entry, "cancelled");
        this._staged = false;
      }
      const result = await action();
      this._staged = result.ok && "staged" in result;
      return result;
    });
  }

  /** In-memory operation rollback, not a battle-time save. Include PRNG, pending choices and undelivered messages. */
  _checkpoint() {
    return {
      engine: this.gw.checkpoint(),
      state: S.clone({
        party: this.party, bag: this.bag, ledger: this.ledger, out: this.out, held: this.held,
        growthQueue: this.growthQueue, pendingLearn: this.pendingLearn, activeNow: this.activeNow,
        participants: Object.entries(this.participants).map(([id, members]) => [id, [...members]] as const),
        ended: this.ended, finished: this.finished, requests: this.requests, grew: this.grew,
        _caughtAwarded: this._caughtAwarded, _result: this._result, _staged: this._staged,
        _friendUnavailable: this._friendUnavailable, _pendingFriendFaints: this._pendingFriendFaints,
      }),
      evidence: this._evidence?.snapshot(),
      effects: this._effects?.snapshot(),
    };
  }

  async _restoreCheckpoint(checkpoint: ReturnType<BattleSession["_checkpoint"]>): Promise<void> {
    this.gw = await this._driver.fromCheckpoint(checkpoint.engine);
    const { participants, ...state } = checkpoint.state;
    Object.assign(this, state);
    this.participants = Object.fromEntries(participants.map(([id, members]) => [id, new Set(members)]));
    // JSON omits undefined properties, so explicitly clear these after a failed first assignment.
    this.requests = state.requests; this._result = state._result;
    if (checkpoint.evidence) this._evidence?.restore(checkpoint.evidence);
    if (checkpoint.effects) this._effects?.restore(checkpoint.effects);
  }

  static defaultAi(request: Req): string {
    if (request.forceSwitch) {
      const i = request.side.pokemon.findIndex((p: Req) => !p.active && !/ fnt$/.test(p.condition));
      return "switch " + (i + 1);
    }
    const i = request.active[0].moves.findIndex(isSelectableMove);
    if (i < 0) throw new Error("battle request has no selectable move");
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
      const mi = a.moves.findIndex(isSelectableMove);
      if (mi < 0) throw new Error("battle request has no selectable move");
      return `move ${mi + 1}` + (needsTarget(a.moves[mi].target) ? " 1" : "");
    }).join(", ");
  }

  // ------------------------------------------------------------------ public actions
  /** Returns and clears everything the UI should show since the last call. */
  take(): SessionMessage[] { this._assertUsable(); return this.out.splice(0); }

  currentRequest(): Req | undefined { return this.requests && this.requests["p1"]; }

  async chooseMove(index: number): Promise<TurnResult> { this._log("info", "choice", { action: "move", index }); return this._action(() => this._turn(async () => this.gw.choose("p1", `move ${index}`))); }
  async chooseSwitch(memberId: string): Promise<TurnResult> {
    return this._action(async () => {
      this._log("info", "choice", { action: "switch", member: memberId });
      const i = (this.requests!["p1"]!["side"].pokemon as Req[]).findIndex((p) => p["ident"] === `p1: ${memberId}`);
      return this._turn(async () => this.gw.choose("p1", `switch ${i + 1}`));
    });
  }
  async chooseForcedSwitch(memberId: string): Promise<TurnResult> { return this.chooseSwitch(memberId); }

  /** Reserve the item (deduct now), register the action; refunded on cancel/no-effect. */
  async useItem(itemId: string, targetId: string, { commit = true }: { commit?: boolean } = {}): Promise<TurnResult> {
    return this._action(async () => {
      this._log("info", "choice", { action: "item", item: itemId, target: targetId, commit });
      if (!ITEM_IDS.has(itemId)) return this._refuse("unknown-item");
      if ((this.bag[itemId] || 0) < 1) return this._refuse("none-left");
      const el = this.canUseItem(itemId, targetId);
      if (!el.ok) return this._refuse(el.reason); // refused before registration: nothing consumed, no turn used
      const entry = this._reserve("item", itemId, targetId);
      const ok = await this.gw.act("p1", { kind: "item", item: itemId, target: targetId });
      if (!ok) { this._refund(entry, "not-registered"); return this._refuse("not-registered"); }
      return commit ? this._resolveTurn() : { ok: true, staged: true };
    });
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
    return this._action(async () => {
      this._log("info", "choice", { action: "doubles", specs: specs.map((x) => (x ? x.kind ?? (x.switch !== undefined ? "switch" : "move") : null)), commit });
      // validate every spec BEFORE reserving anything: a refusal consumes nothing (WP38 2 / WP28 3.5)
      let acted = false;
      for (let i = 0; i < specs.length; i++) {
        const sp = specs[i];
        if (sp && sp.kind === "ball") {
          if (acted) return this._refuse("notfirst"); // a ball must be the first action of the round (WP38 2)
          const q = this.gw.query("p1", "ball", i);
          if (!q.allowed) return this._refuse(q.reason ?? "refused");
        } else if (sp && sp.kind === "run") {
          const q = this.gw.query("p1", "run", i);
          if (!q.allowed) return this._refuse(q.reason ?? "refused");
        } else if (sp && sp.kind === "item") {
          if (!ITEM_IDS.has(sp.item as string)) return this._refuse("unknown-item");
          const el = this.canUseItem(sp.item as string, sp.target);
          if (!el.ok) return this._refuse(el.reason);
        }
        if (sp) acted = true;
      }
      const entries: LedgerEntry[] = [];
      for (const sp of specs) {
        if (!sp || !sp.kind || sp.kind === "run") continue;
        const id = (sp.kind === "item" ? sp.item : sp.ball) as string;
        if ((this.bag[id] || 0) < 1) { entries.forEach((e) => this._refund(e, "not-registered")); return this._refuse("none-left"); }
        if (sp.kind === "ball") {
          const rec = this.foeTeam.find((m) => m.id === sp.target);
          if (!rec) { entries.forEach((e) => this._refund(e, "not-registered")); return this._refuse("unknown-target"); }
          sp.catchRate = this.content.species[rec.species]!.catchRate;
          sp.ctx = { ownedCount: this.startDexOwned.length, speciesOwned: this.startDexOwned.includes(rec.species) };
        }
        entries.push(this._reserve(sp.kind, id, sp.target));
      }
      const ok = await this.gw.chooseSlots("p1", specs);
      if (!ok) { entries.forEach((e) => this._refund(e, "not-registered")); return this._refuse("choice-rejected"); }
      return commit ? this._resolveTurn() : { ok: true, staged: true };
    });
  }

  /** Resolve the turn with whatever the player registered (use after a staged action). */
  async commitTurn(): Promise<TurnResult> {
    return this._action(async () => this._staged ? this._resolveTurn() : this._refuse("choice-rejected"), false);
  }

  async throwBall(ballId: string): Promise<TurnResult> {
    return this._action(async () => {
      this._log("info", "choice", { action: "ball", ball: ballId });
      const q = this.gw.query("p1", "ball");
      if (!q.allowed) return this._refuse(q.reason ?? "refused");
      if ((this.bag[ballId] || 0) < 1) return this._refuse("none-left");
      const foeId = this.gw.activeId("p2");
      const foeRec = this.foeTeam.find((m) => m.id === foeId);
      if (!foeRec) return this._refuse("refused");
      const entry = this._reserve("ball", ballId, foeRec.id);
      const ctx = { ownedCount: this.startDexOwned.length, speciesOwned: this.startDexOwned.includes(foeRec.species) };
      const ok = await this.gw.act("p1", { kind: "ball", ball: ballId, target: foeRec.id, catchRate: this.content.species[foeRec.species]!.catchRate, ctx });
      if (!ok) { this._refund(entry, "not-registered"); return this._refuse("not-registered"); }
      return this._resolveTurn();
    });
  }

  async run(): Promise<TurnResult> {
    return this._action(async () => {
      this._log("info", "choice", { action: "run" });
      const q = this.gw.query("p1", "run");
      if (!q.allowed) return this._refuse(q.reason ?? "refused");
      if (!await this.gw.act("p1", { kind: "run" })) return this._refuse("not-registered");
      return this._resolveTurn();
    });
  }

  /** Cancel the registered (not yet executed) choice; reserved items return to the bag. */
  async cancel(): Promise<void> {
    return this._exclusive(async () => {
      await this.gw.cancel("p1");
      for (const e of this.ledger.filter((x) => x.state === "reserved")) this._refund(e, "cancelled");
      this._staged = false;
    });
  }

  async decideLearn(slotOrNull: number | null | undefined): Promise<SessionMessage[]> {
    return this._exclusive(async () => {
      const p = this.pendingLearn;
      if (!p) throw new Error("no learn decision pending");
      this.pendingLearn = null;
      if (slotOrNull !== null && slotOrNull !== undefined) this._learn(p.memberId, p.move, slotOrNull);
      await this._continueGrowth();
      return this.take();
    });
  }

  /** The BattleResult (protocol v1). Only valid after the battle ended and growth finished. */
  result(): BattleResult {
    this._assertUsable();
    if (!this.finished) throw new Error("battle not finished");
    return this._result!;
  }

  // ------------------------------------------------------------------ ledger
  _reserve(kind: string, itemId: string, target: unknown): LedgerEntry {
    this.bag[itemId] = (this.bag[itemId] as number) - 1;
    this._log("info", "ledger", { op: "reserve", kind, item: itemId, left: this.bag[itemId] });
    const e: LedgerEntry = { kind, itemId, target, state: "reserved" };
    this.ledger.push(e);
    return e;
  }
  _refund(entry: LedgerEntry, why: string): void {
    if (entry.state === "refunded") return;
    entry.state = "refunded"; entry.why = why;
    this._log("info", "ledger", { op: "refund", kind: entry.kind, item: entry.itemId, why });
    this.bag[entry.itemId] = (this.bag[entry.itemId] || 0) + 1;
  }

  // ------------------------------------------------------------------ turn handling
  async _turn(playerAction: () => Promise<boolean>): Promise<TurnResult> {
    const ok = await playerAction();
    if (!ok) return this._refuse("choice-rejected");
    return this._resolveTurn();
  }

  async _resolveTurn(): Promise<TurnResult> {
    // auto-choose the foe from its own pending request, then process whatever the engine produced
    const foeRequest = this.gw.awaitingChoice("p2");
    if (foeRequest) {
      const c = this.ai(foeRequest);
      if (!c || !await this.gw.choose("p2", c)) throw new Error("foe AI did not provide a legal choice");
    }
    this._ingest();
    await this._continueGrowth();
    const messages = this.take();
    const kinds: Record<string, number> = {};
    for (const m of messages) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1;
    this._log("info", "turn", { messages: kinds, finished: this.finished });
    return { ok: true, messages };
  }

  _ingest(): void {
    this._ingestObservations();
    if (this._evidence) {
      try {
        const incoming = this.gw.drainFriendshipFaints?.() ?? [];
        const validActor = (actor: BattleObservation["target"]): boolean => !!actor && typeof actor.id === "string"
          && (actor.side === "p1" ? this.party : actor.side === "p2" ? this.foeTeam : []).some(m => m.id === actor.id)
          && Number.isSafeInteger(actor.level) && actor.level >= 1 && actor.level <= 100
          && Number.isSafeInteger(actor.hp) && actor.hp >= 0 && Number.isSafeInteger(actor.slot) && actor.slot >= 0 && actor.slot < 6 && typeof actor.active === "boolean";
        if (!Array.isArray(incoming) || Array.from(incoming).some(f => f?.kind !== "faint" || !validActor(f.target) || f.target.hp !== 0 || !Array.isArray(f.opponents) || Array.from(f.opponents).some(p => !validActor(p) || p.side === f.target.side))) throw new Error("invalid friendship control facts");
        this._pendingFriendFaints.push(...incoming);
      }
      catch {
        this._pendingFriendFaints = [];
        this._friendUnavailable = [...this._evidence.value.context.playerIds];
        this._evidence.issue("friendship", "friendship-control-drain-failed");
        this._effects?.controlFaintFailed("friendship-control-drain-failed");
      }
    }
    const messages: ReturnType<BattleDriver["drain"]> = [];
    for (let batch = this.gw.drain(); batch.length; batch = this.gw.drain()) messages.push(...batch);
    if (this._evidence) {
      const publicFaints = messages.flatMap(m => m.kind === "events" ? m.events.filter(e => e.type === "faint").map(e => e.args[0] ?? "") : []);
      let matched = false;
      try { matched = this.gw.validateFriendshipFaints?.(this._pendingFriendFaints, publicFaints) === true; } catch { /* invalid control source only */ }
      if (!matched) {
        this._pendingFriendFaints = [];
        this._friendUnavailable = [...this._evidence.value.context.playerIds];
        this._evidence.issue("friendship", "faint-control-source-unavailable");
        this._effects?.controlFaintFailed("faint-control-source-unavailable");
      } else {
        for (const fact of this._pendingFriendFaints) {
          try { this._effects?.controlFaint(fact); }
          catch { this._effects?.controlFaintFailed("control-faint-receipt-failed"); }
        }
      }
    }
    // The complete batch was bound to private real identities before the first authoritative friend write.
    for (const m of messages) {
      if (m.kind === "events") {
        for (const e of m.events) this._onEvent(e);
        this.out.push(m);
      } else if (m.kind === "request") {
        this.held.push(m);
      } else if (m.kind === "end") {
        this.ended = m;
      } else if (m.kind === "error") {
        this._log("warn", "engine.error", { side: m.side, message: m.message });
        this.out.push(m);
      }
    }
    if (this._evidence && this._pendingFriendFaints.length) {
      this._pendingFriendFaints = [];
      this._friendUnavailable = [...this._evidence.value.context.playerIds];
      this._evidence.issue("friendship", "unpaired-faint-control");
      this._effects?.controlFaintFailed("unpaired-faint-control");
    }
  }

  _ingestObservations(): void {
    if (!this._evidence) return;
    let batch: ReturnType<NonNullable<BattleDriver["drainObservations"]>>;
    try {
      if (!this.gw.drainObservations) {
        this._evidence.issue("identity", "driver-observations-unavailable");
        this._effects?.observerFailed("driver-observations-unavailable");
        return;
      }
      batch = this.gw.drainObservations();
    } catch {
      this._evidence.issue("identity", "observation-ingest-failed");
      this._effects?.observerFailed("observation-ingest-failed");
      return;
    }
    try { this._effects?.observe(batch); }
    catch { this._effects?.observerFailed("effects-observation-ingest-failed"); }
    try { this._evidence.record(batch); }
    catch { this._evidence.issue("identity", "observation-ingest-failed"); }
  }

  _changeBattleFriendship(id: string, method: FriendEvidence["changes"][number]["method"]): void {
    const recorder = this._evidence;
    if (!recorder || this._friendUnavailable.includes(id) || !recorder.value.context.playerIds.includes(id)) return;
    const m = this.party.find(member => member.id === id);
    if (!m || !this.gw.applyFriendship || !this.gw.checkpointFriendship || !this.gw.restoreFriendship) { this._friendUnavailable.push(id); recorder.issue("friendship", "friendship-capability-unavailable", id); return; }
    const before = m.friendship ?? 70;
    const map = recorder.value.context.mapId;
    if ((method === "battleitem" || method === "levelup") && m.origin?.map !== undefined && m.origin.map !== null && map === undefined) { this._friendUnavailable.push(id); recorder.issue("friendship", "friendship-map-unavailable", id); return; }
    const after = battleFriendshipValue(before, method, { sameMap: map !== undefined && m.origin?.map === map, luxuryBall: m.ball?.toLowerCase() === "luxuryball", sootheBell: m.item?.toLowerCase() === "soothebell", affection: resolveConfig(this.content.settings).AFFECTION_EFFECTS });
    if (after === null) { this._friendUnavailable.push(id); recorder.issue("friendship", "friendship-out-of-domain", id); return; }
    let checkpoint: ReturnType<NonNullable<BattleDriver["checkpointFriendship"]>>;
    try { checkpoint = this.gw.checkpointFriendship("p1", id); }
    catch { this._friendUnavailable.push(id); recorder.issue("friendship", "friendship-checkpoint-failed", id); return; }
    let failure = "friendship-sync-failed";
    try {
      const ack = this.gw.applyFriendship("p1", id, { expected: before, value: after });
      if (ack.before !== before || ack.after !== after) { failure = "invalid-friendship-ack"; throw new Error(failure); }
    } catch (error) {
      try { this.gw.restoreFriendship(checkpoint); }
      catch (restoreError) { this._broken = new SessionBrokenError(error, restoreError); throw this._broken; }
      this._friendUnavailable.push(id); recorder.issue("friendship", failure, id); return;
    }
    m.friendship = after;
    try { this._effects?.friendshipReceipt(id, method, before, after); }
    catch { this._effects?.friendshipFailed(id, "control-friendship-receipt-failed"); }
    // This is only the observation copy. Failure cannot undo legal control or suppress the next real trigger.
    try {
      let changes = own(recorder.value.friendship, id);
      if (!changes) { changes = { before, current: before, changes: [] }; setOwn(recorder.value.friendship, id, changes); }
      changes.current = after; changes.changes.push({ method, before, after });
    } catch { recorder.issue("friendship", "friendship-record-failed", id); }
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
      if (this._evidence) {
        const trigger = this._pendingFriendFaints.shift();
        if (trigger && trigger.target.side === arg0.slice(0, 2)) {
          this._changeBattleFriendship(trigger.target.id, trigger.opponents.some(p => p.level >= trigger.target.level + 30) ? "faintbad" : "faint");
        } else {
          this._evidence.issue("friendship", "faint-control-source-unavailable");
          this._friendUnavailable = [...this._evidence.value.context.playerIds];
        }
      }
      const side = arg0.slice(0, 2); const id = idOf(arg0);
      (this.activeNow[side] ??= [])[arg0.charCodeAt(2) - 97] = null; // off the field: not a participant for later arrivals
      if (side === "p2") this.growthQueue.push({ kind: "award", foeId: id });
    } else if (e.type === "rpg") {
      const [what, side, itemId, , res] = e.args;
      if (side !== "p1") return;
      if (what === "item") {
        const entry = this.ledger.find((l) => l.kind === "item" && l.state === "reserved" && l.itemId === itemId);
        if (entry) { if (res === "ok") { entry.state = "consumed"; this._log("info", "ledger", { op: "consume", kind: "item", item: itemId }); } else this._refund(entry, res ?? "invalid"); }
        if (entry && res === "ok") this._changeBattleFriendship(String(entry.target), "battleitem");
      } else if (what === "ball") {
        const entry = this.ledger.find((l) => l.kind === "ball" && l.state === "reserved" && l.itemId === itemId);
        if (entry) { entry.state = "consumed"; this._log("info", "ledger", { op: "consume", kind: "ball", item: itemId, outcome: res ?? "" }); } // a thrown ball is spent whatever the outcome (WP38)
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
      if (!this.ended && await this._autoFoeReplacement()) { this._ingest(); continue; }
      break;
    }
    this._finishTurn();
  }

  /** After growth: a defeated foe member is replaced by the foe AI (it is not a player decision). */
  async _autoFoeReplacement(): Promise<boolean> {
    const req = this.gw.awaitingChoice("p2");
    if (!req || !req.forceSwitch) return false;
    const choice = this.ai(req);
    if (!choice || !await this.gw.choose("p2", choice)) throw new Error("foe AI did not provide a legal replacement");
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
      if (this.gw.readState("p1").some(p => p.id === m.id && p.active && !p.fainted)) {
        for (const _level of res.log.levels) this._changeBattleFriendship(m.id, "levelup");
      }
      const changed = amount > 0 || JSON.stringify(evs) !== JSON.stringify(m.evs);
      if (changed) {
        const eng = this.gw.applyGrowth("p1", m.id, { level: res.member.level, evs, expect: { stats: res.after.stats } });
        if (eng.after.hp !== res.member.hp && m.hp > 0) {
          this._log("error", "failure", { what: "hp-rule-mismatch", member: m.id, engine: eng.after.hp, game: res.member.hp });
          throw new Error(`HP rule mismatch for ${m.id}: engine ${eng.after.hp} vs game ${res.member.hp}`);
        }
        this.grew = true;
      }
      this._log("info", "growth", { member: m.id, foe: foeId, exp: amount, level: res.member.level, levelUps: res.log.levels.length });
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
      this._log("info", "end", { reason: this.ended.reason, winner: this.ended.winner, bag: this._result?.bag, members: Object.keys(this._result?.members ?? {}).length });
      this.out.push({ kind: "end", reason: this.ended.reason, outcome: this.ended.outcome || null, winner: this.ended.winner });
      return;
    }
    let reqs = this.held.splice(0).filter((m) => !(m.kind === "request" && m.side === "p2" && m.request["forceSwitch"])); // foe replacements are internal
    if (this.grew) { this.grew = false; reqs = this.gw.refreshRequests(); this.gw.discardQueued(); }
    this.requests = {};
    for (const m of reqs) if (m.kind === "request") { this.requests[m.side] = m.request; this.out.push(m); this._log("info", "request", { side: m.side, seq: m.seq, forceSwitch: !!m.request["forceSwitch"], wait: !!m.request["wait"] }); }
  }

  _buildResult(): void {
    // A choice that was registered (and deducted) but never executed because the battle ended first (e.g. a catch
    // in another slot) goes back to the bag exactly once (WP40 4.2.1 / WP42 6; our "refund once" decision).
    for (const e of this.ledger) if (e.state === "reserved") this._refund(e, "unexecuted");
    this._syncWorkingFromEngine();
    const members: BattleResult["members"] = {};
    for (const m of this.party) members[m.id] = { level: m.level, exp: m.exp, hp: m.hp, ...persistentStatus(m.status, m.statusCount), moves: m.moves.map(({id,pp,maxpp}) => ({id,pp,maxpp})), evs: m.evs! };
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
      result.captured.push(S.protocolMember({
        ...c, exp: G.minExp(curve, c.level), hp: eng.hp, ...persistentStatus(eng.status, eng.statusCount),
        moves: c.moves.map((mv) => ({ id: mv.id, pp: eng.pp[mv.id] ?? mv.pp, maxpp: mv.maxpp })), ball: outcomeInfo!.ball,
      }));
      result.dex.owned.push(c.species);
    }
    this._result = result;
  }
}
