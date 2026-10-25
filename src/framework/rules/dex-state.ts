/** Schema 7 Pokédex state and the single, author-declared layout transition. Pure, with no history inference. */
import { sha256Hex } from "./sha256.ts";
import { speciesDataOf, MAX_FORM } from "./species-key.ts";
import type { Content, DexLayout, DexLayoutTransition, DexState } from "./types.ts";

interface Problem { path: string; message: string }

type Obj = Record<string, unknown>;
const object = (x: unknown): x is Obj => x !== null && typeof x === "object" && !Array.isArray(x);
const integer = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max;
const hash = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
const id = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9#._:-]{1,64}$/.test(x);
const dense = (x: unknown): x is unknown[] => Array.isArray(x) && Array.from({ length: x.length }, (_, i) => Object.hasOwn(x, i)).every(Boolean);
const keys = (x: Obj, allowed: readonly string[], path: string, out: Problem[]): void => {
  for (const key of allowed) if (!Object.hasOwn(x, key) && key in x) out.push({path: `${path}.${key}`, message: "persistent fields must be own data, never inherited"});
  for (const k of Object.keys(x)) if (!allowed.includes(k)) out.push({ path: `${path}.${k}`, message: "unknown field" });
};
const speciesList = (x: unknown, path: string, out: Problem[]): void => {
  if (!dense(x) || x.some(v => !id(v)) || new Set(x).size !== x.length) out.push({ path, message: "must be a dense ordered list of unique species identities" });
};

/** Exactly the canonical layout shape: translation names, sources and transitions do not affect its identity. */
export function dexLayoutIdentity(layout: DexLayout): string {
  return sha256Hex(JSON.stringify({ national: layout.national, regions: layout.regions.map(r => ({ id: r.id, species: r.species })) }));
}

function layoutProblems(x: unknown, path: string, out: Problem[], historical = false): x is DexLayout {
  const start = out.length;
  if (!object(x)) { out.push({ path, message: "must be a complete dex layout" }); return false; }
  if (historical) keys(x, ["national", "regions"], path, out);
  speciesList(x["national"], `${path}.national`, out);
  if (!dense(x["regions"])) out.push({ path: `${path}.regions`, message: "must be a dense ordered region list" });
  else x["regions"].forEach((region, i) => {
    const p = `${path}.regions[${i}]`;
    if (!object(region)) { out.push({ path: p, message: "must be a region record" }); return; }
    keys(region, historical ? ["id", "species"] : ["id", "species", "nameKey"], p, out);
    if (region["id"] !== i) out.push({ path: `${p}.id`, message: "region IDs must be consecutive from zero in order" });
    if (!historical && (typeof region["nameKey"] !== "string" || !region["nameKey"].length)) out.push({ path: `${p}.nameKey`, message: "must be an explicit translation key" });
    speciesList(region["species"], `${p}.species`, out);
  });
  return out.length === start;
}

