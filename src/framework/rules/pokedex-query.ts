/** WP62 + WP66-B. Plain data projections and explicit viewing patches; no persistent cache or hidden writes. */
import type { Content, DexLayout, DexState, GenderRule, SpeciesData } from "./types";
import type { DexPatch } from "./pokedex";

export interface DexCatalogForm extends Pick<SpeciesData, "heightDm" | "weightHg" | "types" | "color" | "shape" | "categoryKey" | "entryKey" | "dexSortKeys" | "formName" | "pokedexForm" | "gender"> {
  species: string;
  form: number;
  name: string;
  formLabel?: string | null;
}
export interface DexQueryCatalog { layout: DexLayout; forms: readonly DexCatalogForm[] }
export interface DexQueryOptions { locale: string; offsets?: readonly number[]; useCurrentRegion?: boolean; currentRegion?: number | null }
export interface DexDiagnostic { species?: string; reason: string }
export interface DexListRow {
  species: string; number: number; name: string; seen: boolean; owned: boolean; canOpen: boolean;
  appearance: { gender: 0 | 1 | 2; form: number; shiny: false };
  data: DexCatalogForm;
}
export type DexOrder = 0 | 1 | 2 | 3 | 4 | 5;
export interface DexList { rows: DexListRow[]; diagnostics: DexDiagnostic[] }
export interface DexNameGroup { id: string; characters: string; other?: boolean }
export interface DexSearchDirectory { names: readonly DexNameGroup[]; types: readonly string[]; colors: readonly string[]; shapes: readonly string[] }
/** WP03 fixed definition order, shared by author validation and default selectors. None is not a candidate. */
export const DEX_COLORS: readonly string[] = Object.freeze(['Red','Blue','Yellow','Green','Black','Brown','Purple','Gray','White','Pink']);
export const DEX_SHAPES: readonly string[] = Object.freeze(['Head','Serpentine','Finned','HeadArms','HeadBase','BipedalTail','HeadLegs','Quadruped','Winged','Multiped','MultiBody','Bipedal','MultiWinged','Insectoid']);
/** Sort, name group, both types, height lower/upper, weight lower/upper, color, shape. Selectors use -1 for unselected. */
export type DexSearchParameters = [number, number, number, number, number, number, number, number, number, number];
export interface DexSearchSession { accepted: DexSearchParameters; rows: DexListRow[]; results: boolean; cursor: number }

const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;
const integer = (n: number): boolean => Number.isSafeInteger(n);
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const orderValid = (n: number): n is DexOrder => integer(n) && n >= 0 && n <= 5;
const formOf = (catalog: DexQueryCatalog, species: string, form: number): DexCatalogForm | undefined => catalog.forms.find(f => f.species === species && f.form === form) ?? catalog.forms.find(f => f.species === species && f.form === 0);
const national = (layout: DexLayout): string[] => [...layout.national];
const regionIndex = (layout: DexLayout, region: number): number => region < 0 || region >= layout.regions.length ? layout.regions.length : region;
const lastSeen = (dex: DexState, species: string): DexState["lastSeenForm"][string] => ({ ...(own(dex.lastSeenForm, species) ?? { gender: 0, form: 0, shiny: false }) });
const copyRows = (rows: readonly DexListRow[]): DexListRow[] => rows.map(r => ({ ...r, appearance: { ...r.appearance }, data: { ...r.data, types: r.data.types ? [...r.data.types] : undefined, dexSortKeys: r.data.dexSortKeys ? { ...r.data.dexSortKeys } : undefined } }));

