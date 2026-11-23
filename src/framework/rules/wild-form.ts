/** WP21 A: the finite ordinary-wild initial read. No clock, host, RNG or persistent owner. */
export interface WildFormEnvironment {
  month?: number;
  hour?: number;
  regionId?: number;
  distortionWorld?: boolean;
}
export interface InitialWildFormView {
  readonly form: number;
  readonly item: string;
  readonly personalID: number;
  readAbility(): string;
  readGender(): "M" | "F" | "N";
  moves(): readonly string[];
}
const identity = (value: string): string => value.replace(/[^a-z0-9]/gi, "").toUpperCase();
const A_READERS = ["GIRATINA", "SHAYMIN", "ARCEUS", "DEERLING", "SAWSBUCK", "KELDEO", "GENESECT", "FURFROU", "HOOPA", "ESPURR", "MEOWSTIC", "ROCKRUFF", "SILVALLY", "MILCERY", "INDEEDEE", "PIKACHU", "EXEGGCUTE", "CUBONE", "KOFFING", "MIMEJR"];
export const hasInitialWildFormReader = (species: string): boolean => A_READERS.includes(identity(species));
const TYPE_ITEMS: readonly (readonly [number, string, string, string])[] = [
  [1,"fistplate","fightiniumz","fightingmemory"], [2,"skyplate","flyiniumz","flyingmemory"],
  [3,"toxicplate","poisoniumz","poisonmemory"], [4,"earthplate","groundiumz","groundmemory"],
  [5,"stoneplate","rockiumz","rockmemory"], [6,"insectplate","buginiumz","bugmemory"],
  [7,"spookyplate","ghostiumz","ghostmemory"], [8,"ironplate","steeliumz","steelmemory"],
  [10,"flameplate","firiumz","firememory"], [11,"splashplate","wateriumz","watermemory"],
  [12,"meadowplate","grassiumz","grassmemory"], [13,"zapplate","electriumz","electricmemory"],
  [14,"mindplate","psychiumz","psychicmemory"], [15,"icicleplate","iciumz","icememory"],
  [16,"dracoplate","dragoniumz","dragonmemory"], [17,"dreadplate","darkiniumz","darkmemory"],
  [18,"pixieplate","fairiumz","fairymemory"],
];
/** Eligibility for finite A-result fallback only. Exact author forms keep their existing authority. */
export function isInitialWildDynamicForm(species: string, form: number): boolean {
  if (!Number.isInteger(form) || form < 0) return false;
  switch (identity(species)) {
    case "ARCEUS": case "SILVALLY": return form === 0 || TYPE_ITEMS.some(row => row[0] === form);
    case "DEERLING": case "SAWSBUCK": return form <= 3;
    case "GENESECT": return form <= 4;
    case "MILCERY": return form <= 62;
    default: return hasInitialWildFormReader(species) && form <= 1;
  }
}
function hour(context: WildFormEnvironment): number {
  if (!Number.isInteger(context.hour) || context.hour! < 0 || context.hour! > 23) throw Error("wild-form-hour-unavailable");
  return context.hour!;
}
function region(context: WildFormEnvironment): number {
  if (!Number.isSafeInteger(context.regionId) || context.regionId! < 0) throw Error("wild-form-region-unavailable");
  return context.regionId!;
}
/** Fresh ordinary individuals have no forced form or time_form_set, and are neither in battle nor storage. */
export function initialWildDynamicForm(species: string, view: InitialWildFormView, context: WildFormEnvironment): number | null {
  const item = view.item.toLowerCase();
  switch (identity(species)) {
    case "GIRATINA":
      if (item === "griseousorb") return 1;
      if (typeof context.distortionWorld !== "boolean") throw Error("wild-form-map-flags-unavailable");
      return context.distortionWorld ? 1 : 0;
    case "SHAYMIN": return hour(context) < 5 || hour(context) >= 20 ? 0 : null;
    case "ARCEUS": return identity(view.readAbility()) === "MULTITYPE" ? TYPE_ITEMS.find(row => row[1] === item || row[2] === item)?.[0] ?? 0 : null;
    case "SILVALLY": return identity(view.readAbility()) === "RKSSYSTEM" ? TYPE_ITEMS.find(row => row[3] === item)?.[0] ?? 0 : null;
    case "DEERLING": case "SAWSBUCK":
      if (!Number.isInteger(context.month) || context.month! < 1 || context.month! > 12) throw Error("wild-form-month-unavailable");
      return (context.month! - 1) % 4;
    case "KELDEO": return view.moves().some(move => identity(move) === "SECRETSWORD") ? 1 : 0;
    case "GENESECT": { const index = ["shockdrive","burndrive","chilldrive","dousedrive"].indexOf(item); return index < 0 ? 0 : index + 1; }
    case "FURFROU": case "HOOPA": return 0;
    case "ESPURR": case "MEOWSTIC": case "INDEEDEE": return view.readGender() === "F" ? 1 : 0;
    case "ROCKRUFF": return view.form >= 2 ? null : hour(context) < 5 || hour(context) >= 20 ? 1 : 0;
    case "MILCERY": { const index = ["strawberrysweet","berrysweet","lovesweet","starsweet","cloversweet","flowersweet","ribbonsweet"].indexOf(item); return index < 0 ? 0 : index + view.personalID % 9 * 7; }
    case "PIKACHU": case "EXEGGCUTE": case "CUBONE": return view.form >= 2 ? null : region(context) === 1 ? 1 : 0;
    case "KOFFING": case "MIMEJR": return view.form >= 2 ? null : region(context) === 2 ? 1 : 0;
    default: return null;
  }
}
