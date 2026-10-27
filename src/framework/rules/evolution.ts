/** WP31/32 pure, ordered evolution checks. Facts are supplied by an owner, never inferred from logs. */
import { evolutionMethod, WORLD_WEATHER_EVOLUTION_METHOD } from "./evolution-data";
import { computeStats } from "./growth";
import { computedNature } from "./member-metadata";
import { catalogOf, itemOf } from "./item-catalog";
import { speciesDataOf } from "./species-key";
import type { Content, EvolutionEntry, Member, SpeciesKey } from "./types";

export type EvolutionFact<T> = { readonly status: "value"; readonly value: T }
  | { readonly status: "absent" }
  | { readonly status: "unavailable" | "invalid"; readonly reason?: string };
export type EvolutionFactInput<T> = EvolutionFact<T> | (() => EvolutionFact<T>);
export interface EvolutionMapMetadata { readonly region?: number; readonly flags?: readonly string[]; readonly darkMap?: boolean }
export interface EvolutionFacts {
  readonly hour?: EvolutionFactInput<number>;
  /** Exact world weather ID, not battle weather. Explicit absent means no world screen. */
  readonly weather?: EvolutionFactInput<string>;
  readonly cycling?: EvolutionFactInput<boolean>;
  readonly surfing?: EvolutionFactInput<boolean>;
  readonly diving?: EvolutionFactInput<boolean>;
  readonly mapId?: EvolutionFactInput<number>;
  /** absent means a valid current map was checked and has no author metadata. */
  readonly mapMetadata?: EvolutionFactInput<EvolutionMapMetadata>;
  readonly beauty?: EvolutionFactInput<number>;
  readonly moveTypes?: EvolutionFactInput<Readonly<Record<string, string>>>;
  readonly criticalHits?: EvolutionFactInput<number>;
  /** Complete direct-loss suffix since the last actual faint, including reset coverage. */
  readonly damageTaken?: EvolutionFactInput<number>;
}
export type EvolutionTrigger = { readonly family: "level" | "battle" }
  | { readonly family: "item"; readonly item: string }
  | { readonly family: "trade"; readonly partner?: Readonly<Member> | null }
  | { readonly family: "event"; readonly event?: number };
export interface EvolutionCheckInput {
  readonly member: Readonly<Member>;
  readonly content: Content;
  readonly trigger: EvolutionTrigger;
  readonly facts?: EvolutionFacts;
  /** Current global party; includes self and fainted members, excludes eggs when queried. */
  readonly party?: readonly Readonly<Member>[];
  readonly shadow?: boolean;
  readonly friendshipSoftCap?: boolean;
}
export interface EvolutionReadinessPlan { readonly readyToEvolve: true; readonly evolutionReadiness: "known" }
export interface EvolutionSelection {
  readonly memberId: string;
  readonly source: SpeciesKey;
  readonly target: SpeciesKey;
  readonly entry: EvolutionEntry;
  readonly entryIndex: number;
  readonly family: EvolutionTrigger["family"];
  readonly cancellable: boolean;
}
export type EvolutionBlocked = { readonly kind: "context-unavailable" | "invalid"; readonly fact: string; readonly reason: string; readonly entryIndex?: number };
export type EvolutionCheckResult = EvolutionBlocked
  | { readonly kind: "no-target"; readonly reason?: string; readonly readiness?: EvolutionReadinessPlan }
  | ({ readonly kind: "target"; readonly readiness?: EvolutionReadinessPlan } & EvolutionSelection);
