/** WP26/38 receive plans. No UI, no host state mutation, no protocol shape changes. */
import { clone } from "./value";
import { allMembers, boxedMembers, firstFreeBox, locateMember, memberAt, placeInBox } from "./storage";
import type { MemberCollection, MemberPosition } from "./storage";
import { able, ableCount, checkStore, referenced } from "./storage-operations";
import { own } from "./own";
import type { ItemDescriptor, MemberReference } from "./storage-operations";
import { healMember } from "./heal";
import { clonePersistentMember } from "./member-metadata";
import type { Content, Member } from "./types";
import type { Limits } from "./limits";

export interface ReceivingProfile { mode: 0 | 1 | 2; naming: number }
export interface ReceivingDecision {
  nickname?: { kind: "keep" } | { kind: "set"; value: string };
  placement?: { kind: "automatic" | "party" | "box" } | { kind: "replace"; target: MemberReference };
}
export interface ReceivingContext {
  limits: Limits;
  content: Content;
  profile: ReceivingProfile;
  partyOnly?: boolean;
  depositHeal?: boolean;
}
export interface ReceivedPlacement { id: string; to: "party" | "boxes"; position: MemberPosition; boxName?: string; replacedId?: string }
export class ReceivingRefused extends Error {
  readonly reason: string;
  readonly memberId: string | undefined;
  constructor(reason: string, message = reason, memberId?: string) { super(message); this.reason = reason; this.memberId = memberId; }
}

/** Full persistent identity must exist before crossing a public captured-result consumption boundary. */
export function requireTemplate(member: Member | undefined, id: string): asserts member is Member {
  if (!member || member.id !== id || !Number.isInteger(member.form) || member.form! < 0 || member.form! > 999 || !Number.isInteger(member.personalID) || member.personalID! < 0 || member.personalID! > 0xffffffff || !member.owner || !member.origin || member.abilityIndex === undefined || member.effectiveAbilityIndex === undefined
    || typeof member.ownerCompatibilityDefault !== "boolean" || typeof member.shiny !== "boolean" || typeof member.superShiny !== "boolean" || !Array.isArray(member.firstMoves) || !Array.isArray(member.markings) || !Array.isArray(member.ribbons)
    || typeof member.cannotStore !== "boolean" || typeof member.cannotRelease !== "boolean" || typeof member.cannotTrade !== "boolean" || typeof member.isEgg !== "boolean" || member.mail === undefined || typeof member.readyToEvolve !== "boolean"
    || !["known", "unknown"].includes(member.evolutionReadiness ?? "") || (!member.readyToEvolve && member.evolutionReadiness === "unknown")) {
    throw new ReceivingRefused("no-template", `captured member ${id} requires its complete original individual template`, id);
  }
}

/** Nonpersistent authority supplied by the caller; absence always closes the source. */
export interface HeldItemSource {
  allowed: boolean;
  /** The adapter must check its source permission BEFORE reading external item data. */
  describe: (id: string) => ItemDescriptor | null;
}

/** Both public and pure result consumers call this before content work or installing captured members. */
export function assertCapturedHeldSources(capturedMembers: readonly Member[], templates: Readonly<Record<string, Member>>, source?: HeldItemSource): void {
  for (const captured of capturedMembers) {
    const template = own(templates, captured.id);
    requireTemplate(template, captured.id);
    const items = [...new Set([captured.item, template.item].filter((item) => !!item))];
    if (!items.length && !captured.mail && !template.mail) continue;
    if (!source?.allowed) throw new ReceivingRefused("held-item-source-disabled");
    if (captured.mail || template.mail) throw new ReceivingRefused("mail-not-supported");
    for (const item of items) {
      const descriptor = source.describe(item);
      if (!descriptor?.holdable || descriptor.mail) throw new ReceivingRefused("invalid-held-item");
    }
  }
}

