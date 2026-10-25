import { inventoryFromBag, inventoryPolicy, inventoryProblems } from "./inventory.ts";
import { catalogOf, itemOf } from "./item-catalog.ts";
import { baseMovePp, totalPp } from "./member-metadata.ts";
/**
 * Versioned persistent game state: strict validation, migration from the declared older versions, and errors that are
 * safe to act on. Pure: never touches files or the MZ save, and never mutates its input (migration works on a copy,
 * so the original document is still intact whenever anything goes wrong).
 *
 * Versions
 *   1  step 2 prototype: members have no statusCount; a badly poisoned member may be stored as status "tox".
 *   2  statusCount (sleep = remaining turns, poison = 0 plain), poison stored as plain "psn" (WP20 / WP39).
 *   3  step 4: `claims`, the one-time grant ledger (claim id -> {kind}).
 *   4  step 5.0, decision D5-3: a member's species is the content id plus a `form` number (was the Showdown
 *      name), the dex lists content ids; `stats` (WP06, 74 fields) and the global step counter `steps`.
 *   5  individual metadata and fixed 40×30 storage.
 *   6  ordered inventory, badges and persistent move PP metadata.
 *   7  readiness certainty, cannotTrade, complete dex history and stable layout identity.
 * Anything else is refused with a diagnosable error ("unknown-version"/"corrupt"/"invalid") — never silently reset.
 * 3 -> 4 needs the content's species mapping (Showdown name -> content id + form): without it the migration refuses
 * ("needs-content"), and a name the content cannot map refuses the WHOLE migration ("unmapped-species", every place
 * listed). Either way the input document is untouched, so the caller keeps the original save.
 */
import { NATURES } from "./growth.ts";
import { own } from "./own.ts";
import { createDexState, dexContentProblems, dexStateProblems, dexLayoutStateProblems, remapDexLayout } from "./dex-state.ts";
import { GAME_SCHEMA } from "./state.ts";
import type { GameState } from "./state.ts";
import { MAX_FORM, speciesDataOf } from "./species-key.ts";
import { completeIndividual, COMPATIBLE_PLAYER, initialOrdinal, resolveAbility } from "./member-identity.ts";
import { BOX_COUNT, SLOTS_PER_BOX, STORAGE_CAPACITY, newStorage } from "./storage.ts";
import type { Content, DexState, Member } from "./types.ts";
import type { SpeciesKeyResolver } from "./species-key.ts";
import { newStats, validateStats } from "./stats.ts";

