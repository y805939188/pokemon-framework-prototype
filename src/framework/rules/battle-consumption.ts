/** Internal V2 finite receipts. Neither these values nor the plans extend frozen protocol v1. */
import type { DexState, Member } from "./types.ts";
import { setOwn } from "./own.ts";

export type EffectStatus = "complete" | "unavailable" | "invalid";
export type EffectCoverage = { status: "complete"; reason?: string } | { status: "unavailable" | "invalid"; reason: string };
export type EffectCell<T> = { status: "complete"; value: T; reason?: string } | { status: "unavailable" | "invalid"; reason: string };
export interface EffectsBindingV2 { battleId: string; generation: number; rawHash: string; contentIdentity: string }
export interface EffectsContextV2 {
  playerIds: string[]; L0: Record<string, number>;
  /** Player engine roster only; eggs and opponents must never widen missing-faint risk. */
  engineRosterIds: string[]; foeIds: string[]; internalBattle: boolean;
}
/** The battle species name includes the actual displayed form. Content mapping happens later. */
export interface BattleDisplayV2 { battleSpecies: string; gender: DexState["lastSeenForm"][string]["gender"]; shiny: DexState["lastSeenForm"][string]["shiny"] }
export interface BattleAppearanceV2 { memberId: string; sourceOrder: number; display: BattleDisplayV2 }
export interface BattleDefeatV2 extends BattleAppearanceV2 { occurrenceOrdinal: number; hookKey: string }
export type EffectSource = "observer" | "control";
export interface FaintOccurrenceV2 { memberId: string; source: EffectSource; occurrenceOrdinal: number; sourceOrder: number; hookKey: string }
/** Coverage is independent of the positive prefix, which can survive a later source interruption. */
export interface FaintCellV2 { positiveOccurrences: FaintOccurrenceV2[]; coverage: EffectCoverage }
export type FaintLifecycleV2 = FaintCellV2;
export interface BattleDamageV2 { total: number; resetCoverage: "complete" }
export interface FriendshipReceiptV2 {
  before: number; current: number;
  changes: { method: "levelup" | "battleitem" | "faint" | "faintbad"; before: number; after: number }[];
}
export interface EffectsSealV2 {
  version: 2; binding: EffectsBindingV2; context: EffectsContextV2;
  observer: {
    appearances: Record<string, EffectCell<BattleAppearanceV2[]>>;
    defeats: Record<string, EffectCell<BattleDefeatV2[]>>;
    members: Record<string, { critical: EffectCell<number>; damage: EffectCell<BattleDamageV2>; faint: FaintCellV2 }>;
  };
  control: { members: Record<string, { friendship: EffectCell<FriendshipReceiptV2>; faint: FaintCellV2 }> };
}
export interface EffectDisposition {
  source: EffectSource | "shared";
  group: "binding" | "context" | "appearances" | "defeats" | "critical" | "damage" | "friendship" | "faint";
  memberId?: string; status: EffectStatus; reason?: string;
}
export interface ResolvedFaintV2 extends FaintCellV2 { sources: { observer: FaintCellV2; control: FaintCellV2 } }
export interface ResolvedBattleEffects {
  binding: EffectsBindingV2 | null;
  appearances: BattleAppearanceV2[]; defeats: BattleDefeatV2[];
  critical: Record<string, EffectCell<number>>; damage: Record<string, EffectCell<BattleDamageV2>>;
  friendshipReplacements: Record<string, number>; faint: Record<string, ResolvedFaintV2>;
  dispositions: EffectDisposition[];
}
export interface ResolveBattleEffectsInput {
  seal: unknown; expectedBinding: EffectsBindingV2; expectedContext: EffectsContextV2;
  /** Before the legal primary plan. A primary friendship write wins; composition owns that conflict. */
  membersBefore: readonly Pick<Member, "id" | "friendship">[];
}

