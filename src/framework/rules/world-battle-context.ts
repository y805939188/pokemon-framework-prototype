/** Capture world facts once before opening a battle. Background time and visual tone are not business inputs. */
import { ENVIRONMENT, TERRAIN, WEATHER, normalizeInitialField } from "./initial-field";
import type { InitialField } from "./initial-field";
import { isWorldWeatherId, worldWeatherCategory } from "./world-data";
import type { EncounterTypeId, WorldFact, WorldWeatherCategory } from "./world-data";
import { isEncounterType } from "./encounter-selection";
import type { WorldBusinessFacts } from "./world-state";

export interface WorldFieldChoices {
  readonly weather: keyof typeof WEATHER | "inherit";
  readonly terrain: keyof typeof TERRAIN | "inherit";
  readonly environment: keyof typeof ENVIRONMENT | "inherit";
}
export interface CapturedWorldBallFacts { readonly timeOfDay: 0 | 1 | 2; readonly fishing: boolean }
export interface CapturedWorldBattleContext {
  readonly initialField: InitialField | undefined;
  readonly capture: CapturedWorldBallFacts;
}
export type WorldBattleFacts = Pick<WorldBusinessFacts, "hour" | "weather" | "mapMetadata">;
export interface WorldBattleProjectionInput {
  readonly facts: WorldBattleFacts;
  readonly source: EncounterTypeId | "event";
  readonly groundEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
  readonly facingEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
  readonly weatherSetsTerrain: boolean;
  readonly choices?: WorldFieldChoices;
}

/** MZ parsing happens before initialFieldMZ erases absent/none distinctions. */
export function parseWorldFieldChoices(weather: unknown, terrain: unknown, environment: unknown, blank: "none" | "inherit"): WorldFieldChoices {
  const parse = <T extends string>(raw: unknown, table: Readonly<Record<T, unknown>>, name: string): T | "inherit" => {
    const value = raw === undefined || raw === "" ? blank : raw;
    if (value === "inherit") return value;
    if (typeof value !== "string" || !Object.hasOwn(table, value)) throw new Error(`unsupported world battle ${name}`);
    // Membership in the finite table above proves the scalar type.
    return value as T;
  };
  return Object.freeze({ weather: parse(weather, WEATHER, "weather"), terrain: parse(terrain, TERRAIN, "terrain"), environment: parse(environment, ENVIRONMENT, "environment") });
}

function blocked(fact: { readonly status: "absent" | "invalid" | "unavailable"; readonly reason?: string }, name: string): { readonly status: "invalid" | "unavailable"; readonly reason: string } {
  return { status: fact.status === "invalid" ? "invalid" : "unavailable", reason: `${name}: ${fact.reason ?? fact.status}` };
}

/** Business cave metadata and wall-clock hour determine Dusk Ball; an encounter table never proves a cave. */
export function captureWorldBallFacts(facts: Pick<WorldBattleFacts, "hour" | "mapMetadata">, source: EncounterTypeId | "event"): WorldFact<CapturedWorldBallFacts> {
  if (source !== "event" && !isEncounterType(source)) return { status: "invalid", reason: "unknown encounter source" };
  if (facts.hour.status !== "value") return blocked(facts.hour, "world hour");
  const hour = facts.hour.value;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { status: "invalid", reason: "world hour must be 0..23" };
  if (facts.mapMetadata.status === "invalid" || facts.mapMetadata.status === "unavailable") return blocked(facts.mapMetadata, "map metadata");
  const environment = facts.mapMetadata.status === "value" ? facts.mapMetadata.value.environment : undefined;
  if (environment !== undefined && !Object.hasOwn(ENVIRONMENT, environment)) return { status: "invalid", reason: "invalid map battle environment" };
  const night = hour < 5 || hour >= 20;
  const timeOfDay = environment === "cave" || night ? 2 : hour >= 17 ? 1 : 0;
  const fishing = source === "OldRod" || source === "GoodRod" || source === "SuperRod";
  return { status: "value", value: Object.freeze({ timeOfDay, fishing }) };
}

function weatherForBattle(category: WorldWeatherCategory): keyof typeof WEATHER {
  switch (category) {
    case "Rain": return "rain";
    case "Hail": return "hail";
    case "Sandstorm": return "sandstorm";
    case "Sun": return "sun";
    case "None": case "Fog": return "none";
  }
}

export function projectWorldBattleContext(input: WorldBattleProjectionInput): WorldFact<CapturedWorldBattleContext> {
  const capture = captureWorldBallFacts(input.facts, input.source);
  if (capture.status !== "value") return capture;
  const choices = input.choices ?? { weather: "inherit", terrain: "inherit", environment: "inherit" };
  // Validate typed public callers too, before accepting explicit overrides.
  const accepted = parseWorldFieldChoices(choices.weather, choices.terrain, choices.environment, "inherit");
  let weather: keyof typeof WEATHER = "none", terrain: keyof typeof TERRAIN = "none", environment: keyof typeof ENVIRONMENT = "none";
  if (accepted.weather === "inherit" || accepted.terrain === "inherit" && input.weatherSetsTerrain) {
    const world = input.facts.weather;
    if (world.status !== "value") return blocked(world, "world weather");
    if (!isWorldWeatherId(world.value.type) || world.value.category !== worldWeatherCategory(world.value.type)) return { status: "invalid", reason: "inconsistent world weather identity/category" };
    weather = weatherForBattle(world.value.category);
    if (input.weatherSetsTerrain) terrain = world.value.type === "Storm" ? "electric" : world.value.type === "Fog" ? "misty" : "none";
  }
  if (accepted.weather !== "inherit") weather = accepted.weather;
  if (accepted.terrain !== "inherit") terrain = accepted.terrain;
  if (accepted.environment === "inherit") {
    const metadata = input.facts.mapMetadata;
    // captureWorldBallFacts already rejected unavailable/invalid metadata.
    const mapEnvironment = metadata.status === "value" ? metadata.value.environment : undefined;
    const tile = capture.value.fishing ? input.facingEnvironment : input.groundEnvironment;
    // A declared map environment takes precedence. Forest still needs the selected tile for ForestGrass.
    if (mapEnvironment !== undefined && mapEnvironment !== "forest") environment = mapEnvironment;
    else {
      if (tile.status !== "value") return blocked(tile, capture.value.fishing ? "facing environment" : "ground environment");
      if (!Object.hasOwn(ENVIRONMENT, tile.value)) return { status: "invalid", reason: "invalid tile battle environment" };
      environment = mapEnvironment === "forest" ? tile.value === "grass" || tile.value === "tallgrass" ? "forestgrass" : "forest" : tile.value;
    }
  } else environment = accepted.environment;
  const initialField = normalizeInitialField({ weather, terrain, environment });
  return { status: "value", value: Object.freeze({ initialField, capture: capture.value }) };
}
