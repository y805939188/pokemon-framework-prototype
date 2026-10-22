/**
 * Versioned persistent game state: strict validation, migration from the declared older versions, and errors that are
 * safe to act on. Pure: never touches files or the MZ save, and never mutates its input (migration works on a copy,
 * so the original document is still intact whenever anything goes wrong).
 *
 * Versions
 *   1  step 2 prototype: members have no statusCount; a badly poisoned member may be stored as status "tox".
 *   2  statusCount (sleep = remaining turns, poison = 0 plain), poison stored as plain "psn" (WP20 / WP39).
 *   3  step 4: `claims`, the one-time grant ledger (claim id -> {kind}).
 *   4  current (step 5.0, decision D5-3): a member's species is the content id plus a `form` number (was the Showdown
 *      name), the dex lists content ids; `stats` (WP06, 74 fields) and the global step counter `steps`.
 * Anything else is refused with a diagnosable error ("unknown-version"/"corrupt"/"invalid") — never silently reset.
 * 3 -> 4 needs the content's species mapping (Showdown name -> content id + form): without it the migration refuses
 * ("needs-content"), and a name the content cannot map refuses the WHOLE migration ("unmapped-species", every place
 * listed). Either way the input document is untouched, so the caller keeps the original save.
 */
import { GAME_SCHEMA } from "./state.ts";
import type { GameState } from "./state.ts";
import { MAX_FORM } from "./species-key.ts";
import type { SpeciesKeyResolver } from "./species-key.ts";
import { newStats, validateStats } from "./stats.ts";

export const SUPPORTED_SCHEMAS: readonly number[] = [1, 2, 3, 4];

