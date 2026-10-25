/** Static progression author fields, inheritance and the single regional layout authority. Pure. */
import type { ContentError, SpeciesSource } from "./schema.ts";
import type { DexLayout, DexLayoutTransition, MapMetadata, RegionalDex, SpeciesKey } from "../rules/types.ts";
import { evolutionMethod } from "../rules/evolution-data.ts";
import { MAX_FORM } from "../rules/species-key.ts";
import { sha256Hex } from "../rules/sha256.ts";

export type ProgressionReport = (file: ContentError["file"], path: string, message: string) => void;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const dense = (v: unknown): v is unknown[] => Array.isArray(v) && Object.keys(v).length === v.length;
const integer = (v: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= lo && v <= hi;
const id = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9-]{0,30}$/.test(v);
const key = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_.]{1,60}$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : obj(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const only = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).every(k => keys.includes(k));
const COLORS = ["Red","Blue","Yellow","Green","Black","Brown","Purple","Gray","White","Pink"];
const SHAPES = ["Head","Serpentine","Finned","HeadArms","HeadBase","BipedalTail","HeadLegs","Quadruped","Winged","Multiped","MultiBody","Bipedal","MultiWinged","Insectoid"];
export const PROGRESSION_FIELDS = ["evolutions", "tutorMoves", "types", "abilities", "hiddenAbilities", "flags", "pokedexForm", "categoryKey", "entryKey", "heightDm", "weightHg", "color", "shape", "formName", "formNameKey", "dexSortKeys"] as const;

export function progressionFieldProblem(field: string, value: unknown): string | null {
  if (["categoryKey", "entryKey", "formNameKey"].includes(field)) return key(value) ? null : "must be a text key";
  if (["heightDm", "weightHg"].includes(field)) return integer(value, 1) ? null : "must be a positive safe integer in integer units";
  if (field === "pokedexForm") return integer(value, 0, MAX_FORM) ? null : `must be an integer from 0 to ${MAX_FORM}`;
  if (field === "formName") return value === null || typeof value === "string" ? null : "must be text or null (empty text is distinct from null)";
  if (field === "color" || field === "shape") return typeof value === "string" && (field === "color" ? COLORS : SHAPES).includes(value) ? null : `unknown ${field} identity`;
  if (field === "dexSortKeys") return obj(value) && Object.entries(value).every(([locale, sort]) => /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(locale) && text(sort)) ? null : "must be locale -> non-empty sort key";
  if (["types", "tutorMoves", "flags", "abilities", "hiddenAbilities"].includes(field)) {
    return dense(value) && value.every(v => ((field === "abilities" || field === "hiddenAbilities") && v === null) || text(v)) ? null : "must be a dense array of non-empty identities (ability slots also allow null)";
  }
  if (field === "evolutions") {
    if (!dense(value)) return "must be a dense ordered evolution array";
    for (const [i, entry] of value.entries()) {
      if (!obj(entry) || !only(entry, ["target", "form", "method", "parameter"]) || !id(entry.target) || (entry.form !== undefined && !integer(entry.form, 0, MAX_FORM))) return `entry ${i} must be {target: content id, form?: 0..${MAX_FORM}, method, parameter?}`;
      const method = evolutionMethod(entry.method);
      if (!method) return `entry ${i}: unknown-method ${String(entry.method)}`;
      if (method.parameterKind === "none") { if (Object.hasOwn(entry, "parameter")) return `entry ${i}: ${method.id} takes no parameter`; }
      else if (method.parameterKind === "integer") {
        if (typeof entry.parameter === "number" && (!Number.isSafeInteger(entry.parameter) || entry.parameter > Number.MAX_SAFE_INTEGER)) return `entry ${i}: unsupported-integer-representation`;
        if (!integer(entry.parameter)) return `entry ${i}: parameter must be an unsigned safe integer`;
      } else if (!text(entry.parameter)) return `entry ${i}: ${method.parameterKind} parameter must be a non-empty identity`;
    }
    return null;
  }
  return `unknown progression field ${field}`;
}

/** Forms inherit before overlays. Empty learnset/evolutions inherit; every other explicit empty array stays empty. */
export function inheritSpecies(records: readonly SpeciesSource[]): SpeciesSource[] {
  const bases = new Map(records.filter(sp => !(sp.form ?? 0)).map(sp => [sp.id, sp]));
  return records.map(record => {
    const base = bases.get(record.id), result = copy(record);
    if ((record.form ?? 0) !== 0 && base) {
      for (const field of ["nameKey", "growth", "baseExp", "evYield", "catchRate", "happiness", "learnset", ...PROGRESSION_FIELDS]) {
        if (field === "pokedexForm") continue;
        const own = (record as unknown as Record<string, unknown>)[field];
        if (own === undefined || ((field === "learnset" || field === "evolutions") && Array.isArray(own) && !own.length)) {
          const value = (base as unknown as Record<string, unknown>)[field];
          if (value !== undefined) (result as unknown as Record<string, unknown>)[field] = copy(value);
        }
      }
    }
    return result;
  });
}