const SAVE_SCHEMA = GAME_SCHEMA;
export const SUPPORTED_SCHEMAS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export interface Problem { path: string; message: string }
export interface SaveErrorInfo {
  code: "corrupt" | "unknown-version" | "invalid" | "needs-content" | "unmapped-species" | "capacity-exceeded";
  partyCount?: number;
  boxMemberCount?: number;
  limit?: number;
  recovery?: string;
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

function persistentMembers(doc: Obj): { member: Obj; path: string }[] {
  const members = (doc["party"] as Obj[]).map((member, i) => ({ member, path: `$.party[${i}]` }));
  const storage = doc["storage"] as { boxes: { slots: (Obj | null)[] }[] };
  for (const [i, box] of storage.boxes.entries()) for (const [j, member] of box.slots.entries()) if (member !== null) members.push({ member, path: `$.storage.boxes[${i}].slots[${j}]` });
  return members;
}

const STATUSES = ["", "psn", "tox", "brn", "par", "slp", "frz"];
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const TOP_KEYS = ["schema", "party", "boxes", "bag", "money", "dex", "appliedBattles", "claims", "stats", "steps"];
const CLAIM_KINDS = ["grant"];
const CLAIM_ID = /^[A-Za-z0-9#._:-]{1,64}$/;
const MEMBER_KEYS = ["id", "species", "form", "nickname", "level", "exp", "hp", "status", "statusCount", "moves", "item", "ability", "nature", "gender", "ivs", "evs", "friendship", "ball", "ot"];
const INDIVIDUAL_KEYS = ["personalID", "owner", "ownerCompatibilityDefault", "origin", "abilityIndex", "effectiveAbilityIndex", "shiny", "superShiny", "firstMoves", "markings", "ribbons", "cannotStore", "cannotRelease", "isEgg", "mail", "readyToEvolve"];
const MEMBER_ID = /^[A-Za-z0-9#._:-]{1,18}$/;

function statBlock(v: unknown, lo: number, hi: number, path: string, out: Problem[]): void {
  if (!isObj(v)) { out.push({ path, message: "must be an object of the six stats" }); return; }
  for (const k of Object.keys(v)) if (!STAT_KEYS.includes(k)) out.push({ path: `${path}.${k}`, message: "unknown stat" });
  for (const k of STAT_KEYS) if (!Object.hasOwn(v, k) || !isInt(v[k], lo, hi)) out.push({ path: `${path}.${k}`, message: `must be an integer from ${lo} to ${hi}` });
}

function validateMember(m: unknown, path: string, out: Problem[], schema: number): void {
  if (!isObj(m)) { out.push({ path, message: "must be an object" }); return; }
  if (schema >= 7 && inheritedFields(m, [...MEMBER_KEYS, ...INDIVIDUAL_KEYS, "statNature", "cannotTrade", "evolutionReadiness"], path, out)) return;
  for (const k of Object.keys(m)) if (!(schema >= 5 ? [...MEMBER_KEYS.filter((k) => k !== "ot"), ...INDIVIDUAL_KEYS, ...(schema >= 6 ? ["statNature"] : []), ...(schema >= 7 ? ["evolutionReadiness", "cannotTrade"] : [])] : [...MEMBER_KEYS, ...INDIVIDUAL_KEYS]).includes(k)) out.push({ path: `${path}.${k}`, message: "unknown field (battle-only or temporary state does not belong in a save)" });
  if (typeof m["id"] !== "string" || !MEMBER_ID.test(m["id"])) out.push({ path: `${path}.id`, message: "must be 1-18 characters of A-Z a-z 0-9 # . _ : -" });
  for (const k of ["species", "item", "ability", "nature", "gender", "ball", ...(schema >= 5 ? [] : ["ot"])]) if (!(schema < 5 && ["ability", "nature", "gender", "ot"].includes(k) && m[k] === undefined) && typeof m[k] !== "string") out.push({ path: `${path}.${k}`, message: "must be a string" });
  if (typeof m["nature"] === "string" && !Object.hasOwn(NATURES, m["nature"].toLowerCase())) out.push({ path: `${path}.nature`, message: "must name a registered nature (case-insensitive)" });
  if (typeof m["gender"] === "string" && !["M", "F", "N"].includes(m["gender"])) out.push({ path: `${path}.gender`, message: "must be M, F or N" });
  if (m["nickname"] !== null && m["nickname"] !== undefined && typeof m["nickname"] !== "string") out.push({ path: `${path}.nickname`, message: "must be a string or null" });
  if (!isInt(m["level"], 1, 100)) out.push({ path: `${path}.level`, message: "must be an integer from 1 to 100" });
  if (!isInt(m["exp"], 0)) out.push({ path: `${path}.exp`, message: "must be an integer >= 0" });
  if (!isInt(m["hp"], 0)) out.push({ path: `${path}.hp`, message: "must be an integer >= 0" });
  if (typeof m["status"] !== "string" || !STATUSES.includes(m["status"])) out.push({ path: `${path}.status`, message: `must be one of ${STATUSES.map((x) => `"${x}"`).join(", ")}` });
  if (m["statusCount"] !== undefined && !isInt(m["statusCount"], 0)) out.push({ path: `${path}.statusCount`, message: "must be an integer >= 0" });
  if (schema >= 4 ? !isInt(m["form"], 0, MAX_FORM) : m["form"] !== undefined) out.push({ path: `${path}.form`, message: schema >= 4 ? `must be an integer from 0 to ${MAX_FORM}` : "a form number belongs to schema 4" });
  if (schema >= 2 && m["status"] === "tox") out.push({ path: `${path}.status`, message: "badly poisoned is stored as plain poison (psn) in schema 2" });
  if (!isInt(m["friendship"], 0)) out.push({ path: `${path}.friendship`, message: "must be a nonnegative safe integer" });
  if (!Array.isArray(m["moves"]) || m["moves"].length > 4) out.push({ path: `${path}.moves`, message: "must be an array of at most 4 moves" });
  else for (const [i, mv] of m["moves"].entries()) {
    const p = `${path}.moves[${i}]`;
    if (!isObj(mv) || typeof mv["id"] !== "string" || !isInt(mv["pp"], 0) || !isInt(mv["maxpp"], 1) || (mv["pp"] as number) > (mv["maxpp"] as number)) out.push({ path: p, message: "must be {id, pp >= 0, maxpp >= 1, pp <= maxpp}" });
  }
  if (schema >= 6 && m["statNature"] !== null && (typeof m["statNature"] !== 'string' || !Object.hasOwn(NATURES, (m["statNature"] as string).toLowerCase()))) out.push({path:`${path}.statNature`,message:'must be null or a registered calculation nature'});
  if (Array.isArray(m["moves"])) for (const [i, move] of m["moves"].entries()) if (isObj(move)) {
    const allowed = schema >= 6 ? ['id','pp','maxpp','ppUps'] : ['id','pp','maxpp','ppUps'];
    knownKeys(move, allowed, `${path}.moves[${i}]`, out);
    if ((schema >= 6 || move['ppUps'] !== undefined) && !isInt(move['ppUps'],0,3)) out.push({path:`${path}.moves[${i}].ppUps`,message:'must be 0..3'});
  }
  statBlock(m["ivs"], 0, 31, `${path}.ivs`, out);
  statBlock(m["evs"], 0, 255, `${path}.evs`, out);
  validateIndividualFields(m, path, out, schema >= 5, schema);
  if (schema >= 7) {
    if (typeof m["cannotTrade"] !== "boolean") out.push({ path: `${path}.cannotTrade`, message: "must be boolean" });
    if (!["known", "unknown"].includes(m["evolutionReadiness"] as string)) out.push({ path: `${path}.evolutionReadiness`, message: "must be known or unknown" });
    else if (m["evolutionReadiness"] === "unknown" && m["readyToEvolve"] !== true) out.push({ path: `${path}.evolutionReadiness`, message: "unknown readiness requires readyToEvolve=true" });
  }

}

/** Old schemas may omit metadata, but an explicitly present bad field is never a default request. */
function validateIndividualFields(m: Obj, path: string, out: Problem[], required: boolean, schema: number): void {
  const present = (key: string): boolean => required || Object.hasOwn(m, key);
  if (present("personalID") && !isInt(m["personalID"], 0, 0xffffffff)) out.push({ path: `${path}.personalID`, message: "must be uint32" });
  if (present("owner")) validateOwner(m["owner"], `${path}.owner`, out);
  if (present("origin")) {
    const origin = m["origin"];
    if (!isObj(origin)) out.push({ path: `${path}.origin`, message: "must be an origin record" });
    else {
      knownKeys(origin, ["method", "map", "text", "level", "receivedAt", "hatchedMap", "hatchedAt", "compatibilityDefault"], `${path}.origin`, out);
      for (const k of ["method", "map", "receivedAt", "hatchedAt"]) if (origin[k] !== null && !isInt(origin[k], 0)) out.push({ path: `${path}.origin.${k}`, message: "must be a nonnegative safe integer or null (unknown)" });
      if (!isInt(origin["level"], 1, 100) || !isInt(origin["hatchedMap"], 0) || typeof origin["text"] !== "string" || typeof origin["compatibilityDefault"] !== "boolean") out.push({ path: `${path}.origin`, message: "invalid level/hatchedMap/text/compatibilityDefault" });
    }
  }
  for (const k of ["abilityIndex", "effectiveAbilityIndex"]) if (present(k) && m[k] !== null && !isInt(m[k], 0)) out.push({ path: `${path}.${k}`, message: "must be a nonnegative safe slot or null" });
  for (const k of ["ownerCompatibilityDefault", "shiny", "superShiny", "cannotStore", "cannotRelease", "isEgg", "readyToEvolve"]) if (present(k) && typeof m[k] !== "boolean") out.push({ path: `${path}.${k}`, message: "must be boolean" });
  for (const k of ["firstMoves", "ribbons"]) if (present(k) && (!Array.isArray(m[k]) || (m[k] as unknown[]).some((v) => typeof v !== "string" || !v.length) || (schema < 7 && k === "firstMoves" && (m[k] as unknown[]).length > 4))) out.push({ path: `${path}.${k}`, message: schema >= 7 ? "must be a dense ordered string list" : "must be an ordered string list (firstMoves at most four)" });
  const marks = m["markings"];
  if (present("markings") && (!Array.isArray(marks) || marks.length > 6 || marks.some((v) => !isInt(v, 0)))) out.push({ path: `${path}.markings`, message: "must be up to six nonnegative integer markings" });
  if (present("mail") && m["mail"] !== null && typeof m["mail"] !== "string") out.push({ path: `${path}.mail`, message: "must be string or null" });
}

function inheritedFields(o: Obj, fields: readonly string[], path: string, out: Problem[]): boolean {
  const inherited = fields.filter(key => !Object.hasOwn(o, key) && key in o);
  for (const key of inherited) out.push({path: `${path}.${key}`, message: "persistent fields must be own data, never inherited"});
  return inherited.length > 0;
}
function knownKeys(o: Obj, allowed: readonly string[], path: string, out: Problem[]): void {
  inheritedFields(o, allowed, path, out);
  for (const k of Object.keys(o)) if (!allowed.includes(k)) out.push({ path: `${path}.${k}`, message: path === "$" ? "unknown top-level field" : "unknown field" });
}
function validateOwner(value: unknown, path: string, out: Problem[]): void {
  if (!isObj(value)) { out.push({ path, message: "must be {id,name,gender,language}" }); return; }
  knownKeys(value, ["id", "name", "gender", "language"], path, out);
  if (!isInt(value["id"], 0, 0xffffffff) || typeof value["name"] !== "string" || !isInt(value["gender"], 0, 2) || !isInt(value["language"], 0)) out.push({ path, message: "must contain uint32 id, string name, gender 0/1/2 and nonnegative language" });
}

// These are the only instance traversal methods used on save arrays by this validator and its finite delegates
// (inventory/dex/statistics). Another realm's native methods have the same intrinsic text; an override must never
// decide which stored elements get checked. Keep the references here, before any caller supplies a document.
const arrayTraversal = ["entries", "map", "some", "forEach", Symbol.iterator].map(key => ({
  key, text: Function.prototype.toString.call(Object.getOwnPropertyDescriptor(Array.prototype, key)!.value),
}));

/** JSON-shaped own data only: sparse lists and inherited records cannot pass then change meaning during cloning. */
function validatePlainData(value: unknown, path: string, out: Problem[], ancestors = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (ancestors.has(value)) { out.push({ path, message: "cyclic value is not persistent data" }); return; }
  if (Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value) as object | null;
    const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, "constructor");
    if (!prototype || !Array.isArray(prototype) || !constructor || !("value" in constructor) || typeof constructor.value !== "function" || constructor.value.prototype !== prototype || Function.prototype.toString.call(constructor.value) !== Function.prototype.toString.call(Array)) {
      out.push({path, message: "must be an own plain-data array with an intrinsic prototype"}); return;
    }
    for (const method of arrayTraversal) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method.key);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function" || Function.prototype.toString.call(descriptor.value) !== method.text) {
        out.push({path, message: "save arrays must retain intrinsic traversal methods"}); return;
      }
    }
  } else {
    const prototype = Object.getPrototypeOf(value) as object | null;
    const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, "constructor");
    // NW's renderer, Node and a bare core may have different intrinsic Object identities.
    // Accept another realm's intrinsic Object.prototype, not arbitrary inherited-data/class records.
    if (prototype !== null && !(Object.getPrototypeOf(prototype) === null && constructor && "value" in constructor && typeof constructor.value === "function" && constructor.value.prototype === prototype && Function.prototype.toString.call(constructor.value) === Function.prototype.toString.call(Object))) {
      out.push({path, message: "must be an own plain-data record"}); return;
    }
  }
  // JSON resolves inherited toJSON too. A valid own-data document must not serialize as different data (or run an
  // inherited accessor) after this gate. Resolve descriptors without executing the hook; non-callable data is inert.
  for (let owner: object | null = value; owner !== null; owner = Object.getPrototypeOf(owner) as object | null) {
    const hook = Object.getOwnPropertyDescriptor(owner, "toJSON");
    if (!hook) continue;
    if (!("value" in hook) || typeof hook.value === "function") {
      out.push({path, message: "persistent data cannot use a JSON serialization hook"}); return;
    }
    break;
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = typeof key === "string" ? descriptors[key] : undefined;
    if (typeof key !== "string" || !descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      out.push({path: `${path}.${String(key)}`, message: "persistent fields must be own enumerable data properties"});
      continue;
    }
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) {
      out.push({path: `${path}.${key}`, message: "arrays may only contain their indexed data"}); continue;
    }
    validatePlainData(descriptor.value, `${path}.${key}`, out, ancestors);
  }
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) out.push({path: `${path}[${i}]`, message: "sparse arrays are not persistent data"});
  ancestors.delete(value);
}

