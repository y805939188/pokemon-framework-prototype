/**
 * The game application: the use cases that coordinate a battle with the persistent game, and nothing else.
 *  - game rules stay in the core (`rules/`): the application calls `applyBattleResult`, it does not re-implement it;
 *  - the Showdown engine and the MZ scene/windows stay behind their own adapters: the application only sees ports.
 * Outcomes are explicit so a caller can tell the four situations apart:
 *   not committed (aborted) | committed | already committed (duplicate) | committed but the host was not informed.
 */
import { applyBattleResult, newGame } from "../rules/state.ts";
import type { ApplyStatus, BattleResult, GameState } from "../rules/state.ts";
import { DEFAULT_LIMITS, storageFull } from "../rules/limits.ts";
import type { Limits } from "../rules/limits.ts";
import { GrantRefusedError, applyGrant } from "../rules/grants.ts";
import { healParty } from "../rules/heal.ts";
import { computeStats } from "../rules/growth.ts";
import { createMember } from "../rules/member-factory.ts";
import { appliesAt, pickEncounter, validateEncounterTable } from "../rules/encounter.ts";
import { isDefeat, settleDefeat } from "../rules/defeat.ts";
import { battleView, speciesDataOf, speciesKeyResolver } from "../rules/species-key.ts";
import { addSteps, bumpStat } from "../rules/stats.ts";
import type { GameStats, StatCounter } from "../rules/stats.ts";
import type { Member } from "../rules/types.ts";
import { own } from "../rules/own.ts";
import { findDanglingReferences, resolveSpecies } from "../flow/content-runtime.ts";
import type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, ClaimOutcome, ContentPort, EncounterPlan, GameStatePort, HealOutcome, OutcomeProjection, PartyView, RandomPort, StepsOutcome } from "./ports.ts";

export interface GameApplicationPorts<S extends BattleHandle> {
  state: GameStatePort;
  sessions: BattleSessionFactory<S>;
  content: ContentPort;
  projection: OutcomeProjection;
  /** Needed by the use cases that create members (grants, encounters); without it they refuse with "no-random". */
  random?: RandomPort;
}

/** Stage configuration of the application (not ports: plain values the host reads from its settings). */
export interface GameApplicationOptions {
  limits?: Limits;
  /** Money of a new game (WP24 StartMoney; 3000 when omitted). */
  startMoney?: number;
  /** NO_MONEY_LOSS (WP42 §6.1): a defeat then costs no money (the party is still healed). */
  noMoneyLoss?: boolean;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** How the host numbers an ending. */
export function outcomeCode(result: BattleResult): number {
  const outcome = result.outcome;
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome) || typeof outcome.kind !== "string" || !outcome.kind || !(outcome.winner === null || typeof outcome.winner === "string")) {
    throw new Error("invalid battle outcome: expected a nonempty kind and a string or null winner");
  }
  const { kind, winner } = outcome;
  return kind === "win" ? (winner === "Player" ? 1 : 4) : kind === "caught" ? 2 : kind === "run" ? 3 : 4;
}

/** What a commit needs to know about the battle beyond its result: for the statistics (WP06 §4.2, WP53 §183, WP61 §7). */
interface BattleFacts { kind: "wild" | "trainer"; canLose: boolean }

/**
 * Battle statistics of one committed result (host code: 1 win, 2 caught, 3 ran, 4 lost or drawn). Wild: a win or a
 * catch is won, a run, loss or draw is lost (the reference's 1/4 vs 2/3/5 split). Trainer: a win is won, a loss or draw
 * is lost. A defeat adds the money lost, and counts a blackout unless the author let the player lose this battle.
 */
function battleStats(stats: GameStats, facts: BattleFacts, code: number, defeat: { moneyLost: number } | undefined): GameStats {
  const won = facts.kind === "wild" ? code === 1 || code === 2 : code === 1;
  const key: StatCounter = `${facts.kind}_battles_${won ? "won" : "lost"}`;
  let next = bumpStat(stats, key);
  if (defeat) {
    next = bumpStat(next, "battle_money_lost", defeat.moneyLost);
    if (!facts.canLose) next = bumpStat(next, "blacked_out_count");
  }
  return next;
}

