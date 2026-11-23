/** Static world contracts. No host access, persistent owner, RNG or action dispatch. */
import type { Fact } from "./fact";
import type { ENVIRONMENT } from "./initial-field";

export type WorldFact<T> = Fact<T>;
export type WorldDirection = 2 | 4 | 6 | 8;
export interface WorldPoint { mapId: number; x: number; y: number }
export interface WorldLocation extends WorldPoint { direction: WorldDirection }

export const WORLD_WEATHER_IDS = ["None", "Rain", "Storm", "Snow", "Blizzard", "Sandstorm", "HeavyRain", "Sun", "Fog"] as const;
export type WorldWeatherId = (typeof WORLD_WEATHER_IDS)[number];
export function isWorldWeatherId(value: unknown): value is WorldWeatherId {
  return typeof value === "string" && WORLD_WEATHER_IDS.some(id => id === value);
}
export type WorldWeatherCategory = "None" | "Rain" | "Hail" | "Sandstorm" | "Sun" | "Fog";
export interface WorldWeatherIntent { type: WorldWeatherId; strength: number; durationFrames: number }
export function worldWeatherCategory(id: WorldWeatherId): WorldWeatherCategory {
  switch (id) {
    case "Storm": case "HeavyRain": case "Rain": return "Rain";
    case "Snow": case "Blizzard": return "Hail";
    case "None": case "Sandstorm": case "Sun": case "Fog": return id;
    default: throw new RangeError("unknown world weather identity");
  }
}

/** WP36's 26 static identities; listing a type does not enable its action family. */
export const ENCOUNTER_TYPES = {
  Land: { category: "land", stepChance: 21 }, LandDay: { category: "land", stepChance: 21 },
  LandNight: { category: "land", stepChance: 21 }, LandMorning: { category: "land", stepChance: 21 },
  LandAfternoon: { category: "land", stepChance: 21 }, LandEvening: { category: "land", stepChance: 21 },
  PokeRadar: { category: "land", stepChance: 20 },
  Cave: { category: "cave", stepChance: 5 }, CaveDay: { category: "cave", stepChance: 5 },
  CaveNight: { category: "cave", stepChance: 5 }, CaveMorning: { category: "cave", stepChance: 5 },
  CaveAfternoon: { category: "cave", stepChance: 5 }, CaveEvening: { category: "cave", stepChance: 5 },
  Water: { category: "water", stepChance: 2 }, WaterDay: { category: "water", stepChance: 2 },
  WaterNight: { category: "water", stepChance: 2 }, WaterMorning: { category: "water", stepChance: 2 },
  WaterAfternoon: { category: "water", stepChance: 2 }, WaterEvening: { category: "water", stepChance: 2 },
  OldRod: { category: "fishing", stepChance: 0 }, GoodRod: { category: "fishing", stepChance: 0 },
  SuperRod: { category: "fishing", stepChance: 0 }, RockSmash: { category: "none", stepChance: 50 },
  HeadbuttLow: { category: "none", stepChance: 0 }, HeadbuttHigh: { category: "none", stepChance: 0 },
  BugContest: { category: "contest", stepChance: 21 },
} as const;
export type EncounterTypeId = keyof typeof ENCOUNTER_TYPES;

export interface WorldMapFields {
  outdoor?: boolean;
  alwaysBicycle?: boolean;
  weather?: { type: WorldWeatherId; chance: number };
  environment?: keyof typeof ENVIRONMENT;
  mapPosition?: { regionId: number; x: number; y: number };
  mapSize?: { width: number; shape: string };
  healingSpot?: WorldPoint;
}
export interface RegionMapPoint {
  x: number; y: number;
  nameKey?: string;
  descriptionKey?: string;
  healingSpot?: WorldPoint;
  /** Missing is visible; an explicit nonpositive value remains hidden. */
  switchId?: number;
}
export interface RegionMapRecord { id: number; nameKey: string; points: RegionMapPoint[] }
export interface ConnectionEndpoint {
  mapId: number;
  anchor: "N" | "S" | "E" | "W" | { x: number; y: number };
  offset: number;
}
export interface MapConnectionRecord { a: ConnectionEndpoint; b: ConnectionEndpoint }
export interface WorldEncounterSlot { species: string; weight: number; minLevel: number; maxLevel: number }
export interface WorldEncounterRecord {
  mapId: number;
  version: number;
  types: Partial<Record<EncounterTypeId, { stepChance: number; slots: WorldEncounterSlot[] }>>;
}
export interface EncounterSource { source: string; tables: WorldEncounterRecord[] }
export interface RegionMapSource { source: string; regions: RegionMapRecord[] }
export interface MapConnectionSource { source: string; connections: MapConnectionRecord[] }
export interface WorldContent {
  encounters?: EncounterSource;
  regionMaps?: RegionMapSource;
  mapConnections?: MapConnectionSource;
}