/** Strict structural validation of a CURRENT-schema (or already migrated) document. Located problems, all of them. */
export function validateGame(x: unknown): Problem[] {
  const out: Problem[] = [];
  if (!isObj(x)) return [{ path: "$", message: "must be an object" }];
  const schemaProperty = Object.getOwnPropertyDescriptor(x, "schema");
  if (!schemaProperty || !("value" in schemaProperty)) return [{path: "$.schema", message: "schema must be an own data property"}];
  const schema = typeof schemaProperty.value === "number" ? schemaProperty.value : 0;
  if (!isInt(x["schema"], 1)) out.push({ path: "$.schema", message: "must be a positive integer" });
  else if (!SUPPORTED_SCHEMAS.includes(schema)) out.push({ path: "$.schema", message: `unsupported schema ${schema}` });
  if (schema >= 7) { validatePlainData(x, "$", out); if (out.length) return out; }
  const allowedTop = schema >= 5 ? [...TOP_KEYS.filter((k) => k !== "boxes"), "storage", "player", "nextMemberOrdinal"] : TOP_KEYS;
  if (schema >= 6) { allowedTop.splice(allowedTop.indexOf("bag"),1); allowedTop.push("inventory","badges"); }
  knownKeys(x, allowedTop, "$", out);
  if (schema >= 7 && out.length) return out;
  const seen = new Set<string>();
  const validateAt = (m: unknown, path: string): void => {
    validateMember(m, path, out, schema);
    const id = isObj(m) ? m["id"] : undefined;
    if (typeof id === "string") { if (seen.has(id)) out.push({ path: `${path}.id`, message: `duplicate member id "${id}"` }); seen.add(id); }
  };
  for (const key of (schema >= 5 ? ["party"] : ["party", "boxes"])) {
    const list = x[key];
    if (!Array.isArray(list)) { out.push({ path: `$.${key}`, message: "must be an array" }); continue; }
    if (key === "party" && list.length > 6) out.push({ path: "$.party", message: "at most 6 members" });
    for (const [i, m] of list.entries()) validateAt(m, `$.${key}[${i}]`);
  }
  if (schema >= 5) {
    validateOwner(x["player"], "$.player", out);
    if (typeof x["nextMemberOrdinal"] !== "string" || !/^[1-9]\d*$/.test(x["nextMemberOrdinal"])) out.push({ path: "$.nextMemberOrdinal", message: "must be a positive canonical decimal string" });
    const storage = x["storage"];
    if (!isObj(storage)) out.push({ path: "$.storage", message: "must be fixed 40×30 storage" });
    else {
      knownKeys(storage, ["currentBox", "boxes", "unlockedWallpapers"], "$.storage", out);
      if (!isInt(storage["currentBox"], 0, BOX_COUNT - 1)) out.push({ path: "$.storage.currentBox", message: "must be box 0–39" });
      const unlocked = storage["unlockedWallpapers"];
      if (!Array.isArray(unlocked) || unlocked.some((n) => !isInt(n, 16, 39)) || new Set(unlocked).size !== unlocked.length) out.push({ path: "$.storage.unlockedWallpapers", message: "must be unique special wallpaper ids 16–39" });
      const boxes = storage["boxes"];
      if (!Array.isArray(boxes) || boxes.length !== BOX_COUNT) out.push({ path: "$.storage.boxes", message: "must contain exactly 40 boxes" });
      if (Array.isArray(boxes)) for (const [i, box] of boxes.entries()) {
        const path = `$.storage.boxes[${i}]`;
        if (!isObj(box)) { out.push({ path, message: "must be a box record" }); continue; }
        knownKeys(box, ["name", "wallpaper", "slots"], path, out);
        if (typeof box["name"] !== "string" || Array.from(box["name"]).length > 12) out.push({ path: `${path}.name`, message: "must be a string of at most 12 characters (empty means localized default)" });
        if (!isInt(box["wallpaper"], 0)) out.push({ path: `${path}.wallpaper`, message: "must be a nonnegative wallpaper id (display fallback does not write)" });
        const slots = box["slots"];
        if (!Array.isArray(slots) || slots.length !== SLOTS_PER_BOX) out.push({ path: `${path}.slots`, message: "must contain exactly 30 slots" });
        if (Array.isArray(slots)) for (const [j, m] of slots.entries()) if (m !== null) validateAt(m, `${path}.slots[${j}]`);
      }
    }
  }
  if (schema >= 6) {
    if (schema >= 7 && isObj(x["inventory"])) {
      const inventory = x["inventory"];
      knownKeys(inventory, ["pockets", "lastPocket", "indices"], "$.inventory", out);
      if (Array.isArray(inventory["pockets"])) for (const [i, pocket] of inventory["pockets"].entries()) if (Array.isArray(pocket)) for (const [j, slot] of pocket.entries()) if (isObj(slot)) knownKeys(slot, ["itemId", "quantity"], `$.inventory.pockets[${i}][${j}]`, out);
    }
    out.push(...inventoryProblems(x['inventory']));
    if (!Array.isArray(x['badges']) || x['badges'].length < 8 || x['badges'].some(v => typeof v !== 'boolean')) out.push({path:'$.badges',message:'must be a boolean array with at least eight positions'});
  } else if (!isObj(x["bag"])) out.push({ path: "$.bag", message: "must be an object" });
  else for (const [k, v] of Object.entries(x["bag"] as Obj)) if (!isInt(v, 1)) out.push({ path: `$.bag.${k}`, message: "must be an integer >= 1 (empty entries are removed)" });
  if (!isInt(x["money"], 0)) out.push({ path: "$.money", message: "must be an integer >= 0" });
  const dex = x["dex"];
  if (schema >= 7) out.push(...dexStateProblems(dex));
  else if (!isObj(dex)) out.push({ path: "$.dex", message: "must be {seen, owned}" });
  else for (const k of ["seen", "owned"]) {
    const l = dex[k];
    if (!Array.isArray(l) || l.some((s) => typeof s !== "string") || new Set(l).size !== l.length) out.push({ path: `$.dex.${k}`, message: schema >= 4 ? "must be an array of unique species content ids" : "must be an array of unique species names" });
  }
  if (!isObj(x["appliedBattles"])) out.push({ path: "$.appliedBattles", message: "must be an object" });
  else for (const [id, v] of Object.entries(x["appliedBattles"])) if (!isObj(v) || !Object.hasOwn(v, "hash") || typeof v["hash"] !== "string" || !/^[0-9a-f]{64}$/.test(v["hash"])) out.push({ path: `$.appliedBattles["${id}"]`, message: "must be {hash: 64 hex characters}" });
  if (schema >= 3) {
    const claims = x["claims"];
    if (!isObj(claims)) out.push({ path: "$.claims", message: "must be an object (claim id -> {kind})" });
    else for (const [id, v] of Object.entries(claims)) {
      if (!CLAIM_ID.test(id)) out.push({ path: `$.claims["${id}"]`, message: "claim id must be 1-64 characters of A-Z a-z 0-9 # . _ : -" });
      if (!isObj(v) || !Object.hasOwn(v, "kind") || !CLAIM_KINDS.includes(v["kind"] as string) || Object.keys(v).length !== 1) out.push({ path: `$.claims["${id}"]`, message: `must be {kind: ${CLAIM_KINDS.map((k) => `"${k}"`).join(" | ")}}` });
    }
  }
  if (schema >= 7 && isObj(x["stats"])) knownKeys(x["stats"], Object.keys(newStats()), "$.stats", out);
  if (schema >= 4) validateStats(x["stats"], x["steps"], out);
  return out;
}