export class GameApplication<S extends BattleHandle = BattleHandle> {
  private readonly ports: GameApplicationPorts<S>;
  private readonly limits: Limits;
  private readonly startMoney: number;
  private readonly noMoneyLoss: boolean;
  /**
   * The battle operation this application has started and not ended: from the moment startBattle reads the state (the
   * session is still being created: "pending") until finishBattle of its session or abortBattle of its battleId. The
   * session works on the state read at the start and commits back over it, so grants and heals are refused meanwhile
   * ("battle-active"), and a second battle cannot start. Each operation is its own object: a creation that fails, or
   * completes after its operation was aborted, only ever touches that object, never a later operation.
   */
  private op: { battleId: string; session: S | null; facts: BattleFacts } | null = null;
  /**
   * Sessions whose state was replaced by the host while they were open (a save loaded, a new game): their result
   * belongs to a state that no longer exists, so finishing them commits nothing (final review P4-2).
   */
  private readonly detached = new WeakSet<object>();

  constructor(ports: GameApplicationPorts<S>, options: GameApplicationOptions = {}) {
    this.ports = ports;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.startMoney = options.startMoney ?? 3000;
    this.noMoneyLoss = options.noMoneyLoss ?? false;
  }

  /** A new game: the formal empty state (no members; the player receives them through grants). Throws only if the store refuses. */
  startNewGame(): { status: "started"; state: GameState } {
    const state = newGame({ party: [], money: this.startMoney });
    this.ports.state.replace(state);
    return { status: "started", state };
  }