export function deriveSpeciesFields(records: SpeciesSource[], report: ProgressionReport, diagnostic?: ProgressionReport): void {
  for (const [i, sp] of records.entries()) {
    sp.color ??= "Red";
    sp.shape ??= "Head";
    const defaults = new Set<number>();
    for (const flag of sp.flags ?? []) {
      const hit = /^DefaultForm_([0-9]+)$/i.exec(flag);
      if (hit) { const n = Number(hit[1]); if (!integer(n, 0, MAX_FORM)) report("species.json", `[${i}].flags`, "default form must be 0..999"); else defaults.add(n); }
    }
    if (defaults.size > 1) report("species.json", `[${i}].flags`, "ambiguous-default-form");
    const defaultForm = [...defaults][0];
    if (defaultForm !== undefined) sp.defaultForm = defaultForm;
    else delete sp.defaultForm;
    sp.displayForm = sp.pokedexForm ?? sp.form ?? 0;
    if (sp.dexSortKeys?.zh === undefined) {
      sp.dexSortKeys = {...sp.dexSortKeys,zh:"其他"};
      diagnostic?.("species.json",`[${i}].dexSortKeys.zh`,"missing Chinese sort key: using 其他 (no pinyin inference)");
    }
    if (sp.formName === undefined && !(sp.form ?? 0)) sp.formName = null;
  }
}

/** Current cache identities use only effective ordered tables, never sources, names or transitions. */
export function canonicalLayout(layout: DexLayout): DexLayout { return { national: [...layout.national], regions: [...layout.regions].sort((a,b)=>a.id-b.id).map(region => ({ id: region.id, species: [...region.species] })) }; }
export function layoutIdentity(layout: DexLayout): string { return sha256Hex(JSON.stringify(stable(canonicalLayout(layout)))); }

export function checkProgressionReferences(records: readonly SpeciesSource[], report: ProgressionReport): void {
  const keys = new Set(records.map(sp => `${sp.id}/${sp.form ?? 0}`));
  const bases = new Set(records.filter(sp => !(sp.form ?? 0)).map(sp => sp.id));
  for (const [i, sp] of records.entries()) for (const [j, entry] of (sp.evolutions ?? []).entries()) {
    if (!keys.has(`${entry.target}/${entry.form ?? 0}`)) report("species.json", `[${i}].evolutions[${j}].target`, "must name an existing exact target record");
    if (evolutionMethod(entry.method)?.parameterKind === "species" && !bases.has(String(entry.parameter))) report("species.json", `[${i}].evolutions[${j}].parameter`, "must name a registered base species");
  }
  const byKey = new Map(records.map(sp => [`${sp.id}/${sp.form ?? 0}`, sp]));
  const done = new Set<string>(), active: string[] = [];
  const visit = (current: string): void => {
    const at = active.indexOf(current);
    if (at >= 0) { report("species.json", "$.evolutions", `evolution-cycle: ${[...active.slice(at), current].join(" -> ")}`); return; }
    if (done.has(current)) return;
    active.push(current);
    for (const edge of byKey.get(current)?.evolutions ?? []) visit(`${edge.target}/${edge.form ?? 0}`);
    active.pop(); done.add(current);
  };
  for (const current of byKey.keys()) visit(current);
}

