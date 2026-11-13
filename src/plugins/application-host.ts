/** Compile-time MZ boundary. Imports are types only; no second application/runtime is bundled into a plugin. */
import type { GameApplication } from '../framework/app';
import type { BattleSessionFactory } from '../framework/app';
import type { Content, DexLookup } from '../framework/rules/types';
import type { LogSink, RingLogger } from '../framework/flow/log';
import type { GameState } from '../framework/rules/state';
import type { Limits } from '../framework/rules/limits';

export type HostApplication = GameApplication;
export interface ApplicationHost {
  app(): HostApplication;
  _app: HostApplication | null;
}
export interface ApplicationCompositionHost extends ApplicationHost {
  game(): GameState;
  content(): Content;
  limits(): Limits;
  random(n: number): number;
  now(): number;
  param(name: string, fallback: number): number;
  flagParam(name: string, fallback: boolean): boolean;
  _content: Content | null;
  _dex: DexLookup | null;
  logger: RingLogger | null;
  seed: number[] | string | undefined;
}
export type LearningApplication = Pick<HostApplication,
  'stateGeneration' | 'encounterBlocked' | 'pendingLearning' | 'beginLearning' | 'resolveLearning' | 'describeLearningMove'>;

/** Only the dynamically loaded exports consumed by application construction. Remaining MZ edges stay separate. */
interface SessionOptions {
  content: () => Content;
  seed?: () => number[] | string | undefined;
  logger?: () => LogSink | undefined;
  replacementOffers?: boolean;
}
export interface ProductionRuntime {
  app: Pick<typeof import('../framework/app'), 'GameApplication' | 'individualView'>;
  composition: {
    createBattleSessionFactory(options: SessionOptions): BattleSessionFactory;
    createLegacyNoHeldBattleSessionFactory(options: SessionOptions): BattleSessionFactory;
  };
  dex: { createDexLookup(engineRoot?: string): DexLookup };
  log: { createRingLogger(capacity?: number): RingLogger };
}

