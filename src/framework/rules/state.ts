import { createDexState } from "./dex-state";
import { moneyCap } from "./economy";
/**
 * Persistent game state model + the battle write-back contract (protocol v1).
 * Pure functions. A BattleResult is the only thing that crosses from the battle layer into persistent state;
 * `applyBattleResult` is the single write path.
 */
import { inventoryFromBag, applyBattleBag, inventoryPolicy } from "./inventory";
import { catalogOf } from "./item-catalog";
import { mergeBattleMoves } from "./member-metadata";
import { memberContentProblems } from "./member-content";
import type { Inventory } from "./inventory";
import { clone } from "./value";
export { clone } from "./value";
import { assertCapturedHeldSources, receiveMembers, requireTemplate } from "./receiving";
import type { HeldItemSource, ReceivingDecision, ReceivingProfile } from "./receiving";
import { sha256Hex } from "./sha256";
import { DEFAULT_LIMITS } from "./limits";
import { own, setOwn } from "./own";
import { assertBattleResultShape } from "./battle-result-validation";
import { identityKeys } from "./species-key";
import type { SpeciesKeyResolver } from "./species-key";
import { advanceMemberOrdinal, completeIndividual, COMPATIBLE_PLAYER, initialOrdinal } from "./member-identity";
import { allMembers, boxedMembers, newStorage, placeInBox } from "./storage";
import type { Storage } from "./storage";
import { newStats } from "./stats";
import type { GameStats } from "./stats";
import type { Limits } from "./limits";
import type { Content, DexState, Member, MemberOrigin, MoveSlot, Owner, PartialStats, Stats } from "./types";
import { PROTOCOL_VERSION, MEMBER_WRITE_SET } from "./battle-result";
import type { BattleResult } from "./battle-result";
export { PROTOCOL_VERSION, MEMBER_WRITE_SET } from "./battle-result";
export type { BattleResult, BattleOutcome, MemberPatch, WriteKey, Dex } from "./battle-result";

/** Version of the PERSISTENT game state document (rules/save-schema.ts migrates older ones). Not the battle protocol version. */
export const GAME_SCHEMA = 7;

export interface GameState {
  schema: number;
  party: Member[];
  storage: Storage;
  player: Owner;
  nextMemberOrdinal: string;
  inventory: Inventory;
  badges: boolean[];
  money: number;
  dex: DexState;
  appliedBattles: Record<string, { hash: string }>;
  /** One-time claims (schema 3): a claimed grant id can never be granted again on this save timeline. */
  claims: Record<string, Claim>;
  /** Statistics record (schema 4; WP06 §4.2, 74 fields). */
  stats: GameStats;
  /** Global step counter (schema 4; WP06 §4.1, wraps at 2^31). */
  steps: number;
}

export interface Claim {
  kind: "grant";
}

export interface NewMemberInput {
  id: string;
  species: string;
  /** Persistent members carry a form; battle records (e.g. a result's captured member, protocol v1) do not. */
  form?: number;
  nickname?: string | null;
  level: number;
  exp: number;
  hp: number;
  status?: string;
  statusCount?: number;
  moves: MoveSlot[];
  item?: string;
  ability: string;
  nature: string;
  statNature?: string | null;
  gender: string;
  ivs?: PartialStats;
  evs?: PartialStats;
  friendship?: number;
  ball?: string;
  ot?: string;
  personalID?: number;
  owner?: Owner;
  ownerCompatibilityDefault?: boolean;
  origin?: MemberOrigin;
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
  evolutionReadiness?: "known" | "unknown";
  cannotTrade?: boolean;
}

export function newMember(o: NewMemberInput): Member {
  const six = (v: number, over?: PartialStats): Stats => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v, ...over });
  return {
    id: o.id, species: o.species, ...(o.form !== undefined ? { form: o.form } : {}), nickname: o.nickname ?? null, level: o.level, exp: o.exp, hp: o.hp, status: o.status || "", statusCount: o.statusCount ?? 0,
    moves: o.moves.map((m) => ({ id: m.id, pp: m.pp, maxpp: m.maxpp })),
    item: o.item || "", ability: o.ability, nature: o.nature, gender: o.gender,
    ivs: six(31, o.ivs),
    evs: six(0, o.evs),
    friendship: o.friendship ?? 70, ball: o.ball || "pokeball", ...(o.owner ? { owner: { ...o.owner } } : { ot: o.ot || "player" }),
    ...Object.fromEntries((["personalID", "ownerCompatibilityDefault", "origin", "abilityIndex", "effectiveAbilityIndex", "shiny", "superShiny", "firstMoves", "markings", "ribbons", "cannotStore", "cannotRelease", "isEgg", "mail", "readyToEvolve", "evolutionReadiness", "cannotTrade"] as const)
      .filter((key) => o[key] !== undefined).map((key) => [key, clone(o[key])])),
  };
}