/** Adapter for B's Content layout/form identities. Localized display strings are supplied explicitly by the owner. */
export function createDexQueryCatalog(content: Pick<Content, "species" | "forms" | "regionalDex">, text: Readonly<Record<string, string>>): DexQueryCatalog {
  if (!content.regionalDex) throw new Error("a validated B regional dex layout is required");
  const forms: DexCatalogForm[] = [];
  for (const species of content.regionalDex.national) {
    const mapping = content.forms ? own(content.forms, species) : undefined;
    const keys = mapping ? Object.keys(mapping).map(Number).sort((a, b) => a - b) : [0];
    for (const form of keys) {
      const battleName = mapping ? own(mapping, String(form)) : species;
      const data = battleName === undefined ? undefined : own(content.species, battleName);
      if (!data) throw new Error(`missing validated dex form ${species}/${form}`);
      forms.push({ species, form, name: data.nameKey ? own(text, data.nameKey) ?? battleName! : battleName!,
        ...(data.formNameKey ? { formLabel: own(text, data.formNameKey) ?? data.formName ?? null } : {}),
        ...(data.formName !== undefined ? { formName: data.formName } : {}),
        ...(data.pokedexForm !== undefined ? { pokedexForm: data.pokedexForm } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.categoryKey !== undefined ? { categoryKey: data.categoryKey } : {}),
        ...(data.entryKey !== undefined ? { entryKey: data.entryKey } : {}),
        ...(data.heightDm !== undefined ? { heightDm: data.heightDm } : {}),
        ...(data.weightHg !== undefined ? { weightHg: data.weightHg } : {}),
        ...(data.types ? { types: [...data.types] } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}), ...(data.shape !== undefined ? { shape: data.shape } : {}),
        ...(data.dexSortKeys ? { dexSortKeys: { ...data.dexSortKeys } } : {}) });
    }
  }
  return { layout: { national: national(content.regionalDex), regions: content.regionalDex.regions.map(r => ({ id: r.id, species: [...r.species] })) }, forms };
}

/** Data-level member query is distinct from the UI's national fallback. Empty/missing regions have no iterable table. */
export function dexRegionMembers(layout: DexLayout, region: number): string[] | null {
  const table = region >= 0 ? layout.regions[region]?.species : undefined;
  return table?.length ? [...table] : null;
}
export function dexRegionalNumber(layout: DexLayout, species: string, region: number): number {
  const table = region === -1 ? layout.regions.at(-1)?.species : layout.regions[region]?.species;
  return table ? table.indexOf(species) + 1 : 0;
}
export function dexRegionLength(layout: DexLayout, region: number): number {
  return region < 0 ? layout.national.length : layout.regions[region]?.species.length ?? 0;
}
export function dexRegionCounts(dex: DexState, layout: DexLayout, region: number): { status: "ok" | "unavailable"; seen: number; owned: number; allSeen: boolean; allOwned: boolean } {
  const table = region === -1 ? national(layout) : dexRegionMembers(layout, region);
  if (!table) return { status: "unavailable", seen: 0, owned: 0, allSeen: false, allOwned: false };
  const seen = table.filter(id => dex.seen.includes(id)).length, owned = table.filter(id => dex.owned.includes(id)).length;
  return { status: "ok", seen, owned, allSeen: seen >= table.length, allOwned: owned >= table.length };
}
export function dexInUnlockedRegion(dex: DexState, layout: DexLayout, species: string): boolean {
  if (dex.unlocked[layout.regions.length]) return true; // Deliberately before unknown-species lookup.
  return layout.regions.some(r => dex.unlocked[r.id] && r.species.includes(species));
}
export function dexAccessibleRegions(dex: DexState, layout: DexLayout, options: Pick<DexQueryOptions, "useCurrentRegion" | "currentRegion"> = {}): number[] {
  if (options.useCurrentRegion) {
    const current = options.currentRegion ?? -1;
    const region = current < 0 || current >= layout.regions.length ? -1 : current;
    return dexRegionCounts(dex, layout, region).seen > 0 ? [region] : [];
  }
  const result = layout.regions.filter(r => dex.unlocked[r.id] && dexRegionCounts(dex, layout, r.id).seen > 0).map(r => r.id);
  if (dex.unlocked[layout.regions.length] && dexRegionCounts(dex, layout, -1).seen > 0) result.push(-1);
  return result;
}
/** Ephemeral, caller-owned cache; shouldRefresh=false is observable without saving a second authority. */
export function refreshDexAccess(previous: readonly number[], dex: DexState, layout: DexLayout, options: Pick<DexQueryOptions, "useCurrentRegion" | "currentRegion">, shouldRefresh = true): number[] {
  return shouldRefresh ? dexAccessibleRegions(dex, layout, options) : [...previous];
}
export function dexMenuEntry(dex: DexState, accessible: readonly number[], useCurrentRegion = false): "hidden" | "list" | "regions" {
  return !dex.hasDex || !accessible.length ? "hidden" : useCurrentRegion || accessible.length === 1 ? "list" : "regions";
}
export function planDexUnlock(dex: DexState, layout: DexLayout, region: number, unlocked: boolean): DexPatch {
  if (!integer(region)) throw new Error("dex unlock region must be an integer");
  const index = regionIndex(layout, region);
  if (dex.unlocked[index] === unlocked) return {};
  const values = [...dex.unlocked]; values[index] = unlocked;
  return { unlocked: values };
}
export function planDexViewing(dex: DexState, layout: DexLayout, command: { region?: number; mode?: number; cursor?: number; searchResults?: boolean }): DexPatch {
  const view = { ...dex.view, indices: [...dex.view.indices] };
  if (command.region !== undefined) {
    if (command.region !== -1 && (!integer(command.region) || command.region < 0 || command.region >= layout.regions.length)) throw new Error("unknown dex viewing region");
    view.region = command.region;
  }
  if (command.mode !== undefined) {
    if (!orderValid(command.mode)) throw new Error("unknown dex ordering mode");
    view.mode = command.mode;
  }
  if (command.cursor !== undefined && !command.searchResults) {
    const length = dexRegionLength(layout, view.region);
    if (!integer(command.cursor) || command.cursor < 0 || command.cursor > Math.max(0, length - 1)) throw new Error("dex cursor outside the layout table");
    view.indices[regionIndex(layout, view.region)] = command.cursor;
  }
  return JSON.stringify(view) === JSON.stringify(dex.view) ? {} : { view };
}

