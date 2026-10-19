/**
 * Composition root: the one place that wires the Showdown-backed battle session to the application's ports.
 * Everything here is a choice of implementation, not logic: change the engine by changing this file (or by passing
 * another driver factory), not the application.
 */
import { BattleSession } from "./flow/session.ts";
import type { LogSink } from "./flow/log.ts";
import type { BattleDriverFactory } from "./battle/driver.ts";
import type { BattleSessionFactory } from "./app/index.ts";
import type { Content, Member } from "./rules/types.ts";
import { foeMember } from "./tools/fixtures/game.ts";

export interface BattleSessionFactoryOptions {
  content: () => Content;
  /** Pins the engine seed (tests); undefined lets the engine pick one. */
  seed?: () => number[] | string | undefined;
  logger?: () => LogSink | undefined;
  /** The battle engine; Pokemon Showdown unless given. */
  driver?: BattleDriverFactory;
  /** How a requested foe becomes a battle member (the prototype builds synthetic foes from the fixtures). */
  makeFoe?: (id: string, species: string, level: number) => Member;
}

export function createBattleSessionFactory(options: BattleSessionFactoryOptions): BattleSessionFactory<BattleSession> {
  const makeFoe = options.makeFoe ?? ((id: string, species: string, level: number) => foeMember(id, species, level));
  return {
    create: (request, game) => BattleSession.create({
      game, battleId: request.battleId, content: options.content(),
      ...(options.seed ? { seed: options.seed() } : {}),
      ...(options.logger ? { logger: options.logger() } : {}),
      ...(options.driver ? { driver: options.driver } : {}),
      foe: { kind: request.kind, team: request.foes.map((f, i) => makeFoe(`W${request.seq}-${i + 1}`, f.species, f.level)) },
    }),
  };
}
