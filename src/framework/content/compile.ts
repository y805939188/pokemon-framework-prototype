/**
 * Pure content compiler: validate authored JSON (every problem is located by file and path), apply overlays with
 * conflict detection, emit one canonical document whose `inputsHash` covers every input. No file system, no Showdown.
 */
import { sha256Hex } from "../rules/sha256";
import { checkItemInputs } from "./item-input";
import { DEFAULT_LIMITS } from "../rules/limits";
import { MAX_FORM } from "../rules/species-key";
import { checkOverrides, developmentCapabilities } from "../rules/config";
import {
  CURVES_ALLOWED, GRANT_ID, OVERRIDABLE, AUTHOR_SCHEMA_VERSION, COMPILED_SCHEMA_VERSION, SOURCE_KINDS, STAT_KEYS_ALLOWED, USAGE_DECISIONS,
} from "./schema";
import { CONTENT_SHOWDOWN_SHA } from "./showdown-pin";
import { PROGRESSION_FIELDS, progressionFieldProblem, inheritSpecies, deriveSpeciesFields, checkProgressionReferences, checkRegionalDex, checkMapMetadata } from "./progression-input";
import type { CompiledContent, ContentError, ContentInputs, GrantSource, Overlay, SourceEntry, SpeciesSource } from "./schema";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** Deterministic JSON: object keys sorted, no insignificant whitespace variance. */
export function canonicalJson(v: unknown, indent = 0): string {
  const sort = (x: unknown): unknown => Array.isArray(x) ? x.map(sort) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x;
  return JSON.stringify(sort(v), null, indent);
}

export function hashInputs(inputs: ContentInputs): string {
  // grants/settings are undefined for content without those files: JSON drops the key, so older hashes are unchanged
  return sha256Hex(canonicalJson({ manifest: inputs.manifest, sources: inputs.sources, species: inputs.species, overlays: inputs.overlays, grants: inputs.grants, settings: inputs.settings, items: inputs.items, shops: inputs.shops, regionalDex: inputs.regionalDex, mapMetadata: inputs.mapMetadata }));
}

const ID = /^[a-z][a-z0-9-]{0,30}$/;
const SHOWDOWN_ID = /^[a-z0-9]{1,40}$/;
const NAME_KEY = /^[a-z][a-z0-9_.]{1,60}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Overlay/target key of a species record: "species/<id>" for the base form, "species/<id>/<form>" otherwise. */
const recordKey = (id: string, form: number): string => (form ? `species/${id}/${form}` : `species/${id}`);

type Report = (file: ContentError["file"], path: string, message: string) => void;

function checkKnownKeys(o: Obj, allowed: readonly string[], file: ContentError["file"], path: string, report: Report): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) report(file, `${path}.${k}`, `unknown field "${k}" (allowed: ${allowed.join(", ")})`);
}

/** Field validators shared by species records and overlay values. Return a problem text or null. */
const FIELD_CHECK: Record<string, (v: unknown) => string | null> = {
  nameKey: (v) => typeof v === "string" && NAME_KEY.test(v) ? null : "must be a text key like \"species.pidgey\" (lowercase letters, digits, _ and .)",
  growth: (v) => typeof v === "string" && (CURVES_ALLOWED as readonly string[]).includes(v) ? null : `must be one of ${CURVES_ALLOWED.join("|")}`,
  baseExp: (v) => isInt(v, 1, 1000) ? null : "must be an integer from 1 to 1000",
  happiness: (v) => isInt(v, 0, Number.MAX_SAFE_INTEGER) ? null : "must be a nonnegative safe integer (creation does not clamp at 255)",
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
      if (!isObj(e) || !isInt(e["level"], 0, 100) || typeof e["move"] !== "string" || !SHOWDOWN_ID.test(e["move"])) return `entry ${i} must be {level: 0..100, move: "<showdown move id>"}`;
      const key = `${e["level"]}:${e["move"]}`;
      if (seen.has(key)) return `entry ${i} repeats level ${e["level"]} / move ${e["move"]}`;
      seen.add(key);
    }
    return null;
  },
};
export function speciesFieldProblem(field: string, value: unknown): string | null { return FIELD_CHECK[field]?.(value) ?? null; }
for (const field of PROGRESSION_FIELDS) FIELD_CHECK[field] = value => progressionFieldProblem(field, value);

