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
import type { Member } from "../rules/types.ts";
import { findDanglingReferences, resolveSpecies } from "../flow/content-runtime.ts";
import type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, ClaimOutcome, ContentPort, EncounterPlan, GameStatePort, HealOutcome, OutcomeProjection, PartyView, RandomPort } from "./ports.ts";

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

export class GameApplication<S extends BattleHandle = BattleHandle> {
  private readonly ports: GameApplicationPorts<S>;
  private readonly limits: Limits;
  private readonly startMoney: number;
  private readonly noMoneyLoss: boolean;

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
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return refused("state-unusable", error); }
    if (game.claims[grantId]) return { status: "already-claimed", grantId };
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
        const sp = content.species[m.species];
        const maxhp = sp ? computeStats(sp.base, m.ivs, m.evs, m.level, m.nature).hp : m.hp;
        return { id: m.id, species: m.species, ...(sp?.nameKey ? { nameKey: sp.nameKey } : {}), level: m.level, hp: m.hp, maxhp, status: m.status, moves: m.moves.map((x) => ({ ...x })) };
      }),
      boxes: game.boxes.length, bag: { ...game.bag }, money: game.money,
    };
  }

  /** Heal the party (HP, status, PP). Safe to repeat: an already healed party writes nothing. Never throws. */
  healParty(): HealOutcome {
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { status: "refused", reason: "state-unusable", error: message(error) }; }
    let next: GameState;
    try { next = healParty(game, this.ports.content().content); } catch (error) { return { status: "refused", reason: "invalid", error: message(error) }; }
    if (JSON.stringify(next.party) === JSON.stringify(game.party)) return { status: "unchanged" };
    try { this.ports.state.replace(next); } catch (error) { return { status: "refused", reason: "commit-failed", error: message(error) }; }
    return { status: "healed" };
  }

  /**
   * Open a battle. A save written against older content is explained here, with the record and the missing thing,
   * instead of crashing inside a battle. The foes are created here from the content (species + level, member-factory)
   * with ids W<seq>-<n>; a foe that cannot be created, or a party with nobody able to battle, refuses the battle.
   * Balls are disabled when a caught member would have nowhere to go (D1). Throws; nothing has been committed or changed.
   */
  async startBattle(request: BattleStartRequest): Promise<S> {
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
    return this.ports.sessions.create(request, game, setup);
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
    const content = this.ports.content().content;
    for (const slot of checked.table.slots) if (!resolveSpecies(content, slot.species)) return { ok: false, reason: "unknown-species", error: `"${slot.species}" is not in the content` };
    const pick = pickEncounter(checked.table, random);
    return { ok: true, foe: { species: resolveSpecies(content, pick.species)!, level: pick.level } };
  }

  /**
   * Apply a result to the persistent state. Safe to call twice: the same result is a no-op, a different result for the
   * same battle is refused. Throws on a contract violation and then the state is exactly as it was.
   */
  commitResult(result: BattleResult): ApplyStatus {
    return this.commit(result).status;
  }

  /**
   * One state replacement per result: the result, and for a lost or drawn battle the defeat settlement (money loss and
   * party heal, D3). Both are identified by the result's battleId + hash in appliedBattles, so a repeat (already-applied)
   * never settles again.
   */
  private commit(result: BattleResult): { status: ApplyStatus; defeat?: { moneyLost: number; healed: true } } {
    outcomeCode(result); // validate the part used by the host before any persistent state can be installed
    const applied = applyBattleResult(this.ports.state.read(), result, this.limits);
    if (applied.status !== "applied") return { status: applied.status };
    let next = applied.state;
    let defeat: { moneyLost: number; healed: true } | undefined;
    if (isDefeat(result)) {
      const settled = settleDefeat(next, this.ports.content().content, { noMoneyLoss: this.noMoneyLoss });
      next = settled.state;
      defeat = { moneyLost: settled.moneyLost, healed: true };
    }
    this.ports.state.replace(next);
    return defeat ? { status: "applied", defeat } : { status: "applied" };
  }

  /**
   * End a battle: read its result, commit it once, tell the host. Never throws. A battle whose result cannot be read
   * (unfinished, closed after a failure) or committed ends aborted with the persistent state untouched; once the state
   * is committed a failing host projection is reported on the outcome and does not undo or repeat the commit.
   */
  finishBattle(handle: S, request: Pick<BattleStartRequest, "battleId"> | null): BattleOutcome & { result?: BattleResult } {
    let result: BattleResult;
    let outcome: BattleOutcome & { result?: BattleResult };
    try {
      result = handle.result();
      // Read and validate every result field needed after commit first. A bad handle must never leave a committed
      // battle that the caller subsequently mistakes for an abort.
      const code = outcomeCode(result), kind = result.outcome.kind;
      const battleId = request ? request.battleId : result.battleId;
      const committed = this.commit(result);
      outcome = { code, battleId, commit: committed.status, kind, ...(committed.defeat ? { defeat: committed.defeat } : {}) };
    } catch (error) {
      return this.abortBattle(request, error);
    }
    this.project(outcome);
    outcome.result = result;
    return outcome;
  }

  /** End without a result (a failure, a cancelled scene). Nothing is committed. Never throws. */
  abortBattle(request: Pick<BattleStartRequest, "battleId"> | null, error: unknown): BattleOutcome {
    const outcome: BattleOutcome = { code: 0, battleId: request ? request.battleId : null, commit: "none", aborted: true, error: message(error) };
    this.project(outcome);
    return outcome;
  }

  private project(outcome: BattleOutcome): void {
    try { this.ports.projection.project(outcome); outcome.projection = "ok"; }
    catch (error) { outcome.projection = "failed"; outcome.projectionError = message(error); }
  }
}
