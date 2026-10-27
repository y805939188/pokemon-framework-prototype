/** Local script trade: an owned draft, never a third persistent member collection. */
import { clone } from "../rules/value";
import { semanticFingerprint } from "../rules/semantic";
import { resolveSpecies, validatedContentIdentity } from "../flow/content-runtime";
import { validateGameContent } from "../rules/save-schema";
import { createMember, personalId } from "../rules/member-factory";
import type { CreateMemberInput, Random } from "../rules/member-factory";
import { toPersistentMember } from "../rules/species-key";
import { allocateMemberId } from "../rules/member-identity";
import { requireTemplate } from "../rules/receiving";
import { allMembers } from "../rules/storage";
import { scanEvolution } from "../rules/evolution";
import type { EvolutionFacts } from "../rules/evolution";
import { normalizeDexAppearance, planDexRecord, planDexLastSeen, applyDexPatch, dexShouldOfferEntry } from "../rules/pokedex";
import type { DexAppearance } from "../rules/pokedex";
import { dexInUnlockedRegion } from "../rules/pokedex-query";
import { resolveConfig } from "../rules/config";
import { bumpStat } from "../rules/stats";
import { catalogOf, itemOf } from "../rules/item-catalog";
import { EvolutionOperation } from "./evolution-operation";
import type { EvolutionDecision, EvolutionResolution } from "./evolution-operation";
import type { ContentPort, GameStatePort } from "./ports";
import type { GameState } from "../rules/state";
import type { Content, Member, Owner } from "../rules/types";
import type { Limits } from "../rules/limits";
import type { ItemWorldContext } from "../rules/item-effects";

export interface TradeIntent {
  outgoingId: string;
  incoming: { species: string; form?: number; item?: string } | { existing: Member };
  nickname?: string | null;
  foreignOwner?: { name: string; gender?: 0 | 1 | 2; language?: number };
  requiredSpecies?: string;
}
export type TradeDecision = { kind: "confirm"; accept: boolean }
  | { kind: "presented" | "open-entry" | "close-entry" | "commit" | "retry" | "cancel" | "technical-terminate" };
interface Entry { stage: "received" | "evolved"; species: string; appearance: DexAppearance; previouslyOwned: boolean; opened: boolean }
interface Operation {
  token: string; generation: number; revision: number; requestId: string; requestKey: string; intent: TradeIntent;
  phase: "offer" | "presenting" | "entry" | "evolution" | "ready";
  before?: GameState; world?: ItemWorldContext; identity?: string; index?: number;
  draft?: GameState; incomingId?: string; evolution?: EvolutionOperation; entry?: Entry;
  beforeEvolutionOwned?: boolean; diagnostics: string[]; error?: string; retired?: string; reloadRequired: boolean;
  pendingWrite?: { before: GameState; next: GameState; attempted: boolean; incomingId: string };
}
export interface TradeDraftView {
  token: string; revision: number; draftKey: string; source: "trade-draft";
  intent: TradeIntent;
  contentIdentity?: string;
  phase: Operation["phase"] | "failed"; outgoing: Member;
  incoming?: { source: "trade-draft"; draftKey: string; member: Member };
  dex?: GameState["dex"]; entry?: Entry; evolution?: NonNullable<EvolutionOperation["view"]>;
  error?: string; reloadRequired?: boolean;
}
export type TradeOutcome = { status: "pending"; view: TradeDraftView }
  | { status: "committed"; token: string; incomingId: string; diagnostics: string[] }
  | { status: "cancelled" | "technically-terminated"; token: string; diagnostics: string[] }
  | { status: "refused"; reason: string };
interface Options {
  state: GameStatePort; content: ContentPort; generation: () => number; limits: Limits;
  enter: () => void; random?: Random; now: () => number; creationContext?: () => CreateMemberInput["context"];
  world: () => ItemWorldContext; facts: (member: Readonly<Member>, content: Content) => EvolutionFacts;
  allowHeldSources: boolean; holdable: (id: string) => boolean;
}
const hash = (value: unknown): string => semanticFingerprint(value);
const message = (value: unknown): string => value instanceof Error ? value.message : String(value);

