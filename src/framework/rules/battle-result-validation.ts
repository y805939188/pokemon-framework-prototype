/** Content-independent frozen-v1 gate. Run before hashing or consulting the replay ledger.
 * This checks the received value without copying away unknown fields or invoking caller code.
 * Fresh content references, original capture templates, receiving and state-dependent limits
 * remain the primary planner's responsibility; exact replay needs none of those lookups.
 */
import type { BattleResult } from "./battle-result.ts";

type Data = Record<string, unknown>;
const MEMBER_ID = /^[A-Za-z0-9#._:-]{1,18}$/;
const ITEM_ID = /^[A-Za-z0-9#._:-]{1,64}$/;
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const PATCH = ["level", "exp", "hp", "status", "statusCount", "moves", "evs", "friendship"] as const;
const CAPTURE = ["id", "species", "nickname", "level", "exp", "hp", "status", "statusCount", "moves", "item", "ability", "nature", "gender", "ivs", "evs", "friendship", "ball", "ot"] as const;
const NATURES = ["hardy", "docile", "serious", "bashful", "quirky", "lonely", "brave", "adamant", "naughty", "bold", "relaxed", "impish", "lax", "timid", "hasty", "jolly", "naive", "modest", "mild", "quiet", "rash", "calm", "gentle", "sassy", "careful"];

function fail(path: string, reason: string): never { throw new Error(`invalid battle result ${path}: ${reason}`); }

/** Accept local/cross-realm intrinsic prototypes, and null-prototype records. Do not read
 * prototype.constructor or toJSON as properties: either could be an accessor.
 * This is an own-slot boundary, not protection against hostile replacement of global intrinsics.
 */
function plain(value: object, array: boolean, path: string): void {
  const prototype = Object.getPrototypeOf(value) as object | null;
  const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, "constructor");
  const intrinsic = array ? Array : Object;
  if (!(prototype === null && !array) && !(prototype && constructor && "value" in constructor
    && typeof constructor.value === "function"
    && Object.getOwnPropertyDescriptor(constructor.value, "prototype")?.value === prototype
    && Function.prototype.toString.call(constructor.value) === Function.prototype.toString.call(intrinsic)
    && (array ? Array.isArray(prototype) : Object.getPrototypeOf(prototype) === null))) {
    fail(path, "expected plain own data");
  }
  for (let owner: object | null = value; owner !== null; owner = Object.getPrototypeOf(owner) as object | null) {
    const hook = Object.getOwnPropertyDescriptor(owner, "toJSON");
    if (!hook) continue;
    if (!("value" in hook) || typeof hook.value === "function") fail(path, "JSON hooks are not data");
    break;
  }
}

/** A temporary check view, never a replacement for the received value or its hash input. */
function record(value: unknown, path: string, allowed?: readonly string[], required: readonly string[] = []): Data {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected a record");
  plain(value, false, path);
  const view = Object.create(null) as Data;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(path, "symbol keys are not data");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor)) fail(`${path}.${key}`, "expected own enumerable data");
    if (allowed && !allowed.includes(key)) fail(`${path}.${key}`, "unknown field");
    view[key] = descriptor.value;
  }
  if (allowed) for (const key of allowed) {
    if (!Object.hasOwn(view, key) && key in value) fail(`${path}.${key}`, "inherited fields are not data");
  }
  for (const key of required) if (!Object.hasOwn(view, key)) fail(`${path}.${key}`, "missing field");
  return view;
}

function list(value: unknown, path: string, maximum = Number.MAX_SAFE_INTEGER): unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  plain(value, true, path);
  const length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
  if (length > maximum) fail(path, `at most ${maximum} entries allowed`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) fail(path, "expected a dense array with only indexed data");
  const view: unknown[] = [];
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) fail(path, "arrays only contain indexed data");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor)) fail(`${path}[${key}]`, "expected own enumerable data");
    view[Number(key)] = descriptor.value;
  }
  return view;
}

function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(path, `expected a safe integer from ${minimum} to ${maximum}`);
}
function text(value: unknown, path: string, nonempty = false): asserts value is string {
  if (typeof value !== "string" || (nonempty && !value.length)) fail(path, nonempty ? "expected a nonempty string" : "expected a string");
}
function memberId(value: unknown, path: string): asserts value is string {
  text(value, path);
  if (!MEMBER_ID.test(value)) fail(path, "expected a stable member id (1-18 safe characters)");
}
function itemId(value: unknown, path: string): asserts value is string {
  text(value, path);
  if (!ITEM_ID.test(value)) fail(path, "expected an item battle id (1-64 safe characters)");
}
function stats(value: unknown, path: string, maximum: number): void {
  const block = record(value, path, STATS);
  for (const key of Object.keys(block)) integer(block[key], `${path}.${key}`, 0, maximum);
}
function moves(value: unknown, path: string): void {
  for (const [i, entry] of list(value, path, 4).entries()) {
    const p = `${path}[${i}]`, move = record(entry, p, ["id", "pp", "maxpp"], ["id", "pp", "maxpp"]);
    text(move["id"], `${p}.id`, true);
    integer(move["pp"], `${p}.pp`);
    integer(move["maxpp"], `${p}.maxpp`, 1);
    if ((move["pp"] as number) > (move["maxpp"] as number)) fail(p, "PP exceeds maximum PP");
  }
}
function patchFields(patch: Data, path: string): void {
  for (const key of ["level", "exp", "hp", "statusCount", "friendship"] as const) if (Object.hasOwn(patch, key)) {
    integer(patch[key], `${path}.${key}`, key === "level" ? 1 : 0, key === "level" ? 100 : Number.MAX_SAFE_INTEGER);
  }
  if (Object.hasOwn(patch, "status") && !["", "psn", "brn", "par", "slp", "frz"].includes(patch["status"] as string)) fail(`${path}.status`, "expected a persistent v1 status");
  if (Object.hasOwn(patch, "moves")) moves(patch["moves"], `${path}.moves`);
  if (Object.hasOwn(patch, "evs")) stats(patch["evs"], `${path}.evs`, 255);
}