/** The content assembler owns source verification; these are defensive shape, identity and reference checks. */
export function dexContentProblems(content: Content): Problem[] {
  const out: Problem[] = [], dex = content.regionalDex, path = "$content.regionalDex";
  if (!dex) return [{ path, message: "needs-content: a validated regional dex layout is required" }];
  if (!layoutProblems(dex, path, out)) return out;
  if (!hash(dex.layoutIdentity) || dex.layoutIdentity !== dexLayoutIdentity(dex)) out.push({ path: `${path}.layoutIdentity`, message: "target-layout-mismatch: does not identify the current canonical layout" });
  for (const [p, species] of [[`${path}.national`, dex.national], ...dex.regions.map(r => [`${path}.regions[${r.id}].species`, r.species] as const)] as const) {
    species.forEach((base, i) => { if (!speciesDataOf(content, { species: base, form: 0 })) out.push({ path: `${p}[${i}]`, message: "unmapped species content identity" }); });
  }
  if (dex.transitions !== undefined && !dense(dex.transitions)) { out.push({ path: `${path}.transitions`, message: "must be a dense transition list" }); return out; }
  const froms = new Set<string>();
  for (const [i, raw] of (dex.transitions ?? []).entries()) {
    const p = `${path}.transitions[${i}]`, t: unknown = raw;
    if (!object(t)) { out.push({ path: p, message: "must be a transition record" }); continue; }
    keys(t, ["source", "from", "to", "oldLayout", "regionMap"], p, out);
    if (typeof t["source"] !== "string" || !t["source"].length) out.push({ path: `${p}.source`, message: "source-unusable: an explicit verified source identity is required" });
    if (!hash(t["from"])) out.push({ path: `${p}.from`, message: "must be a lowercase SHA256 identity" });
    else { if (froms.has(t["from"])) out.push({ path: `${p}.from`, message: "ambiguous-layout-transition: duplicate from identity" }); froms.add(t["from"]); }
    if (t["to"] !== dex.layoutIdentity) out.push({ path: `${p}.to`, message: "target-layout-mismatch: every transition must target current layout" });
    if (!layoutProblems(t["oldLayout"], `${p}.oldLayout`, out, true)) continue;
    const old = t["oldLayout"];
    if (dexLayoutIdentity(old) !== t["from"]) out.push({ path: `${p}.oldLayout`, message: "old-layout-hash-mismatch" });
    const mappings = t["regionMap"];
    if (!dense(mappings)) { out.push({ path: `${p}.regionMap`, message: "invalid-region-map: must be a dense complete mapping" }); continue; }
    const sources = new Set<number>(), targets = new Set<number>();
    for (const [j, entry] of mappings.entries()) {
      const mp = `${p}.regionMap[${j}]`;
      if (!object(entry)) { out.push({ path: mp, message: "invalid-region-map: must be {from,to}" }); continue; }
      keys(entry, ["from", "to"], mp, out);
      const f = entry["from"], to = entry["to"];
      if (!integer(f, -1, old.regions.length - 1) || sources.has(f)) out.push({ path: `${mp}.from`, message: "invalid-region-map: unknown or repeated old region" });
      else sources.add(f);
      if (f === -1 ? to !== -1 : to !== null && !integer(to, 0, dex.regions.length - 1)) out.push({ path: `${mp}.to`, message: "invalid-region-map: national must stay -1; regions map to current regions or null" });
      if (typeof to === "number") { if (targets.has(to)) out.push({ path: `${mp}.to`, message: "invalid-region-map: retained regions must map one to one" }); targets.add(to); }
    }
    if (sources.size !== old.regions.length + 1) out.push({ path: `${p}.regionMap`, message: "invalid-region-map: every old region and national -1 require exactly one entry" });
  }
  return out;
}

/** Omitting content is an explicit empty, national-only pure fixture; provided content must carry a valid layout. */
export function createDexState(content?: Content, legacy: { seen: string[]; owned: string[] } = { seen: [], owned: [] }, origin: "new" | "migration" = "new"): DexState {
  const problems = content ? dexContentProblems(content) : [];
  if (problems.length) throw new Error(`${problems[0]!.path}: ${problems[0]!.message}`);
  const layout = content?.regionalDex ?? { national: [], regions: [] };
  const hasDex = origin === "migration" && (legacy.seen.length > 0 || legacy.owned.length > 0);
  const unlocked = Array<boolean>(layout.regions.length + 1).fill(false);
  if (origin === "new" || hasDex) unlocked[0] = true;
  return { seen: [...legacy.seen], owned: [...legacy.owned], hasDex, seenForms: {}, lastSeenForm: {}, capturedCounts: {}, defeatedCounts: {},
    unlocked, view: { region: layout.regions.length ? 0 : -1, indices: Array<number>(unlocked.length).fill(0), mode: 0 }, layoutIdentity: dexLayoutIdentity(layout) };
}