export type CompileResult = { ok: true; data: CompiledContent; errors: []; warnings: ContentError[] } | { ok: false; errors: ContentError[] };

/** Located problems of a pre-use check record (DETAILED-PLAN §280, D5-2); empty = complete. */
export function usageCheckProblems(u: unknown, path: string): { path: string; message: string }[] {
  if (!isObj(u)) return [{ path, message: "must be {checkedOn, checkedBy, conditions, decision}" }];
  const out: { path: string; message: string }[] = [];
  for (const k of Object.keys(u)) if (!["checkedOn", "checkedBy", "conditions", "decision"].includes(k)) out.push({ path: `${path}.${k}`, message: `unknown field "${k}" (allowed: checkedOn, checkedBy, conditions, decision)` });
  if (typeof u["checkedOn"] !== "string" || !DATE.test(u["checkedOn"])) out.push({ path: `${path}.checkedOn`, message: "must be a date YYYY-MM-DD" });
  for (const k of ["checkedBy", "conditions"]) if (typeof u[k] !== "string" || !u[k]) out.push({ path: `${path}.${k}`, message: "must be a non-empty string" });
  if (!(USAGE_DECISIONS as readonly string[]).includes(u["decision"] as string)) out.push({ path: `${path}.decision`, message: `must be ${USAGE_DECISIONS.join("|")}` });
  return out;
}

/** Validate sources.json (every problem reported with its path); returns the entries, for the pre-use gate. */
export function checkSources(raw: unknown, report: (file: "sources.json", path: string, message: string) => void): SourceEntry[] {
  const sources: SourceEntry[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) { report("sources.json", "$", "must be an array"); return sources; }
  for (const [i, s] of raw.entries()) {
    const p = `[${i}]`;
    if (!isObj(s)) { report("sources.json", p, "must be an object"); continue; }
    for (const k of Object.keys(s)) if (!["id", "kind", "description", "license", "ref", "status", "usedFor", "usageCheck"].includes(k)) report("sources.json", `${p}.${k}`, `unknown field "${k}" (allowed: id, kind, description, license, ref, status, usedFor, usageCheck)`);
    if (typeof s["id"] !== "string" || !ID.test(s["id"])) report("sources.json", `${p}.id`, "must be an id");
    else if (seen.has(s["id"])) report("sources.json", `${p}.id`, `duplicate source id "${s["id"]}"`);
    else seen.add(s["id"]);
    if (!(SOURCE_KINDS as readonly string[]).includes(s["kind"] as string)) report("sources.json", `${p}.kind`, `must be ${SOURCE_KINDS.join("|")}`);
    if (!["confirmed", "placeholder", "pending"].includes(s["status"] as string)) report("sources.json", `${p}.status`, "must be confirmed|placeholder|pending");
    for (const k of ["description", "license", "ref"]) if (typeof s[k] !== "string" || !s[k]) report("sources.json", `${p}.${k}`, "must be a non-empty string");
    if (!Array.isArray(s["usedFor"]) || s["usedFor"].some((x) => typeof x !== "string")) report("sources.json", `${p}.usedFor`, "must be an array of strings");
    if (s["usageCheck"] !== undefined) for (const pr of usageCheckProblems(s["usageCheck"], `${p}.usageCheck`)) report("sources.json", pr.path, pr.message);
    sources.push(s as unknown as SourceEntry);
  }
  return sources;
}

/**
 * The pre-use gate (DETAILED-PLAN §280, D5-2): may data of source `id` be used? null = yes. A record may only use a
 * source whose terms were checked first (a complete usageCheck that is not "not-allowed"); an explicit author
 * placeholder without a check is exempt (it is the project's own stand-in data). An explicit denial still applies.
 */
