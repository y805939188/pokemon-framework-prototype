/**
 * The game application: the use cases that coordinate a battle with the persistent game, and nothing else.
 *  - game rules stay in the core (`rules/`): the application calls `applyBattleResult`, it does not re-implement it;
 *  - the Showdown engine and the MZ scene/windows stay behind their own adapters: the application only sees ports.
 * Outcomes are explicit so a caller can tell the four situations apart:
 *   not committed (aborted) | committed | already committed (duplicate) | committed but the host was not informed.
 */
import { applyBattleResult, newGame } from "../rules/state.ts";
import type { ApplyStatus, BattleResult, GameState } from "../rules/state.ts";
import { DEFAULT_LIMITS } from "../rules/limits.ts";
import type { Limits } from "../rules/limits.ts";
import { GrantRefusedError, applyGrant } from "../rules/grants.ts";
import { healParty } from "../rules/heal.ts";
import { findDanglingReferences } from "../flow/content-runtime.ts";
import type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleStartRequest, ClaimOutcome, ContentPort, GameStatePort, HealOutcome, OutcomeProjection, RandomPort } from "./ports.ts";

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

  constructor(ports: GameApplicationPorts<S>, options: GameApplicationOptions = {}) {
    this.ports = ports;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.startMoney = options.startMoney ?? 3000;
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
   * instead of crashing inside a battle. Throws; nothing has been committed or changed.
   */
  async startBattle(request: BattleStartRequest): Promise<S> {
    const game = this.ports.state.read();
    const { content, dex } = this.ports.content();
    const dangling = findDanglingReferences(game, content, dex);
    if (dangling.length) throw new Error("the save refers to content that no longer exists: " + dangling.slice(0, 3).map((d) => `${d.path} ${d.message}`).join("; "));
    return this.ports.sessions.create(request, game);
  }

  /**
   * Apply a result to the persistent state. Safe to call twice: the same result is a no-op, a different result for the
   * same battle is refused. Throws on a contract violation and then the state is exactly as it was.
   */
  commitResult(result: BattleResult): ApplyStatus {
    outcomeCode(result); // validate the part used by the host before any persistent state can be installed
    const applied = applyBattleResult(this.ports.state.read(), result);
    if (applied.status === "applied") this.ports.state.replace(applied.state);
    return applied.status;
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
      const status = this.commitResult(result);
      outcome = { code, battleId, commit: status, kind };
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