export interface DexNumber { region: number; number: number | null; text: string }
function numberProjection(raw: number, region: number, offsets: readonly number[] = []): DexNumber {
  const number = raw > 0 ? raw - (offsets.includes(region) ? 1 : 0) : null;
  return { region, number, text: number === null ? "???" : String(number).padStart(3, "0") };
}
/** Summary stops at the first unlocked region; brief entry continues until the species is found. */
export function dexEntryNumber(dex: DexState, layout: DexLayout, species: string, entry: "summary" | "brief", offsets: readonly number[] = []): DexNumber {
  if (dex.unlocked[layout.regions.length]) return numberProjection(layout.national.indexOf(species) + 1, -1, offsets);
  for (const region of layout.regions) if (dex.unlocked[region.id]) {
    const raw = dexRegionalNumber(layout, species, region.id);
    if (raw > 0 || entry === "summary") return numberProjection(raw, region.id, offsets);
  }
  return numberProjection(0, -1, offsets);
}
/** D53-02a: complete single entry's -1 queries the last regional table, independently of its scene map resolution. */
export function dexCompleteEntryNumber(dex: DexState, layout: DexLayout, species: string, options: DexQueryOptions): DexNumber & { sceneRegion: number } {
  const current = options.currentRegion ?? -1;
  const region = options.useCurrentRegion ? current < 0 || current >= layout.regions.length ? -1 : current : dex.view.region;
  return { ...numberProjection(dexRegionalNumber(layout, species, region), region, options.offsets), sceneRegion: region < 0 ? current < 0 ? 0 : current : region };
}

