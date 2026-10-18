/**
 * Pure content compiler: validate authored JSON (every problem is located by file and path), apply overlays with
 * conflict detection, emit one canonical document whose `inputsHash` covers every input. No file system, no Showdown.
 */
import { createHash } from "node:crypto";
import {
  CURVES_ALLOWED, OVERRIDABLE, SCHEMA_VERSION, STAT_KEYS_ALLOWED,
} from "./schema.ts";
import type { CompiledContent, ContentError, ContentInputs, Overlay, SourceEntry, SpeciesSource } from "./schema.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** Deterministic JSON: object keys sorted, no insignificant whitespace variance. */
export function canonicalJson(v: unknown, indent = 0): string {
  const sort = (x: unknown): unknown => Array.isArray(x) ? x.map(sort) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x;
  return JSON.stringify(sort(v), null, indent);
}

export function hashInputs(inputs: ContentInputs): string {
  return createHash("sha256").update(canonicalJson({ manifest: inputs.manifest, sources: inputs.sources, species: inputs.species, overlays: inputs.overlays })).digest("hex");
}

const ID = /^[a-z][a-z0-9-]{0,30}$/;
const SHOWDOWN_ID = /^[a-z0-9]{1,40}$/;
const NAME_KEY = /^[a-z][a-z0-9_.]{1,60}$/;

type Report = (file: ContentError["file"], path: string, message: string) => void;

function checkKnownKeys(o: Obj, allowed: readonly string[], file: ContentError["file"], path: string, report: Report): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) report(file, `${path}.${k}`, `unknown field "${k}" (allowed: ${allowed.join(", ")})`);
}

/** Field validators shared by species records and overlay values. Return a problem text or null. */
const FIELD_CHECK: Record<string, (v: unknown) => string | null> = {
  nameKey: (v) => typeof v === "string" && NAME_KEY.test(v) ? null : "must be a text key like \"species.pidgey\" (lowercase letters, digits, _ and .)",
  growth: (v) => typeof v === "string" && (CURVES_ALLOWED as readonly string[]).includes(v) ? null : `must be one of ${CURVES_ALLOWED.join("|")}`,
  baseExp: (v) => isInt(v, 1, 1000) ? null : "must be an integer from 1 to 1000",
  catchRate: (v) => isInt(v, 0, 255) ? null : "must be an integer from 0 to 255",
  evYield: (v) => {
    if (!isObj(v)) return "must be an object like {\"spe\": 1}";
    for (const [k, n] of Object.entries(v)) {
      if (!(STAT_KEYS_ALLOWED as readonly string[]).includes(k)) return `unknown stat "${k}" (allowed: ${STAT_KEYS_ALLOWED.join(", ")})`;
      if (!isInt(n, 0, 255)) return `${k} must be an integer from 0 to 255`;
    }
    return null;
  },
  learnset: (v) => {
    if (!Array.isArray(v)) return "must be an array of {level, move}";
    const seen = new Set<string>();
    for (const [i, e] of v.entries()) {
      if (!isObj(e) || !isInt(e["level"], 1, 100) || typeof e["move"] !== "string" || !SHOWDOWN_ID.test(e["move"])) return `entry ${i} must be {level: 1..100, move: "<showdown move id>"}`;
      const key = `${e["level"]}:${e["move"]}`;
      if (seen.has(key)) return `entry ${i} repeats level ${e["level"]} / move ${e["move"]}`;
      seen.add(key);
    }
    return null;
  },
};

export type CompileResult = { ok: true; data: CompiledContent; errors: [] } | { ok: false; errors: ContentError[] };

