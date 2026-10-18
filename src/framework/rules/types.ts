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

export interface SpeciesData {
  base: Stats;
  growth: CurveId;
  baseExp: number;
  evYield: PartialStats;
  catchRate: number;
  learnset: Record<number, string[]>;
}

export interface Content {
  species: Record<string, SpeciesData>;
  meta?: ContentMeta;
}

/** What the content layer needs to know about Showdown's static data (the battle adapter implements it). */
export interface DexLookup {
  species(showdownId: string): { name: string; baseStats: Stats } | null;
  move(showdownId: string): { name: string } | null;
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