export function dexNameGroups(locale: string): DexNameGroup[] {
  const groups: DexNameGroup[] = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", c => ({ id: c, characters: c.toLowerCase() }));
  if (locale.toLowerCase().startsWith("zh")) groups.push({ id: "other", characters: "", other: true });
  return groups;
}
export function dexSortKey(form: DexCatalogForm, locale: string): { key: string; other: boolean; diagnostic?: DexDiagnostic } {
  const authored = form.dexSortKeys && (own(form.dexSortKeys, locale) ?? own(form.dexSortKeys, locale.split("-")[0]!));
  const missing = locale.toLowerCase().startsWith("zh") && !authored?.trim();
  const key = (missing ? "" : authored ?? form.name).trim().toLowerCase();
  return { key, other: !/^[a-z]/.test(key), ...(missing ? { diagnostic: { species: form.species, reason: "missing localized dexSortKey; using the other group" } } : {}) };
}
function sortRows(rows: DexListRow[], mode: DexOrder, locale: string): DexListRow[] {
  return [...rows].sort((a, b) => {
    let primary = 0;
    if (mode === 1) {
      const ak = dexSortKey(a.data, locale), bk = dexSortKey(b.data, locale);
      primary = Number(ak.other) - Number(bk.other) || cmp(ak.key, bk.key);
    } else if (mode >= 2) {
      const dimension = mode < 4 ? "heightDm" : "weightHg";
      primary = (a.data[dimension]! - b.data[dimension]!) * (mode === 2 || mode === 4 ? -1 : 1);
    }
    return primary || a.number - b.number || cmp(a.species, b.species);
  });
}
function allRows(dex: DexState, catalog: DexQueryCatalog, region: number, options: DexQueryOptions): DexList {
  const table = region === -1 ? national(catalog.layout) : dexRegionMembers(catalog.layout, region) ?? national(catalog.layout);
  const rows: DexListRow[] = [], diagnostics: DexDiagnostic[] = [];
  table.forEach((species, i) => {
    const last = lastSeen(dex, species), data = formOf(catalog, species, last.form);
    if (!data) { diagnostics.push({ species, reason: "missing dex content; no form was invented" }); return; }
    const key = dexSortKey(data, options.locale); if (key.diagnostic) diagnostics.push(key.diagnostic);
    const seen = dex.seen.includes(species), owned = dex.owned.includes(species);
    rows.push({ species, number: i + 1 - (options.offsets?.includes(region) ? 1 : 0), name: seen ? data.name : "----------", seen, owned, canOpen: seen,
      appearance: { gender: last.gender, form: last.form, shiny: false }, data: { ...data, types: data.types ? [...data.types] : undefined, dexSortKeys: data.dexSortKeys ? { ...data.dexSortKeys } : undefined } });
  });
  return { rows, diagnostics };
}
export function dexList(dex: DexState, catalog: DexQueryCatalog, region: number, mode: DexOrder, options: DexQueryOptions): DexList {
  if (!orderValid(mode)) throw new Error("unknown dex ordering mode");
  const result = allRows(dex, catalog, region, options);
  if (mode === 0) {
    while (result.rows.length && !result.rows.at(-1)!.seen) result.rows.pop();
    if (result.rows[0]?.number === 0 && !result.rows[0].seen) result.rows.shift();
  } else if (mode === 1) result.rows = result.rows.filter(r => r.seen);
  else result.rows = result.rows.filter(r => r.owned && (mode < 4 ? r.data.heightDm !== undefined : r.data.weightHg !== undefined));
  result.rows = sortRows(result.rows, mode, options.locale);
  return result;
}