/** Content-independent shape. In particular, bad current documents are never normalized into valid documents. */
export function dexStateProblems(value: unknown): Problem[] {
  const out: Problem[] = [], path = "$.dex";
  if (!object(value)) return [{ path, message: "must be a complete schema 7 dex record" }];
  keys(value, ["seen", "owned", "hasDex", "seenForms", "lastSeenForm", "capturedCounts", "defeatedCounts", "unlocked", "view", "layoutIdentity"], path, out);
  for (const key of ["seen", "owned"]) speciesList(value[key], `${path}.${key}`, out);
  if (typeof value["hasDex"] !== "boolean") out.push({ path: `${path}.hasDex`, message: "must be boolean" });
  if (!hash(value["layoutIdentity"])) out.push({ path: `${path}.layoutIdentity`, message: "must be a lowercase SHA256 layout identity" });
  const formRecord = (r: unknown, p: string, maxGender: number): void => {
    if (!object(r)) { out.push({ path: p, message: "must be {gender,shiny,form}" }); return; }
    keys(r, ["gender", "shiny", "form"], p, out);
    if (!integer(r["gender"], 0, maxGender) || typeof r["shiny"] !== "boolean" || !integer(r["form"], 0, MAX_FORM)) out.push({ path: p, message: `must contain gender 0..${maxGender}, boolean shiny and form 0..${MAX_FORM}` });
  };
  for (const name of ["seenForms", "lastSeenForm", "capturedCounts", "defeatedCounts"]) {
    const dict = value[name], p = `${path}.${name}`;
    if (!object(dict)) { out.push({ path: p, message: "must be a species-keyed record" }); continue; }
    for (const [key, entry] of Object.entries(dict)) {
      const ep = `${p}[${JSON.stringify(key)}]`;
      if (!id(key)) out.push({ path: ep, message: "must have a species identity key" });
      if (name === "seenForms") {
        if (!dense(entry)) out.push({ path: ep, message: "must be a dense ordered form list" });
        else {
          const seen = new Set<string>();
          for (const [i, record] of entry.entries()) {
            formRecord(record, `${ep}[${i}]`, 1);
            if (object(record)) { const identity = JSON.stringify([record["gender"], record["shiny"], record["form"]]); if (seen.has(identity)) out.push({ path: `${ep}[${i}]`, message: "duplicate seen form" }); seen.add(identity); }
          }
        }
      } else if (name === "lastSeenForm") formRecord(entry, ep, 2);
      else if (!integer(entry)) out.push({ path: ep, message: "must be a nonnegative safe integer" });
    }
  }
  const unlocked = value["unlocked"];
  if (!dense(unlocked) || !unlocked.length || unlocked.some(v => typeof v !== "boolean")) out.push({ path: `${path}.unlocked`, message: "must be a dense boolean list including national" });
  const view = value["view"];
  if (!object(view)) out.push({ path: `${path}.view`, message: "must be {region,indices,mode}" });
  else {
    keys(view, ["region", "indices", "mode"], `${path}.view`, out);
    if (!integer(view["region"], -1)) out.push({ path: `${path}.view.region`, message: "must be -1 or a nonnegative region ID" });
    if (!dense(view["indices"]) || view["indices"].some(v => !integer(v))) out.push({ path: `${path}.view.indices`, message: "must be a dense nonnegative integer cursor list" });
    if (!integer(view["mode"], 0, 5)) out.push({ path: `${path}.view.mode`, message: "must be one of the six search order modes 0..5" });
  }
  return out;
}

export function dexLayoutStateProblems(dex: DexState, layout: DexLayout): Problem[] {
  const out: Problem[] = [], n = layout.regions.length;
  if (dex.unlocked.length !== n + 1) out.push({ path: "$.dex.unlocked", message: "length must equal region count plus national" });
  if (dex.view.indices.length !== n + 1) out.push({ path: "$.dex.view.indices", message: "length must equal region count plus national" });
  if (dex.view.region !== -1 && !integer(dex.view.region, 0, n - 1)) out.push({ path: "$.dex.view.region", message: "unknown region in this layout" });
  for (const [i, table] of [...layout.regions.map(r => r.species), layout.national].entries()) {
    if (!integer(dex.view.indices[i], 0, Math.max(0, table.length - 1))) out.push({ path: `$.dex.view.indices[${i}]`, message: "cursor outside this layout table (empty tables only allow zero)" });
  }
  return out;
}

/** Call only after structure/content/old-layout validation. The caller owns the cloned document. */
export function remapDexLayout(dex: DexState, target: NonNullable<Content["regionalDex"]>, transition: DexLayoutTransition, notes: string[]): void {
  const old = transition.oldLayout, unlocked = Array<boolean>(target.regions.length + 1).fill(false), indices = Array<number>(unlocked.length).fill(0);
  const index = (region: number, count: number): number => region === -1 ? count : region;
  const table = (layout: DexLayout, region: number): string[] => region === -1 ? layout.national : layout.regions[region]!.species;
  for (const mapping of transition.regionMap) {
    if (mapping.to === null) { notes.push(`dex layout: deleted region ${mapping.from}; its unlock and cursor were removed, no region was unlocked`); continue; }
    const oi = index(mapping.from, old.regions.length), ni = index(mapping.to, target.regions.length);
    unlocked[ni] = dex.unlocked[oi]!;
    const baseId = table(old, mapping.from)[dex.view.indices[oi]!];
    const cursor = baseId === undefined ? -1 : table(target, mapping.to).indexOf(baseId);
    indices[ni] = Math.max(0, cursor);
    if (baseId !== undefined && cursor < 0) notes.push(`dex layout: region ${mapping.from} cursor species ${baseId} is absent from target region ${mapping.to}; cursor reset to zero`);
  }
  const selected = transition.regionMap.find(m => m.from === dex.view.region)!.to;
  dex.view.region = selected === null ? target.regions.length ? 0 : -1 : selected;
  if (selected === null) notes.push(`dex layout: viewed region was deleted; view reset to ${dex.view.region} without granting unlock`);
  dex.unlocked = unlocked; dex.view.indices = indices; dex.layoutIdentity = target.layoutIdentity;
}