/** Synchronous installation/save gate. It validates the present state; only migrateGame may change layouts. */
export function validateGameContent(state: unknown, content: Content): Problem[] {
  const out = validateGame(state);
  if (out.length) return out;
  const doc = state as Obj;
  if (doc["schema"] !== SAVE_SCHEMA) return [{ path: "$.schema", message: "must migrate to schema 7 before installation or saving" }];
  out.push(...dexContentProblems(content));
  if (out.length) return out;
  const catalog = catalogOf(content);
  const moveDirectory = Object.values(content.moves ?? {});
  const abilityDirectory = content.abilities;
  const abilityKnown = (ability: string): boolean => abilityDirectory !== undefined
    ? Object.values(abilityDirectory).some(entry => entry.id === ability || entry.name === ability)
    : Object.values(content.species).some(species => [...(species.abilities ?? []), ...(species.hiddenAbilities ?? [])].includes(ability));
  const moveKnown = (id: string): boolean => moveDirectory.some(move => move.id === id);
  for (const { member, path } of persistentMembers(doc)) {
    const m = member as unknown as Member;
    const species = speciesDataOf(content, m);
    if (!species) out.push({ path: `${path}.species`, message: "unmapped species/form; original save must be kept" });
    // An explicitly empty/sparse author slot list can legitimately resolve to no ability (WP19).
    // This is not permission for arbitrary empty overrides or a guessed slot on an old individual.
    const legalEmpty = m.ability === "" && !!species && m.effectiveAbilityIndex === null &&
      (m.abilityIndex === null ? [0, 1].some(slot => resolveAbility(m.personalID!, species, slot).ability === "") : resolveAbility(m.personalID!, species, m.abilityIndex!).ability === "");
    if (!legalEmpty && !abilityKnown(m.ability)) out.push({ path: `${path}.ability`, message: "unmapped ability; a trusted legacy override still requires the checked ability directory" });
    if (m.item && !itemOf(catalog, m.item)) out.push({ path: `${path}.item`, message: "unmapped held item" });
    if (m.ball && !itemOf(catalog, m.ball)) out.push({ path: `${path}.ball`, message: "unmapped capture ball" });
    for (const [i, move] of m.moves.entries()) {
      const base = baseMovePp(content, move.id);
      if (!moveKnown(move.id)) out.push({ path: `${path}.moves[${i}].id`, message: "unmapped move" });
      else if (base === undefined || move.maxpp !== totalPp(base, move.ppUps ?? 0)) out.push({ path: `${path}.moves[${i}].maxpp`, message: "max PP does not match checked base PP and PP Ups" });
    }
    for (const [i, move] of m.firstMoves!.entries()) if (!moveKnown(move)) out.push({ path: `${path}.firstMoves[${i}]`, message: "unmapped first move" });
  }
  const inventory = doc["inventory"] as unknown as GameState["inventory"];
  for (const [i, pocket] of inventory.pockets.entries()) for (const [j, slot] of pocket.entries()) if (!itemOf(catalog, slot.itemId)) out.push({ path: `$.inventory.pockets[${i}][${j}].itemId`, message: "unmapped item; original save must be kept" });
  const dex = doc["dex"] as unknown as DexState;
  const baseKnown = (id: string): boolean => !!speciesDataOf(content, { species: id, form: 0 });
  for (const key of ["seen", "owned"] as const) dex[key].forEach((id, i) => { if (!baseKnown(id)) out.push({ path: `$.dex.${key}[${i}]`, message: "unmapped species content identity" }); });
  for (const key of ["seenForms", "capturedCounts", "defeatedCounts"] as const) for (const id of Object.keys(dex[key])) if (!baseKnown(id)) out.push({ path: `$.dex.${key}[${JSON.stringify(id)}]`, message: "unmapped species content identity" });
  // Named record keys and base keys remain distinct. Recognize both without merging or rewriting either history.
  for (const [id, record] of Object.entries(dex.lastSeenForm)) {
    const key = own(content.speciesKeys, id);
    if (!speciesDataOf(content, { species: id, form: record.form }) && !(key && speciesDataOf(content, { ...key, form: record.form }))) out.push({ path: `$.dex.lastSeenForm[${JSON.stringify(id)}]`, message: "unmapped species/form record identity" });
  }
  if (dex.layoutIdentity !== content.regionalDex!.layoutIdentity) out.push({ path: "$.dex.layoutIdentity", message: "layout mismatch: explicit load migration is required before saving or installation" });
  else out.push(...dexLayoutStateProblems(dex, content.regionalDex!));
  return out;
}