export const DEX_HEIGHT_STEPS_DM: readonly number[] = Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,30,35,40,45,50,55,60,65,70,80,90,100]);
export const DEX_WEIGHT_STEPS_HG: readonly number[] = Object.freeze([5,10,15,20,25,30,35,40,45,50,55,60,70,80,90,100,110,120,140,160,180,200,250,300,350,400,500,600,700,800,900,1000,1250,1500,2000,3000,5000]);
export function dexEmptySearch(mode = 0): DexSearchParameters {
  if (!orderValid(mode)) throw new Error("unknown dex ordering mode");
  return [mode,-1,-1,-1,-1,-1,-1,-1,-1,-1];
}
export function dexSizeBound(kind: "height" | "weight", side: "lower" | "upper", index: number): number {
  const values = kind === "height" ? DEX_HEIGHT_STEPS_DM : DEX_WEIGHT_STEPS_HG;
  if (!integer(index) || index < -1 || index > values.length) throw new Error("invalid dex size selector index");
  const extreme = kind === "height" ? 999 : 9999;
  return index === -1 ? side === "lower" ? 0 : extreme : index === values.length ? side === "lower" ? extreme : 0 : values[index]!;
}
export function dexSearchProblems(params: readonly number[], directory: DexSearchDirectory): string[] {
  if (params.length !== 10) return ["search requires exactly ten parameters"];
  const problems: string[] = [];
  if (!orderValid(params[0]!)) problems.push("unknown ordering mode");
  for (const [index, size] of [[1,directory.names.length],[2,directory.types.length],[3,directory.types.length],[8,directory.colors.length],[9,directory.shapes.length]]) {
    if (!integer(params[index!]!) || params[index!]! < -1 || params[index!]! >= size!) problems.push(`invalid selector at ${index}`);
  }
  if (params[2] !== -1 && params[2] === params[3]) problems.push("the two type slots must be distinct");
  for (const i of [4,5,6,7]) if (!integer(params[i]!) || params[i]! < -1 || params[i]! > 37) problems.push(`invalid size selector at ${i}`);
  return problems;
}
export function dexSearch(dex: DexState, catalog: DexQueryCatalog, region: number, params: DexSearchParameters, directory: DexSearchDirectory, options: DexQueryOptions): DexList {
  const problems = dexSearchProblems(params, directory);
  if (problems.length) throw new Error(problems.join("; "));
  const result = allRows(dex, catalog, region, options);
  const [mode, name, type1, type2, hLow, hHigh, wLow, wHigh, color, shape] = params;
  const sizeSelected = [hLow,hHigh,wLow,wHigh].some(v => v !== -1);
  result.rows = result.rows.filter(row => {
    if (!row.seen || mode === 1 && !row.seen || mode >= 2 && !row.owned) return false;
    if (name >= 0) {
      const group = directory.names[name]!, key = dexSortKey(row.data, options.locale);
      if (!(group.other ? key.other : !key.other && group.characters.toLowerCase().includes(key.key[0] ?? ""))) return false;
    }
    if (type1 >= 0 || type2 >= 0) {
      if (!row.owned || [type1,type2].some(i => i >= 0 && !row.data.types?.includes(directory.types[i]!))) return false;
    }
    if (sizeSelected) {
      if (!row.owned) return false;
      if ((hLow !== -1 || hHigh !== -1) && (row.data.heightDm === undefined || row.data.heightDm < dexSizeBound("height","lower",hLow) || row.data.heightDm > dexSizeBound("height","upper",hHigh))) return false;
      if ((wLow !== -1 || wHigh !== -1) && (row.data.weightHg === undefined || row.data.weightHg < dexSizeBound("weight","lower",wLow) || row.data.weightHg > dexSizeBound("weight","upper",wHigh))) return false;
    }
    if (color >= 0 && row.data.color !== directory.colors[color]) return false;
    if (shape >= 0 && row.data.shape !== directory.shapes[shape]) return false;
    return mode < 2 || (mode < 4 ? row.data.heightDm !== undefined : row.data.weightHg !== undefined);
  });
  result.rows = sortRows(result.rows, mode as DexOrder, options.locale);
  return result;
}
export function createDexSearchSession(dex: DexState, catalog: DexQueryCatalog, region: number, options: DexQueryOptions): DexSearchSession {
  const rows = dexList(dex, catalog, region, dex.view.mode as DexOrder, options).rows;
  return { accepted: dexEmptySearch(dex.view.mode), rows, results: false, cursor: Math.max(0, Math.min(dex.view.indices[regionIndex(catalog.layout, region)] ?? 0, rows.length - 1)) };
}
export function startDexSearch(dex: DexState, catalog: DexQueryCatalog, region: number, session: DexSearchSession, draft: DexSearchParameters, directory: DexSearchDirectory, options: DexQueryOptions): { patch: DexPatch; session: DexSearchSession; empty: boolean; diagnostics: DexDiagnostic[] } {
  const result = dexSearch(dex, catalog, region, draft, directory, options);
  const patch = planDexViewing(dex, catalog.layout, { mode: draft[0] });
  return { patch, empty: result.rows.length === 0, diagnostics: result.diagnostics,
    session: result.rows.length ? { accepted: [...draft], rows: result.rows, results: true, cursor: 0 } : { ...session, accepted: [...session.accepted], rows: copyRows(session.rows) } };
}
export function backDexSearch(dex: DexState, catalog: DexQueryCatalog, region: number, session: DexSearchSession, options: DexQueryOptions): { exit: boolean; patch: DexPatch; session: DexSearchSession } {
  if (!session.results) return { exit: true, patch: {}, session: { ...session, accepted: [...session.accepted], rows: copyRows(session.rows) } };
  const species = session.rows[session.cursor]?.species, rows = dexList(dex, catalog, region, 0, options).rows;
  const found = rows.findIndex(r => r.species === species), cursor = found >= 0 ? found : Math.max(0, Math.min(session.cursor, rows.length - 1));
  const savedCursor = Math.min(cursor, Math.max(0, dexRegionLength(catalog.layout, region) - 1));
  return { exit: false, patch: planDexViewing(dex, catalog.layout, { mode: 0, region, cursor: savedCursor }), session: { accepted: dexEmptySearch(), rows, results: false, cursor } };
}
export function refreshDexSearch(dex: DexState, catalog: DexQueryCatalog, region: number, session: DexSearchSession, directory: DexSearchDirectory, options: DexQueryOptions): DexSearchSession {
  const rows = session.results ? dexSearch(dex, catalog, region, session.accepted, directory, options).rows : dexList(dex, catalog, region, dex.view.mode as DexOrder, options).rows;
  return { accepted: [...session.accepted], rows, results: session.results, cursor: Math.max(0, Math.min(session.cursor, rows.length - 1)) };
}

