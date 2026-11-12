/**
 * Detached required-settlement data and its finite write set. This validator grants NO source authority: the
 * application must first authenticate the producer, operation and generation. It is separate from auxiliary V2.
 */
import { semanticFingerprint } from "./semantic";
import { clone } from "./value";
import { captureHeldClaims } from "./held-provenance";
import { allMembers, locateMember } from "./storage";
import type { MemberCollection } from "./storage";

export interface HeldBinding { battleId: string; generation: number; rawHash: string; contentIdentity: string }
export interface HeldRosterMember { id: string; side: "p1" | "p2"; initial: string }
export interface HeldValues { current: string; recovery: string; recycle: string }
export interface HeldMemberFact extends HeldRosterMember, HeldValues {}
export type HeldReason = "consume" | "consume-no-recycle" | "temporary-remove" | "temporary-receive"
  | "permanent-gain" | "permanent-loss" | "transfer-release" | "recycle" | "harvest" | "clear-recycle";
export interface HeldEvent { ordinal: number; id: string; side: "p1" | "p2"; sourceId: string | null; reason: HeldReason; before: HeldValues; after: HeldValues }
export interface RequiredFacts {
  version: 1; binding: HeldBinding; coverage: "complete";
  members: HeldMemberFact[]; events: HeldEvent[];
  money: { amuletCoin: boolean; happyHour: boolean; payDay: number };
}
export interface RequiredFactsExpectation { binding: HeldBinding; roster: readonly HeldRosterMember[]; wild?: boolean }
/** Actual engine objects stay within the battle layer; this hook table is never serialized or exposed as authority. */
export interface HeldRuntimeObserver { entered(pokemon: object): void; moneyMove(pokemon: object, kind: "payday" | "happyhour"): void }
export type RequiredFactsResolution = { ok: true; facts: RequiredFacts; pairHash: string } | { ok: false; reason: string };

const item = (v: unknown): v is string => typeof v === "string" && /^(?:[a-z0-9-]{1,64})?$/.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9#._:-]{1,18}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function fields(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  return object(v) && Reflect.ownKeys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
}
function dense(v: unknown, max: number): v is unknown[] {
  return Array.isArray(v) && v.length <= max && Reflect.ownKeys(v).length === v.length + 1
    && Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, String(i))).every(Boolean);
}
/** Bound traversal before canonicalization. Do not invoke getters, inherited toJSON, coercion or caller callbacks. */
function plainData(value: unknown): boolean {
  const pending = [value], visited = new Set<object>(); let count = 0;
  while (pending.length) {
    if (++count > 1000000) return false;
    const v = pending.pop();
    if (!v || typeof v !== "object") continue;
    if (visited.has(v)) continue;
    visited.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Array.isArray(v) && (!Number.isSafeInteger(descriptors.length?.value) || descriptors.length!.value > 100000)) return false;
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor)) return false;
      pending.push(descriptor.value);
    }
  }
  try { semanticFingerprint(value); return true; } catch { return false; }
}
function values(v: unknown): v is HeldValues {
  return fields(v, ["current", "recovery", "recycle"]) && item(v.current) && item(v.recovery) && item(v.recycle);
}
const same = (a: HeldValues, b: HeldValues): boolean => a.current === b.current && a.recovery === b.recovery && a.recycle === b.recycle;

function legalTransition(event: HeldEvent, wild: boolean): boolean {
  const a = event.before, b = event.after;
  switch (event.reason) {
    case "consume":
    case "consume-no-recycle":
      return !!a.current && b.current === "" && b.recovery === (a.current === a.recovery ? "" : a.recovery)
        && b.recycle === (event.reason === "consume" ? a.current : a.recycle);
    case "temporary-remove": return !!a.current && b.current === "" && b.recovery === a.recovery && b.recycle === a.recycle;
    case "temporary-receive": return !!b.current && b.recovery === a.recovery && b.recycle === a.recycle;
    case "permanent-gain": return !a.recovery && !!b.current && b.recovery === b.current && b.recycle === a.recycle;
    case "permanent-loss": return !!a.current && b.current === "" && b.recovery === (a.current === a.recovery ? "" : a.recovery) && b.recycle === a.recycle;
    // A successful receiving assignment can happen after TakeItem temporarily cleared the donor C.
    // Only that authenticated transfer may retire its I; the plain value still supplies no source authority.
    case "transfer-release": return wild && !a.current && !!a.recovery && !b.current && !b.recovery && b.recycle === a.recycle;
    case "recycle": return !a.current && !!a.recycle && b.current === a.recycle && b.recycle === ""
      && b.recovery === (wild && !a.recovery ? a.recycle : a.recovery);
    case "harvest": return !a.current && !!a.recycle && b.current === a.recycle && b.recycle === ""
      && b.recovery === (!a.recovery ? a.recycle : a.recovery);
    case "clear-recycle": return b.current === a.current && b.recovery === a.recovery && b.recycle === "";
    default: return false;
  }
}