function speciesList(raw: unknown, bases: Set<string> | null, file: ContentError["file"], path: string, report: ProgressionReport): string[] {
  if (!dense(raw)) { report(file, path, "must be a dense ordered base species array"); return []; }
  const seen = new Set<string>(), out: string[] = [];
  for (const [i, value] of raw.entries()) {
    if (!id(value) || (bases && !bases.has(value))) report(file, `${path}[${i}]`, "must name a registered base species");
    else if (seen.has(value)) report(file, `${path}[${i}]`, "duplicate species");
    else { seen.add(value); out.push(value); }
  }
  return out;
}
function readLayout(raw: unknown, bases: Set<string> | null, path: string, report: ProgressionReport): DexLayout | null {
  if (!obj(raw) || !only(raw, ["national", "regions"]) || !dense(raw.regions)) { report("regional-dex.json", path, "must be {national, regions: [{id,species}]} only"); return null; }
  const national = speciesList(raw.national, bases, "regional-dex.json", `${path}.national`, report), regions: DexLayout["regions"] = [];
  for (const [i, region] of raw.regions.entries()) {
    if (!obj(region) || !only(region, ["id", "species"]) || !integer(region.id,0,raw.regions.length-1) || regions.some(r=>r.id===region.id)) { report("regional-dex.json", `${path}.regions[${i}]`, "region ids must be unique and contiguous from 0"); continue; }
    regions.push({id:region.id as number, species:speciesList(region.species,bases,"regional-dex.json",`${path}.regions[${i}].species`,report)});
  }
  regions.sort((a,b)=>a.id-b.id);
  return {national,regions};
}
export function checkRegionalDex(raw: unknown, order: readonly SpeciesKey[], usable: (id: unknown) => string | null, report: ProgressionReport): RegionalDex & {source?:string} {
  const baseOrder = order.filter(k => !k.form).map(k => k.species), bases = new Set(baseOrder);
  const result: RegionalDex & {source?:string} = {national:[...baseOrder],regions:[],layoutIdentity:""};
  if (raw !== undefined) {
    if (!obj(raw) || !only(raw,["source","national","regions","transitions"]) || !dense(raw.regions)) report("regional-dex.json", "$", "must be {source,national?,regions,transitions?}");
    else {
      if (typeof raw.source === "string") result.source = raw.source;
      const problem = usable(raw.source); if (problem) report("regional-dex.json", "$.source", `source-unusable: ${problem}`);
      if (raw.national !== undefined) result.national = speciesList(raw.national,bases,"regional-dex.json","$.national",report);
      for (const [i, region] of raw.regions.entries()) {
        if (!obj(region) || !only(region,["id","nameKey","species"]) || !integer(region.id,0,raw.regions.length-1) || result.regions.some(r=>r.id===region.id) || !key(region.nameKey)) { report("regional-dex.json", `$.regions[${i}]`, "must have unique contiguous id and valid nameKey"); continue; }
        result.regions.push({id:region.id as number,nameKey:region.nameKey,species:speciesList(region.species,bases,"regional-dex.json",`$.regions[${i}].species`,report)});
      }
      result.regions.sort((a,b)=>a.id-b.id);
      if (raw.transitions !== undefined) {
        result.transitions=[];
        if (!dense(raw.transitions)) report("regional-dex.json","$.transitions","must be a dense array");
        else {
          const seen = new Set<string>();
          for (const [i,t] of raw.transitions.entries()) {
            const p=`$.transitions[${i}]`;
            if (!obj(t) || !only(t,["source","from","to","oldLayout","regionMap"]) || typeof t.from !== "string" || !/^[a-f0-9]{64}$/.test(t.from) || typeof t.to !== "string" || !/^[a-f0-9]{64}$/.test(t.to)) { report("regional-dex.json",p,"must be {source,from,to,oldLayout,regionMap} with SHA256 identities"); continue; }
            const gate=usable(t.source); if(gate) report("regional-dex.json",`${p}.source`,`source-unusable: ${gate}`);
            if(seen.has(t.from)) report("regional-dex.json",`${p}.from`,"ambiguous-layout-transition"); seen.add(t.from);
            const old=readLayout(t.oldLayout,null,`${p}.oldLayout`,report);
            if(old && layoutIdentity(old)!==t.from) report("regional-dex.json",`${p}.from`,"old-layout-hash-mismatch");
            if(t.to!==layoutIdentity(result)) report("regional-dex.json",`${p}.to`,"target-layout-mismatch");
            const froms=new Set<number>(),tos=new Set<number>(); let valid=dense(t.regionMap);
            if(valid && Array.isArray(t.regionMap)) for(const m of t.regionMap) {
              if(!obj(m)||!only(m,["from","to"])||!integer(m.from,-1,(old?.regions.length??0)-1)||froms.has(m.from)||!(m.to===null||integer(m.to,-1,result.regions.length-1))) {valid=false;continue;}
              froms.add(m.from);
              if(m.from===-1 ? m.to!==-1 : m.to===-1) valid=false;
              if(m.to!==null) {if(tos.has(m.to))valid=false;tos.add(m.to);}
            }
            if(!old || froms.size!==old.regions.length+1 || !froms.has(-1)) valid=false;
            if(!valid) report("regional-dex.json",`${p}.regionMap`,"invalid-region-map: include each old region and -1 exactly once; retained targets must be unique; -1 maps to -1");
            if(old) result.transitions.push(copy(t) as unknown as DexLayoutTransition);
          }
        }
      }
    }
  }
  result.layoutIdentity=layoutIdentity(result);
  return result;
}
export function checkMapMetadata(raw: unknown, regional: RegionalDex, usable: (id: unknown) => string | null, report: ProgressionReport): MapMetadata | undefined {
  if(raw===undefined)return undefined;
  if(!obj(raw)||!only(raw,["source","maps"])||!obj(raw.maps)){report("map-metadata.json","$","must be {source,maps}");return undefined;}
  const problem=usable(raw.source);if(problem)report("map-metadata.json","$.source",`source-unusable: ${problem}`);
  for(const [mapId,value] of Object.entries(raw.maps)) {
    const p=`$.maps.${mapId}`;
    if(!/^[1-9][0-9]*$/.test(mapId)||!Number.isSafeInteger(Number(mapId)))report("map-metadata.json",p,"map id must be a positive safe integer");
    if(!obj(value)||!only(value,["region","flags","darkMap"])){report("map-metadata.json",p,"must be {region?,flags?,darkMap?}");continue;}
    if(value.region!==undefined&&!integer(value.region,0,regional.regions.length-1))report("map-metadata.json",`${p}.region`,"unknown region");
    if(value.flags!==undefined&&(!dense(value.flags)||!value.flags.every(text)))report("map-metadata.json",`${p}.flags`,"must be an array of non-empty flags");
    if(value.darkMap!==undefined&&typeof value.darkMap!=="boolean")report("map-metadata.json",`${p}.darkMap`,"must be boolean");
  }
  return copy(raw) as unknown as MapMetadata;
}