/** Frozen v1 captured-member projection: no schema-5 metadata may cross this result boundary. */
export function protocolMember(member: Member): Member {
  return newMember({ id: member.id, species: member.species, nickname: member.nickname, level: member.level,
    exp: member.exp, hp: member.hp, status: member.status, statusCount: member.statusCount, moves: member.moves,
    item: member.item, ability: member.ability, nature: member.nature, gender: member.gender,
    ivs: member.ivs, evs: member.evs, friendship: member.friendship, ball: member.ball, ot: member.owner?.name ?? member.ot });
}

/**
 * A new persistent game state. Its members are persistent: `species` is a content id, and a member given without a
 * form gets the base form 0 here (only here: `newMember` also builds battle records, which carry no form).
 */
export function newGame({ party, bag = {}, money = 0, player = { ...COMPATIBLE_PLAYER }, content }: { party: NewMemberInput[]; bag?: Record<string, number>; money?: number; player?: Owner; content?: Content }): GameState {
  const members = party.map((m) => ({...completeIndividual(newMember({ ...m, form: m.form ?? 0 }), {}), statNature: m.statNature ?? null, moves: m.moves.map(move => ({...clone(move),ppUps:move.ppUps ?? 0}))}));
  return { schema: GAME_SCHEMA, party: members, storage: newStorage(), player: { ...player }, nextMemberOrdinal: initialOrdinal(members.map((m) => m.id)), inventory: inventoryFromBag(bag, catalogOf(content), inventoryPolicy(content)), badges: Array(8).fill(false) as boolean[], money, dex: createDexState(content), appliedBattles: {}, claims: {}, stats: newStats(), steps: 0 };
}

/** Stable hash of a result, used for idempotency (same battleId + same hash => no-op). */
export function resultHash(result: BattleResult): string {
  const canon = JSON.stringify(result, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, (v as Record<string, unknown>)[x]])) : v));
  return sha256Hex(canon);
}

export type ApplyStatus = "applied" | "already-applied";
export interface BattleCommitOptions {
  templates?: Readonly<Record<string, Member>>;
  decisions?: Readonly<Record<string, ReceivingDecision>>;
  profile?: ReceivingProfile;
  content?: Content;
  nextMemberOrdinal?: string;
  depositHeal?: boolean;
  heldItemSource?: HeldItemSource;
}

export function capturedTemplates(result: BattleResult, templates: Readonly<Record<string, Member>>, keys: SpeciesKeyResolver, content?: Content): Member[] {
  const received: Member[] = [];
  for (const c of result.captured || []) {
    const template = own(templates, c.id);
    requireTemplate(template, c.id);
    const k = keys(c.species);
    if (!k || k.species !== template.species || k.form !== (template.form ?? 0)) throw new Error(`captured member ${c.id}: "${c.species}" has no matching persistent key in its original template`);
    received.push({ ...clone(template), hp: c.hp, status: c.status, statusCount: c.statusCount ?? 0, moves: mergeBattleMoves(template.moves, c.moves, content), ball: c.ball ?? template.ball, friendship: c.friendship ?? template.friendship });
  }
  return received;
}

/**
 * Apply a BattleResult to a game state (pure). Throws on contract violations (unknown member,
 * result for another protocol version, bag going negative) without partial application.
 * Capacity backstop (step 4, decision D1): a captured member joins the party, else the boxes; when both are full the
 * WHOLE result is refused (nothing is dropped and nothing half-applied; the ball is disabled before that can happen).
 * A bag item may not be raised above the per-item cap (results only spend in this build; an amount already above the
 * cap is kept).
 * Species (decision D5-3): the result speaks battle names (protocol v1); `keys` turns a captured member and the dex
 * entries into persistent keys (content id + form). The idempotency hash is taken over the result AS RECEIVED, so the
 * replay ledger written before schema 4 still recognises the same result. A name without a key refuses the whole
 * result. Without `keys` the battle name is the content id (fixture worlds); the game application always passes them.
 */
export function applyBattleResult(state: GameState, result: BattleResult, limits: Limits = DEFAULT_LIMITS, keys: SpeciesKeyResolver = identityKeys, options: BattleCommitOptions = {}): { state: GameState; status: ApplyStatus } {
  return applyResult(state, result, limits, keys, options, true);
}