export interface MigrateOptions {
  /** The current content's mapping from a Showdown species name to its persistent key; needed from schema 3 to 4. */
  speciesKey?: SpeciesKeyResolver;
  /** Required for 4→5 individual defaults and every schema 7 load; validated by the content boundary. */
  content?: Content;
}

/** Thrown inside a migration step: the whole migration is refused with this code and these located problems. */
class MigrationRefused extends Error {
  readonly code: SaveErrorInfo["code"];
  readonly problems: Problem[];
  constructor(code: SaveErrorInfo["code"], message: string, problems: Problem[] = []) { super(message); this.code = code; this.problems = problems; }
}

interface MigrationContext extends MigrateOptions { originalMembers: ReadonlyMap<string, unknown> }
type Migrator = (doc: Obj, notes: string[], options: MigrationContext) => void;
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
  4: (doc, notes, options) => {
    const content = options.content;
    if (!content) throw new MigrationRefused("needs-content", "moving this save to schema 5 needs validated game content for individual ability slots; nothing was changed");
    const boxes = doc["boxes"] as Obj[];
    if (boxes.length > STORAGE_CAPACITY) throw new MigrationRefused("capacity-exceeded", `schema 4 has ${boxes.length} boxed members, limit ${STORAGE_CAPACITY}; this save cannot continue in 5.1. No recovery tool is provided in this batch; original bytes and all save slots must remain untouched.`, [{ path: "$.boxes[1200]", message: "first member exceeding 40×30; no recovery path in 5.1" }]);
    const party = doc["party"] as Obj[];
    const problems: Problem[] = [];
    const complete = (raw: Obj, path: string): Member | null => {
      const member = raw as unknown as Member;
      const species = speciesDataOf(content, member);
      if (!species) { problems.push({ path: `${path}.species`, message: `"${member.species}" form ${member.form ?? 0} is not in current content` }); return null; }
      // Old formats never declared these fields, but a trusted explicit value in the whitelist is retained.
      try { return completeIndividual(member, species, options.originalMembers.get(member.id) ?? raw); } catch (error) { throw new MigrationRefused("invalid", `invalid legacy individual at ${path}: ${String(error instanceof Error ? error.message : error)}`, [{ path, message: "invalid individual metadata; nothing was changed" }]); }
    };
    const newParty = party.map((m, i) => complete(m, `$.party[${i}]`));
    const newBoxes = boxes.map((m, i) => complete(m, `$.boxes[${i}]`));
    if (problems.length) throw new MigrationRefused("unmapped-species", "individual metadata could not be resolved; nothing was changed", problems);
    const storage = newStorage();
    for (const [i, member] of newBoxes.entries()) storage.boxes[Math.floor(i / 30)]!.slots[i % 30] = member;
    doc["party"] = newParty;
    doc["storage"] = storage;
    doc["player"] = { ...COMPATIBLE_PLAYER };
    doc["nextMemberOrdinal"] = initialOrdinal([...newParty, ...newBoxes].map((m) => m!.id));
    delete doc["boxes"];
    doc["schema"] = 5;
    notes.push("schema 5: fixed 40×30 storage; stable deterministic legacy PID; trusted fields retained; owner is compatibility data, obtain time/map/method remain unknown");
  },
  5: (doc, notes, options) => {
    const content = options.content;
    try { doc['inventory'] = inventoryFromBag(doc['bag'] as Record<string,number>, catalogOf(content), inventoryPolicy(content)); }
    catch(error) { throw new MigrationRefused('invalid', `inventory migration refused; original save unchanged: ${String(error)}`, [{path:'$.bag',message:String(error)}]); }
    const members: {member:Obj;path:string}[] = (doc['party'] as Obj[]).map((member,i)=>({member,path:`$.party[${i}]`}));
    const storage = doc['storage'] as {boxes:{slots:(Obj|null)[]}[]};
    for (const [i,box] of storage.boxes.entries()) for (const [j,member] of box.slots.entries()) if(member) members.push({member,path:`$.storage.boxes[${i}].slots[${j}]`});
    for (const {member,path} of members) {
      for (const [i,move] of (member['moves'] as Obj[]).entries()) {
        if (!content) throw new MigrationRefused('needs-content','schema 6 needs validated move base PP before adding PP metadata; nothing changed');
        const base=baseMovePp(content,move['id'] as string), boost=move['ppUps'] ?? 0;
        if (base===undefined || move['maxpp']!==totalPp(base,boost as number)) throw new MigrationRefused('invalid','ambiguous-move-pp; repair the content mapping and reload the unchanged save',[{path:`${path}.moves[${i}].maxpp`,message:'base PP/legacy max PP is missing or ambiguous; no guessing or reset'}]);
        move['ppUps']=boost;
      }
      member['statNature']=null;
    }
    doc['badges']=Array(8).fill(false);delete doc['bag'];doc['schema']=6;
    notes.push('schema 6: single ordered inventory authority, badges default false, calculation nature has no override, unambiguous move PP metadata preserved');
  },
  6: (doc, notes, options) => {
    const content = options.content;
    if (!content?.regionalDex) throw new MigrationRefused("needs-content", "schema 7 requires validated content and its current regional dex layout; nothing was changed");
    const contentProblems = dexContentProblems(content);
    if (contentProblems.length) throw new MigrationRefused("invalid", "schema 7 content layout is invalid; nothing was changed", contentProblems);
    for (const { member } of persistentMembers(doc)) {
      member["evolutionReadiness"] = "known";
      member["cannotTrade"] = false;
    }
    doc["dex"] = createDexState(content, doc["dex"] as { seen: string[]; owned: string[] }, "migration");
    doc["schema"] = 7;
    notes.push("schema 7: existing readiness is known; cannotTrade defaults false; old seen/owned remain independent, no forms or counts were inferred; dex unlocks follow the declared legacy truth table");
  },
};