type Obj = Record<string, unknown>;
const object = (value: unknown): value is Obj => value !== null && typeof value === "object" && !Array.isArray(value);
/** Inspect only own data slots; receipt getters are never executed. Proxies/global intrinsic replacement are outside this contract. */
function data(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const identity = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9#._:-]{1,128}$/.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const reason = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const fields = (value: unknown, allowed: readonly string[]): boolean => object(value) && Object.keys(value).every(key => allowed.includes(key));
function slots(value: unknown, allowed: readonly string[]): boolean {
  return fields(value, allowed) && Object.keys(value as Obj).every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"));
}
function array(value: unknown, maximum = 100000): unknown[] | null {
  if (!Array.isArray(value)) return null;
  const length = data(value, "length");
  if (!integer(length, 0, maximum)) return null;
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor)) return null;
    result.push(descriptor.value);
  }
  return result;
}
const unavailable = (why: string): { status: "unavailable"; reason: string } => ({ status: "unavailable", reason: why });
const invalid = (why: string): { status: "invalid"; reason: string } => ({ status: "invalid", reason: why });
function coverage(value: unknown): EffectCoverage {
  if (!slots(value, ["status", "reason"])) return invalid("invalid-coverage");
  const status = data(value, "status"), why = data(value, "reason");
  if (status === "complete" && (why === undefined || reason(why))) return { status, ...(why === undefined ? {} : { reason: why }) };
  return (status === "unavailable" || status === "invalid") && reason(why) ? { status, reason: why } : invalid("invalid-coverage");
}
function cell<T>(value: unknown, parse: (raw: unknown) => T | null): EffectCell<T> {
  if (value === undefined) return unavailable("cell-not-supplied");
  if (!slots(value, ["status", "reason", "value"])) return invalid("invalid-cell");
  const status = data(value, "status"), why = data(value, "reason");
  if (status === "unavailable" || status === "invalid") {
    return reason(why) && !Object.hasOwn(value as Obj, "value") ? { status, reason: why } : invalid("noncomplete-cell-has-value-or-no-reason");
  }
  if (status !== "complete" || (why !== undefined && !reason(why))) return invalid("invalid-cell-status");
  const parsed = parse(data(value, "value"));
  return parsed === null ? invalid("invalid-complete-value") : { status: "complete", value: parsed, ...(why === undefined ? {} : { reason: why }) };
}
function binding(value: unknown): EffectsBindingV2 | null {
  if (!slots(value, ["battleId", "generation", "rawHash", "contentIdentity"])) return null;
  const battleId = data(value, "battleId"), generation = data(value, "generation"), rawHash = data(value, "rawHash"), contentIdentity = data(value, "contentIdentity");
  return identity(battleId) && integer(generation) && hash(rawHash) && hash(contentIdentity) ? { battleId, generation, rawHash, contentIdentity } : null;
}
function context(value: unknown): EffectsContextV2 | null {
  if (!slots(value, ["playerIds", "L0", "engineRosterIds", "foeIds", "internalBattle"])) return null;
  const players = array(data(value, "playerIds"), 6), roster = array(data(value, "engineRosterIds"), 6), foes = array(data(value, "foeIds"), 24), levels = data(value, "L0"), internalBattle = data(value, "internalBattle");
  if (!players || !roster || !foes || !players.every(identity) || !roster.every(identity) || !foes.every(identity) || new Set(players).size !== players.length || new Set(roster).size !== roster.length || new Set(foes).size !== foes.length || !roster.every(id => players.includes(id)) || foes.some(id => players.includes(id)) || typeof internalBattle !== "boolean" || !object(levels) || Object.keys(levels).length !== players.length) return null;
  const L0: Record<string, number> = {};
  for (const id of players) {
    const level = data(levels, id);
    if (!integer(level, 1, 100)) return null;
    setOwn(L0, id, level);
  }
  return { playerIds: [...players], L0, engineRosterIds: [...roster], foeIds: [...foes], internalBattle };
}
function display(value: unknown): BattleDisplayV2 | null {
  if (!slots(value, ["battleSpecies", "gender", "shiny"])) return null;
  const battleSpecies = data(value, "battleSpecies"), gender = data(value, "gender"), shiny = data(value, "shiny");
  return typeof battleSpecies === "string" && battleSpecies.trim().length > 0 && battleSpecies.length <= 128 && integer(gender, 0, 2) && typeof shiny === "boolean" ? { battleSpecies, gender: gender as 0 | 1 | 2, shiny } : null;
}
function appearances(value: unknown, id: string): BattleAppearanceV2[] | null {
  const rows = array(value); if (!rows) return null;
  const result: BattleAppearanceV2[] = []; let lastOrder = -1;
  for (const row of rows) {
    const memberId = data(row, "memberId"), sourceOrder = data(row, "sourceOrder"), snapshot = display(data(row, "display"));
    if (!slots(row, ["memberId", "sourceOrder", "display"]) || memberId !== id || !identity(memberId) || !integer(sourceOrder) || sourceOrder <= lastOrder || !snapshot) return null;
    result.push({ memberId, sourceOrder, display: snapshot }); lastOrder = sourceOrder;
  }
  return result;
}
function defeats(value: unknown, id: string, recordHook: (hookKey: string) => void): BattleDefeatV2[] | null {
  const rows = array(value); if (!rows) return null;
  const result: BattleDefeatV2[] = [], hooks = new Set<string>(); let lastOrder = -1, lastOrdinal = 0, projectionValid = true;
  for (const row of rows) {
    const memberId = data(row, "memberId"), sourceOrder = data(row, "sourceOrder"), snapshot = display(data(row, "display")), occurrenceOrdinal = data(row, "occurrenceOrdinal"), hookKey = data(row, "hookKey");
    if (!fields(row, ["memberId", "sourceOrder", "display", "occurrenceOrdinal", "hookKey"]) || memberId !== id || !identity(memberId) || !integer(sourceOrder) || sourceOrder <= lastOrder || !integer(occurrenceOrdinal, 1) || occurrenceOrdinal !== lastOrdinal + 1 || !identity(hookKey) || hooks.has(hookKey)) return null;
    // Display failure prevents projection, but ownership remains provable until the identity/order chain breaks.
    recordHook(hookKey);
    if (!slots(row, ["memberId", "sourceOrder", "display", "occurrenceOrdinal", "hookKey"]) || !snapshot) projectionValid = false;
    else result.push({ memberId, sourceOrder, display: snapshot, occurrenceOrdinal, hookKey });
    hooks.add(hookKey); lastOrder = sourceOrder; lastOrdinal = occurrenceOrdinal;
  }
  return projectionValid ? result : null;
}
function damage(value: unknown): BattleDamageV2 | null {
  const total = data(value, "total");
  return slots(value, ["total", "resetCoverage"]) && integer(total) && data(value, "resetCoverage") === "complete" ? { total, resetCoverage: "complete" } : null;
}
function friendship(value: unknown, before: unknown): FriendshipReceiptV2 | null {
  if (!integer(before, 0, 255) || !slots(value, ["before", "current", "changes"]) || data(value, "before") !== before) return null;
  const current = data(value, "current"), changes = array(data(value, "changes"));
  if (!integer(current, 0, 255) || !changes) return null;
  const result: FriendshipReceiptV2["changes"] = []; let cursor = before;
  for (const change of changes) {
    const method = data(change, "method"), after = data(change, "after");
    if (!slots(change, ["method", "before", "after"]) || data(change, "before") !== cursor || !integer(after, 0, 255) || (method !== "levelup" && method !== "battleitem" && method !== "faint" && method !== "faintbad")) return null;
    result.push({ method, before: cursor, after }); cursor = after;
  }
  return cursor === current ? { before, current, changes: result } : null;
}
function faint(value: unknown, id: string, source: EffectSource): FaintCellV2 {
  if (value === undefined) return { positiveOccurrences: [], coverage: unavailable("faint-not-supplied") };
  if (!slots(value, ["positiveOccurrences", "coverage"])) return { positiveOccurrences: [], coverage: invalid("invalid-faint-cell") };
  const rows = array(data(value, "positiveOccurrences")), cover = coverage(data(value, "coverage"));
  if (!rows) return { positiveOccurrences: [], coverage: invalid("invalid-faint-occurrences") };
  const result: FaintOccurrenceV2[] = [], hooks = new Set<string>(); let lastOrder = -1, lastOrdinal = 0;
  for (const row of rows) {
    const memberId = data(row, "memberId"), occurrenceOrdinal = data(row, "occurrenceOrdinal"), sourceOrder = data(row, "sourceOrder"), hookKey = data(row, "hookKey");
    if (!slots(row, ["memberId", "source", "occurrenceOrdinal", "sourceOrder", "hookKey"]) || memberId !== id || data(row, "source") !== source || !integer(occurrenceOrdinal, 1) || occurrenceOrdinal !== lastOrdinal + 1 || !integer(sourceOrder) || sourceOrder <= lastOrder || !identity(hookKey) || hooks.has(hookKey)) return { positiveOccurrences: result, coverage: invalid("invalid-faint-identity-or-order") };
    result.push({ memberId: id, source, occurrenceOrdinal, sourceOrder, hookKey }); hooks.add(hookKey); lastOrder = sourceOrder; lastOrdinal = occurrenceOrdinal;
  }
  // Invalid coverage alone cannot revoke an independently valid hook identity.
  return { positiveOccurrences: result, coverage: cover };
}
function combineFaint(observer: FaintCellV2, control: FaintCellV2): ResolvedFaintV2 {
  // Hook keys are the actual cross-source association; equal ordinals carry no cross-source meaning.
  const observerHooks = new Set(observer.positiveOccurrences.map(fact => fact.hookKey)), controlHooks = new Set(control.positiveOccurrences.map(fact => fact.hookKey));
  if (control.coverage.status === "complete" && observer.positiveOccurrences.some(fact => !controlHooks.has(fact.hookKey))) control.coverage = invalid("complete-coverage-misses-real-hook");
  if (observer.coverage.status === "complete" && control.positiveOccurrences.some(fact => !observerHooks.has(fact.hookKey))) observer.coverage = invalid("complete-coverage-misses-real-hook");
  const hooks = new Set<string>(), positiveOccurrences: FaintOccurrenceV2[] = [];
  for (const fact of [...observer.positiveOccurrences, ...control.positiveOccurrences]) if (!hooks.has(fact.hookKey)) { hooks.add(fact.hookKey); positiveOccurrences.push({ ...fact }); }
  const combined = observer.coverage.status === "complete" && control.coverage.status === "complete" ? { status: "complete" as const }
    : observer.coverage.status === "unavailable" || control.coverage.status === "unavailable" ? unavailable("faint-coverage-incomplete") : invalid("faint-coverage-conflict");
  return { positiveOccurrences, coverage: combined, sources: { observer, control } };
}
function disposition(result: ResolvedBattleEffects, source: EffectDisposition["source"], group: EffectDisposition["group"], value: EffectCoverage, memberId?: string): void {
  result.dispositions.push({ source, group, ...(memberId === undefined ? {} : { memberId }), status: value.status, ...(value.reason === undefined ? {} : { reason: value.reason }) });
}

