/**
 * Composition root: the one place that wires the Showdown-backed battle session to the application's ports.
 * Everything here is a choice of implementation, not logic: change the engine by changing this file (or by passing
 * another driver factory), not the application.
 */
import { BattleSession } from "./flow/session.ts";
import type { LogSink } from "./flow/log.ts";
import type { BattleDriverFactory } from "./battle/driver.ts";
import type { BattleSessionFactory } from "./app/index.ts";
import type { Content } from "./rules/types.ts";

export interface BattleSessionFactoryOptions {
  content: () => Content;
  /** Pins the engine seed (tests); undefined lets the engine pick one. */
  seed?: () => number[] | string | undefined;
  logger?: () => LogSink | undefined;
  /** The battle engine; Pokemon Showdown unless given. */
  driver?: BattleDriverFactory;
}

export function createBattleSessionFactory(options: BattleSessionFactoryOptions): BattleSessionFactory<BattleSession> {
  return {
    // the application has created the foes (rules/member-factory) and decided the flags; this only wires the engine
    create: (request, game, setup) => BattleSession.create({
      game, battleId: request.battleId, content: options.content(), experimentalHeldBattle: setup.experimentalHeldBattle ?? false,
      ...(options.seed ? { seed: options.seed() } : {}),
      ...(options.logger ? { logger: options.logger() } : {}),
      ...(options.driver ? { driver: options.driver } : {}),
      foe: { kind: request.kind, team: setup.foes, noRun: setup.noRun, noBall: setup.noBall },
    }),
  };
}