/** The same predicate is used by the selector and final installation. cannotRelease is deliberately independent. */
export function tradeEligibility(member: Readonly<Member>, world: ItemWorldContext, requiredSpecies?: string): string | null {
  return member.isEgg ? "egg-not-tradable" : world.shadowIds?.includes(member.id) ? "shadow-not-tradable"
    : member.cannotTrade ? "cannot-trade" : requiredSpecies && member.species !== requiredSpecies ? "wrong-trade-species" : null;
}
export class TradeOperation {
  private operation: Operation | null = null;
  private resolving = false;
  private sequence = 0;
  private readonly receipts = new Map<string, { fingerprint: string; outcome: TradeOutcome }>();
  private readonly options: Options;
  constructor(options: Options) { this.options = options; }
  get active(): boolean { return !!this.operation; }
  get continuation(): EvolutionOperation["view"] { const op = this.operation; return op?.phase === "evolution" ? op.evolution?.view ?? null : null; }
  matchesContinuation(token: string): boolean { return !!this.operation?.evolution?.matches(token); }
  get view(): TradeDraftView | null {
    const op = this.operation; if (!op?.before || op.index === undefined) return null;
    const member = op.draft?.party.find(value => value.id === op.incomingId), evolution = this.continuation;
    return clone({ token: op.token, revision: op.revision, draftKey: op.token, source: "trade-draft", intent: op.intent, contentIdentity: op.identity, phase: op.error || evolution?.phase === "failed" ? "failed" : op.phase,
      outgoing: op.before.party[op.index]!, ...(member ? { incoming: { source: "trade-draft", draftKey: op.token, member }, dex: op.draft!.dex } : {}),
      ...(op.entry ? { entry: op.entry } : {}), ...(evolution ? { evolution } : {}),
      ...(op.error || evolution?.error ? { error: op.error ?? evolution?.error, reloadRequired: op.reloadRequired || evolution?.reloadRequired } : {}) });
  }
  invalidate(): void { this.operation?.evolution?.invalidate(); this.operation = null; this.receipts.clear(); }
  private current(op: Operation): void { if (this.operation !== op || op.generation !== this.options.generation()) throw Error("stale-trade"); }
  private pending(op: Operation): TradeOutcome { this.current(op); return { status: "pending", view: this.view! }; }
  private content(op: Operation, initial = false): Content {
    this.current(op); if (op.retired) throw Error(op.retired);
    const { content } = this.options.content(); this.current(op); const identity = validatedContentIdentity(content);
    if (!identity || !initial && identity !== op.identity) { op.retired = "trade-content-changed-or-unavailable"; throw Error(op.retired); }
    if (initial) op.identity = identity; return content;
  }
  private fresh(op: Operation): Content {
    const content = this.content(op), state = clone(this.options.state.read()); this.current(op);
    if (hash(state) !== hash(op.before)) { op.retired = "trade-state-changed"; throw Error(op.retired); }
    const world = clone(this.options.world()); this.current(op);
    if (hash(world) !== hash(op.world)) { op.retired = "trade-world-changed"; throw Error(op.retired); }
    const member = state.party[op.index!];
    if (member?.id !== op.intent.outgoingId) { op.retired = "trade-outgoing-moved"; throw Error(op.retired); }
    const reason = tradeEligibility(member, world, op.intent.requiredSpecies); if (reason) { op.retired = reason; throw Error(reason); }
    return this.content(op);
  }
  begin(requestId: string, intent: TradeIntent): TradeOutcome {
    if (this.active || this.resolving) return { status: "refused", reason: "trade-active" };
    if (!requestId || requestId.length > 64) return { status: "refused", reason: "invalid-request-id" };
    const key = hash(intent), old = this.receipts.get(requestId);
    if (old) return old.fingerprint === key ? clone(old.outcome) : { status: "refused", reason: "request-conflict" };
    if (this.receipts.size >= 256) return { status: "refused", reason: "trade-request-limit" };
    const op: Operation = { token: `trade:${this.options.generation()}:${++this.sequence}`, generation: this.options.generation(), revision: 1,
      requestId, requestKey: key, intent: clone(intent), phase: "offer", diagnostics: [], reloadRequired: false };
    this.operation = op;
    try {
      this.options.enter(); this.current(op);
      op.before = clone(this.options.state.read()); this.current(op); const content = this.content(op, true);
      const problems = validateGameContent(op.before, content); if (problems.length) throw Error(`invalid-trade-state:${problems[0]!.path}`);
      op.world = clone(this.options.world()); this.current(op); op.index = op.before.party.findIndex(member => member.id === op.intent.outgoingId);
      if (op.index < 0) throw Error("outgoing-not-in-party"); this.fresh(op);
      const incoming = op.intent.incoming;
      if (!incoming || typeof incoming !== "object") throw Error("invalid-trade-incoming");
      if ("existing" in incoming) requireTemplate(incoming.existing, incoming.existing?.id);
      else if (!resolveSpecies(content, incoming.species)) throw Error("unknown-trade-species");
      const held = "existing" in incoming ? incoming.existing.item : incoming.item;
      if (held && (!this.options.allowHeldSources || !this.options.holdable(held))) throw Error("held-item-source-disabled-or-invalid");
      if (op.intent.nickname !== undefined && op.intent.nickname !== null && typeof op.intent.nickname !== "string") throw Error("invalid-trade-nickname");
      return this.pending(op);
    } catch (error) { if (this.operation === op) this.operation = null; return { status: "refused", reason: message(error) }; }
  }
  private finish(op: Operation, status: "committed" | "cancelled" | "technically-terminated", incomingId?: string): TradeOutcome {
    this.current(op); const outcome: TradeOutcome = status === "committed" ? { status, token: op.token, incomingId: incomingId!, diagnostics: [...op.diagnostics] }
      : { status, token: op.token, diagnostics: [...op.diagnostics] };
    op.evolution?.invalidate(); this.operation = null; this.receipts.set(op.requestId, { fingerprint: op.requestKey, outcome: clone(outcome) }); return outcome;
  }
  private member(op: Operation): Member { const member = op.draft?.party.find(value => value.id === op.incomingId); if (!member) throw Error("trade-draft-missing"); return member; }
  private appearance(member: Member, content: Content): DexAppearance {
    const result = normalizeDexAppearance(content, { species: member.species, form: member.form!, gender: member.gender === "M" ? 0 : member.gender === "F" ? 1 : 2, shiny: member.shiny! });
    if (!result) throw Error("invalid-trade-appearance"); return result;
  }
  private offerEntry(op: Operation, stage: Entry["stage"], previouslyOwned: boolean, content: Content): boolean {
    const member = this.member(op), dex = op.draft!.dex;
    if (!content.regionalDex) throw Error("trade-dex-layout-missing");
    if (!dexShouldOfferEntry({ source: stage === "received" ? "trade" : "evolution", previouslyOwned, hasDex: dex.hasDex,
      inUnlockedDex: dexInUnlockedRegion(dex, content.regionalDex, member.species), moreOften: resolveConfig(content.settings).SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN })) return false;
    const appearance = normalizeDexAppearance(content, { species: member.species, form: member.form!, gender: member.gender === "M" ? 0 : member.gender === "F" ? 1 : 2, shiny: member.shiny! }, "recent");
    if (!appearance) throw Error("invalid-trade-recent-appearance");
    op.entry = { stage, species: member.species, appearance, previouslyOwned, opened: false }; op.phase = "entry"; return true;
  }
  private createDraft(op: Operation): TradeOutcome {
    const content = this.fresh(op), before = op.before!, input = op.intent.incoming;
    const random = this.options.random; if (!random) throw Error("no-random");
    let foreignId = personalId(random); if (foreignId === before.player.id) foreignId = (foreignId + 1) >>> 0;
    const owner: Owner = { id: foreignId, name: op.intent.foreignOwner?.name ?? "", gender: op.intent.foreignOwner?.gender ?? 0, language: op.intent.foreignOwner?.language ?? 2 };
    const taken = new Set(allMembers(before).map(member => member.id)); let draftId = `DRAFT${this.sequence.toString(36)}`; while (taken.has(draftId)) draftId = `DRAFT${(++this.sequence).toString(36)}`;
    let member: Member;
    if ("existing" in input) member = { ...clone(input.existing), id: draftId, owner, ownerCompatibilityDefault: false };
    else {
      const species = resolveSpecies(content, input.species); if (!species) throw Error("unknown-trade-species");
      member = toPersistentMember(createMember({ id: draftId, species, level: before.party[op.index!]!.level, ...(input.form !== undefined ? { form: input.form } : {}), owner,
        context: { ...this.options.creationContext?.(), playerId: before.player.id, receivedAt: Math.floor(this.options.now() / 1000) } }, content, random), content);
      member.item = input.item ?? "";
    }
    member.nickname = op.intent.nickname ?? null; member.origin = { ...member.origin!, method: 2 }; member.firstMoves = member.moves.map(move => move.id);
    const draft = clone(before); draft.party[op.index!] = member;
    const record = planDexRecord(draft.dex, { source: "trade", appearance: this.appearance(member, content) }); if (record.status !== "ok") throw Error(record.reason);
    draft.dex = applyDexPatch(draft.dex, record.patch); draft.stats = bumpStat(draft.stats, "trade_count", 1);
    const problems = validateGameContent(draft, content); if (problems.length) throw Error(`invalid-trade-draft:${problems[0]!.path}`);
    this.fresh(op); op.draft = draft; op.incomingId = draftId; op.phase = "presenting";
    op.evolution = new EvolutionOperation({ state: { read: () => { this.current(op); return op.draft!; }, replace: next => { this.current(op); op.draft = clone(next); } },
      content: () => ({ content: this.content(op) }), generation: this.options.generation, limits: this.options.limits, facts: this.options.facts });
    return this.pending(op);
  }
  private evolve(op: Operation): TradeOutcome {
    const content = this.fresh(op), member = this.member(op), facts = this.options.facts(member, content); this.current(op); this.fresh(op);
    const partner = clone(op.before!.party[op.index!]!); partner.item = itemOf(catalogOf(content), partner.item)?.battleId ?? partner.item;
    const result = scanEvolution({ member, party: op.before!.party, content, trigger: { family: "trade", partner }, facts,
      shadow: false, friendshipSoftCap: resolveConfig(content.settings).AFFECTION_EFFECTS });
    if (result.kind === "target") {
      op.beforeEvolutionOwned = op.draft!.dex.owned.includes(result.target.species);
      op.evolution!.prepareSelected({ token: `${op.token}:evolution`, generation: op.generation, selected: true, deferLearning: true }, result, content);
      op.evolution!.activate(`${op.token}:evolution`); op.phase = "evolution";
    } else { if (result.kind !== "no-target") op.diagnostics.push(`trade-evolution:${result.kind}:${result.fact}:${result.reason}`); op.phase = "ready"; }
    return this.pending(op);
  }
  resolve(token: string, revision: number, decision: TradeDecision): TradeOutcome {
    const op = this.operation; if (!op || op.token !== token || op.revision !== revision || this.resolving) return { status: "refused", reason: "stale-trade-decision" };
    this.resolving = true;
    try {
      this.current(op);
      if (decision.kind === "technical-terminate") return this.terminate(op);
      if (op.pendingWrite) { if (decision.kind !== "retry") return { status: "refused", reason: "trade-retry-or-terminate-required" }; return this.install(op); }
      this.fresh(op); op.error = undefined;
      let result: TradeOutcome;
      if (decision.kind === "cancel" || decision.kind === "confirm" && !decision.accept) {
        if (op.phase !== "offer") return { status: "refused", reason: "trade-cannot-cancel" }; return this.finish(op, "cancelled");
      }
      if (decision.kind === "confirm" && op.phase === "offer") result = this.createDraft(op);
      else if (decision.kind === "presented" && op.phase === "presenting") {
        if (this.offerEntry(op, "received", op.before!.dex.owned.includes(this.member(op).species), this.content(op))) result = this.pending(op); else result = this.evolve(op);
      } else if (decision.kind === "open-entry" && op.phase === "entry" && !op.entry!.opened) {
        const plan = planDexLastSeen(op.draft!.dex, op.entry!.species, op.entry!.appearance); if (plan.status !== "ok") throw Error(plan.reason);
        op.draft!.dex = applyDexPatch(op.draft!.dex, plan.patch); op.entry!.opened = true; result = this.pending(op);
      } else if (decision.kind === "close-entry" && op.phase === "entry" && op.entry!.opened) {
        const stage = op.entry!.stage; delete op.entry;
        if (stage === "received") result = this.evolve(op);
        else { const p = op.evolution!.view!; result = this.afterEvolution(op, op.evolution!.resolve(p.token, p.revision, { kind: "continue-learning" })); }
      } else if (decision.kind === "commit" && op.phase === "ready") return this.commit(op);
      else if (decision.kind === "retry" && op.phase === "evolution") {
        const p = op.evolution!.view!;
        result = this.afterEvolution(op, op.evolution!.resolve(p.token, p.revision, { kind: "retry" }, () => { this.fresh(op); }));
      } else if (decision.kind === "retry") result = this.pending(op);
      else return { status: "refused", reason: "trade-stage-decision-mismatch" };
      op.revision++; return result.status === "pending" ? this.pending(op) : result;
    } catch (error) { return this.failure(op, error); } finally { this.resolving = false; }
  }
  resolveEvolution(token: string, revision: number, decision: EvolutionDecision): TradeOutcome {
    const op = this.operation; if (!op || !op.evolution?.matches(token) || this.resolving || op.phase !== "evolution") return { status: "refused", reason: "stale-trade-evolution" };
    this.resolving = true;
    try {
      this.current(op); if (decision.kind === "technical-terminate") return this.terminate(op);
      this.fresh(op); op.error = undefined;
      const result = this.afterEvolution(op, op.evolution.resolve(token, revision, decision, () => { this.fresh(op); }));
      op.revision++; return result.status === "pending" ? this.pending(op) : result;
    } catch (error) { return this.failure(op, error); } finally { this.resolving = false; }
  }
  private afterEvolution(op: Operation, result: EvolutionResolution): TradeOutcome {
    this.current(op); if (result.status === "refused") return result;
    op.diagnostics.push(...("diagnostics" in result ? result.diagnostics : []));
    if (result.status === "pending") {
      if (result.view.phase === "after-evolution") {
        if (!this.offerEntry(op, "evolved", op.beforeEvolutionOwned!, this.content(op))) {
          const p = op.evolution!.view!; return this.afterEvolution(op, op.evolution!.resolve(p.token, p.revision, { kind: "continue-learning" }));
        }
      } else op.phase = "evolution";
    } else op.phase = "ready";
    return this.pending(op);
  }
  private commit(op: Operation): TradeOutcome {
    const content = this.fresh(op), next = clone(op.draft!);
    const oldIds = new Set(allMembers(op.before!).map(member => member.id));
    // Only the replaced slot and private appended extras belong to this draft. A provisional extra ID may equal
    // the removed outgoing ID when an old ordinal lags; final identity mapping must still include that extra.
    const newDraftMembers = next.party.filter((_member, index) => index === op.index || index >= op.before!.party.length);
    let ordinal = op.before!.nextMemberOrdinal, incomingId = "";
    for (const member of newDraftMembers) { const allocated = allocateMemberId(ordinal, oldIds); oldIds.add(allocated.id); ordinal = allocated.nextMemberOrdinal;
      if (member.id === op.incomingId) incomingId = allocated.id; member.id = allocated.id; }
    if (!incomingId) throw Error("trade-incoming-map-missing"); next.nextMemberOrdinal = ordinal;
    const problems = validateGameContent(next, content); if (problems.length) throw Error(`invalid-trade-final:${problems[0]!.path}`);
    op.pendingWrite = { before: clone(op.before!), next, attempted: false, incomingId }; return this.install(op);
  }
  private install(op: Operation): TradeOutcome {
    this.current(op); const pending = op.pendingWrite!, actual = clone(this.options.state.read()); this.current(op);
    if (hash(actual) === hash(pending.next)) return this.finish(op, "committed", pending.incomingId);
    if (hash(actual) !== hash(pending.before)) { op.reloadRequired = true; op.retired = "trade-install-indeterminate"; throw Error(op.retired); }
    if (op.retired) throw Error(op.retired); const content = this.fresh(op);
    const problems = validateGameContent(pending.next, content); if (problems.length) throw Error(`invalid-trade-final:${problems[0]!.path}`);
    pending.attempted = false; this.fresh(op); pending.attempted = true; let failure: unknown;
    try { this.options.state.replace(clone(pending.next)); } catch (error) { failure = error; }
    let after: GameState; try { after = clone(this.options.state.read()); this.current(op); } catch (error) { this.current(op); op.reloadRequired = true; throw error; }
    if (hash(after) === hash(pending.next)) { if (failure) op.diagnostics.push(`trade-installed-with-host-error:${message(failure)}`); return this.finish(op, "committed", pending.incomingId); }
    op.reloadRequired = hash(after) !== hash(pending.before); if (op.reloadRequired) op.retired = "trade-install-indeterminate";
    throw Error(op.retired ?? message(failure ?? "trade-install-not-confirmed"));
  }
  private terminate(op: Operation): TradeOutcome {
    if (op.pendingWrite?.attempted) {
      const actual = clone(this.options.state.read()); this.current(op);
      if (hash(actual) === hash(op.pendingWrite.next)) return this.finish(op, "committed", op.pendingWrite.incomingId);
      if (hash(actual) !== hash(op.pendingWrite.before)) return { status: "refused", reason: "trade-install-indeterminate:reload-required" };
    }
    return this.finish(op, "technically-terminated");
  }
  private failure(op: Operation, error: unknown): TradeOutcome {
    if (this.operation !== op || op.generation !== this.options.generation()) return { status: "refused", reason: "stale-trade" };
    op.error = message(error); op.revision++; return this.pending(op);
  }
}