/** Normal application path: validate every raw dex reference, but leave all dex writes to the source-aware owner.
 * The original result and its ledger hash are unchanged. The legacy wrapper retains its explicit raw-dex behavior.
 */
export function planBattlePrimary(state: GameState, result: BattleResult, limits: Limits = DEFAULT_LIMITS, keys: SpeciesKeyResolver = identityKeys, options: BattleCommitOptions = {}): { state: GameState; status: ApplyStatus } {
  return applyResult(state, result, limits, keys, options, false);
}

function applyResult(state: GameState, result: BattleResult, limits: Limits, keys: SpeciesKeyResolver, options: BattleCommitOptions, rawDex: boolean): { state: GameState; status: ApplyStatus } {
  // Structural validity is independent of current content and must precede hashing or exact-replay shortcuts.
  assertBattleResultShape(result);
  if (result.protocol !== PROTOCOL_VERSION) throw new Error(`unsupported protocol ${result.protocol}`);
  if (state.schema !== GAME_SCHEMA) throw new Error(`game state has schema ${state.schema}, this build writes schema ${GAME_SCHEMA}: migrate it first (rules/save-schema.ts)`);
  if (!result.battleId) throw new Error("result without battleId");
  const h = resultHash(result);
  const prev = own(state.appliedBattles, result.battleId);
  if (prev) {
    if (prev.hash === h) return { state, status: "already-applied" };
    throw new Error(`battle ${result.battleId} already applied with a different result`);
  }
  assertCapturedHeldSources(result.captured ?? [], options.templates ?? {}, options.heldItemSource);
  const next = clone(state);
  for (const [id, patch] of Object.entries(result.members || {})) {
    const m = next.party.find((x) => x.id === id);
    if (!m) throw new Error(`result references unknown member ${id}`);
    for (const k of Object.keys(patch)) {
      if (!(MEMBER_WRITE_SET as readonly string[]).includes(k)) throw new Error(`result tries to write ${k} outside the write set`);
      const v = (patch as Record<string, unknown>)[k];
      if (k === "statusCount" && !(typeof v === "number" && Number.isInteger(v) && v >= 0)) throw new Error("statusCount must be an integer >= 0");
      (m as unknown as Record<string, unknown>)[k] = k === "moves" ? mergeBattleMoves(m.moves, v as MoveSlot[], options.content) : clone(v);
    }
  }
  next.inventory = applyBattleBag(next.inventory, result.bag || {}, catalogOf(options.content), inventoryPolicy(options.content, limits));
  const received = capturedTemplates(result, options.templates ?? {}, keys, options.content);
  // Normal application reception must finish resource-reference validation before it can ask for decisions or
  // authorize a source lookup. The legacy wrapper retains its explicitly supported minimal-content harness.
  if (!rawDex && options.content) for (const member of received) {
    const problems = memberContentProblems(member, options.content, `captured.${member.id}`);
    if (problems.length) throw new Error(`invalid captured member: ${problems[0]!.path} ${problems[0]!.message}`);
  }
  if (result.dex) {
    for (const list of ["seen", "owned"] as const) for (const name of result.dex[list] || []) {
      const k = keys(name);
      if (!k) throw new Error(`dex ${list}: "${name}" has no persistent species key in the content`);
      if (rawDex && !next.dex[list].includes(k.species)) next.dex[list].push(k.species);
    }
  }
  if (result.money !== undefined) {
    if (!Number.isSafeInteger(result.money) || !Number.isSafeInteger(next.money + result.money)) throw new Error("invalid-money-delta");
    next.money = Math.min(moneyCap(options.content,limits.money), Math.max(0, next.money + result.money));
  }
  if (received.length) {
    const planned = receiveMembers(next, received, options.decisions ?? {}, { limits, content: options.content ?? { species: {} }, profile: options.profile ?? { mode: 0, naming: 0 }, depositHeal: options.depositHeal ?? false });
    next.party = planned.state.party; next.storage = planned.state.storage;
    next.nextMemberOrdinal = advanceMemberOrdinal(state.nextMemberOrdinal, received.map((m) => m.id), options.nextMemberOrdinal ?? state.nextMemberOrdinal);
  }
  setOwn(next.appliedBattles, result.battleId, { hash: h });
  return { state: next, status: "applied" };
}

/** Paths that differ between two states (for "nothing outside the write set changed" assertions). */
export function diffPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (a === b) return [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return [prefix];
  const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  const out: string[] = [];
  for (const k of keys) out.push(...diffPaths(ra[k], rb[k], prefix ? `${prefix}.${k}` : k));
  return out;
}
