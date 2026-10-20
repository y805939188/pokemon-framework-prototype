/**
 * Persistent game state model + the battle write-back contract (protocol v1).
 * Pure functions. A BattleResult is the only thing that crosses from the battle layer into persistent state;
 * `applyBattleResult` is the single write path.
 */
import { sha256Hex } from "./sha256.ts";
import { DEFAULT_LIMITS } from "./limits.ts";
import type { Limits } from "./limits.ts";
import type { Member, MoveSlot, PartialStats, Stats } from "./types.ts";

export const PROTOCOL_VERSION = 1;

/** Version of the PERSISTENT game state document (rules/save-schema.ts migrates older ones). Not the battle protocol version. */
export const GAME_SCHEMA = 3;

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
  boxes: Member[];
  bag: Record<string, number>;
  money: number;
  dex: Dex;
  appliedBattles: Record<string, { hash: string }>;
  /** One-time claims (schema 3): a claimed grant id can never be granted again on this save timeline. */
  claims: Record<string, Claim>;
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

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export interface NewMemberInput {
  id: string;
  species: string;
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
}

export function newMember(o: NewMemberInput): Member {
  const six = (v: number, over?: PartialStats): Stats => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v, ...over });
  return {
    id: o.id, species: o.species, nickname: o.nickname ?? null, level: o.level, exp: o.exp, hp: o.hp, status: o.status || "", statusCount: o.statusCount ?? 0,
    moves: o.moves.map((m) => ({ id: m.id, pp: m.pp, maxpp: m.maxpp })),
    item: o.item || "", ability: o.ability, nature: o.nature, gender: o.gender,
    ivs: six(31, o.ivs),
    evs: six(0, o.evs),
    friendship: o.friendship ?? 70, ball: o.ball || "pokeball", ot: o.ot || "player",
  };
}

export function newGame({ party, bag = {}, money = 0 }: { party: NewMemberInput[]; bag?: Record<string, number>; money?: number }): GameState {
  return { schema: GAME_SCHEMA, party: party.map(newMember), boxes: [], bag: { ...bag }, money, dex: { seen: [], owned: [] }, appliedBattles: {}, claims: {} };
}

/** Stable hash of a result, used for idempotency (same battleId + same hash => no-op). */
export function resultHash(result: BattleResult): string {
  const canon = JSON.stringify(result, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, (v as Record<string, unknown>)[x]])) : v));
  return sha256Hex(canon);
}

export type ApplyStatus = "applied" | "already-applied";

/**
 * Apply a BattleResult to a game state (pure). Throws on contract violations (unknown member,
 * result for another protocol version, bag going negative) without partial application.
 * Capacity backstop (step 4, decision D1): a captured member joins the party, else the boxes; when both are full the
 * WHOLE result is refused (nothing is dropped and nothing half-applied; the ball is disabled before that can happen).
 * A bag item may not be raised above the per-item cap (results only spend in this build; an amount already above the
 * cap is kept).
 */
export function applyBattleResult(state: GameState, result: BattleResult, limits: Limits = DEFAULT_LIMITS): { state: GameState; status: ApplyStatus } {
  if (result.protocol !== PROTOCOL_VERSION) throw new Error(`unsupported protocol ${result.protocol}`);
  if (state.schema !== GAME_SCHEMA) throw new Error(`game state has schema ${state.schema}, this build writes schema ${GAME_SCHEMA}: migrate it first (rules/save-schema.ts)`);
  if (!result.battleId) throw new Error("result without battleId");
  const h = resultHash(result);
  const prev = state.appliedBattles[result.battleId];
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
  for (const c of result.captured || []) {
    if (next.party.some((x) => x.id === c.id) || next.boxes.some((x) => x.id === c.id)) throw new Error(`captured id ${c.id} already exists`);
    const m = newMember(c);
    if (next.party.length < limits.party) next.party.push(m);
    else if (next.boxes.length < limits.boxes) next.boxes.push(m);
    else throw new Error(`no room for captured member ${c.id}: the party (${next.party.length}) and the boxes (${next.boxes.length}) are full`);
  }
  if (result.dex) {
    for (const k of ["seen", "owned"] as const) for (const sp of result.dex[k] || []) if (!next.dex[k].includes(sp)) next.dex[k].push(sp);
  }
  if (result.money) next.money = Math.max(0, next.money + result.money);
  next.appliedBattles[result.battleId] = { hash: h };
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