export function migrateGame(raw: unknown, options: MigrateOptions = {}): MigrationResult {
  if (!isObj(raw)) return { ok: false, error: { code: "corrupt", message: "the save state is not an object (damaged or not a game state)" } };
  const found = raw["schema"];
  if (!isInt(found, 1)) return { ok: false, error: { code: raw["schema"] === undefined ? "corrupt" : "unknown-version", message: raw["schema"] === undefined ? "the save state has no schema version" : `unsupported schema value ${JSON.stringify(found)}`, found } };
  if (found > SAVE_SCHEMA) return { ok: false, error: { code: "unknown-version", message: `saved by a newer version (schema ${found}); this build understands up to ${SAVE_SCHEMA}. Nothing was changed.`, found } };
  if (!SUPPORTED_SCHEMAS.includes(found)) return { ok: false, error: { code: "unknown-version", message: `schema ${found} is not a supported old version (supported: ${SUPPORTED_SCHEMAS.join(", ")})`, found } };
  const originalProblems = validateGame(raw);
  if (originalProblems.length) return { ok: false, error: { code: "invalid", message: `the original schema ${found} document is invalid; nothing was changed`, found, problems: originalProblems } };
  const doc = JSON.parse(JSON.stringify(raw)) as Obj; // never touch the original
  const notes: string[] = [];
  const originalMembers = new Map<string, unknown>();
  for (const key of ["party", "boxes"]) if (Array.isArray(raw[key])) for (const member of raw[key]) if (isObj(member) && typeof member["id"] === "string") originalMembers.set(member["id"], member);
  const context: MigrationContext = { ...options, originalMembers };
  let v = found;
  while (v < SAVE_SCHEMA) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: { code: "unknown-version", message: `no migration from schema ${v}`, found } };
    try { step(doc, notes, context); }
    catch (e) {
      if (!(e instanceof MigrationRefused)) throw e;
      return { ok: false, error: { code: e.code, message: e.message, found, ...(e.problems.length ? { problems: e.problems } : {}), ...(e.code === "capacity-exceeded" ? { partyCount: Array.isArray(raw["party"]) ? raw["party"].length : 0, boxMemberCount: Array.isArray(raw["boxes"]) ? raw["boxes"].length : 0, limit: STORAGE_CAPACITY, recovery: "none-in-5.1" } : {}) } };
    }
    v = doc["schema"] as number;
  }
  if (!options.content?.regionalDex) return { ok: false, error: { code: "needs-content", message: "schema 7 loading requires validated content and its current dex layout; nothing was changed", found } };
  const layoutProblems = dexContentProblems(options.content);
  if (layoutProblems.length) return { ok: false, error: { code: "invalid", message: "current content layout or transition is invalid; nothing was changed", found, problems: layoutProblems } };
  const dex = doc["dex"] as unknown as DexState, target = options.content.regionalDex;
  let layoutMigrated = false;
  if (dex.layoutIdentity !== target.layoutIdentity) {
    const matches = (target.transitions ?? []).filter(t => t.from === dex.layoutIdentity && t.to === target.layoutIdentity);
    if (matches.length !== 1) return { ok: false, error: { code: matches.length ? "invalid" : "needs-content", message: matches.length ? "ambiguous-layout-transition: exactly one declared transition is required; nothing was changed" : "layout-transition-missing: no declared one-hop transition; nothing was changed", found, problems: [{ path: "$.dex.layoutIdentity", message: matches.length ? "ambiguous-layout-transition" : "layout-transition-missing" }] } };
    const oldProblems = dexLayoutStateProblems(dex, matches[0]!.oldLayout);
    if (oldProblems.length) return { ok: false, error: { code: "invalid", message: "saved dex is invalid for its declared old layout; nothing was changed", found, problems: oldProblems } };
    remapDexLayout(dex, target, matches[0]!, notes);
    layoutMigrated = true;
    notes.push(`schema 7 dex layout: applied declared one-hop transition ${matches[0]!.from} -> ${target.layoutIdentity}`);
  }
  const problems = validateGameContent(doc, options.content);
  if (problems.length) return { ok: false, error: { code: "invalid", message: `the save state (schema ${found}) is structurally invalid: ${problems.length} problem(s); first: ${problems[0]!.path} ${problems[0]!.message}`, found, problems } };
  return { ok: true, state: doc as unknown as GameState, from: found, to: SAVE_SCHEMA, migrated: found !== SAVE_SCHEMA || layoutMigrated, notes };
}

/** Size of the replay ledger (appliedBattles): the growth that has to stay visible. */
export function ledgerStats(state: GameState): { entries: number; jsonBytes: number } {
  const text = JSON.stringify(state.appliedBattles);
  return { entries: Object.keys(state.appliedBattles).length, jsonBytes: text.length };
}
