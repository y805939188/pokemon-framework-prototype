/** Shared plain-data types of the game-rule layer. No host (MZ) or Showdown types appear here. */
export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type Stats = Record<StatKey, number>;
export type PartialStats = Partial<Stats>;
export type CurveId = "medium" | "fast" | "slow" | "parabolic" | "erratic" | "fluctuating";

export interface MoveSlot {
  id: string;
  pp: number;
  maxpp: number;
  /** Required in persistent schema 6, absent in frozen v1 battle records. */
  ppUps?: number;
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
  statNature?: string | null;
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
  /** Schema7 persistent fields, deliberately absent from frozen v1 projections. */
  evolutionReadiness?: "known" | "unknown";
  cannotTrade?: boolean;
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
  evolutions?: EvolutionEntry[];
  tutorMoves?: string[];
  /** Canonical runtime move references. Absence means author data unavailable, not an empty list. */
  eggMoves?: string[];
  types?: string[];
  flags?: string[];
  defaultForm?: number;
  displayForm?: number;
  pokedexForm?: number;
  categoryKey?: string;
  entryKey?: string;
  heightDm?: number;
  weightHg?: number;
  color?: string;
  shape?: string;
  formName?: string | null;
  formNameKey?: string;
  dexSortKeys?: Record<string, string>;
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
  /** Absent = explicit legacy compatibility catalog; an empty catalog stays empty. */
  items?: import('./item-catalog').ItemCatalog;
  shops?: Record<string, import('./item-catalog').ShopDefinition>;
  species: Record<string, SpeciesData>;
  registrationOrder?: SpeciesKey[];
  regionalDex?: RegionalDex;
  mapMetadata?: MapMetadata;
  meta?: ContentMeta;
  /** Every learnset move by its display name (the learnset stores names), with id and PP. Needed to create an individual. */
  moves?: Record<string, MoveData>;
  /** Complete source-checked ability directory, including trusted overrides outside a species slot list. */
  abilities?: Record<string, { id: string; name: string }>;
  /** Author content id -> Showdown name of its base form (form 0). */
  speciesIds?: Record<string, string>;
  /** Content id -> form number -> Showdown name. Absent in fixture content, whose content ids are the Showdown names. */
  forms?: Record<string, Record<string, string>>;
  /** Showdown name -> persistent key (the reverse of `forms`). Absent in fixture content (see `forms`). */
  speciesKeys?: Record<string, SpeciesKey>;
  grants?: Record<string, Grant>;
  /** Rule configuration overrides of the content (rules/config.ts); absent = the Gen 8 defaults. */
  settings?: import("./settings-types").RuleOverrides;
}

/** What the content layer needs to know about Showdown's static data (the battle adapter implements it). */
export interface DexLookup {
  species(showdownId: string): { name: string; baseSpecies: string; types?: string[]; baseStats: Stats; abilities?: (string | null)[]; hiddenAbilities?: (string | null)[]; gender?: GenderRule } | null;
  /** Optional complete pinned move directory, read only after the source gate. Needed for saved moves outside current learnsets. */
  allMoves?(): MoveData[];
  allAbilities?(): { id: string; name: string }[];
  /** Complete registered, non-pseudo type directory in definition order. Optional adapter capability. */
  allTypes?(): { name: string }[];
  type?(id: string): { name: string } | null;
  move(showdownId: string): { name: string; id?: string; pp?: number } | null;
  /** Gen 8 level-up learn levels per move id (Showdown's learnset data), or null for an unknown species. */
  levelUpMoves(showdownId: string): Record<string, number[]> | null;
  /** The pinned Showdown build the answers come from (recorded into reports). */
  sha(): string;
  abilityInfo?(id: string): { name: string; description: string } | null;
  moveDetails?(id: string): { name: string; type: string; category: string; power: number | null; accuracy: number; description: string } | null;
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
  compiledSemantics?: number;
  showdownSha?: string;
  contentIdentity?: string;
}

/** B static progression contracts. No battle facts, pending workflow or public result fields. */
export type EvolutionMethodId = "Level" | "LevelMale" | "LevelFemale" | "LevelDay" | "LevelNight" | "LevelMorning" | "LevelAfternoon" | "LevelEvening" | "LevelNoWeather" | "LevelSun" | "LevelRain" | "LevelSnow" | "LevelSandstorm" | "LevelCycling" | "LevelSurfing" | "LevelDiving" | "LevelDarkness" | "LevelDarkInParty" | "AttackGreater" | "AtkDefEqual" | "DefenseGreater" | "Silcoon" | "Cascoon" | "Ninjask" | "Happiness" | "HappinessMale" | "HappinessFemale" | "HappinessDay" | "HappinessNight" | "HappinessMove" | "HappinessMoveType" | "HappinessHoldItem" | "MaxHappiness" | "Beauty" | "HoldItem" | "HoldItemMale" | "HoldItemFemale" | "DayHoldItem" | "NightHoldItem" | "HoldItemHappiness" | "HasMove" | "HasMoveType" | "HasInParty" | "Location" | "LocationFlag" | "Region" | "Item" | "ItemMale" | "ItemFemale" | "ItemDay" | "ItemNight" | "ItemHappiness" | "Trade" | "TradeMale" | "TradeFemale" | "TradeDay" | "TradeNight" | "TradeItem" | "TradeSpecies" | "BattleDealCriticalHit" | "EventAfterDamageTaken" | "Event" | "Shedinja" | "None";
export interface EvolutionEntry { target: string; form?: number; method: EvolutionMethodId; parameter?: number | string }
export interface DexLayout { national: string[]; regions: { id: number; species: string[] }[] }
export interface DexLayoutTransition { source: string; from: string; to: string; oldLayout: DexLayout; regionMap: { from: number; to: number | null }[] }
export interface RegionalDex extends DexLayout { source?: string; layoutIdentity: string; regions: { id: number; nameKey: string; species: string[] }[]; transitions?: DexLayoutTransition[] }
export interface MapMetadata { source: string; maps: Record<string, { region?: number; flags?: string[]; darkMap?: boolean }> }
export interface DexFormRecord { gender: 0 | 1; shiny: boolean; form: number }
export interface DexState { seen: string[]; owned: string[]; hasDex: boolean; seenForms: Record<string, DexFormRecord[]>; lastSeenForm: Record<string, { gender: 0 | 1 | 2; shiny: boolean; form: number }>; capturedCounts: Record<string, number>; defeatedCounts: Record<string, number>; unlocked: boolean[]; view: { region: number; indices: number[]; mode: number }; layoutIdentity: string }