function captured(value: unknown, path: string): Data {
  const member = record(value, path, CAPTURE, ["id", "species", "level", "exp", "hp", "status", "moves", "item", "ability", "nature", "gender"]);
  memberId(member["id"], `${path}.id`);
  text(member["species"], `${path}.species`, true);
  patchFields(member, path);
  for (const key of ["item", "ability", "nature", "gender", "ball", "ot"] as const) if (Object.hasOwn(member, key)) text(member[key], `${path}.${key}`);
  if (!NATURES.includes((member["nature"] as string).toLowerCase())) fail(`${path}.nature`, "expected a registered nature");
  if (!["M", "F", "N"].includes(member["gender"] as string)) fail(`${path}.gender`, "expected M, F or N");
  if (Object.hasOwn(member, "nickname") && member["nickname"] !== null) text(member["nickname"], `${path}.nickname`);
  if (Object.hasOwn(member, "ivs")) stats(member["ivs"], `${path}.ivs`, 31);
  if (Object.hasOwn(member, "ball")) itemId(member["ball"], `${path}.ball`);
  return member;
}

/** Full finite shape validation only. No content/state access, hashing, normalization or mutation.
 * Optional v1 member fields may be omitted; explicitly present undefined is not JSON data.
 * Friendship retains its existing nonnegative-safe-integer domain (not the engine's 0..255).
 */
export function assertBattleResultShape(value: unknown): asserts value is BattleResult {
  const required = ["protocol", "battleId", "outcome", "members", "bag", "captured", "dex"];
  const result = record(value, "$", [...required, "money"], required);
  if (result["protocol"] !== 1) fail("$.protocol", "expected protocol 1");
  text(result["battleId"], "$.battleId", true);
  const outcome = record(result["outcome"], "$.outcome", ["kind", "winner", "target", "ball"], ["kind", "winner"]);
  const kind = outcome["kind"];
  if (!["win", "run", "caught", "tie"].includes(kind as string)) fail("$.outcome.kind", "expected a frozen v1 end reason");
  if (kind === "win") text(outcome["winner"], "$.outcome.winner", true);
  else if (outcome["winner"] !== null) fail("$.outcome.winner", "expected null for run, caught or tie");
  if (kind === "caught") {
    memberId(outcome["target"], "$.outcome.target");
    itemId(outcome["ball"], "$.outcome.ball");
  } else for (const key of ["target", "ball"]) if (Object.hasOwn(outcome, key)) fail(`$.outcome.${key}`, "only caught outcomes have this field");

  const members = record(result["members"], "$.members");
  for (const id of Object.keys(members)) {
    memberId(id, `$.members.${id}`);
    patchFields(record(members[id], `$.members.${id}`, PATCH), `$.members.${id}`);
  }
  const bag = record(result["bag"], "$.bag");
  for (const id of Object.keys(bag)) {
    itemId(id, `$.bag.${id}`);
    integer(bag[id], `$.bag.${id}`, Number.MIN_SAFE_INTEGER);
  }
  const captures = list(result["captured"], "$.captured"), captureIds = new Set<string>();
  for (const [i, entry] of captures.entries()) {
    const member = captured(entry, `$.captured[${i}]`), id = member["id"] as string;
    if (captureIds.has(id) || Object.hasOwn(members, id)) fail(`$.captured[${i}].id`, "duplicate or patched captured member id");
    captureIds.add(id);
    if (id === outcome["target"] && Object.hasOwn(member, "ball") && member["ball"] !== outcome["ball"]) fail(`$.captured[${i}].ball`, "capture must match outcome ball");
  }
  if (kind === "caught" && !captureIds.has(outcome["target"] as string)) fail("$.outcome.target", "caught target must be in captured members");
  const dex = record(result["dex"], "$.dex", ["seen", "owned"], ["seen", "owned"]);
  for (const key of ["seen", "owned"]) for (const [i, name] of list(dex[key], `$.dex.${key}`).entries()) text(name, `$.dex.${key}[${i}]`, true);
  if (Object.hasOwn(result, "money")) integer(result["money"], "$.money", Number.MIN_SAFE_INTEGER);
}