const identity = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const unsigned = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const blocked = (kind: EvolutionBlocked["kind"], fact: string, reason: string): EvolutionBlocked => ({ kind, fact, reason });
type ReadFact<T> = EvolutionBlocked | { readonly kind: "value"; readonly value: T } | { readonly kind: "absent" };
function readFact<T>(input: EvolutionFactInput<T> | undefined, key: string, valid: (value: unknown) => boolean): ReadFact<T> {
  try {
    const fact = typeof input === "function" ? input() : input;
    if (!fact) return blocked("context-unavailable", key, "fact-not-supplied");
    if (fact.status === "unavailable") return blocked("context-unavailable", key, fact.reason ?? "provider-unavailable");
    if (fact.status === "invalid") return blocked("invalid", key, fact.reason ?? "provider-invalid");
    if (fact.status === "absent") return { kind: "absent" };
    if (fact.status !== "value" || !valid(fact.value)) return blocked("invalid", key, "invalid-fact-value");
    return { kind: "value", value: fact.value };
  } catch { return blocked("invalid", key, "provider-threw"); }
}
const isBlocked = (result: { readonly kind: string }): result is EvolutionBlocked => result.kind === "invalid" || result.kind === "context-unavailable";
function guardReason(member: Readonly<Member>, shadow = false, content?: Content): string | null {
  if (member.isEgg || shadow) return member.isEgg ? "egg" : "shadow";
  if (identity(itemOf(catalogOf(content), member.item)?.battleId ?? member.item) === "everstone") return "everstone";
  return identity(member.ability) === "battlebond" ? "battle-bond" : null;
}
function requiredFact<T>(input: EvolutionFactInput<T> | undefined, key: string, valid: (value: unknown) => boolean): Exclude<ReadFact<T>, { kind: "absent" }> {
  const read = readFact(input, key, valid);
  return read.kind === "absent" ? blocked("invalid", key, "required-fact-absent") : read;
}
function validMetadata(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as EvolutionMapMetadata;
  return (data.region === undefined || unsigned(data.region))
    && (data.darkMap === undefined || typeof data.darkMap === "boolean")
    && (data.flags === undefined || (Array.isArray(data.flags) && data.flags.every(flag => typeof flag === "string")));
}
function metadata(facts: EvolutionFacts): ReadFact<EvolutionMapMetadata> { return readFact(facts.mapMetadata, "mapMetadata", validMetadata); }
function timeMatches(input: EvolutionCheckInput, period: string): boolean | EvolutionBlocked {
  const hour = requiredFact(input.facts?.hour, "hour", value => unsigned(value) && value < 24);
  if (isBlocked(hour)) return hour;
  const h = hour.value;
  switch (period) {
    case "Day": return h >= 5 && h < 20;
    case "Night": return h < 5 || h >= 20;
    case "Morning": return h >= 5 && h < 10;
    case "Afternoon": return h >= 14 && h < 17;
    case "Evening": return h >= 17 && h < 20;
    default: return blocked("invalid", "hour", "unknown-time-period");
  }
}
function hasMove(input: EvolutionCheckInput, move: string): boolean { return input.member.moves.some(slot => identity(slot.id) === identity(move)); }
function hasMoveType(input: EvolutionCheckInput, type: string): boolean | EvolutionBlocked {
  if (input.member.moves.length === 0) return false;
  const read = requiredFact(input.facts?.moveTypes, "moveTypes", value => !!value && typeof value === "object" && !Array.isArray(value));
  if (isBlocked(read)) return read;
  for (const slot of input.member.moves) {
    const key = Object.keys(read.value).find(id => identity(id) === identity(slot.id));
    if (key === undefined || typeof read.value[key] !== "string") return blocked("invalid", "moveTypes", `missing-move-type:${slot.id}`);
    if (identity(read.value[key]!) === identity(type)) return true;
  }
  return false;
}
function partyMatches(input: EvolutionCheckInput, predicate: (member: Readonly<Member>) => boolean | EvolutionBlocked): boolean | EvolutionBlocked {
  if (!input.party) return blocked("context-unavailable", "party", "current-party-not-supplied");
  for (const member of input.party) {
    if (member.isEgg) continue;
    const match = predicate(member);
    if (match !== false) return match;
  }
  return false;
}
function checkCondition(input: EvolutionCheckInput, entry: EvolutionEntry): boolean | EvolutionBlocked | EvolutionReadinessPlan {
  const m = input.member, facts = input.facts ?? {}, method = entry.method;
  const happy = () => (m.friendship ?? 0) >= (input.friendshipSoftCap ? 160 : 220);
  const held = () => identity(m.item) === identity(String(entry.parameter));
  const male = () => m.gender === "M", female = () => m.gender === "F";
  // Every integer parameter here is a level threshold except Beauty, event and battle methods.
  if ((method.startsWith("Level") || ["AttackGreater", "AtkDefEqual", "DefenseGreater", "Silcoon", "Cascoon", "Ninjask"].includes(method)) && m.level < Number(entry.parameter)) return false;
  switch (method) {
    case "Level": case "Ninjask": return true;
    case "LevelMale": return male();
    case "LevelFemale": return female();
    case "LevelDay": case "LevelNight": case "LevelMorning": case "LevelAfternoon": case "LevelEvening": return timeMatches(input, method.slice(5));
    case "LevelNoWeather": case "LevelSun": case "LevelRain": case "LevelSnow": case "LevelSandstorm": {
      const weather = readFact(facts.weather, "weather", value => typeof value === "string" && Object.hasOwn(WORLD_WEATHER_EVOLUTION_METHOD, value));
      return isBlocked(weather) ? weather : weather.kind === "absent" ? false : WORLD_WEATHER_EVOLUTION_METHOD[weather.value] === method;
    }
    case "LevelCycling": case "LevelSurfing": case "LevelDiving": {
      const key = method === "LevelCycling" ? "cycling" : method === "LevelSurfing" ? "surfing" : "diving";
      const vehicle = readFact(facts[key], key, value => typeof value === "boolean");
      return isBlocked(vehicle) ? vehicle : vehicle.kind === "value" && vehicle.value;
    }
    case "LevelDarkness": {
      const data = metadata(facts);
      return isBlocked(data) ? data : data.kind === "value" && data.value.darkMap === true;
    }
    case "LevelDarkInParty": return partyMatches(input, member => {
      const data = speciesDataOf(input.content, member);
      return !data?.types ? blocked("invalid", "party", `missing-party-types:${member.id}`) : data.types.some(type => identity(type) === "dark");
    });
    case "AttackGreater": case "AtkDefEqual": case "DefenseGreater": {
      const data = speciesDataOf(input.content, m);
      if (!data) return blocked("invalid", "member", "unknown-source-species");
      const stats = computeStats(data.base, m.ivs, m.evs, m.level, computedNature(m));
      return method === "AttackGreater" ? stats.atk > stats.def : method === "AtkDefEqual" ? stats.atk === stats.def : stats.atk < stats.def;
    }
    case "Silcoon": case "Cascoon": {
      if (!unsigned(m.personalID) || m.personalID > 0xffffffff) return blocked("invalid", "personalID", "invalid-personal-id");
      return method === "Silcoon" ? (m.personalID >>> 16) % 10 < 5 : (m.personalID >>> 16) % 10 >= 5;
    }
    case "Happiness": return happy();
    case "HappinessMale": return happy() && male();
    case "HappinessFemale": return happy() && female();
    case "HappinessDay": case "HappinessNight": return happy() && timeMatches(input, method.slice(9));
    case "HappinessMove": return happy() && hasMove(input, String(entry.parameter));
    case "HappinessMoveType": return happy() && hasMoveType(input, String(entry.parameter));
    case "HappinessHoldItem": case "HoldItemHappiness": return held() && happy();
    case "MaxHappiness": return m.friendship === 255;
    case "Beauty": {
      const beauty = readFact(facts.beauty, "beauty", unsigned);
      return isBlocked(beauty) ? beauty : beauty.kind === "value" && beauty.value >= Number(entry.parameter);
    }
    case "HoldItem": case "TradeItem": return held();
    case "HoldItemMale": return held() && male();
    case "HoldItemFemale": return held() && female();
    case "DayHoldItem": return held() && timeMatches(input, "Day");
    case "NightHoldItem": return held() && timeMatches(input, "Night");
    case "HasMove": return hasMove(input, String(entry.parameter));
    case "HasMoveType": return hasMoveType(input, String(entry.parameter));
    case "HasInParty": return partyMatches(input, member => member.species === entry.parameter);
    case "Location": {
      const map = requiredFact(facts.mapId, "mapId", value => unsigned(value) && value > 0);
      return isBlocked(map) ? map : map.value === entry.parameter;
    }
    case "LocationFlag": case "Region": {
      const data = metadata(facts);
      if (isBlocked(data)) return data;
      if (data.kind === "absent") return false;
      return method === "Region" ? data.value.region === entry.parameter : (data.value.flags ?? []).some(flag => flag.toLowerCase() === String(entry.parameter).toLowerCase());
    }
    case "Item": case "ItemMale": case "ItemFemale": case "ItemDay": case "ItemNight": case "ItemHappiness": {
      if (input.trigger.family !== "item" || identity(input.trigger.item) !== identity(String(entry.parameter))) return false;
      if (method === "ItemMale") return male();
      if (method === "ItemFemale") return female();
      if (method === "ItemDay" || method === "ItemNight") return timeMatches(input, method.slice(4));
      return method === "ItemHappiness" ? happy() : true;
    }
    case "Trade": return true;
    case "TradeMale": return male();
    case "TradeFemale": return female();
    case "TradeDay": case "TradeNight": return timeMatches(input, method.slice(5));
    case "TradeSpecies": {
      // Approved compatibility behavior: compare incoming's own base species, not outgoing's species.
      if (m.species !== entry.parameter) return false;
      if (input.trigger.family !== "trade" || !input.trigger.partner) return blocked("invalid", "partner", "trade-partner-missing");
      return identity(input.trigger.partner.item) !== "everstone";
    }
    case "BattleDealCriticalHit": {
      const critical = readFact(facts.criticalHits, "criticalHits", unsigned);
      return isBlocked(critical) ? critical : critical.kind === "value" && critical.value >= Number(entry.parameter);
    }
    case "EventAfterDamageTaken": {
      if (input.trigger.family === "battle") {
        const damage = readFact(facts.damageTaken, "damageTaken", unsigned);
        if (isBlocked(damage)) return damage;
        return damage.kind === "value" && damage.value >= 49 ? { readyToEvolve: true, evolutionReadiness: "known" } : false;
      }
      if (input.trigger.family !== "event" || (input.trigger.event ?? 0) !== entry.parameter || !m.readyToEvolve) return false;
      return m.evolutionReadiness === "unknown" ? blocked("context-unavailable", "evolutionReadiness", "readiness-uncertain") : true;
    }
    case "Event": return input.trigger.family === "event" && (input.trigger.event ?? 0) === entry.parameter;
    case "Shedinja": case "None": return false;
  }
}