export function preUseProblem(sources: readonly SourceEntry[], id: unknown): string | null {
  const src = sources.find((x) => x.id === id);
  if (!src) return `must name an entry of sources.json (known: ${sources.map((x) => x.id).join(", ") || "none"})`;
  if (src.kind === "author-placeholder" && src.status === "placeholder" && src.usageCheck === undefined) return null;
  if (src.usageCheck === undefined) return `source "${src.id}" has no recorded pre-use check (usageCheck): its data may not be used yet`;
  if (usageCheckProblems(src.usageCheck, "usageCheck").length) return `source "${src.id}" has an incomplete pre-use check (usageCheck needs checkedOn, checkedBy, conditions and a decision): its data may not be used yet`;
  if (src.usageCheck.decision === "not-allowed") return `source "${src.id}" was checked and may not be used (${src.usageCheck.conditions})`;
  return null;
}

/** Species and moves are read from one pinned Showdown build: its source must be unambiguous and pass the gate. */
export function showdownDependencyProblem(sources: readonly SourceEntry[]): string | null {
  const sd = sources.filter((x) => x.kind === "showdown");
  if (!sd.length) return "the content's species and moves are read from the pinned Showdown build, but sources.json registers no source of kind \"showdown\" (register it with its pre-use check)";
  if (sd.length > 1) return `the pinned Showdown source is ambiguous (${sd.map((x) => x.id).join(", ")}): register exactly one source of kind "showdown" for the build in use`;
  const problem = preUseProblem(sources, sd[0]!.id);
  return problem ? `the content's species and moves are read from the pinned Showdown build: ${problem}` : null;
}