/** All failures are whole-required-channel failures; an unavailable cell is never an empty successful result. */
export function resolveRequiredFacts(value: unknown, expected: RequiredFactsExpectation): RequiredFactsResolution {
  const fail = (reason: string): RequiredFactsResolution => ({ ok: false, reason });
  if (!plainData(value)) return fail("required-facts-not-plain-data");
  if (!fields(value, ["version", "binding", "coverage", "members", "events", "money"]) || value.version !== 1 || value.coverage !== "complete") return fail("required-facts-incomplete");
  const binding = value.binding;
  if (!fields(binding, ["battleId", "generation", "rawHash", "contentIdentity"]) || typeof binding.battleId !== "string"
    || !Number.isSafeInteger(binding.generation) || (binding.generation as number) < 0 || !hash(binding.rawHash) || !hash(binding.contentIdentity)
    || semanticFingerprint(binding) !== semanticFingerprint(expected.binding)) return fail("required-facts-binding-mismatch");
  if (!dense(value.members, 48) || !dense(value.events, 100000) || value.members.length !== expected.roster.length) return fail("required-facts-roster-incomplete");
  const roster = new Map(expected.roster.map(m => [m.id, m])), current = new Map<string, HeldValues>(), members: HeldMemberFact[] = [];
  if (roster.size !== expected.roster.length) return fail("required-facts-expected-roster-invalid");
  for (const member of value.members) {
    if (!fields(member, ["id", "side", "initial", "current", "recovery", "recycle"]) || !id(member.id)
      || !["p1", "p2"].includes(member.side as string) || !item(member.initial) || !item(member.current) || !item(member.recovery) || !item(member.recycle)) return fail("required-facts-member-invalid");
    const initial = roster.get(member.id);
    if (!initial || current.has(member.id) || initial.side !== member.side || initial.initial !== member.initial) return fail("required-facts-initial-roster-mismatch");
    current.set(member.id, { current: member.initial, recovery: member.initial, recycle: "" });
    members.push({ id: member.id, side: member.side as "p1" | "p2", initial: member.initial, current: member.current, recovery: member.recovery, recycle: member.recycle });
  }
  const events: HeldEvent[] = []; let ordinal = 0;
  for (const input of value.events) {
    if (!fields(input, ["ordinal", "id", "side", "sourceId", "reason", "before", "after"]) || !Number.isSafeInteger(input.ordinal)
      || (input.ordinal as number) <= ordinal || !id(input.id) || input.sourceId !== null && (!id(input.sourceId) || !roster.has(input.sourceId))
      || typeof input.reason !== "string" || !values(input.before) || !values(input.after)) return fail("required-facts-event-invalid");
    const prior = current.get(input.id), member = roster.get(input.id);
    if (!prior || !member || member.side !== input.side || !same(prior, input.before)) return fail("required-facts-event-chain-mismatch");
    const event = input as unknown as HeldEvent;
    if (event.reason === "permanent-gain" && (!expected.wild || event.side !== "p1" || !event.sourceId || roster.get(event.sourceId)?.side !== "p2")) return fail("required-facts-permanent-transfer-owner");
    if (event.reason === "transfer-release" && (!expected.wild || event.side !== "p2" || !event.sourceId || roster.get(event.sourceId)?.side !== "p1")) return fail("required-facts-permanent-transfer-owner");
    if (!legalTransition(event, !!expected.wild)) return fail("required-facts-unknown-transition");
    current.set(input.id, { ...event.after }); ordinal = event.ordinal;
    events.push({ ...event, before: { ...event.before }, after: { ...event.after } });
  }
  for (const member of members) if (!same(current.get(member.id)!, member)) return fail("required-facts-terminal-chain-mismatch");
  const money = value.money;
  if (!fields(money, ["amuletCoin", "happyHour", "payDay"]) || typeof money.amuletCoin !== "boolean" || typeof money.happyHour !== "boolean"
    || !Number.isSafeInteger(money.payDay) || (money.payDay as number) < 0) return fail("required-money-facts-incomplete");
  const facts: RequiredFacts = { version: 1, binding: { ...expected.binding }, coverage: "complete", members, events,
    money: { amuletCoin: money.amuletCoin, happyHour: money.happyHour, payDay: money.payDay as number } };
  return { ok: true, facts, pairHash: semanticFingerprint({ domain: "required-battle-settlement-v1", facts }) };
}