/** Validate/detach only the finite auxiliary cells. Primary battle state and legal captures are owned elsewhere. */
export function resolveBattleEffects(input: ResolveBattleEffectsInput): ResolvedBattleEffects {
  const result: ResolvedBattleEffects = { binding: null, appearances: [], defeats: [], critical: {}, damage: {}, friendshipReplacements: {}, faint: {}, dispositions: [] };
  const expectedBinding = binding(data(input, "expectedBinding")), expectedContext = context(data(input, "expectedContext")), seal = data(input, "seal");
  const actualBinding = binding(data(seal, "binding")), actualContext = context(data(seal, "context"));
  // Source slots are optional reads: an unreadable observer cannot invalidate the independent control binding.
  const bindingOK = fields(seal, ["version", "binding", "context", "observer", "control"]) && expectedBinding !== null && actualBinding !== null && data(seal, "version") === 2 && JSON.stringify(expectedBinding) === JSON.stringify(actualBinding);
  const contextOK = expectedContext !== null && actualContext !== null && JSON.stringify(expectedContext) === JSON.stringify(actualContext);
  disposition(result, "shared", "binding", bindingOK ? { status: "complete" } : unavailable("seal-binding-mismatch-or-unavailable"));
  disposition(result, "shared", "context", contextOK ? { status: "complete" } : unavailable("seal-context-mismatch-or-unavailable"));
  if (bindingOK && contextOK) result.binding = actualBinding;
  const usable = result.binding !== null;
  const rawObserver = usable ? data(seal, "observer") : undefined, rawControl = usable ? data(seal, "control") : undefined;
  const observer = fields(rawObserver, ["appearances", "defeats", "members"]) ? rawObserver : undefined, control = fields(rawControl, ["members"]) ? rawControl : undefined;
  const rawObserverMembers = data(observer, "members"), rawControlMembers = data(control, "members");
  const observerMembers = object(rawObserverMembers) ? rawObserverMembers : undefined, controlMembers = object(rawControlMembers) ? rawControlMembers : undefined;
  // A real faint hook has one entity owner across both sources and enemy defeat records.
  const hookOwners = new Map<string, Set<string>>();
  const recordHook = (hookKey: string, id: string): void => { const ids = hookOwners.get(hookKey) ?? new Set<string>(); ids.add(id); hookOwners.set(hookKey, ids); };
  const pendingDefeats: { id: string; parsed: EffectCell<BattleDefeatV2[]> }[] = [];
  for (const group of ["appearances", "defeats"] as const) {
    const records = data(observer, group);
    if (!object(records)) { disposition(result, "observer", group, unavailable("observation-group-not-supplied")); continue; }
    for (const id of Object.keys(records)) {
      if (group === "appearances") {
        const parsed = cell(data(records, id), value => identity(id) && (expectedContext!.engineRosterIds.includes(id) || expectedContext!.foeIds.includes(id)) ? appearances(value, id) : null);
        disposition(result, "observer", group, parsed, id);
        if (parsed.status === "complete") result.appearances.push(...parsed.value);
      } else {
        const parsed = cell(data(records, id), value => identity(id) && expectedContext!.foeIds.includes(id) ? defeats(value, id, hookKey => recordHook(hookKey, id)) : null);
        pendingDefeats.push({ id, parsed });
      }
    }
  }
  result.appearances.sort((a, b) => a.sourceOrder - b.sourceOrder);
  const before = new Map<string, unknown>();
  for (const member of array(data(input, "membersBefore")) ?? []) {
    const id = data(member, "id");
    if (typeof id === "string") before.set(id, before.has(id) ? undefined : data(member, "friendship"));
  }
  const pairs = new Map<string, { observer: FaintCellV2; control: FaintCellV2 }>();
  for (const id of expectedContext?.playerIds ?? []) {
    const observed = data(observerMembers, id), controlled = data(controlMembers, id);
    const k = cell(data(observed, "critical"), value => integer(value) ? value : null), d = cell(data(observed, "damage"), damage);
    setOwn(result.critical, id, k); setOwn(result.damage, id, d);
    disposition(result, "observer", "critical", k, id);
    const f = cell(data(controlled, "friendship"), value => friendship(value, before.get(id)));
    disposition(result, "control", "friendship", f, id);
    if (f.status === "complete") setOwn(result.friendshipReplacements, id, f.value.current);
    const inEngine = expectedContext!.engineRosterIds.includes(id);
    pairs.set(id, inEngine ? { observer: faint(data(observed, "faint"), id, "observer"), control: faint(data(controlled, "faint"), id, "control") }
      : { observer: { positiveOccurrences: [], coverage: { status: "complete", reason: "not-in-engine-roster" } }, control: { positiveOccurrences: [], coverage: { status: "complete", reason: "not-in-engine-roster" } } });
  }
  for (const [id, pair] of pairs) for (const source of ["observer", "control"] as const) for (const fact of pair[source].positiveOccurrences) {
    recordHook(fact.hookKey, id);
  }
  for (const { id, parsed } of pendingDefeats) {
    const conflicted = parsed.status === "complete" && parsed.value.some(row => hookOwners.get(row.hookKey)!.size > 1);
    disposition(result, "observer", "defeats", conflicted ? invalid("defeat-hook-identity-conflict") : parsed, id);
    if (parsed.status === "complete") result.defeats.push(...parsed.value.filter(row => hookOwners.get(row.hookKey)!.size === 1));
  }
  result.defeats.sort((a, b) => a.sourceOrder - b.sourceOrder);
  for (const [id, pair] of pairs) {
    let ownershipConflict = false;
    for (const source of ["observer", "control"] as const) {
      if (pair[source].positiveOccurrences.some(fact => hookOwners.get(fact.hookKey)!.size > 1)) {
        ownershipConflict = true;
        pair[source] = { positiveOccurrences: pair[source].positiveOccurrences.filter(fact => hookOwners.get(fact.hookKey)!.size === 1), coverage: invalid("faint-hook-identity-conflict") };
      }
    }
    const resolved = combineFaint(pair.observer, pair.control); setOwn(result.faint, id, resolved);
    // A disputed entity or disproved observer reset coverage cannot authorize D/new R. Never rebuild D from control.
    if (result.damage[id]!.status === "complete") {
      if (ownershipConflict) setOwn(result.damage, id, invalid("damage-faint-hook-identity-conflict"));
      else if (resolved.sources.observer.coverage.reason === "complete-coverage-misses-real-hook") setOwn(result.damage, id, invalid("damage-faint-reset-coverage-conflict"));
    }
    disposition(result, "observer", "damage", result.damage[id]!, id);
    disposition(result, "observer", "faint", resolved.sources.observer.coverage, id); disposition(result, "control", "faint", resolved.sources.control.coverage, id);
  }
  return result;
}