export function compileContent(inputs: ContentInputs, developerCapabilities: unknown = {}, context: { showdownSha: string } = { showdownSha: CONTENT_SHOWDOWN_SHA }): CompileResult {
  const capabilities = developmentCapabilities(developerCapabilities);
  const errors: ContentError[] = [];
  const report: Report = (file, path, message) => { errors.push({ file, path, message }); };

  // ---- manifest
  let contentId = "";
  if (!isObj(inputs.manifest)) report("manifest.json", "$", "must be an object");
  else {
    const m = inputs.manifest;
    checkKnownKeys(m, ["schema", "id", "title"], "manifest.json", "$", report);
    if (m["schema"] !== AUTHOR_SCHEMA_VERSION) report("manifest.json", "$.schema", `must be ${AUTHOR_SCHEMA_VERSION} (this compiler only knows schema ${AUTHOR_SCHEMA_VERSION})`);
    if (typeof m["id"] !== "string" || !ID.test(m["id"])) report("manifest.json", "$.id", "must be an id like \"sample\"");
    else contentId = m["id"];
    if (typeof m["title"] !== "string" || !m["title"]) report("manifest.json", "$.title", "must be a non-empty string");
  }

  // ---- sources registry, and the pre-use gate of its entries (checkSources / preUseProblem below)
  const sources = checkSources(inputs.sources, report);
  const usable = (id: unknown): string | null => preUseProblem(sources, id);
  // every species record is resolved against the pinned Showdown data: that dependency passes the same gate, whatever
  // source the record's own fields name (an author placeholder covers its numbers, not the Showdown data under them)
  if (Array.isArray(inputs.species) && inputs.species.length) {
    const dep = showdownDependencyProblem(sources);
    if (dep) report("sources.json", "$", dep);
  }

  const itemInputs = checkItemInputs(inputs.items, inputs.shops, usable);
  errors.push(...itemInputs.errors);

  // ---- species
  const species: SpeciesSource[] = [];
  const ids = new Set<string>(); // content ids with a base form
  const keys = new Set<string>();
  const nameKeys = new Map<string, {label:string;id:unknown}>();
  if (!Array.isArray(inputs.species)) report("species.json", "$", "must be an array");
  else for (const [i, s] of inputs.species.entries()) {
    const p = `[${i}]`;
    if (!isObj(s)) { report("species.json", p, "must be an object"); continue; }
    checkKnownKeys(s, ["id", "form", "showdownId", "nameKey", "growth", "baseExp", "evYield", "catchRate", "happiness", "learnset", "source", ...PROGRESSION_FIELDS], "species.json", p, report);
    const form = s["form"] === undefined ? 0 : s["form"];
    if (!isInt(form, 0, MAX_FORM)) report("species.json", `${p}.form`, `must be an integer from 0 to ${MAX_FORM} (0 = the base form)`);
    const label = typeof s["id"] === "string" ? `${p} (${s["id"]}${form ? ` form ${String(form)}` : ""})` : p;
    if (typeof s["id"] !== "string" || !ID.test(s["id"])) report("species.json", `${p}.id`, "must be an id like \"pidgey\"");
    else if (isInt(form, 0, MAX_FORM)) {
      const key = recordKey(s["id"], form);
      if (keys.has(key)) report("species.json", `${p}.id`, form ? `duplicate form ${form} of species "${s["id"]}"` : `duplicate species id "${s["id"]}"`);
      else { keys.add(key); if (!form) ids.add(s["id"]); }
    }
    if (typeof s["showdownId"] !== "string" || !SHOWDOWN_ID.test(s["showdownId"])) report("species.json", `${p}.showdownId`, "must be a Showdown species id (lowercase letters and digits)");
    if (s["happiness"] !== undefined) { const issue = FIELD_CHECK["happiness"]!(s["happiness"]); if (issue) report("species.json", `${p}.happiness`, issue); }
    for (const f of ["nameKey", "growth", "baseExp", "catchRate", "evYield", "learnset"] as const) {
      if (!(f in s)) { if (form !== 0) continue; report("species.json", `${p}.${f}`, `missing required field "${f}" in ${label}`); continue; }
      const problem = FIELD_CHECK[f]!(s[f]);
      if (problem) report("species.json", `${p}.${f}`, `${problem} (in ${label})`);
    }
    for (const field of PROGRESSION_FIELDS) if (Object.hasOwn(s, field)) { const problem = progressionFieldProblem(field, s[field]); if (problem) report("species.json", `${p}.${field}`, problem); }
    if (typeof s["nameKey"] === "string") {
      const prev = nameKeys.get(s["nameKey"]);
      if (prev !== undefined && prev.id !== s["id"]) report("species.json", `${p}.nameKey`, `text key "${s["nameKey"]}" is already used by ${prev.label}`);
      else nameKeys.set(s["nameKey"], {label,id:s["id"]});
    }
    const sourceProblem = usable(s["source"]);
    if (sourceProblem) report("species.json", `${p}.source`, sourceProblem);
    species.push(s as unknown as SpeciesSource);
  }
  for (const [i, s] of species.entries()) {
    if (isObj(s) && typeof s.id === "string" && isInt(s.form, 1, MAX_FORM) && !ids.has(s.id)) report("species.json", `[${i}].form`, `form ${s.form} of "${s.id}" has no base form 0 record (a missing form falls back to it, WP03 §3.2)`);
  }

  // ---- overlays: author patches on top of the base records, never silently conflicting
  let overlaysApplied = 0;
  const inherited = inheritSpecies(species);
  const merged = new Map<string, SpeciesSource>(inherited.map((sp) => [recordKey(sp.id, sp.form ?? 0), JSON.parse(JSON.stringify(sp)) as SpeciesSource]));
  const setBy = new Map<string, number>();
  if (!Array.isArray(inputs.overlays)) report("overlays.json", "$", "must be an array");
  else for (const [i, o] of inputs.overlays.entries()) {
    const p = `[${i}]`;
    if (!isObj(o)) { report("overlays.json", p, "must be an object"); continue; }
    checkKnownKeys(o, ["target", "set", "reason"], "overlays.json", p, report);
    if (typeof o["reason"] !== "string" || !o["reason"]) report("overlays.json", `${p}.reason`, "an overlay must say why (non-empty reason)");
    const target = typeof o["target"] === "string" ? merged.get(o["target"]) : undefined;
    if (!target) { report("overlays.json", `${p}.target`, `target ${JSON.stringify(o["target"])} does not exist (expected "species/<id>", or "species/<id>/<form>" for a form)`); continue; }
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

  // ---- cross-record invariants again, on the MERGED records: an overlay can create a clash that the base check cannot
  // see (it ran before the overlays). The final state decides, so swapping two keys is fine; the error is located at
  // the overlay entry that set the key and names the entities involved.
  const baseIndex = new Map(species.map((sp, n) => [recordKey(sp.id, sp.form ?? 0), n]));
  const holders = new Map<string, string[]>();
  for (const [target, rec] of merged) holders.set(rec.nameKey, [...(holders.get(rec.nameKey) ?? []), target]);
  const origin = (target: string, field: string): string => {
    const at = setBy.get(`${target}#${field}`);
    return at === undefined ? `species.json [${baseIndex.get(target)}]` : `overlays.json [${at}].set.${field}`;
  };
  for (const [key, group] of holders) {
    if (group.length < 2 || new Set(group.map(target => merged.get(target)!.id)).size === 1) continue;
    for (const target of group) {
      const at = setBy.get(`${target}#nameKey`);
      if (at === undefined) continue; // a base record: base-only duplicates were reported above
      const others = group.filter((t) => t !== target).map((t) => `${t} (${origin(t, "nameKey")})`).join(", ");
      report("overlays.json", `[${at}].set.nameKey`, `text key "${key}" set on ${target} is also the text key of ${others}`);
    }
  }

  // ---- grants: one-time reward packages; every reference is checked here, so a claim can never point at nothing
  const grants: GrantSource[] = [];
  if (inputs.grants !== undefined) {
    const grantIds = new Set<string>();
    if (!Array.isArray(inputs.grants)) report("grants.json", "$", "must be an array");
    else for (const [i, g] of inputs.grants.entries()) {
      const p = `[${i}]`;
      if (!isObj(g)) { report("grants.json", p, "must be an object"); continue; }
      checkKnownKeys(g, ["id", "members", "items", "money", "source"], "grants.json", p, report);
      if (typeof g["id"] !== "string" || !GRANT_ID.test(g["id"])) report("grants.json", `${p}.id`, "must be an id of 1-12 characters like \"starter\" (lowercase letters, digits, -)");
      else if (grantIds.has(g["id"])) report("grants.json", `${p}.id`, `duplicate grant id "${g["id"]}"`);
      else grantIds.add(g["id"]);
      const members = g["members"];
      if (!Array.isArray(members) || members.length > DEFAULT_LIMITS.party) report("grants.json", `${p}.members`, `must be an array of at most ${DEFAULT_LIMITS.party} {species, level}`);
      else for (const [j, m] of members.entries()) {
        if (!isObj(m) || typeof m["species"] !== "string" || !isInt(m["level"], 1, 100) || Object.keys(m).some((k) => !["species", "level", "form", "item"].includes(k))) { report("grants.json", `${p}.members[${j}]`, "must be {species: <species id>, level: 1..100}"); continue; }
        if (m["form"] !== undefined && (!isInt(m["form"], 0, MAX_FORM) || !keys.has(recordKey(m["species"], m["form"] as number)))) report("grants.json", `${p}.members[${j}].form`, "must name an existing exact form");
        if (m["item"] !== undefined && (typeof m["item"] !== "string" || (m["item"] !== "" && !SHOWDOWN_ID.test(m["item"])))) report("grants.json", `${p}.members[${j}].item`, "must be a held item id");
        if (m["item"] && !capabilities.allowHeldItemSources) report("grants.json", `${p}.members[${j}].item`, "held-item-source-disabled: controlled developer injection required; not a player setting");
        if (!ids.has(m["species"])) report("grants.json", `${p}.members[${j}].species`, `"${m["species"]}" is not a species id of species.json`);
      }
      const items = g["items"];
      if (!isObj(items)) report("grants.json", `${p}.items`, "must be an object of item id -> count");
      else for (const [k, n] of Object.entries(items)) {
        if (!Object.hasOwn(itemInputs.catalog, k)) report("grants.json", `${p}.items.${k}`, `"${k}" is not a bag item this build knows`);
        if (!isInt(n, 1, Number.MAX_SAFE_INTEGER)) report("grants.json", `${p}.items.${k}`, `count must be a positive safe integer`);
      }
      if (!isInt(g["money"], 0, DEFAULT_LIMITS.money)) report("grants.json", `${p}.money`, `must be an integer from 0 to ${DEFAULT_LIMITS.money}`);
      if (Array.isArray(members) && !members.length && isObj(items) && !Object.keys(items).length && g["money"] === 0) report("grants.json", p, "a grant must give something");
      const grantSource = usable(g["source"]);
      if (grantSource) report("grants.json", `${p}.source`, grantSource);
      grants.push(g as unknown as GrantSource);
    }
  }

  // ---- settings: the rule configuration overrides (WP02 subset, rules/config.ts)
  if (inputs.settings !== undefined) for (const p of checkOverrides(inputs.settings)) report("settings.json", p.path, p.message);

  if (errors.length) return {ok:false,errors};
  const registrationOrder = species.map(sp => ({species: sp.id, form: sp.form ?? 0}));
  const effective = [...merged.values()];
  const warnings: ContentError[] = [];
  deriveSpeciesFields(effective, report, (file,path,message)=>warnings.push({file,path,message}));
  const effectiveByKey = new Map(effective.map(sp=>[recordKey(sp.id,sp.form??0),sp]));
  for (const [i,sp] of effective.entries()) for (const [j,entry] of (sp.evolutions??[]).entries()) {
    const target=effectiveByKey.get(recordKey(entry.target,entry.form??0));
    if(target && target.growth!==sp.growth) warnings.push({file:"species.json",path:`[${i}].evolutions[${j}]`,message:`cross-growth-curve: ${sp.id} (${sp.growth}) -> ${target.id} (${target.growth})`});
  }
  if (!errors.length) checkProgressionReferences(effective, report);
  const regionalDex = checkRegionalDex(inputs.regionalDex, registrationOrder, usable, report);
  const mapMetadata = checkMapMetadata(inputs.mapMetadata, regionalDex, usable, report);
  const offsets = (inputs.settings as {DEXES_WITH_OFFSETS?: unknown} | undefined)?.DEXES_WITH_OFFSETS;
  if (Array.isArray(offsets)) for (const [i, region] of offsets.entries()) if (typeof region === "number" && region >= regionalDex.regions.length) report("settings.json", `$.DEXES_WITH_OFFSETS[${i}]`, "unknown region reference");
  if (!/^[a-f0-9]{40}$/.test(context.showdownSha)) report("compiled", "$.showdownSha", "must be the 40-character pinned Showdown SHA");
  if (errors.length) return { ok: false, errors };
  const inputsHash = hashInputs(inputs);
  const data: CompiledContent = {
    schema: COMPILED_SCHEMA_VERSION, contentId, inputsHash, showdownSha: context.showdownSha, contentIdentity: sha256Hex(canonicalJson({compiledSemantics: COMPILED_SCHEMA_VERSION, inputsHash, showdownSha: context.showdownSha})), registrationOrder, regionalDex, ...(mapMetadata ? {mapMetadata} : {}), sources: [...sources].sort((a, b) => a.id.localeCompare(b.id)),
    overlaysApplied, species: [...merged.values()].sort((a, b) => a.id.localeCompare(b.id) || (a.form ?? 0) - (b.form ?? 0)),
    ...(inputs.items !== undefined ? { items: itemInputs.items } : {}),
    ...(inputs.shops !== undefined ? { shops: itemInputs.shops } : {}),
    ...(inputs.grants !== undefined ? { grants: [...grants].sort((a, b) => a.id.localeCompare(b.id)) } : {}),
    ...(inputs.settings !== undefined ? { settings: { ...(inputs.settings as import("../rules/config").RuleOverrides) } } : {}),
  };
  return { ok: true, data, errors: [], warnings };
}

/** Is a compiled document still the build of exactly these inputs? (stale or missing output must not pass as current) */
export function checkFresh(compiled: unknown, inputs: ContentInputs): ContentError | null {
  if (!isObj(compiled) || typeof compiled["inputsHash"] !== "string") return { file: "compiled", path: "$.inputsHash", message: "compiled content is missing or has no inputsHash: run the content build" };
  if (compiled["schema"] !== COMPILED_SCHEMA_VERSION) return {file:"compiled",path:"$.schema",message:`needs-rebuild: compiled content must use schema ${COMPILED_SCHEMA_VERSION}`};
  const now = hashInputs(inputs);
  if (compiled["inputsHash"] !== now) return { file: "compiled", path: "$.inputsHash", message: `compiled content is stale (built from ${compiled["inputsHash"].slice(0, 12)}, inputs are now ${now.slice(0, 12)}): run the content build` };
  return null;
}