export function receiveMembers<T extends MemberCollection>(state: T, members: readonly Member[], decisions: Readonly<Record<string, ReceivingDecision>>, context: ReceivingContext): { state: T; placed: ReceivedPlacement[] } {
  const next = clone(state);
  const placed: ReceivedPlacement[] = [];
  const taken = new Set(allMembers(state).map((m) => m.id));
  for (const template of members) {
    requireTemplate(template, template.id);
    if (taken.has(template.id)) throw new ReceivingRefused("member-id-taken", `member ${template.id} already exists`, template.id);
    taken.add(template.id);
    const decision = Object.hasOwn(decisions, template.id) ? decisions[template.id] : undefined;
    if (context.profile.naming === 0 && !decision?.nickname) throw new ReceivingRefused("pending", "nickname decision required", template.id);
    const member = clonePersistentMember(template);
    if (decision?.nickname?.kind === "set") {
      if (typeof decision.nickname.value !== "string" || Array.from(decision.nickname.value).length > 10) throw new ReceivingRefused("invalid-name");
      member.nickname = decision.nickname.value || null;
    }
    member.firstMoves = member.moves.map((m) => m.id);
    if (next.party.length < context.limits.party) {
      next.party.push(member); placed.push({ id: member.id, to: "party", position: { kind: "party", index: next.party.length - 1 } }); continue;
    }
    if (context.partyOnly) throw new ReceivingRefused("party-full");
    const choice = decision?.placement;
    if (!choice || choice.kind === "automatic") {
      if (context.profile.mode !== 1) throw new ReceivingRefused("pending", "placement decision required", member.id);
    }
    if (choice?.kind === "party") throw new ReceivingRefused("pending", "a replacement target is required", member.id);
    if (choice?.kind === "replace") {
      if (choice.target.position.kind !== "party") throw new ReceivingRefused("invalid-replacement");
      const old = referenced(next, choice.target);
      if (able(old) && ableCount(next.party) <= 1 && !able(member)) throw new ReceivingRefused("last-able");
      checkStore(old);
      if (boxedMembers(next).length >= context.limits.boxes || !firstFreeBox(next.storage)) throw new ReceivingRefused("boxes-full");
      placeInBox(next.storage, context.depositHeal ? healMember(old, context.content, { preserveReadyToEvolve: true }) : old);
      // WP38 §6 / CX22: remove the outgoing identity, compact survivors, then append the newcomer.
      // Battle snapshots are keyed by member ID; neither a compacted survivor nor the newcomer inherits a slot's facts.
      next.party.splice(choice.target.position.index, 1);
      next.party.push(member);
      placed.push({ id: member.id, to: "party", position: { kind: "party", index: next.party.length - 1 }, replacedId: old.id }); continue;
    }
    if (context.profile.mode === 2) throw new ReceivingRefused("pending", "forced party reception requires a replacement", member.id);
    checkStore(member);
    if (boxedMembers(next).length >= context.limits.boxes) throw new ReceivingRefused("boxes-full");
    const position = placeInBox(next.storage, context.depositHeal ? healMember(member, context.content, { preserveReadyToEvolve: true }) : member);
    placed.push({ id: member.id, to: "boxes", position, boxName: next.storage.boxes[position.box]!.name });
  }
  // A later reception can compact the party again, or box an earlier newcomer.
  // Every returned location describes the same complete next, never an intermediate prefix.
  for (const placement of placed) {
    const location = locateMember(next, placement.id);
    if (!location) throw new Error("received-member-missing");
    placement.position = clone(location.position);
    placement.to = location.position.kind === "party" ? "party" : "boxes";
    if (location.position.kind === "box") placement.boxName = next.storage.boxes[location.position.box]!.name;
    else delete placement.boxName;
  }
  return { state: next, placed };
}

/** Only an explicit same-generation host scene-aborted/rebuild-failed signal may request this plan. */
export function fallbackDecisions(state: MemberCollection, members: readonly Member[], context: ReceivingContext, previous: Readonly<Record<string, ReceivingDecision>>): Record<string, ReceivingDecision> {
  const decisions: Record<string, ReceivingDecision> = {};
  let virtual = clone(state);
  for (const member of members) {
    const decision: ReceivingDecision = { nickname: previous[member.id]?.nickname ?? { kind: "keep" } };
    if (virtual.party.length >= context.limits.party) {
      if (context.profile.mode !== 2) decision.placement = { kind: "box" };
      else {
        const old = previous[member.id]?.placement;
        const candidates = old?.kind === "replace" ? [old.target, ...virtual.party.map((m, index) => ({ id: m.id, position: { kind: "party" as const, index } })).reverse()]
          : virtual.party.map((m, index) => ({ id: m.id, position: { kind: "party" as const, index } })).reverse();
        for (const target of candidates) {
          try { const chosen = { ...decision, placement: { kind: "replace" as const, target } }; receiveMembers(virtual, [member], { [member.id]: chosen }, context); decision.placement = chosen.placement; break; } catch { /* try another identity; never drop the new member */ }
        }
        if (!decision.placement) throw new ReceivingRefused("pending", "no legal forced-party recovery plan", member.id);
      }
    }
    decisions[member.id] = decision;
    virtual = receiveMembers(virtual, [member], decisions, context).state;
  }
  return decisions;
}

/** Preflight uses the same complete replacement/box/last-able guards as actual force-party recovery. */
export function hasForcedPartyPlan(state: MemberCollection, member: Member, context: ReceivingContext): boolean {
  try { fallbackDecisions(state, [member], { ...context, profile: { ...context.profile, mode: 2 } }, {}); return true; }
  catch { return false; }
}