export interface Problem { path: string; message: string }
export interface SaveErrorInfo {
  code: "corrupt" | "unknown-version" | "invalid" | "needs-content" | "unmapped-species";
  message: string;
  /** The schema value found in the document, when there was one. */
  found?: unknown;
  problems?: Problem[];
}
export type MigrationResult =
  | { ok: true; state: GameState; from: number; to: number; migrated: boolean; notes: string[] }
  | { ok: false; error: SaveErrorInfo };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const STATUSES = ["", "psn", "tox", "brn", "par", "slp", "frz"];
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const TOP_KEYS = ["schema", "party", "boxes", "bag", "money", "dex", "appliedBattles", "claims", "stats", "steps"];
const CLAIM_KINDS = ["grant"];
const CLAIM_ID = /^[A-Za-z0-9#._:-]{1,64}$/;
const MEMBER_KEYS = ["id", "species", "form", "nickname", "level", "exp", "hp", "status", "statusCount", "moves", "item", "ability", "nature", "gender", "ivs", "evs", "friendship", "ball", "ot"];
const MEMBER_ID = /^[A-Za-z0-9#._:-]{1,18}$/;

function statBlock(v: unknown, lo: number, hi: number, path: string, out: Problem[]): void {
  if (!isObj(v)) { out.push({ path, message: "must be an object of the six stats" }); return; }
  for (const k of Object.keys(v)) if (!STAT_KEYS.includes(k)) out.push({ path: `${path}.${k}`, message: "unknown stat" });
  for (const k of STAT_KEYS) if (!isInt(v[k], lo, hi)) out.push({ path: `${path}.${k}`, message: `must be an integer from ${lo} to ${hi}` });
}

function validateMember(m: unknown, path: string, out: Problem[], schema: number): void {
  if (!isObj(m)) { out.push({ path, message: "must be an object" }); return; }
  for (const k of Object.keys(m)) if (!MEMBER_KEYS.includes(k)) out.push({ path: `${path}.${k}`, message: "unknown field (battle-only or temporary state does not belong in a save)" });
  if (typeof m["id"] !== "string" || !MEMBER_ID.test(m["id"])) out.push({ path: `${path}.id`, message: "must be 1-18 characters of A-Z a-z 0-9 # . _ : -" });
  for (const k of ["species", "item", "ability", "nature", "gender", "ball", "ot"]) if (typeof m[k] !== "string") out.push({ path: `${path}.${k}`, message: "must be a string" });
  if (m["nickname"] !== null && m["nickname"] !== undefined && typeof m["nickname"] !== "string") out.push({ path: `${path}.nickname`, message: "must be a string or null" });
  if (!isInt(m["level"], 1, 100)) out.push({ path: `${path}.level`, message: "must be an integer from 1 to 100" });
  if (!isInt(m["exp"], 0)) out.push({ path: `${path}.exp`, message: "must be an integer >= 0" });
  if (!isInt(m["hp"], 0)) out.push({ path: `${path}.hp`, message: "must be an integer >= 0" });
  if (typeof m["status"] !== "string" || !STATUSES.includes(m["status"])) out.push({ path: `${path}.status`, message: `must be one of ${STATUSES.map((x) => `"${x}"`).join(", ")}` });
  if (m["statusCount"] !== undefined && !isInt(m["statusCount"], 0)) out.push({ path: `${path}.statusCount`, message: "must be an integer >= 0" });
  if (schema >= 4 ? !isInt(m["form"], 0, MAX_FORM) : m["form"] !== undefined) out.push({ path: `${path}.form`, message: schema >= 4 ? `must be an integer from 0 to ${MAX_FORM}` : "a form number belongs to schema 4" });
  if (schema >= 2 && m["status"] === "tox") out.push({ path: `${path}.status`, message: "badly poisoned is stored as plain poison (psn) in schema 2" });
  if (!isInt(m["friendship"], 0, 255)) out.push({ path: `${path}.friendship`, message: "must be an integer from 0 to 255" });
  if (!Array.isArray(m["moves"]) || m["moves"].length > 4) out.push({ path: `${path}.moves`, message: "must be an array of at most 4 moves" });
  else for (const [i, mv] of m["moves"].entries()) {
    const p = `${path}.moves[${i}]`;
    if (!isObj(mv) || typeof mv["id"] !== "string" || !isInt(mv["pp"], 0) || !isInt(mv["maxpp"], 1) || (mv["pp"] as number) > (mv["maxpp"] as number)) out.push({ path: p, message: "must be {id, pp >= 0, maxpp >= 1, pp <= maxpp}" });
  }
  statBlock(m["ivs"], 0, 31, `${path}.ivs`, out);
  statBlock(m["evs"], 0, 252, `${path}.evs`, out);
}

/** Strict structural validation of a CURRENT-schema (or already migrated) document. Located problems, all of them. */
export function validateGame(x: unknown): Problem[] {
  const out: Problem[] = [];
  if (!isObj(x)) return [{ path: "$", message: "must be an object" }];
  for (const k of Object.keys(x)) if (!TOP_KEYS.includes(k)) out.push({ path: `$.${k}`, message: "unknown top-level field" });
  const schema = typeof x["schema"] === "number" ? x["schema"] : 0;
  if (!isInt(x["schema"], 1)) out.push({ path: "$.schema", message: "must be a positive integer" });
  const seen = new Set<string>();
  for (const key of ["party", "boxes"] as const) {
    const list = x[key];
    if (!Array.isArray(list)) { out.push({ path: `$.${key}`, message: "must be an array" }); continue; }
    if (key === "party" && list.length > 6) out.push({ path: "$.party", message: "at most 6 members" });
    for (const [i, m] of list.entries()) {
      validateMember(m, `$.${key}[${i}]`, out, schema);
      const id = isObj(m) ? m["id"] : undefined;
      if (typeof id === "string") { if (seen.has(id)) out.push({ path: `$.${key}[${i}].id`, message: `duplicate member id "${id}"` }); seen.add(id); }
    }
  }
  if (!isObj(x["bag"])) out.push({ path: "$.bag", message: "must be an object" });
  else for (const [k, v] of Object.entries(x["bag"])) if (!isInt(v, 1)) out.push({ path: `$.bag.${k}`, message: "must be an integer >= 1 (empty entries are removed)" });
  if (!isInt(x["money"], 0)) out.push({ path: "$.money", message: "must be an integer >= 0" });
  const dex = x["dex"];
  if (!isObj(dex)) out.push({ path: "$.dex", message: "must be {seen, owned}" });
  else for (const k of ["seen", "owned"]) {
    const l = dex[k];
    if (!Array.isArray(l) || l.some((s) => typeof s !== "string") || new Set(l).size !== l.length) out.push({ path: `$.dex.${k}`, message: schema >= 4 ? "must be an array of unique species content ids" : "must be an array of unique species names" });
  }
  if (!isObj(x["appliedBattles"])) out.push({ path: "$.appliedBattles", message: "must be an object" });
  else for (const [id, v] of Object.entries(x["appliedBattles"])) if (!isObj(v) || typeof v["hash"] !== "string" || !/^[0-9a-f]{64}$/.test(v["hash"])) out.push({ path: `$.appliedBattles["${id}"]`, message: "must be {hash: 64 hex characters}" });
  if (schema >= 3) {
    const claims = x["claims"];
    if (!isObj(claims)) out.push({ path: "$.claims", message: "must be an object (claim id -> {kind})" });
    else for (const [id, v] of Object.entries(claims)) {
      if (!CLAIM_ID.test(id)) out.push({ path: `$.claims["${id}"]`, message: "claim id must be 1-64 characters of A-Z a-z 0-9 # . _ : -" });
      if (!isObj(v) || !CLAIM_KINDS.includes(v["kind"] as string) || Object.keys(v).length !== 1) out.push({ path: `$.claims["${id}"]`, message: `must be {kind: ${CLAIM_KINDS.map((k) => `"${k}"`).join(" | ")}}` });
    }
  }
  if (schema >= 4) validateStats(x["stats"], x["steps"], out);
  return out;
}

export interface MigrateOptions {
  /** The current content's mapping from a Showdown species name to its persistent key; needed from schema 3 to 4. */
  speciesKey?: SpeciesKeyResolver;
}

/** Thrown inside a migration step: the whole migration is refused with this code and these located problems. */
class MigrationRefused extends Error {
  readonly code: SaveErrorInfo["code"];
  readonly problems: Problem[];
  constructor(code: SaveErrorInfo["code"], message: string, problems: Problem[] = []) { super(message); this.code = code; this.problems = problems; }
}

type Migrator = (doc: Obj, notes: string[], options: MigrateOptions) => void;
/** from -> from+1. Each works on an already-cloned document. */
const MIGRATIONS: Record<number, Migrator> = {
  1: (doc, notes) => {
    for (const key of ["party", "boxes"]) {
      const list = doc[key];
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        if (!isObj(m)) continue;
        if (m["status"] === "tox") { m["status"] = "psn"; m["statusCount"] = 0; notes.push(`${m["id"]}: badly poisoned stored as plain poison (poison counters are cleared after battle, WP39)`); }
        else if (m["statusCount"] === undefined) {
          if (m["status"] === "slp") notes.push(`${m["id"]}: sleep counter unknown in schema 1; the next battle draws a fresh duration`);
          else m["statusCount"] = 0;
        }
      }
    }
    doc["schema"] = 2;
  },
  2: (doc, notes) => {
    doc["claims"] = {};
    notes.push("schema 3: an empty claims ledger was added (nothing had been claimed through it before)");
    doc["schema"] = 3;
  },
  3: (doc, notes, options) => {
    const key = options.speciesKey;
    if (!key) throw new MigrationRefused("needs-content", "moving this save to schema 4 needs the game content (Showdown species name -> content id + form); none was given. Nothing was changed.");
    const problems: Problem[] = [];
    let members = 0;
    for (const list of ["party", "boxes"]) {
      const l = doc[list];
      if (!Array.isArray(l)) continue; // left to validation
      for (const [i, m] of l.entries()) {
        if (!isObj(m) || typeof m["species"] !== "string") continue;
        const k = key(m["species"]);
        if (!k) { problems.push({ path: `$.${list}[${i}].species`, message: `"${m["species"]}" (member ${String(m["id"])}) is not a species of the current content` }); continue; }
        m["species"] = k.species; m["form"] = k.form; members++;
      }
    }
    const dex = doc["dex"];
    if (isObj(dex)) for (const list of ["seen", "owned"]) {
      const l = dex[list];
      if (!Array.isArray(l)) continue;
      const ids: string[] = [];
      for (const [i, name] of l.entries()) {
        const k = typeof name === "string" ? key(name) : null;
        if (!k) { problems.push({ path: `$.dex.${list}[${i}]`, message: `${JSON.stringify(name)} is not a species of the current content` }); continue; }
        if (!ids.includes(k.species)) ids.push(k.species);
      }
      dex[list] = ids;
    }
    if (problems.length) throw new MigrationRefused("unmapped-species", `this save names ${problems.length} species the current content cannot map to a content id; nothing was changed (first: ${problems[0]!.path} ${problems[0]!.message})`, problems);
    doc["stats"] = newStats();
    doc["steps"] = 0;
    notes.push(`schema 4: ${members} member(s) and the dex moved from Showdown names to content id + form; statistics and the step counter start at zero (nothing counted them before)`);
    doc["schema"] = 4;
  },
};

export function migrateGame(raw: unknown, options: MigrateOptions = {}): MigrationResult {
  if (!isObj(raw)) return { ok: false, error: { code: "corrupt", message: "the save state is not an object (damaged or not a game state)" } };
  const found = raw["schema"];
  if (!isInt(found, 1)) return { ok: false, error: { code: raw["schema"] === undefined ? "corrupt" : "unknown-version", message: raw["schema"] === undefined ? "the save state has no schema version" : `unsupported schema value ${JSON.stringify(found)}`, found } };
  if (found > GAME_SCHEMA) return { ok: false, error: { code: "unknown-version", message: `saved by a newer version (schema ${found}); this build understands up to ${GAME_SCHEMA}. Nothing was changed.`, found } };
  if (!SUPPORTED_SCHEMAS.includes(found)) return { ok: false, error: { code: "unknown-version", message: `schema ${found} is not a supported old version (supported: ${SUPPORTED_SCHEMAS.join(", ")})`, found } };
  const doc = JSON.parse(JSON.stringify(raw)) as Obj; // never touch the original
  const notes: string[] = [];
  let v = found;
  while (v < GAME_SCHEMA) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: { code: "unknown-version", message: `no migration from schema ${v}`, found } };
    try { step(doc, notes, options); }
    catch (e) {
      if (!(e instanceof MigrationRefused)) throw e;
      return { ok: false, error: { code: e.code, message: e.message, found, ...(e.problems.length ? { problems: e.problems } : {}) } };
    }
    v = doc["schema"] as number;
  }
  const problems = validateGame(doc);
  if (problems.length) return { ok: false, error: { code: "invalid", message: `the save state (schema ${found}) is structurally invalid: ${problems.length} problem(s); first: ${problems[0]!.path} ${problems[0]!.message}`, found, problems } };
  return { ok: true, state: doc as unknown as GameState, from: found, to: GAME_SCHEMA, migrated: found !== GAME_SCHEMA, notes };
}

/** Size of the replay ledger (appliedBattles): the growth that has to stay visible. */
export function ledgerStats(state: GameState): { entries: number; jsonBytes: number } {
  const text = JSON.stringify(state.appliedBattles);
  return { entries: Object.keys(state.appliedBattles).length, jsonBytes: text.length };
}
