/**
 * One-time grants (step 4): a content reward package (members, items, money) given at most once per save timeline,
 * recorded in `claims`. Pure. All or nothing: any refusal leaves the state exactly as it was and writes no claim.
 *   members  created by member-factory, named G-<grant id>-<n>; party first, then the boxes (WP38 §6 normal storage);
 *            each received species is registered as seen and owned in the dex (WP26 §3.2 gifts), once
 *   items    refused as a whole when one would pass the per-item stage cap (an amount already above it, from an
 *            older save, is kept but cannot grow)
 *   money    clamped to the money cap (WP24); a balance already above it is kept, never reduced
 */
import { DEFAULT_LIMITS } from "./limits.ts";
import type { Limits } from "./limits.ts";
import { createMember } from "./member-factory.ts";
import type { Random } from "./member-factory.ts";
import { own } from "./own.ts";
import { GAME_SCHEMA, clone } from "./state.ts";
import type { GameState } from "./state.ts";
import type { Content } from "./types.ts";

export type GrantRefusal = "unknown-grant" | "no-room" | "bag-full" | "member-id-taken" | "creation-failed";

export class GrantRefusedError extends Error {
  readonly reason: GrantRefusal;
  constructor(reason: GrantRefusal, message: string) { super(message); this.name = "GrantRefusedError"; this.reason = reason; }
}

export interface PlacedMember { id: string; species: string; level: number; to: "party" | "boxes" }

export type GrantResult =
  | { status: "applied"; state: GameState; placed: PlacedMember[]; items: Record<string, number>; money: number }
  | { status: "already-claimed"; state: GameState };

export const grantMemberId = (grantId: string, n: number): string => `G-${grantId}-${n}`;

export function applyGrant(state: GameState, grantId: string, content: Content, random: Random, limits: Limits = DEFAULT_LIMITS): GrantResult {
  if (state.schema !== GAME_SCHEMA) throw new Error(`game state has schema ${state.schema}, this build writes schema ${GAME_SCHEMA}: migrate it first (rules/save-schema.ts)`);
  if (own(state.claims, grantId)) return { status: "already-claimed", state };
  const grant = own(content.grants, grantId);
  if (!grant) throw new GrantRefusedError("unknown-grant", `grant "${grantId}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  const next = clone(state);
  const placed: PlacedMember[] = [];
  const taken = new Set([...state.party, ...state.boxes].map((m) => m.id));
  for (const [i, spec] of grant.members.entries()) {
    const id = grantMemberId(grantId, i + 1);
    if (taken.has(id)) throw new GrantRefusedError("member-id-taken", `grant "${grantId}": member id ${id} already exists in this save`);
    const to = next.party.length < limits.party ? "party" : next.boxes.length < limits.boxes ? "boxes" : null;
    if (!to) throw new GrantRefusedError("no-room", `grant "${grantId}": the party and the boxes are full (${grant.members.length} member(s) to receive)`);
    let m;
    try { m = createMember({ id, species: spec.species, level: spec.level }, content, random); }
    catch (e) { throw new GrantRefusedError("creation-failed", `grant "${grantId}": ${e instanceof Error ? e.message : String(e)}`); }
    next[to].push(m);
    placed.push({ id, species: spec.species, level: spec.level, to });
    for (const k of ["seen", "owned"] as const) if (!next.dex[k].includes(spec.species)) next.dex[k].push(spec.species);
  }
  for (const [item, count] of Object.entries(grant.items)) {
    const have = next.bag[item] ?? 0;
    if (have + count > limits.bagPerItem) throw new GrantRefusedError("bag-full", `grant "${grantId}": ${item} would be ${have + count}, above the stage cap of ${limits.bagPerItem} per item`);
    next.bag[item] = have + count;
  }
  const before = next.money;
  next.money = before > limits.money ? before : Math.min(before + grant.money, limits.money);
  next.claims[grantId] = { kind: "grant" };
  return { status: "applied", state: next, placed, items: { ...grant.items }, money: next.money - before };
}