export function compileContent(inputs: ContentInputs): CompileResult {
  const errors: ContentError[] = [];
  const report: Report = (file, path, message) => { errors.push({ file, path, message }); };

  // ---- manifest
  let contentId = "";
  if (!isObj(inputs.manifest)) report("manifest.json", "$", "must be an object");
  else {
    const m = inputs.manifest;
    checkKnownKeys(m, ["schema", "id", "title"], "manifest.json", "$", report);
    if (m["schema"] !== SCHEMA_VERSION) report("manifest.json", "$.schema", `must be ${SCHEMA_VERSION} (this compiler only knows schema ${SCHEMA_VERSION})`);
    if (typeof m["id"] !== "string" || !ID.test(m["id"])) report("manifest.json", "$.id", "must be an id like \"sample\"");
    else contentId = m["id"];
    if (typeof m["title"] !== "string" || !m["title"]) report("manifest.json", "$.title", "must be a non-empty string");
  }

  // ---- sources registry
  const sources: SourceEntry[] = [];
  const sourceIds = new Set<string>();
  if (!Array.isArray(inputs.sources)) report("sources.json", "$", "must be an array");
  else for (const [i, s] of inputs.sources.entries()) {
    const p = `[${i}]`;
    if (!isObj(s)) { report("sources.json", p, "must be an object"); continue; }
    checkKnownKeys(s, ["id", "kind", "description", "license", "ref", "status", "usedFor"], "sources.json", p, report);
    if (typeof s["id"] !== "string" || !ID.test(s["id"])) report("sources.json", `${p}.id`, "must be an id");
    else if (sourceIds.has(s["id"])) report("sources.json", `${p}.id`, `duplicate source id "${s["id"]}"`);
    else sourceIds.add(s["id"]);
    if (!["showdown", "author-placeholder", "spec-derived"].includes(s["kind"] as string)) report("sources.json", `${p}.kind`, "must be showdown|author-placeholder|spec-derived");
    if (!["confirmed", "placeholder", "pending"].includes(s["status"] as string)) report("sources.json", `${p}.status`, "must be confirmed|placeholder|pending");
    for (const k of ["description", "license", "ref"]) if (typeof s[k] !== "string" || !s[k]) report("sources.json", `${p}.${k}`, "must be a non-empty string");
    if (!Array.isArray(s["usedFor"]) || s["usedFor"].some((x) => typeof x !== "string")) report("sources.json", `${p}.usedFor`, "must be an array of strings");
    sources.push(s as unknown as SourceEntry);
  }

  // ---- species
  const species: SpeciesSource[] = [];
  const ids = new Set<string>();
  const nameKeys = new Map<string, string>();
  if (!Array.isArray(inputs.species)) report("species.json", "$", "must be an array");
  else for (const [i, s] of inputs.species.entries()) {
    const p = `[${i}]`;
    if (!isObj(s)) { report("species.json", p, "must be an object"); continue; }
    checkKnownKeys(s, ["id", "showdownId", "nameKey", "growth", "baseExp", "evYield", "catchRate", "learnset", "source"], "species.json", p, report);
    const label = typeof s["id"] === "string" ? `${p} (${s["id"]})` : p;
    if (typeof s["id"] !== "string" || !ID.test(s["id"])) report("species.json", `${p}.id`, "must be an id like \"pidgey\"");
    else if (ids.has(s["id"])) report("species.json", `${p}.id`, `duplicate species id "${s["id"]}"`);
    else ids.add(s["id"]);
    if (typeof s["showdownId"] !== "string" || !SHOWDOWN_ID.test(s["showdownId"])) report("species.json", `${p}.showdownId`, "must be a Showdown species id (lowercase letters and digits)");
    for (const f of ["nameKey", "growth", "baseExp", "catchRate", "evYield", "learnset"] as const) {
      if (!(f in s)) { report("species.json", `${p}.${f}`, `missing required field "${f}" in ${label}`); continue; }
      const problem = FIELD_CHECK[f]!(s[f]);
      if (problem) report("species.json", `${p}.${f}`, `${problem} (in ${label})`);
    }
    if (typeof s["nameKey"] === "string") {
      const prev = nameKeys.get(s["nameKey"]);
      if (prev !== undefined) report("species.json", `${p}.nameKey`, `text key "${s["nameKey"]}" is already used by ${prev}`);
      else nameKeys.set(s["nameKey"], label);
    }
    if (typeof s["source"] !== "string" || !sourceIds.has(s["source"])) report("species.json", `${p}.source`, `must name an entry of sources.json (known: ${[...sourceIds].join(", ") || "none"})`);
    species.push(s as unknown as SpeciesSource);
  }

  // ---- overlays: author patches on top of the base records, never silently conflicting
  let overlaysApplied = 0;
  const merged = new Map<string, SpeciesSource>(species.map((sp) => [`species/${sp.id}`, JSON.parse(JSON.stringify(sp)) as SpeciesSource]));
  const setBy = new Map<string, number>();
  if (!Array.isArray(inputs.overlays)) report("overlays.json", "$", "must be an array");
  else for (const [i, o] of inputs.overlays.entries()) {
    const p = `[${i}]`;
    if (!isObj(o)) { report("overlays.json", p, "must be an object"); continue; }
    checkKnownKeys(o, ["target", "set", "reason"], "overlays.json", p, report);
    if (typeof o["reason"] !== "string" || !o["reason"]) report("overlays.json", `${p}.reason`, "an overlay must say why (non-empty reason)");
    const target = typeof o["target"] === "string" ? merged.get(o["target"]) : undefined;
    if (!target) { report("overlays.json", `${p}.target`, `target ${JSON.stringify(o["target"])} does not exist (expected "species/<id>")`); continue; }
    if (!isObj(o["set"]) || !Object.keys(o["set"]).length) { report("overlays.json", `${p}.set`, "must be a non-empty object of fields to replace"); continue; }
    let ok = true;
    for (const [f, v] of Object.entries(o["set"])) {
      if (!(OVERRIDABLE as readonly string[]).includes(f)) { report("overlays.json", `${p}.set.${f}`, `field "${f}" cannot be overridden (allowed: ${OVERRIDABLE.join(", ")})`); ok = false; continue; }
      const problem = FIELD_CHECK[f]!(v);
      if (problem) { report("overlays.json", `${p}.set.${f}`, problem); ok = false; continue; }
      const key = `${o["target"]}#${f}`;
      if (setBy.has(key)) { report("overlays.json", `${p}.set.${f}`, `conflicts with overlay [${setBy.get(key)}]: both replace ${f} of ${o["target"]}`); ok = false; continue; }
      setBy.set(key, i);
    }
    if (!ok) continue;
    Object.assign(target, JSON.parse(JSON.stringify(o["set"])) as Overlay["set"]);
    overlaysApplied++;
  }

  if (errors.length) return { ok: false, errors };
  const data: CompiledContent = {
    schema: SCHEMA_VERSION, contentId, inputsHash: hashInputs(inputs), sources: [...sources].sort((a, b) => a.id.localeCompare(b.id)),
    overlaysApplied, species: [...merged.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return { ok: true, data, errors: [] };
}

/** Is a compiled document still the build of exactly these inputs? (stale or missing output must not pass as current) */
export function checkFresh(compiled: unknown, inputs: ContentInputs): ContentError | null {
  if (!isObj(compiled) || typeof compiled["inputsHash"] !== "string") return { file: "compiled", path: "$.inputsHash", message: "compiled content is missing or has no inputsHash: run the content build" };
  const now = hashInputs(inputs);
  if (compiled["inputsHash"] !== now) return { file: "compiled", path: "$.inputsHash", message: `compiled content is stale (built from ${compiled["inputsHash"].slice(0, 12)}, inputs are now ${now.slice(0, 12)}): run the content build` };
  return null;
}
