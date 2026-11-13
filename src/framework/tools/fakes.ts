/**
 * In-memory stand-ins for the application's ports, for tests and the headless harness: a state holder that counts and
 * (optionally) refuses, a projection that records and can fail, and a session factory that hands out scripted handles.
 */
import { clone } from "../rules/state";
import type { BattleResult, GameState } from "../rules/state";
import type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, GameStatePort, OutcomeProjection } from "../app/ports";
import { registerSettlementFactory } from "../app/settlement-source";
import { createLegacyNoHeldSaveStore } from "./save-store";
import type { FaultPoint, SaveStore } from "./save-store";
import type { Content } from "../rules/types";
import type { SpeciesKeyResolver } from "../rules/species-key";

/** Recursively freeze, so any in-place write by the code under test throws instead of passing silently. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); }
  return value;
}

export interface MemoryState extends GameStatePort {
  /** The state currently held (frozen). */
  current(): GameState;
  readonly reads: number;
  /** Every state ever installed with `replace`, in order. */
  readonly replaced: GameState[];
  /** Make the port refuse: `read` (an unusable save) and/or `replace` (a failing store) throw this error. */
  failRead: Error | null;
  failReplace: Error | null;
}

export function createMemoryState(initial: GameState): MemoryState {
  let held = deepFreeze(clone(initial));
  const port: MemoryState = {
    reads: 0, replaced: [], failRead: null, failReplace: null,
    current: () => held,
    read() { if (port.failRead) throw port.failRead; (port as { reads: number }).reads++; return held; },
    replace(next) { if (port.failReplace) throw port.failReplace; held = deepFreeze(clone(next)); port.replaced.push(held); },
  };
  return port;
}

export interface RecordingProjection extends OutcomeProjection {
  readonly outcomes: BattleOutcome[];
  /** Number of upcoming projections that throw before it works again. */
  failures: number;
}

export function createRecordingProjection(): RecordingProjection {
  const port: RecordingProjection = {
    outcomes: [], failures: 0,
    project(outcome) { port.outcomes.push({ ...outcome }); if (port.failures > 0) { port.failures--; throw new Error("host projection failed"); } },
  };
  return port;
}

export interface FakeSessions extends BattleSessionFactory<BattleHandle> {
  readonly created: { request: BattleStartRequest; game: GameState; setup: BattleSetup }[];
  /** The result the next handle will report; a function may throw (an unfinished or closed session). */
  next: BattleResult | (() => BattleResult);
}

export function createFakeSessions(first: BattleResult | (() => BattleResult)): FakeSessions {
  const factory: FakeSessions = {
    created: [], next: first,
    async create(request, game, setup) {
      factory.created.push({ request, game, setup });
      const source = factory.next;
      return { result: () => (typeof source === "function" ? source() : source) };
    },
  };
  registerSettlementFactory(factory, "legacy-no-held", undefined, () => {
    const source = factory.next; return typeof source === "function" ? source() : source;
  });
  return factory;
}

/** Explicit historical synthetic store fixture. New required/default-store admission tests must use the real API. */
export function createFixtureSaveStore(file: string, hooks: { at?: (point: FaultPoint) => void } = {}, speciesKey?: SpeciesKeyResolver, content?: Content): SaveStore {
  let input: BattleResult | null = null;
  const store = createLegacyNoHeldSaveStore(file, () => { if (!input) throw new Error("no synthetic store result selected"); return input; }, hooks, speciesKey, content);
  const commit = store.commit.bind(store);
  store.commit = (result, options = {}) => { input = result; return commit(result, options); };
  return store;
}
