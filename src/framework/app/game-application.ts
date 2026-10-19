/**
 * The game application: the use cases that coordinate a battle with the persistent game, and nothing else.
 *  - game rules stay in the core (`rules/`): the application calls `applyBattleResult`, it does not re-implement it;
 *  - the Showdown engine and the MZ scene/windows stay behind their own adapters: the application only sees ports.
 * Outcomes are explicit so a caller can tell the four situations apart:
 *   not committed (aborted) | committed | already committed (duplicate) | committed but the host was not informed.
 */
import { applyBattleResult } from "../rules/state.ts";
import type { ApplyStatus, BattleResult } from "../rules/state.ts";
import { findDanglingReferences } from "../flow/content-runtime.ts";
import type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleStartRequest, ContentPort, GameStatePort, OutcomeProjection } from "./ports.ts";

export interface GameApplicationPorts<S extends BattleHandle> {
  state: GameStatePort;
  sessions: BattleSessionFactory<S>;
  content: ContentPort;
  projection: OutcomeProjection;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** How the host numbers an ending. */
export function outcomeCode(result: BattleResult): number {
  const { kind, winner } = result.outcome;
  return kind === "win" ? (winner === "Player" ? 1 : 4) : kind === "caught" ? 2 : kind === "run" ? 3 : 4;
}

export class GameApplication<S extends BattleHandle = BattleHandle> {
  private readonly ports: GameApplicationPorts<S>;

  constructor(ports: GameApplicationPorts<S>) { this.ports = ports; }

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
    let status: ApplyStatus;
    try {
      result = handle.result();
      status = this.commitResult(result);
    } catch (error) {
      return this.abortBattle(request, error);
    }
    const outcome: BattleOutcome & { result?: BattleResult } = { code: outcomeCode(result), battleId: request ? request.battleId : result.battleId, commit: status, kind: result.outcome.kind };
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
