import { addItems, removeItems, itemQuantity, inventoryPolicy } from "./inventory.ts";
import type { Inventory } from "./inventory.ts";
import { catalogOf } from "./item-catalog.ts";
/** Pure WP25/66 operations. Callers install the returned next state once, after collecting UI decisions. */
import { own, setOwn } from "./own.ts";
import { healMember } from "./heal.ts";
import { clone } from "./value.ts";
import { allMembers, firstFreeBox, locateMember, memberAt, validPosition } from "./storage.ts";
import type { MemberCollection, MemberPosition } from "./storage.ts";
import type { Content, Member } from "./types.ts";
import type { Limits } from "./limits.ts";

export interface MemberReference { id: string; position: MemberPosition }
export interface MovementContext { limits: Limits; content: Content; depositHeal?: boolean }
export interface HeldIntent { source: MemberReference; steps: { target: MemberPosition; expectedId: string | null }[] }
export class ManagementRefused extends Error {
  readonly reason: string;
  constructor(reason: string, text = reason) { super(text); this.reason = reason; }
}
const refuse = (reason: string): never => { throw new ManagementRefused(reason); };
export const able = (member: Member): boolean => !member.isEgg && member.hp > 0;
export const ableCount = (members: readonly Member[]): number => members.filter(able).length;
export const samePosition = (a: MemberPosition, b: MemberPosition): boolean => JSON.stringify(a) === JSON.stringify(b);

export function referenced(state: MemberCollection, reference: MemberReference): Member {
  const member = memberAt(state, reference.position);
  if (!member || member.id !== reference.id) return refuse("stale-source");
  return member;
}
export function checkStore(member: Member): void {
  if (member.mail) refuse("mail");
  if (member.cannotStore) refuse("cannot-store");
}
export function checkRelease(member: Member): void {
  if (member.isEgg) refuse("egg");
  if (member.mail) refuse("mail");
  if (member.cannotRelease) refuse("cannot-release");
}

function remove(state: MemberCollection, position: MemberPosition): void {
  if (position.kind === "party") state.party.splice(position.index, 1);
  else state.storage.boxes[position.box]!.slots[position.slot] = null;
}
function write(state: MemberCollection, position: MemberPosition, member: Member, context: MovementContext, partyLimit = context.limits.party): void {
  if (!validPosition(position)) refuse("position-out-of-bounds");
  if (position.kind === "party") {
    if (position.index > state.party.length) refuse("party-hole");
    if (position.index === state.party.length && state.party.length >= partyLimit) refuse("party-full");
    state.party[position.index] = member;
  } else {
    checkStore(member);
    state.storage.boxes[position.box]!.slots[position.slot] = context.depositHeal ? healMember(member, context.content, { preserveReadyToEvolve: true }) : member;
  }
}

/** Direct two-way moves check the final party, so swapping its last able member with another able one is valid. */
export function moveMember<T extends MemberCollection>(state: T, from: MemberReference, to: MemberPosition, targetId: string | null, context: MovementContext): T {
  const source = referenced(state, from);
  const target = memberAt(state, to);
  if ((target?.id ?? null) !== targetId) refuse("stale-target");
  if (samePosition(from.position, to)) return state;
  const next = clone(state);
  const partyLimit = Math.max(context.limits.party, state.party.length); // legacy over-p parties may keep, not add, members
  if (target) {
    write(next, from.position, clone(target), context, partyLimit);
    write(next, to, clone(source), context, partyLimit);
  } else {
    // Party-to-party empty destination is a move to the end; account for removal's compaction.
    remove(next, from.position);
    const destination = to.kind === "party" && from.position.kind === "party" && to.index > from.position.index ? { ...to, index: to.index - 1 } : to;
    write(next, destination, clone(source), context, partyLimit);
  }
  if (ableCount(state.party) > 0 && ableCount(next.party) === 0) refuse("last-able");
  return next;
}

export function releaseMember<T extends MemberCollection>(state: T, from: MemberReference): T {
  const member = referenced(state, from); checkRelease(member);
  if (from.position.kind === "party" && able(member) && ableCount(state.party) <= 1) refuse("last-able");
  const next = clone(state); remove(next, from.position); return next;
}

export function pickUp(state: MemberCollection, source: MemberReference): HeldIntent {
  const member = referenced(state, source);
  if (source.position.kind === "party" && able(member) && ableCount(state.party) <= 1) refuse("last-able");
  return { source: clone(source), steps: [] };
}