export interface HeldWritebackInput<T extends MemberCollection> {
  before: T; primary: T; facts: RequiredFacts;
  /** New persistent capture ID -> original foe stable ID; supplied by the authenticated session/receiving plan. */
  capturedOrigins: Readonly<Record<string, string>>;
}
/** Finite detached plan only. The application composes this with all other changes before its single replacement. */
export function planHeldWriteback<T extends MemberCollection>(input: HeldWritebackInput<T>): { state: T; changes: { id: string; item: string; destination: "party" | "box" }[] } {
  const { before, primary, facts, capturedOrigins } = input;
  const beforeMembers = allMembers(before), nextMembers = allMembers(primary);
  if (new Set(beforeMembers.map(m => m.id)).size !== beforeMembers.length || new Set(nextMembers.map(m => m.id)).size !== nextMembers.length) throw new Error("held-writeback-duplicate-member");
  const originalIds = new Set(beforeMembers.map(m => m.id));
  const incoming = nextMembers.filter(m => !originalIds.has(m.id)).map(m => m.id);
  if (incoming.length !== Object.keys(capturedOrigins).length || incoming.some(id => !Object.hasOwn(capturedOrigins, id))) throw new Error("held-writeback-capture-origin-incomplete");
  const byId = new Map(facts.members.map(m => [m.id, m]));
  if (byId.size !== facts.members.length) throw new Error("held-writeback-duplicate-fact");
  const claims = Object.keys(capturedOrigins).length ? captureHeldClaims(facts) : null;
  const state = clone(primary), changes: { id: string; item: string; destination: "party" | "box" }[] = [];
  const players = facts.members.filter(m => m.side === "p1").map(fact => {
    const old = before.party.find(m => m.id === fact.id), located = locateMember(state, fact.id);
    if (!old || old.item !== fact.initial || !located) throw new Error("held-writeback-player-identity-mismatch");
    return { fact, located };
  });
  // A boxed temporary holder and a remaining party owner can prefer the same token.
  // Restore party recovery first; boxed current remains preferred over all fallbacks.
  // Keep the returned change order and the no-capture path unchanged.
  const preferred = claims ? [...players].sort((a, b) => {
    const rank = Number(a.located.position.kind !== "party") - Number(b.located.position.kind !== "party");
    return rank || (a.fact.id < b.fact.id ? -1 : a.fact.id > b.fact.id ? 1 : 0);
  }) : players;
  for (const { fact, located } of preferred) {
    const field = located.position.kind === "party" ? "recovery" : "current";
    located.member.item = claims ? claims.claim(fact.id, field) || "" : fact[field];
  }
  for (const { fact, located } of players) {
    changes.push({ id: fact.id, item: located.member.item, destination: located.position.kind === "party" ? "party" : "box" });
  }
  if (claims) {
    // All player preferred claims must precede any current fallback. Otherwise an
    // earlier empty recovery can take the live source a later player must recover.
    for (const change of changes) if (!change.item) {
      change.item = claims.claim(change.id, "current") || "";
      locateMember(state, change.id)!.member.item = change.item;
    }
  }
  const used = new Set<string>();
  for (const [capturedId, sourceId] of Object.entries(capturedOrigins)) {
    const source = byId.get(sourceId), located = locateMember(state, capturedId);
    if (!source || source.side !== "p2" || used.has(sourceId) || !located || beforeMembers.some(m => m.id === capturedId)) throw new Error("held-writeback-capture-identity-mismatch");
    // Existing player's recovery claim wins over copying its temporary gift into the capture.
    // In a two-item swap, keep the wild original recovery instead, if it is still alive/unclaimed.
    // Empty C only reclaims its recovery if that token is actually still held elsewhere;
    // this returns a displaced swap partner without reviving an unrelated knocked-off wild item.
    const current = claims!.claim(sourceId, "current");
    const item = current === null ? claims!.claim(sourceId, "recovery") ?? ""
      : current || claims!.claim(sourceId, "recovery", true) || "";
    used.add(sourceId); located.member.item = item;
    changes.push({ id: capturedId, item, destination: located.position.kind === "party" ? "party" : "box" });
  }
  if (claims) {
    // More than two members can form a transfer cycle. Restoring one original can displace
    // another member's C even when capture C/I are already claimed. Close that entire cycle:
    // every still-held source token in the admitted roster must occupy exactly one final slot.
    const sources = [...facts.members.filter(m => m.side === "p1").map(m => m.id), ...used];
    const remaining = claims.claimRemainingCurrent(sources);
    const empty = changes.filter(change => !change.item).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (remaining.length > empty.length) throw new Error("held-capture-conservation-capacity");
    remaining.forEach((item, index) => {
      const change = empty[index]!;
      locateMember(state, change.id)!.member.item = item;
      change.item = item;
    });
  }
  return { state, changes };
}
