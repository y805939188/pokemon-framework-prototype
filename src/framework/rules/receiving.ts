/** WP26/38 receive plans. No UI, no host state mutation, no protocol shape changes. */
import { clone } from "./value.ts";
import { allMembers, boxedMembers, firstFreeBox, memberAt, placeInBox } from "./storage.ts";
import type { MemberCollection, MemberPosition } from "./storage.ts";
import { able, ableCount, checkStore, referenced } from "./storage-operations.ts";
import type { MemberReference } from "./storage-operations.ts";
import { healMember } from "./heal.ts";
import type { Content, Member } from "./types.ts";
import type { Limits } from "./limits.ts";

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
    || typeof member.cannotStore !== "boolean" || typeof member.cannotRelease !== "boolean" || typeof member.isEgg !== "boolean" || member.mail === undefined || typeof member.readyToEvolve !== "boolean") {
    throw new ReceivingRefused("no-template", `captured member ${id} requires its complete original individual template`, id);
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
    const member = clone(template);
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
      next.party[choice.target.position.index] = member;
      placed.push({ id: member.id, to: "party", position: clone(choice.target.position), replacedId: old.id }); continue;
    }
    if (context.profile.mode === 2) throw new ReceivingRefused("pending", "forced party reception requires a replacement", member.id);
    checkStore(member);
    if (boxedMembers(next).length >= context.limits.boxes) throw new ReceivingRefused("boxes-full");
    const position = placeInBox(next.storage, context.depositHeal ? healMember(member, context.content, { preserveReadyToEvolve: true }) : member);
    placed.push({ id: member.id, to: "boxes", position, boxName: next.storage.boxes[position.box]!.name });
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
