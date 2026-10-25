/** Static WP31 identities and parameter contracts. No condition execution or host facts. */
import type { Content, EvolutionMethodId, SpeciesKey } from "./types.ts";
import { battleNameOf, speciesDataOf } from "./species-key.ts";
export type EvolutionParameterKind = "none" | "integer" | "item" | "move" | "type" | "species" | "flag";
export type EvolutionFamily = "level" | "item" | "trade" | "battle" | "event" | "post-only" | "none";
export interface EvolutionMethod { readonly id: EvolutionMethodId; readonly parameterKind: EvolutionParameterKind; readonly families: readonly EvolutionFamily[]; readonly after: "none" | "target-match-held-item-consume" | "extra-member-copy"; }
export const EVOLUTION_METHODS: readonly EvolutionMethod[] = Object.freeze([
  Object.freeze({ id: "Level", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelMale", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelFemale", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelDay", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelNight", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelMorning", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelAfternoon", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelEvening", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelNoWeather", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelSun", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelRain", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelSnow", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelSandstorm", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelCycling", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelSurfing", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelDiving", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelDarkness", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LevelDarkInParty", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "AttackGreater", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "AtkDefEqual", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "DefenseGreater", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Silcoon", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Cascoon", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Ninjask", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Happiness", parameterKind: "none", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HappinessMale", parameterKind: "none", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HappinessFemale", parameterKind: "none", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HappinessDay", parameterKind: "none", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HappinessNight", parameterKind: "none", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HappinessMove", parameterKind: "move", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HappinessMoveType", parameterKind: "type", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HappinessHoldItem", parameterKind: "item", families: Object.freeze(["level"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "MaxHappiness", parameterKind: "none", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Beauty", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HoldItem", parameterKind: "item", families: Object.freeze(["level"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "HoldItemMale", parameterKind: "item", families: Object.freeze(["level"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "HoldItemFemale", parameterKind: "item", families: Object.freeze(["level"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "DayHoldItem", parameterKind: "item", families: Object.freeze(["level"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "NightHoldItem", parameterKind: "item", families: Object.freeze(["level"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "HoldItemHappiness", parameterKind: "item", families: Object.freeze(["level"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "HasMove", parameterKind: "move", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HasMoveType", parameterKind: "type", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "HasInParty", parameterKind: "species", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Location", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "LocationFlag", parameterKind: "flag", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Region", parameterKind: "integer", families: Object.freeze(["level"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Item", parameterKind: "item", families: Object.freeze(["item"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "ItemMale", parameterKind: "item", families: Object.freeze(["item"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "ItemFemale", parameterKind: "item", families: Object.freeze(["item"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "ItemDay", parameterKind: "item", families: Object.freeze(["item"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "ItemNight", parameterKind: "item", families: Object.freeze(["item"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "ItemHappiness", parameterKind: "item", families: Object.freeze(["item"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Trade", parameterKind: "none", families: Object.freeze(["trade"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "TradeMale", parameterKind: "none", families: Object.freeze(["trade"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "TradeFemale", parameterKind: "none", families: Object.freeze(["trade"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "TradeDay", parameterKind: "none", families: Object.freeze(["trade"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "TradeNight", parameterKind: "none", families: Object.freeze(["trade"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "TradeItem", parameterKind: "item", families: Object.freeze(["trade"] as EvolutionFamily[]), after: "target-match-held-item-consume" }),
  Object.freeze({ id: "TradeSpecies", parameterKind: "species", families: Object.freeze(["trade"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "BattleDealCriticalHit", parameterKind: "integer", families: Object.freeze(["battle"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "EventAfterDamageTaken", parameterKind: "integer", families: Object.freeze(["battle", "event"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Event", parameterKind: "integer", families: Object.freeze(["event"] as EvolutionFamily[]), after: "none" }),
  Object.freeze({ id: "Shedinja", parameterKind: "none", families: Object.freeze(["post-only"] as EvolutionFamily[]), after: "extra-member-copy" }),
  Object.freeze({ id: "None", parameterKind: "none", families: Object.freeze(["none"] as EvolutionFamily[]), after: "none" }),
 ]);
export function evolutionMethod(id: unknown): EvolutionMethod | null { return EVOLUTION_METHODS.find(entry => entry.id === id) ?? null; }
/** PBS u lexical contract; compare decimal text BEFORE Number conversion (DEVIATION-PBS-INT-01). */
export function parseEvolutionInteger(text: string): { ok: true; value: number } | { ok: false; reason: "invalid-unsigned-integer" | "unsupported-integer-representation" } {
  if (!/^[0-9]+$/.test(text)) return { ok: false, reason: "invalid-unsigned-integer" };
  const decimal = text.replace(/^0+/, "") || "0", max = "9007199254740991";
  if (decimal.length > max.length || (decimal.length === max.length && decimal > max)) return { ok: false, reason: "unsupported-integer-representation" };
  return { ok: true, value: Number(decimal) };
}
/** World weather, independent of battle weather. WP31 §3.1. */
export const WORLD_WEATHER_EVOLUTION_METHOD: Readonly<Record<string, EvolutionMethodId>> = Object.freeze({ None: "LevelNoWeather", Sun: "LevelSun", Rain: "LevelRain", Storm: "LevelRain", HeavyRain: "LevelRain", Fog: "LevelRain", Snow: "LevelSnow", Blizzard: "LevelSnow", Sandstorm: "LevelSandstorm" });
/** All forward edges remain intact; the first registered matching predecessor is the static reverse relation. */
export function firstEvolutionPredecessor(content: Content, target: SpeciesKey): SpeciesKey | null {
  const targetData = speciesDataOf(content, {species:target.species,form:target.form});
  const targetForm = targetData?.defaultForm ?? targetData?.form ?? 0;
  const find = (form: number): SpeciesKey | null => {
    for (const key of content.registrationOrder ?? []) {
      const data = speciesDataOf(content, {species:key.species,form:key.form});
      for (const entry of data?.evolutions ?? []) if (entry.target === target.species && (entry.form ?? key.form) === form && battleNameOf(content,key) !== null) return {...key};
    }
    return null;
  };
  return find(targetForm) ?? (targetForm ? find(0) : null);
}