  /** Give a content grant once per save timeline. Never throws; a refusal commits nothing (and writes no claim). */
  claimGrant(grantId: string): ClaimOutcome {
    const refused = (reason: string, error: unknown): ClaimOutcome => ({ status: "refused", grantId, reason, error: message(error) });
    if (this.op) return refused("battle-active", "a battle is open: its result would overwrite the state");
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return refused("state-unusable", error); }
    if (own(game.claims, grantId)) return { status: "already-claimed", grantId };
    const random = this.ports.random;
    if (!random) return refused("no-random", "no random source is configured for this application");
    let r;
    try { r = applyGrant(game, grantId, this.ports.content().content, random, this.limits); }
    catch (error) { return refused(error instanceof GrantRefusedError ? error.reason : "invalid", error); }
    if (r.status === "already-claimed") return { status: "already-claimed", grantId };
    try { this.ports.state.replace(r.state); } catch (error) { return refused("commit-failed", error); }
    return { status: "applied", grantId, placed: r.placed, items: r.items, money: r.money };
  }

  /** What a party/bag screen shows. Throws when the state is unusable (the screen then says so). */
  describeParty(): PartyView {
    const game = this.ports.state.read();
    const { content } = this.ports.content();
    return {
      members: game.party.map((m) => {
        const sp = speciesDataOf(content, m);
        const maxhp = sp ? computeStats(sp.base, m.ivs, m.evs, m.level, m.nature).hp : m.hp;
        return { id: m.id, species: m.species, form: m.form ?? 0, ...(sp?.nameKey ? { nameKey: sp.nameKey } : {}), level: m.level, hp: m.hp, maxhp, status: m.status, moves: m.moves.map((x) => ({ ...x })) };
      }),
      boxes: game.boxes.length, bag: { ...game.bag }, money: game.money,
    };
  }

  /** Heal the party (HP, status, PP). Safe to repeat: an already healed party writes nothing. Never throws. */
  healParty(): HealOutcome {
    if (this.op) return { status: "refused", reason: "battle-active", error: "a battle is open: its result would overwrite the state" };
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { status: "refused", reason: "state-unusable", error: message(error) }; }
    let next: GameState;
    try { next = healParty(game, this.ports.content().content); } catch (error) { return { status: "refused", reason: "invalid", error: message(error) }; }
    if (JSON.stringify(next.party) === JSON.stringify(game.party)) return { status: "unchanged" };
    try { this.ports.state.replace(next); } catch (error) { return { status: "refused", reason: "commit-failed", error: message(error) }; }
    return { status: "healed" };
  }

  /** Count steps the player took (WP06 §4.1: the global counter, wrapping at 2^31). The host applies the guards of that step. */
  recordSteps(n = 1): StepsOutcome {
    if (this.op) return { status: "refused", reason: "battle-active", error: "a battle is open: its result would overwrite the state" };
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { status: "refused", reason: "state-unusable", error: message(error) }; }
    let steps: number;
    try { steps = addSteps(game.steps, n); } catch (error) { return { status: "refused", reason: "invalid", error: message(error) }; }
    try { this.ports.state.replace({ ...game, steps }); } catch (error) { return { status: "refused", reason: "commit-failed", error: message(error) }; }
    return { status: "counted", steps };
  }

  /**
   * The host installed a state the application did not produce (a save was loaded, a new game was set up). A battle
   * still open belongs to the replaced state: its operation is released (otherwise grants, heals and battles would stay
   * refused for good, final review P4-2), and its session, should it still finish, commits nothing.
   */
  stateReplacedByHost(): void {
    if (this.op && this.op.session) this.detached.add(this.op.session);
    this.op = null;
  }

  /**
   * Open a battle. A save written against older content is explained here, with the record and the missing thing,
   * instead of crashing inside a battle. The foes are created here from the content (species + level, member-factory)
   * with ids W<seq>-<n>; a foe that cannot be created, or a party with nobody able to battle, refuses the battle.
   * Balls are disabled when a caught member would have nowhere to go (D1). Throws; nothing has been committed or changed.
   * Only one battle at a time: while another is open (also while its session is still being created) this throws. When
   * the battle is aborted before its session exists, a session that arrives later is not kept or returned (rejects).
   */
  async startBattle(request: BattleStartRequest): Promise<S> {
    if (this.op) throw new Error(`a battle is already open (${this.op.battleId})`);
    const game = this.ports.state.read();
    const { content, dex } = this.ports.content();
    const dangling = findDanglingReferences(game, content, dex);
    if (dangling.length) throw new Error("the save refers to content that no longer exists: " + dangling.slice(0, 3).map((d) => `${d.path} ${d.message}`).join("; "));
    if (!game.party.some((m) => m.hp > 0)) throw new Error("no party member can battle");
    const random = this.ports.random;
    if (!random) throw new Error("no random source is configured for this application (needed to create the foes)");
    if (!request.foes.length) throw new Error("a battle needs at least one foe");
    const foes: Member[] = request.foes.map((f, i) => {
      const species = resolveSpecies(content, f.species);
      if (!species) throw new Error(`foe ${i + 1}: species "${f.species}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
      const m = createMember({ id: `W${request.seq}-${i + 1}`, species, level: f.level }, content, random);
      if (!m.moves.length) throw new Error(`foe ${i + 1}: ${species} at level ${f.level} knows no move in the content (its learnset has nothing at or below that level)`);
      return m;
    });
    const full = storageFull(game, this.limits);
    const setup: BattleSetup = { foes, noRun: !!request.noRun, noBall: !!request.noBall || full, storageFull: full };
    const view = battleView(game, content); // the session speaks Showdown names (protocol v1); the save keeps content ids
    const op: { battleId: string; session: S | null; facts: BattleFacts } = { battleId: request.battleId, session: null, facts: { kind: request.kind, canLose: !!request.canLose } };
    this.op = op; // taken before the first await: nothing can write between reading the state and opening the battle
    let session: S;
    try { session = await this.ports.sessions.create(request, view, setup); }
    catch (error) { if (this.op === op) this.op = null; throw error; }
    if (this.op !== op) throw new Error(`battle ${request.battleId} was aborted while its session was being created; the late session is not used`);
    op.session = session;
    return session;
  }

  /**
   * A wild encounter for a host table at a region (WP36 §5.1 selection, decided here so the host keeps no rule).
   * Never throws: "not-here" when the table does not apply at the region, and no encounter when nobody can battle.
   */
  prepareEncounter(table: unknown, region: number): EncounterPlan {
    const checked = validateEncounterTable(table);
    if (!checked.table) return { ok: false, reason: "invalid-table", error: checked.problems.map((p) => `${p.path} ${p.message}`).join("; ") };
    if (!appliesAt(checked.table, region)) return { ok: false, reason: "not-here" };
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { ok: false, reason: "state-unusable", error: message(error) }; }
    if (!game.party.some((m) => m.hp > 0)) return { ok: false, reason: "no-able-member" };
    const random = this.ports.random;
    if (!random) return { ok: false, reason: "no-random", error: "no random source is configured for this application" };
    try {
      const content = this.ports.content().content;
      for (const slot of checked.table.slots) if (!resolveSpecies(content, slot.species)) return { ok: false, reason: "unknown-species", error: `"${slot.species}" is not in the content` };
      const pick = pickEncounter(checked.table, random);
      return { ok: true, foe: { species: resolveSpecies(content, pick.species)!, level: pick.level } };
    } catch (error) { return { ok: false, reason: "invalid-content", error: message(error) }; } // an unusable content port or random source
  }

  /**
   * Apply a result to the persistent state. Safe to call twice: the same result is a no-op, a different result for the
   * same battle is refused. Throws on a contract violation and then the state is exactly as it was. Without a battle
   * operation the application does not know the battle's kind, so no battle statistics are counted (finishBattle does).
   */
  commitResult(result: BattleResult): ApplyStatus {
    return this.commit(result).status;
  }

  /**
   * One state replacement per result: the result (species mapped to persistent keys through the content, D5-3), for a
   * lost or drawn battle the defeat settlement (money loss and party heal, D3), and the battle statistics. All are
   * identified by the result's battleId + hash in appliedBattles, so a repeat (already-applied) never settles again.
   */
  private commit(result: BattleResult, facts?: BattleFacts): { status: ApplyStatus; defeat?: { moneyLost: number; healed: true } } {
    const code = outcomeCode(result); // validate the part used by the host before any persistent state can be installed
    const { content } = this.ports.content();
    const applied = applyBattleResult(this.ports.state.read(), result, this.limits, speciesKeyResolver(content));
    if (applied.status !== "applied") return { status: applied.status };
    let next = applied.state;
    let defeat: { moneyLost: number; healed: true } | undefined;
    if (isDefeat(result)) {
      const settled = settleDefeat(next, content, { noMoneyLoss: this.noMoneyLoss });
      next = settled.state;
      defeat = { moneyLost: settled.moneyLost, healed: true };
    }
    if (facts) next = { ...next, stats: battleStats(next.stats, facts, code, defeat) };
    this.ports.state.replace(next);
    return defeat ? { status: "applied", defeat } : { status: "applied" };
  }

  /**
   * End a battle: read its result, commit it once, tell the host. Never throws. A battle whose result cannot be read
   * (unfinished, closed after a failure) or committed ends aborted with the persistent state untouched; once the state
   * is committed a failing host projection is reported on the outcome and does not undo or repeat the commit.
   */
  finishBattle(handle: S, request: Pick<BattleStartRequest, "battleId"> | null): BattleOutcome & { result?: BattleResult } {
    if (this.detached.has(handle)) {
      // the state this battle read is gone: no commit, no projection into the new state, and no lock to release
      return { code: 0, battleId: request ? request.battleId : null, commit: "none", aborted: true, error: "the game state was replaced while this battle was open (a save was loaded or a new game started); its result is not committed" };
    }
    const facts = this.op && this.op.session === handle ? this.op.facts : undefined;
    if (this.op && this.op.session === handle) this.op = null;
    let result: BattleResult;
    let outcome: BattleOutcome & { result?: BattleResult };
    try {
      result = handle.result();
      // Read and validate every result field needed after commit first. A bad handle must never leave a committed
      // battle that the caller subsequently mistakes for an abort.
      const code = outcomeCode(result), kind = result.outcome.kind;
      const battleId = request ? request.battleId : result.battleId;
      const committed = this.commit(result, facts);
      outcome = { code, battleId, commit: committed.status, kind, ...(committed.defeat ? { defeat: committed.defeat } : {}) };
    } catch (error) {
      return this.abortBattle(request, error);
    }
    this.project(outcome);
    outcome.result = result;
    return outcome;
  }

  /**
   * End without a result (a failure, a cancelled scene). Nothing is committed. Never throws. Ends the open operation when
   * it is this battle (same battleId), also while its session is still being created.
   */
  abortBattle(request: Pick<BattleStartRequest, "battleId"> | null, error: unknown): BattleOutcome {
    if (this.op && request && this.op.battleId === request.battleId) this.op = null;
    const outcome: BattleOutcome = { code: 0, battleId: request ? request.battleId : null, commit: "none", aborted: true, error: message(error) };
    this.project(outcome);
    return outcome;
  }

  private project(outcome: BattleOutcome): void {
    try { this.ports.projection.project(outcome); outcome.projection = "ok"; }
    catch (error) { outcome.projection = "failed"; outcome.projectionError = message(error); }
  }
}