export interface BattleReadinessInput {
  member: Pick<Member, "id" | "hp" | "readyToEvolve" | "evolutionReadiness">;
  faint: Pick<FaintCellV2, "positiveOccurrences" | "coverage">;
  damage?: EffectCell<BattleDamageV2>;
  healed?: boolean; evolved?: boolean;
  /** Supplied only after the complete ordered evolution scan accepts the member's whole new plan. */
  scan?: { status: EffectStatus; permitsNewReady: boolean };
}
export type BattleReadinessPlan = Pick<Required<Member>, "readyToEvolve" | "evolutionReadiness">;
/** Positive faint clears the old flag even after revival. A proved post-faint suffix can earn a new flag. */
export function planBattleReadiness(input: BattleReadinessInput): BattleReadinessPlan {
  if (input.member.hp === 0 || input.healed === true || input.evolved === true) return { readyToEvolve: false, evolutionReadiness: "known" };
  const d = cell(input.damage, damage);
  if (input.scan?.status === "complete" && input.scan.permitsNewReady && d.status === "complete" && d.value.total >= 49) return { readyToEvolve: true, evolutionReadiness: "known" };
  if (input.faint.positiveOccurrences.length) return { readyToEvolve: false, evolutionReadiness: "known" };
  if (!input.member.readyToEvolve) return { readyToEvolve: false, evolutionReadiness: "known" };
  return { readyToEvolve: true, evolutionReadiness: input.member.evolutionReadiness === "unknown" || input.faint.coverage.status !== "complete" ? "unknown" : "known" };
}
