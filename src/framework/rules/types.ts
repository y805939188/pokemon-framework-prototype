/** Shared plain-data types of the game-rule layer. No host (MZ) or Showdown types appear here. */
export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type Stats = Record<StatKey, number>;
export type PartialStats = Partial<Stats>;
export type CurveId = "medium" | "fast" | "slow" | "parabolic" | "erratic" | "fluctuating";

export interface MoveSlot {
  id: string;
  pp: number;
  maxpp: number;
}

/** A persistent party/box member. Foe records in a battle carry the same shape with some fields absent. */
export interface Member {
  id: string;
  species: string;
  nickname?: string | null;
  level: number;
  exp: number;
  hp: number;
  status: string;
  statusCount?: number;
  moves: MoveSlot[];
  item: string;
  ability: string;
  nature: string;
  gender: string;
  ivs?: PartialStats;
  evs?: PartialStats;
  friendship?: number;
  ball?: string;
  ot?: string;
}

/** How a new individual's gender is decided (WP19 §3.2): fixed "M"/"F"/"N", or a female chance out of 256 (low 8 bits of the personal id < chance -> female). */
export type GenderRule = "M" | "F" | "N" | number;

export interface SpeciesData {
  base: Stats;
  growth: CurveId;
  baseExp: number;
  evYield: PartialStats;
  catchRate: number;
  learnset: Record<number, string[]>;
  /** Text key of the display name (content-provided); absent in fixtures, which fall back to the Showdown name. */
  nameKey?: string;
  /** Natural ability slots 0 and 1 (WP19 §3.4), from the pinned Showdown data. Needed to create an individual. */
  abilities?: string[];
  /** Gender rule (WP19 §3.2), from the pinned Showdown data. Needed to create an individual. */
  gender?: GenderRule;
  /** The author's content id of this species (e.g. "pidgey"); the persistent key stays the Showdown name (decision D2). */
  contentId?: string;
}

/** A move as content and creation need it: Showdown id, display name and base PP. */
export interface MoveData {
  id: string;
  name: string;
  pp: number;
}

/** A one-time reward package (content grants.json): members by Showdown species name, items, money. */
export interface Grant {
  id: string;
  members: { species: string; level: number }[];
  items: Record<string, number>;
  money: number;
}

export interface Content {
  species: Record<string, SpeciesData>;
  meta?: ContentMeta;
  /** Every learnset move by its display name (the learnset stores names), with id and PP. Needed to create an individual. */
  moves?: Record<string, MoveData>;
  /** Author content id -> persistent species key (Showdown name). */
  speciesIds?: Record<string, string>;
  grants?: Record<string, Grant>;
}

/** What the content layer needs to know about Showdown's static data (the battle adapter implements it). */
export interface DexLookup {
  species(showdownId: string): { name: string; baseStats: Stats; abilities?: string[]; gender?: GenderRule } | null;
  move(showdownId: string): { name: string; id?: string; pp?: number } | null;
  /** Gen 8 level-up learn levels per move id (Showdown's learnset data), or null for an unknown species. */
  levelUpMoves(showdownId: string): Record<string, number[]> | null;
  /** The pinned Showdown build the answers come from (recorded into reports). */
  sha(): string;
}

/** Where a Content object came from; carried so logs and reports say which one a battle used. */
export interface ContentMeta {
  kind: "fixture" | "sample";
  id: string;
  inputsHash?: string;
}