export function dexMeasurements(heightDm: number, weightHg: number, locale: string, consumer: "info" | "search"): { height: string; weight: string } {
  if (locale.slice(3,5) !== "US") return { height: `${(heightDm / 10).toFixed(1)} m`, weight: `${(weightHg / 10).toFixed(1)} kg` };
  const inches = Math.round(heightDm / 0.254);
  return { height: `${Math.floor(inches / 12)}'${String(inches % 12).padStart(2,"0")}"`, weight: `${(Math.round(weightHg / (consumer === "info" ? 0.45359 : 0.254)) / 10).toFixed(1)} lb` };
}
export function dexSizeLabel(kind: "height" | "weight", side: "lower" | "upper", index: number, locale: string): string {
  const value = dexSizeBound(kind, side, index);
  if (locale.slice(3,5) === "US" && (side === "lower" && index === 37 || side === "upper" && index === -1)) return kind === "height" ? "99'00\"" : "9999.0 lb";
  const display = dexMeasurements(kind === "height" ? value : 0, kind === "weight" ? value : 0, locale, "search");
  return kind === "height" ? display.height : display.weight;
}
export function dexInfo(dex: DexState, catalog: DexQueryCatalog, species: string, number: DexNumber) {
  const last = lastSeen(dex, species), data = formOf(catalog, species, last.form), owned = dex.owned.includes(species);
  if (!data) return null;
  const captured = own(dex.capturedCounts, species) ?? 0, defeated = own(dex.defeatedCounts, species) ?? 0;
  return { species, name: data.name, number: { ...number }, owned, appearance: { gender: last.gender, form: last.form, shiny: false as const },
    categoryKey: owned ? data.categoryKey ?? null : null, entryKey: owned ? data.entryKey ?? null : null,
    heightDm: owned ? data.heightDm ?? null : null, weightHg: owned ? data.weightHg ?? null : null,
    types: owned ? [...data.types ?? []] : [], footprint: owned, counts: { captured, defeated, battled: captured + defeated } };
}