/** Replays IDs/positions against LATEST records, never against a saved member or state snapshot. */
export function replayHeld<T extends MemberCollection>(state: T, intent: HeldIntent, context: MovementContext): { state: T; held: Member | null } {
  let held: Member | null = clone(referenced(state, intent.source));
  const next = clone(state); remove(next, intent.source.position);
  for (const step of intent.steps) {
    if (!held) throw new ManagementRefused("held-already-placed");
    const target = memberAt(next, step.target);
    if ((target?.id ?? null) !== step.expectedId) refuse("stale-target");
    if (step.target.kind === "party" && target && able(target) && ableCount(next.party) <= 1 && !able(held)) refuse("last-able");
    write(next, step.target, held, context, Math.max(context.limits.party, state.party.length));
    held = target;
  }
  return { state: next, held };
}

export function placeHeld<T extends MemberCollection>(state: T, intent: HeldIntent, target: MemberPosition, expectedId: string | null, context: MovementContext): { intent: HeldIntent; next: T | null; heldId: string | null } {
  const extended = { source: clone(intent.source), steps: [...intent.steps, { target: clone(target), expectedId }] };
  const replay = replayHeld(state, extended, context);
  if (replay.held) return { intent: extended, next: null, heldId: replay.held.id };
  if (ableCount(state.party) > 0 && ableCount(replay.state.party) === 0) refuse("last-able");
  if (allMembers(replay.state).length !== allMembers(state).length) refuse("member-count-changed");
  return { intent: extended, next: replay.state, heldId: null };
}

export function releaseHeld<T extends MemberCollection>(state: T, intent: HeldIntent, context: MovementContext): T {
  const replay = replayHeld(state, intent, context);
  if (!replay.held) return refuse("nothing-held");
  checkRelease(replay.held);
  return replay.state;
}

export function heldDestination(state: MemberCollection, intent: HeldIntent, destination: "party" | "box", context: MovementContext): MemberPosition {
  const replay = replayHeld(state, intent, context);
  if (!replay.held) return refuse("nothing-held");
  if (destination === "party") {
    if (replay.state.party.length >= Math.max(context.limits.party, state.party.length)) return refuse("party-full");
    return { kind: "party", index: replay.state.party.length };
  }
  return firstFreeBox(replay.state.storage) ?? refuse("boxes-full");
}

export interface ItemDescriptor { holdable: boolean; mail?: boolean }
export function giveItem<T extends MemberCollection & { inventory: Inventory }>(state: T, ref: MemberReference, item: string, context: { limits: Limits; sourceAllowed: boolean; content?: Content; describe: (id: string) => ItemDescriptor | null }): T {
  if (!context.sourceAllowed) return refuse("held-item-source-disabled");
  const member = referenced(state, ref);
  if (member.isEgg) return refuse("egg");
  const descriptor = context.describe(item);
  if (!item || !descriptor?.holdable || descriptor.mail) return refuse("invalid-held-item");
  if (member.mail) return refuse("mail");
  if (itemQuantity(state.inventory, item, catalogOf(context.content)) < 1) return refuse("no-item");
  const next = clone(state), target = locateMember(next, ref.id)!.member;
  next.inventory = removeItems(next.inventory, item, 1, catalogOf(context.content));
  if (target.item) next.inventory = addItems(next.inventory, target.item, 1, catalogOf(context.content), inventoryPolicy(context.content, context.limits));
  target.item = item; target.mail = null; return next;
}
export function takeItem<T extends MemberCollection & { inventory: Inventory }>(state: T, ref: MemberReference, limits: Limits, content?: Content): T {
  const member = referenced(state, ref);
  if (member.mail) return refuse("mail");
  if (!member.item) return state;
  const next = clone(state), target = locateMember(next, ref.id)!.member;
  next.inventory = addItems(next.inventory, target.item, 1, catalogOf(content), inventoryPolicy(content, limits));
  target.item = ""; target.mail = null; return next;
}
export function swapItems<T extends MemberCollection>(state: T, source: MemberReference, target: MemberReference, sourceAllowed: boolean): T {
  if (!sourceAllowed) return refuse("held-item-source-disabled");
  const a = referenced(state, source), b = referenced(state, target);
  if (a.isEgg || b.isEgg) return refuse("egg");
  if (a.mail || b.mail) return refuse("mail");
  if (source.id === target.id) return state;
  const next = clone(state), one = locateMember(next, source.id)!.member, two = locateMember(next, target.id)!.member;
  [one.item, two.item] = [two.item, one.item]; one.mail = null; two.mail = null; return next;
}
