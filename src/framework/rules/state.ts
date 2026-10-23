/**
 * Persistent game state model + the battle write-back contract (protocol v1).
 * Pure functions. A BattleResult is the only thing that crosses from the battle layer into persistent state;
 * `applyBattleResult` is the single write path.
 */
import { clone } from "./value.ts";
export { clone } from "./value.ts";
import { assertCapturedHeldSources, receiveMembers, requireTemplate } from "./receiving.ts";
import type { HeldItemSource, ReceivingDecision, ReceivingProfile } from "./receiving.ts";
import { sha256Hex } from "./sha256.ts";
import { DEFAULT_LIMITS } from "./limits.ts";
import { own, setOwn } from "./own.ts";
import { identityKeys } from "./species-key.ts";
import type { SpeciesKeyResolver } from "./species-key.ts";
import { advanceMemberOrdinal, completeIndividual, COMPATIBLE_PLAYER, initialOrdinal } from "./member-identity.ts";
import { allMembers, boxedMembers, newStorage, placeInBox } from "./storage.ts";
import type { Storage } from "./storage.ts";
import { newStats } from "./stats.ts";
import type { GameStats } from "./stats.ts";
import type { Limits } from "./limits.ts";
import type { Content, Member, MemberOrigin, MoveSlot, Owner, PartialStats, Stats } from "./types.ts";

export const PROTOCOL_VERSION = 1;

/** Version of the PERSISTENT game state document (rules/save-schema.ts migrates older ones). Not the battle protocol version. */
export const GAME_SCHEMA = 5;

/** Fields of a persistent member that a battle result may change. Everything else must be untouched. */
export const MEMBER_WRITE_SET = ["level", "exp", "hp", "status", "statusCount", "moves", "evs", "friendship"] as const;
export type WriteKey = (typeof MEMBER_WRITE_SET)[number];

export type MemberPatch = Partial<Pick<Member, WriteKey>>;

export interface Dex {
  seen: string[];
  owned: string[];
}

export interface GameState {
  schema: number;
  party: Member[];
  storage: Storage;
  player: Owner;
  nextMemberOrdinal: string;
  bag: Record<string, number>;
  money: number;
  dex: Dex;
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

export interface BattleOutcome {
  kind: string;
  winner: string | null;
  target?: string;
  ball?: string;
}

export interface BattleResult {
  protocol: number;
  battleId: string;
  outcome: BattleOutcome;
  members: Record<string, MemberPatch>;
  bag: Record<string, number>;
  captured: Member[];
  dex: Dex;
  money?: number;
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
    ...Object.fromEntries((["personalID", "ownerCompatibilityDefault", "origin", "abilityIndex", "effectiveAbilityIndex", "shiny", "superShiny", "firstMoves", "markings", "ribbons", "cannotStore", "cannotRelease", "isEgg", "mail", "readyToEvolve"] as const)
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
export function newGame({ party, bag = {}, money = 0, player = { ...COMPATIBLE_PLAYER } }: { party: NewMemberInput[]; bag?: Record<string, number>; money?: number; player?: Owner }): GameState {
  const members = party.map((m) => completeIndividual(newMember({ ...m, form: m.form ?? 0 }), {}));
  return { schema: GAME_SCHEMA, party: members, storage: newStorage(), player: { ...player }, nextMemberOrdinal: initialOrdinal(members.map((m) => m.id)), bag: { ...bag }, money, dex: { seen: [], owned: [] }, appliedBattles: {}, claims: {}, stats: newStats(), steps: 0 };
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

export function capturedTemplates(result: BattleResult, templates: Readonly<Record<string, Member>>, keys: SpeciesKeyResolver): Member[] {
  const received: Member[] = [];
  for (const c of result.captured || []) {
    const template = own(templates, c.id);
    requireTemplate(template, c.id);
    const k = keys(c.species);
    if (!k || k.species !== template.species || k.form !== (template.form ?? 0)) throw new Error(`captured member ${c.id}: "${c.species}" has no matching persistent key in its original template`);
    received.push({ ...clone(template), hp: c.hp, status: c.status, statusCount: c.statusCount ?? 0, moves: clone(c.moves), ball: c.ball ?? template.ball, friendship: c.friendship ?? template.friendship });
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
  if (result.protocol !== PROTOCOL_VERSION) throw new Error(`unsupported protocol ${result.protocol}`);
  if (state.schema !== GAME_SCHEMA) throw new Error(`game state has schema ${state.schema}, this build writes schema ${GAME_SCHEMA}: migrate it first (rules/save-schema.ts)`);
  if (!result.battleId) throw new Error("result without battleId");
  assertCapturedHeldSources(result.captured ?? [], options.templates ?? {}, options.heldItemSource);
  const h = resultHash(result);
  const prev = own(state.appliedBattles, result.battleId);
  if (prev) {
    if (prev.hash === h) return { state, status: "already-applied" };
    throw new Error(`battle ${result.battleId} already applied with a different result`);
  }
  const next = clone(state);
  for (const [id, patch] of Object.entries(result.members || {})) {
    const m = next.party.find((x) => x.id === id);
    if (!m) throw new Error(`result references unknown member ${id}`);
    for (const k of Object.keys(patch)) {
      if (!(MEMBER_WRITE_SET as readonly string[]).includes(k)) throw new Error(`result tries to write ${k} outside the write set`);
      const v = (patch as Record<string, unknown>)[k];
      if (k === "statusCount" && !(typeof v === "number" && Number.isInteger(v) && v >= 0)) throw new Error("statusCount must be an integer >= 0");
      (m as unknown as Record<string, unknown>)[k] = clone(v);
    }
  }
  for (const [item, delta] of Object.entries(result.bag || {})) {
    const had = next.bag[item] || 0;
    const n = had + delta;
    if (n < 0) throw new Error(`bag would go negative for ${item}`);
    if (delta > 0 && n > limits.bagPerItem) throw new Error(`${item} would be ${n}, above the stage cap of ${limits.bagPerItem} per item`);
    if (n === 0) delete next.bag[item]; else next.bag[item] = n;
  }
  const received = capturedTemplates(result, options.templates ?? {}, keys);
  if (received.length) {
    const planned = receiveMembers(next, received, options.decisions ?? {}, { limits, content: options.content ?? { species: {} }, profile: options.profile ?? { mode: 0, naming: 0 }, depositHeal: options.depositHeal ?? false });
    next.party = planned.state.party; next.storage = planned.state.storage;
    next.nextMemberOrdinal = advanceMemberOrdinal(state.nextMemberOrdinal, received.map((m) => m.id), options.nextMemberOrdinal ?? state.nextMemberOrdinal);
  }
  if (result.dex) {
    for (const list of ["seen", "owned"] as const) for (const name of result.dex[list] || []) {
      const k = keys(name);
      if (!k) throw new Error(`dex ${list}: "${name}" has no persistent species key in the content`);
      if (!next.dex[list].includes(k.species)) next.dex[list].push(k.species);
    }
  }
  if (result.money) next.money = Math.max(0, next.money + result.money);
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