export interface DexFormChoice { gender: 0 | 1; form: number; label: string }
/** Front-image equality is supplied as a normalized fact; true may include two missing resources, never proof of media. */
export function dexForms(dex: DexState, catalog: DexQueryCatalog, species: string, options: { showAll: boolean; gender: GenderRule; baseFrontsEqual: boolean }): DexFormChoice[] {
  const forms = catalog.forms.filter(f => f.species === species && (f.form === 0 || Boolean(f.formName)) && (f.pokedexForm ?? f.form) === f.form).sort((a,b) => a.form - b.form);
  const multi = forms.some(f => f.form > 0), result: DexFormChoice[] = [];
  for (const data of forms) {
    const genderRule = data.gender ?? options.gender;
    const genders: (0 | 1)[] = genderRule === "F" ? [1] : genderRule === "M" || genderRule === "N" ? [0] : [0,1];
    const label = data.formLabel !== undefined ? data.formLabel : data.formName;
    const fold = genders.length === 2 && data.form === 0 && options.baseFrontsEqual;
    for (const gender of genders) {
      if (!options.showAll && !(own(dex.seenForms, species) ?? []).some(f => f.form === data.form && f.gender === gender)) continue;
      let text = label ?? (fold ? "One Form" : genderRule === "N" ? multi ? "One Form" : "Genderless" : gender === 0 ? "Male" : "Female");
      if (!multi && options.baseFrontsEqual) text = "";
      result.push({ gender: fold ? 0 : gender, form: data.form, label: text });
      if (fold || Boolean(data.formName)) break;
    }
  }
  return result;
}
/** Opening a multi-choice selector is itself an explicit lastSeen write. Single-choice pages generate no patch. */
export function planDexFormSelection(dex: DexState, species: string, choices: readonly DexFormChoice[], selected?: number): { index: number; patch: DexPatch } {
  if (choices.length <= 1) return { index: 0, patch: {} };
  const last = lastSeen(dex, species), match = choices.findIndex(f => f.form === last.form && f.gender === last.gender);
  const index = selected === undefined ? Math.max(0,match) : selected;
  if (!integer(index) || index < 0 || index >= choices.length) throw new Error("form selector outside the available choices");
  const choice = choices[index]!, record = { gender: choice.gender, form: choice.form, shiny: false };
  if (!/^[A-Za-z0-9#._:-]{1,64}$/.test(species) || !integer(record.form) || record.form < 0 || record.form > 999 || record.gender !== 0 && record.gender !== 1) throw new Error("form selection must fit the schema7 identity and record domain");
  const unchanged = last.gender === record.gender && last.form === record.form && last.shiny === false && Object.hasOwn(dex.lastSeenForm, species);
  return { index, patch: unchanged ? {} : { lastSeenForm: { ...Object.fromEntries(Object.entries(dex.lastSeenForm).map(([id, form]) => [id, { ...form }])), [species]: record } } };
}
export function moveDexFormSelection(index: number, count: number, direction: -1 | 1): number {
  if (!integer(count) || count < 1 || !integer(index) || index < 0 || index >= count) throw new Error("invalid form selector position");
  return (index + direction + count) % count;
}

export interface DexAreaInput {
  region: number; encounterVersion: number;
  tables: readonly { mapId: number; version: number; species: readonly string[] }[];
  maps: readonly { mapId: number; region: number; x: number; y: number; hidden?: boolean; size?: { width: number; shape: string } }[];
  points: readonly { region: number; x: number; y: number; visible: boolean }[];
}
/** Existing normalized world data only. Version>0 retains WP62's v0 enumeration compatibility; no world provider is invented. */
export function dexArea(species: string, input?: DexAreaInput): { status: "known" | "unknown" | "invalid"; points: { x: number; y: number }[]; diagnostics: string[] } {
  if (!input) return { status: "unknown", points: [], diagnostics: ["area data unavailable"] };
  if (!integer(input.region) || input.region < 0 || !integer(input.encounterVersion) || input.encounterVersion < 0) return { status: "invalid", points: [], diagnostics: ["invalid area region or encounter version"] };
  const visible = new Set(input.points.filter(p => p.region === input.region && p.visible).map(p => `${p.x},${p.y}`));
  const found = new Map<string,{x:number;y:number}>();
  for (const table of input.tables) {
    if (table.version !== input.encounterVersion && !(input.encounterVersion > 0 && table.version === 0) || !table.species.includes(species)) continue;
    const map = input.maps.find(m => m.mapId === table.mapId);
    if (!map || map.hidden || map.region !== input.region) continue;
    if (!integer(map.x) || !integer(map.y) || map.x < 0 || map.y < 0 || map.size && (!integer(map.size.width) || map.size.width < 0 || typeof map.size.shape !== "string" || !/^[0-9x]*$/.test(map.size.shape))) return { status: "invalid", points: [], diagnostics: ["invalid area position or finite ASCII mask"] };
    const width = map.size?.width || 1, shape = map.size?.width ? map.size.shape : "1";
    Array.from(shape).forEach((cell,k) => {
      if (!/^[1-9]$/.test(cell)) return;
      const point = { x: map.x + k % width, y: map.y + Math.floor(k / width) }, key = `${point.x},${point.y}`;
      if (visible.has(key)) found.set(key,point);
    });
  }
  const points = [...found.values()].sort((a,b) => a.y - b.y || a.x - b.x);
  return { status: points.length ? "known" : "unknown", points, diagnostics: [] };
}
