/** Composition-only registration. This module is not part of any public entry or JSON/save contract. */
import type { BattleHandle, BattleSessionFactory } from "./ports";
import type { HeldBinding } from "../rules/held-facts";
import type { BattleCommitOptions, BattleResult } from "../rules/state";
export interface SettlementFactorySource {
  readonly mode: "required" | "legacy-no-held";
  readonly factory: object;
  readonly create: BattleSessionFactory["create"];
  readonly collect?: (handle: BattleHandle, binding: HeldBinding) => unknown;
  readonly legacyProduce?: (battleId: string) => BattleResult;
}
const SOURCES = new WeakMap<object, SettlementFactorySource>();
const HANDLES = new WeakMap<object, { app: object; operation: object }>();
/** Binding only, not admission. A retired/foreign handle cannot be rebound by a later same-id factory callback. */
export function claimSettlementHandle(handle: object, app: object, operation: object): boolean {
  const old = HANDLES.get(handle);
  if (old) return old.app === app && old.operation === operation;
  HANDLES.set(handle, { app, operation }); return true;
}
export function registerSettlementFactory<S extends BattleHandle>(factory: BattleSessionFactory<S>, mode: SettlementFactorySource["mode"], collect?: (handle: S, binding: HeldBinding) => unknown, legacyProduce?: (battleId: string) => BattleResult): void {
  if (SOURCES.has(factory)) throw new Error("settlement-factory-already-registered");
  // Required production retains its exact implementation. Explicit legacy consumers keep dynamic method lookup/this.
  const create: BattleSessionFactory["create"] = mode === "required" ? factory.create.bind(factory) : (...args) => factory.create(...args);
  if (legacyProduce && mode !== "legacy-no-held") throw new Error("required-factory-has-no-legacy-producer");
  SOURCES.set(factory, Object.freeze({ mode, factory, create, ...(collect ? { collect: (handle: BattleHandle, binding: HeldBinding) => collect(handle as S, binding) } : {}), ...(legacyProduce ? { legacyProduce } : {}) }));
}
export function settlementFactorySource(factory: object): SettlementFactorySource | null { return SOURCES.get(factory) ?? null; }

interface LegacyAdmissionRoot {
  open(battleId: string, options: BattleCommitOptions): BattleHandle;
  commit(battleId: string, options: BattleCommitOptions): string;
}
const APPLICATIONS = new WeakMap<object, LegacyAdmissionRoot>();
export function registerLegacyAdmissionRoot(app: object, root: LegacyAdmissionRoot): void { if (APPLICATIONS.has(app)) throw new Error("legacy-root-already-registered"); APPLICATIONS.set(app, root); }
export function legacyAdmissionRoot(app: object): LegacyAdmissionRoot { const root = APPLICATIONS.get(app); if (!root) throw new Error("unknown-application"); return root; }
