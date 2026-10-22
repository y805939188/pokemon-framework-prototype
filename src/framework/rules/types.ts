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

/** WP18/WP24: the original owner, independent of the current host actor or UI language. */
export interface Owner {
  id: number;
  name: string;
  gender: 0 | 1 | 2;
  language: number;
}

export interface MemberOrigin {
  /** null means historical information is unknown, never the current map/time. */
  method: number | null;
  map: number | null;
  text: string;
  level: number;
  receivedAt: number | null;
  hatchedMap: number;
  hatchedAt: number | null;
  compatibilityDefault: boolean;
}

/**
 * A party/box member. Two identities of the species exist (decision D5-3, step 5.0):
 *  - persistent (the save, schema 4): `species` is the author's content id and `form` the form number;
 *  - battle (sessions, protocol v1): `species` is the Showdown species name and there is no `form`.
 * rules/species-key.ts converts between them; foe records in a battle carry the battle shape with some fields absent.
 */
export interface Member {
  id: string;
  species: string;
  /** Form number of a persistent member (WP03 §3.2, WP21); absent on battle records. */
  form?: number;
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
  /** Individual metadata is required by schema 5; optional here because frozen v1 battle records omit it. */
  personalID?: number;
  owner?: Owner;
  ownerCompatibilityDefault?: boolean;
  origin?: MemberOrigin;
  /** Requested slot is retained even if a missing hidden slot resolves to a natural ability. null = trusted override, unknown slot. */
  abilityIndex?: number | null;
  effectiveAbilityIndex?: number | null;
  shiny?: boolean;
  superShiny?: boolean;
  firstMoves?: string[];
  markings?: number[];
  ribbons?: string[];
  cannotStore?: boolean;
  cannotRelease?: boolean;
  isEgg?: boolean;
  mail?: string | null;
  readyToEvolve?: boolean;
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
  abilities?: (string | null)[];
  hiddenAbilities?: (string | null)[];
  happiness?: number;
  /** Gender rule (WP19 §3.2), from the pinned Showdown data. Needed to create an individual. */
  gender?: GenderRule;
  /** The author's content id of this species (e.g. "pidgey"): with `form`, the persistent key of members (decision D5-3). */
  contentId?: string;
  /** Stable rule family from the data adapter (baseSpecies), independent of author ID and battle form name. */
  ruleSpecies?: string;
  /** Form number of this record (0 = the base form). */
  form?: number;
}

/** The persistent identity of a species: content id + form number (decision D5-3; WP03 §3.2 "(species, form)"). */
export interface SpeciesKey {
  species: string;
  form: number;
}

/** A move as content and creation need it: Showdown id, display name and base PP. */
export interface MoveData {
  id: string;
  name: string;
  pp: number;
}

/** A one-time reward package (content grants.json): members by Showdown species name (battle identity), items, money. */
export interface Grant {
  id: string;
  members: { species: string; level: number; form?: number; item?: string }[];
  items: Record<string, number>;
  money: number;
}

export interface Content {
  species: Record<string, SpeciesData>;
  meta?: ContentMeta;
  /** Every learnset move by its display name (the learnset stores names), with id and PP. Needed to create an individual. */
  moves?: Record<string, MoveData>;
  /** Author content id -> Showdown name of its base form (form 0). */
  speciesIds?: Record<string, string>;
  /** Content id -> form number -> Showdown name. Absent in fixture content, whose content ids are the Showdown names. */
  forms?: Record<string, Record<string, string>>;
  /** Showdown name -> persistent key (the reverse of `forms`). Absent in fixture content (see `forms`). */
  speciesKeys?: Record<string, SpeciesKey>;
  grants?: Record<string, Grant>;
  /** Rule configuration overrides of the content (rules/config.ts); absent = the Gen 8 defaults. */
  settings?: Record<string, number>;
}

/** What the content layer needs to know about Showdown's static data (the battle adapter implements it). */
export interface DexLookup {
  species(showdownId: string): { name: string; baseSpecies: string; baseStats: Stats; abilities?: (string | null)[]; hiddenAbilities?: (string | null)[]; gender?: GenderRule } | null;
  move(showdownId: string): { name: string; id?: string; pp?: number } | null;
  /** Gen 8 level-up learn levels per move id (Showdown's learnset data), or null for an unknown species. */
  levelUpMoves(showdownId: string): Record<string, number[]> | null;
  /** The pinned Showdown build the answers come from (recorded into reports). */
  sha(): string;
  /** Controlled held-item sources only; never queried before source/capability checks. */
  heldItem?(id: string): { holdable: boolean; mail: boolean } | null;
}

/** Where a Content object came from; carried so logs and reports say which one a battle used. */
export interface ContentMeta {
  kind: "fixture" | "sample";
  id: string;
  inputsHash?: string;
  /** Runtime assembly checked the Showdown source; not a developer capability or persistent state. */
  showdownSourceChecked?: true;
}
