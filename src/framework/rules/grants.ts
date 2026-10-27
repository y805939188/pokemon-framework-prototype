/**
 * One-time grants (step 4): a content reward package (members, items, money) given at most once per save timeline,
 * recorded in `claims`. Pure. All or nothing: any refusal leaves the state exactly as it was and writes no claim.
 *   members  created by member-factory, named G-<grant id>-<n>; party first, then the boxes (WP38 §6 normal storage);
 *            stored with their persistent key (content id + form, decision D5-3); each received species is registered
 *            as seen and owned in the dex (WP26 §3.2 gifts), once
 *   items    ordered slot allocation, with atomic finite-capacity refusal
 *   money    every explicit write clamps to the configured cap (WP24)
 */
import { assertInventoryMapped, addItems, inventoryPolicy } from "./inventory";
import { moneyCap, changeMoney } from "./economy";
import { catalogOf } from "./item-catalog";
import { allMembers, boxedMembers, placeInBox } from "./storage";
import { DEFAULT_LIMITS } from "./limits";
import type { Limits } from "./limits";
import { createMember } from "./member-factory";
import type { Random } from "./member-factory";
import { own, setOwn } from "./own";
import { toPersistentMember } from "./species-key";
import { GAME_SCHEMA, clone } from "./state";
import type { GameState } from "./state";
import { planAcquisitionDex } from "./acquisition-dex";
import { allocateMemberId } from "./member-identity";
import type { Content } from "./types";

export type GrantRefusal = "unknown-grant" | "no-room" | "bag-full" | "member-id-taken" | "creation-failed" | "held-item-source-disabled" | "invalid-held-item";

export class GrantRefusedError extends Error {
  readonly reason: GrantRefusal;
  constructor(reason: GrantRefusal, message: string) { super(message); this.name = "GrantRefusedError"; this.reason = reason; }
}

/** A received member: `species` + `form` are its persistent key (content id + form). */
export interface PlacedMember { id: string; species: string; form: number; level: number; to: "party" | "boxes" }

export type GrantResult =
  | { status: "applied"; state: GameState; placed: PlacedMember[]; items: Record<string, number>; money: number }
  | { status: "already-claimed"; state: GameState };

export const grantMemberId = (grantId: string, n: number): string => `G-${grantId}-${n}`;

export function applyGrant(state: GameState, grantId: string, content: Content, random: Random, limits: Limits = DEFAULT_LIMITS, context: { receivedAt?: number; map?: number; environment?: string | null; timeOfDay?: "day" | "dusk" | "night"; allowHeldItemSources?: boolean } = {}): GrantResult {
  if (state.schema !== GAME_SCHEMA) throw new Error(`game state has schema ${state.schema}, this build writes schema ${GAME_SCHEMA}: migrate it first (rules/save-schema.ts)`);
  if (own(state.claims, grantId)) return { status: "already-claimed", state };
  const grant = own(content.grants, grantId);
  if (!grant) throw new GrantRefusedError("unknown-grant", `grant "${grantId}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  if (grant.members.some((m) => m.item) && !context.allowHeldItemSources) throw new GrantRefusedError("held-item-source-disabled", "held-item-source-disabled");
  assertInventoryMapped(state.inventory,catalogOf(content));
  const next = clone(state);
  const placed: PlacedMember[] = [];
  const taken = new Set(allMembers(state).map((m) => m.id));
  for (const [i, spec] of grant.members.entries()) {
    const allocated = allocateMemberId(next.nextMemberOrdinal, taken);
    const id = allocated.id;
    if (taken.has(id)) throw new GrantRefusedError("member-id-taken", `grant "${grantId}": member id ${id} already exists in this save`);
    const to = next.party.length < limits.party ? "party" : boxedMembers(next).length < limits.boxes ? "boxes" : null;
    if (!to) throw new GrantRefusedError("no-room", `grant "${grantId}": the party and the boxes are full (${grant.members.length} member(s) to receive)`);
    let m;
    try { m = toPersistentMember(createMember({ id, species: spec.species, level: spec.level, ...(spec.form !== undefined ? { form: spec.form } : {}), owner: state.player, context: { ...context, playerId: state.player.id } }, content, random), content); }
    catch (e) { throw new GrantRefusedError("creation-failed", `grant "${grantId}": ${e instanceof Error ? e.message : String(e)}`); }
    m.item = spec.item ?? "";
    m.firstMoves = m.moves.map((move) => move.id);
    next.nextMemberOrdinal = allocated.nextMemberOrdinal; taken.add(id);
    if (to === "party") next.party.push(m); else placeInBox(next.storage, m);
    placed.push({ id, species: m.species, form: m.form ?? 0, level: spec.level, to });
    const registration = planAcquisitionDex(next.dex, [m], content, { source: "grant", seeForm: true, showMessages: false });
    if (registration.status !== "ready") throw new GrantRefusedError("creation-failed", registration.reason);
    next.dex = registration.dex;
  }
  for (const [item, count] of Object.entries(grant.items)) {
    try { next.inventory = addItems(next.inventory, item, count, catalogOf(content), inventoryPolicy(content, limits)); }
    catch (error) { throw new GrantRefusedError("bag-full", String(error)); }
  }
  const before = next.money;
  if (!Number.isSafeInteger(before + grant.money)) throw new GrantRefusedError("creation-failed", "money overflow");
  next.money = changeMoney(before, grant.money, moneyCap(content,limits.money));
  setOwn(next.claims, grantId, { kind: "grant" });
  return { status: "applied", state: next, placed, items: { ...grant.items }, money: next.money - before };
}