/** Target form is latched with the selection. Only the approved regional destination subset is implemented. */
export function resolveEvolutionTarget(member: Readonly<Member>, entry: Readonly<EvolutionEntry>, content: Content, facts: EvolutionFacts = {}): SpeciesKey | EvolutionBlocked {
  const targetData = speciesDataOf(content, { species: entry.target, form: entry.form ?? 0 });
  if (!targetData) return blocked("invalid", "target", "unknown-target-species");
  if (targetData.defaultForm !== undefined) return { species: entry.target, form: targetData.defaultForm };
  const targetForm = entry.form ?? targetData.form ?? 0;
  if (targetForm > 0) return { species: entry.target, form: targetForm };
  let form = member.form ?? 0;
  const rule = identity(speciesDataOf(content, member)?.ruleSpecies ?? "");
  const region = ["pikachu", "exeggcute", "cubone"].includes(rule) ? 1 : ["koffing", "mimejr"].includes(rule) ? 2 : null;
  if (region !== null && form < 2) {
    const data = metadata(facts);
    if (isBlocked(data)) return data;
    form = data.kind === "value" && data.value.region === region ? 1 : 0;
  }
  return { species: entry.target, form };
}

/** A query returns a complete plan; an unknown later condition discards earlier tentative readiness. */
export function scanEvolution(input: EvolutionCheckInput): EvolutionCheckResult {
  const m = input.member;
  const guard = guardReason(m, input.shadow, input.content);
  if (guard) return { kind: "no-target", reason: guard };
  const sourceData = speciesDataOf(input.content, m);
  if (!sourceData) return blocked("invalid", "member", "unknown-source-species");
  if (input.trigger.family === "event" && !unsigned(input.trigger.event ?? 0)) return blocked("invalid", "event", "invalid-event-number");
  let readiness: EvolutionReadinessPlan | undefined;
  const entries = sourceData.evolutions ?? [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex]!;
    const method = evolutionMethod(entry.method);
    if (!method) return { ...blocked("invalid", "entry", "unknown-evolution-method"), entryIndex };
    if (!method.families.includes(input.trigger.family)) continue;
    if (method.parameterKind === "integer" ? !unsigned(entry.parameter) : method.parameterKind !== "none" && (typeof entry.parameter !== "string" || !entry.parameter)) return { ...blocked("invalid", "entry", "invalid-evolution-parameter"), entryIndex };
    const condition = checkCondition(input, entry);
    if (typeof condition === "object") {
      if ("kind" in condition) return { ...condition, entryIndex };
      readiness = condition;
    } else if (condition) {
      const target = resolveEvolutionTarget(m, entry, input.content, input.facts);
      if ("kind" in target) return { ...target, entryIndex };
      return { kind: "target", memberId: m.id, source: { species: m.species, form: m.form ?? 0 }, target, entry: { ...entry }, entryIndex,
        family: input.trigger.family, cancellable: input.trigger.family !== "item" && input.trigger.family !== "trade", ...(readiness ? { readiness } : {}) };
    }
  }
  return { kind: "no-target", ...(readiness ? { readiness } : {}) };
}

