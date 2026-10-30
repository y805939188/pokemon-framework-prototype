import { createTrainerAiStrategyRegistry } from "./flow/trainer-ai-strategy";
import type { TrainerAiStrategyRegistry } from "./flow/trainer-ai-strategy";
export { createTrainerAiStrategyRegistry } from "./flow/trainer-ai-strategy";
export type { TrainerAiStrategyRegistry, TrainerAiStrategyRegistration, TrainerAiStrategy, StrategyParameters, TrainerAiStrategyReference } from "./flow/trainer-ai-strategy";
/**
 * Composition root: the one place that wires the Showdown-backed battle session to the application's ports.
 * Everything here is a choice of implementation, not logic: change the engine by changing this file (or by passing
 * another driver factory), not the application.
 */
import { BattleSession, sealBattleEvidence, sealBattleEffects } from "./flow/session";
import type { LogSink } from "./flow/log";
import type { BattleDriverFactory } from "./battle/driver";
import type { BattleSessionFactory } from "./app/index";
import type { Content } from "./rules/types";
import { showdownDriverFactory } from "./battle/gateway";
import { sealRequiredSettlement } from "./flow/required-settlement";
import { legacyAdmissionRoot, registerSettlementFactory, settlementFactorySource } from "./app/settlement-source";
import type { BattleHandle } from "./app/ports";
import { validatedContentIdentity } from "./flow/content-runtime";
import type { BattleCommitOptions, BattleResult } from "./rules/state";
const CREATE_BATTLE_SESSION = BattleSession.create.bind(BattleSession);

export interface BattleSessionFactoryOptions {
  content: () => Content;
  trainerAiStrategies?: TrainerAiStrategyRegistry;
  /** Pins the engine seed (tests); undefined lets the engine pick one. */
  seed?: () => number[] | string | undefined;
  logger?: () => LogSink | undefined;
  /** The battle engine; Pokemon Showdown unless given. */
  driver?: BattleDriverFactory;
}

export function createBattleSessionFactory(options: BattleSessionFactoryOptions): BattleSessionFactory<BattleSession> {
  const driver = options.driver;
  return buildSessionFactory(options, !driver || driver === showdownDriverFactory, driver);
}
/** Explicit real-engine legacy root for old no-held content without a verified compiled identity. */
export function createLegacyNoHeldBattleSessionFactory(options: BattleSessionFactoryOptions): BattleSessionFactory<BattleSession> {
  return createLegacyNoHeldSessionFactory(buildSessionFactory(options, false, options.driver));
}
function buildSessionFactory(options: BattleSessionFactoryOptions, required: boolean, selectedDriver: BattleDriverFactory | undefined): BattleSessionFactory<BattleSession> {
  // Selecting the producer mode and the actual driver is one composition-time choice. Later mutable options cannot
  // retain required authority while substituting another engine. Callback receivers/content lookup stay unchanged.
  const driver = selectedDriver ?? showdownDriverFactory;
  const resolveStrategy = (options.trainerAiStrategies ?? createTrainerAiStrategyRegistry()).resolve;
  const currentContent = options.content.bind(options);
  const factory: BattleSessionFactory<BattleSession> = {
    // the application has created the foes (rules/member-factory) and decided the flags; this only wires the engine
    create: (request, game, setup) => {
      const content = options.content();
      if (required && (!setup.evidenceContext || validatedContentIdentity(content) !== setup.evidenceContext.contentIdentity)) throw new Error("required-settlement-factory-content-mismatch");
      if (required && setup.trainer && !setup.isCurrentBattle) throw new Error('trainer-ai-app-owner-missing');
      return CREATE_BATTLE_SESSION({
      game, battleId: request.battleId, content, experimentalHeldBattle: setup.experimentalHeldBattle ?? false,
      requiredSettlement: required,
      ...(setup.evidenceContext ? { evidence: setup.evidenceContext } : {}),
      ...(setup.obedience ? { obedience: setup.obedience } : {}),
      ...(required && setup.trainer && setup.evidenceContext && setup.isCurrentBattle ? { trainerAi: {
        strategy: resolveStrategy(setup.trainer.ai.aiStrategy), projection: setup.trainer, generation: setup.evidenceContext.generation, contentIdentity: setup.evidenceContext.contentIdentity,
        currentContent, isCurrent: setup.isCurrentBattle,
      } } : {}),
      ...(options.seed ? { seed: options.seed() } : {}),
      ...(options.logger ? { logger: options.logger() } : {}),
      driver,
      foe: { kind: request.kind, team: setup.foes, noRun: setup.noRun, noBall: setup.noBall },
    }); },
    evidence: (handle, binding) => sealBattleEvidence(handle, binding),
    effects: (handle, binding) => sealBattleEffects(handle, binding),
  };
  if (required) registerSettlementFactory(factory, "required", sealRequiredSettlement);
  return factory;
}

/** Explicit compatibility root for create-only/custom non-held producers; never an automatic missing-method fallback. */
export function createLegacyNoHeldSessionFactory<S extends BattleHandle>(original: BattleSessionFactory<S>): BattleSessionFactory<S> {
  const wrapper: BattleSessionFactory<S> = {
    create: (request, game, setup) => original.create(request, game, setup),
    evidence: (handle, binding) => original.evidence?.(handle, binding) ?? null,
    effects: (handle, binding) => original.effects?.(handle, binding) ?? null,
  };
  const previous = settlementFactorySource(original);
  registerSettlementFactory(wrapper, "legacy-no-held", undefined, previous?.mode === "legacy-no-held" ? previous.legacyProduce : undefined);
  return wrapper;
}

/** Pre-register a legitimate old producer before result() runs; the handle stays bound to this app/generation. */
export function createLegacyNoHeldBattleHandle(application: object, battleId: string, options: BattleCommitOptions = {}): BattleHandle {
  return legacyAdmissionRoot(application).open(battleId, options);
}
/** Synchronous legacy API migration. The adapter reserves its source/operation before invoking the producer. */
export function commitLegacyNoHeldResult(application: object, battleId: string, options: BattleCommitOptions = {}): string {
  return legacyAdmissionRoot(application).commit(battleId, options);
}

/** Select the actual old synchronous producer at composition time, before the application/operation exists. */
export function createLegacyNoHeldResultFactory(producer: (battleId: string) => BattleResult): BattleSessionFactory {
  const factory: BattleSessionFactory = { create: async request => ({ result: () => producer(request.battleId) }) };
  registerSettlementFactory(factory, "legacy-no-held", undefined, producer);
  return factory;
}
