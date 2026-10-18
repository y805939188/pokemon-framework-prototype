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
}