export interface PostBattleEvolutionInput extends Omit<EvolutionCheckInput, "trigger"> {
  /** absent is legal for a newly received member; unavailable means a damaged expected L0. */
  readonly levelBefore: EvolutionFactInput<number>;
  readonly checkFainted?: boolean;
  readonly eligibleHp?: number;
}
/** Upgrade family has priority. A selected/cancelled upgrade never falls through to battle achievements. */
export function planPostBattleEvolution(input: PostBattleEvolutionInput): EvolutionCheckResult {
  const guard = guardReason(input.member, input.shadow, input.content);
  if (guard) return { kind: "no-target", reason: guard };
  if (input.checkFainted === false && (input.eligibleHp ?? input.member.hp) <= 0) return { kind: "no-target", reason: "ineligible-member" };
  const entries = speciesDataOf(input.content, input.member)?.evolutions ?? [];
  if (entries.some(entry => evolutionMethod(entry.method)?.families.includes("level"))) {
    const l0 = readFact(input.levelBefore, "levelBefore", value => unsigned(value) && value > 0);
    if (isBlocked(l0)) return l0;
    if (l0.kind === "value" && input.member.level > l0.value) {
      const level = scanEvolution({ ...input, trigger: { family: "level" } });
      if (level.kind !== "no-target") return level;
    }
  }
  return scanEvolution({ ...input, trigger: { family: "battle" } });
}

export interface EvolutionBattleRecord { readonly criticalHits: number; readonly damageTaken: number }
/** Already normalized source-domain facts. This helper is not evidence that a live hook supplies them. */
export type EvolutionBattleFact = { readonly kind: "critical-hit"; readonly playerOwned: boolean; readonly critical: boolean; readonly unaffected: boolean; readonly absorbed: boolean }
  | { readonly kind: "direct-damage"; readonly playerOwned: boolean; readonly hpLost: number }
  | { readonly kind: "faint"; readonly playerOwned: boolean }
  | { readonly kind: "other-hp-loss" };
export function applyEvolutionBattleFact(record: EvolutionBattleRecord, fact: EvolutionBattleFact): EvolutionBattleRecord {
  if (!unsigned(record.criticalHits) || !unsigned(record.damageTaken)) throw new RangeError("invalid-evolution-battle-record");
  let criticalHits = record.criticalHits, damageTaken = record.damageTaken;
  if (fact.kind === "critical-hit" && fact.playerOwned && fact.critical && !fact.unaffected && !fact.absorbed) criticalHits++;
  if (fact.kind === "direct-damage" && fact.playerOwned) {
    if (!unsigned(fact.hpLost)) throw new RangeError("invalid-direct-damage");
    damageTaken += fact.hpLost;
  }
  if (fact.kind === "faint" && fact.playerOwned) damageTaken = 0;
  if (!unsigned(criticalHits) || !unsigned(damageTaken)) throw new RangeError("evolution-battle-record-overflow");
  return { criticalHits, damageTaken };
}
