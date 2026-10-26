/** Owned candy/item/event transactions. No battle evidence is manufactured and no workflow is saved. */
import { clone } from "../rules/value.ts";
import { semanticFingerprint } from "../rules/semantic.ts";
import { planItemUse } from "../rules/item-effects.ts";
import type { ItemIntent, ItemPending, ItemWorldContext, ItemResult } from "../rules/item-effects.ts";
import type { LearningAnswer } from "../rules/learning.ts";
import { scanEvolution } from "../rules/evolution.ts";
import type { EvolutionSelection, EvolutionFacts, EvolutionCheckResult } from "../rules/evolution.ts";
import { planEvolutionCommit } from "../rules/evolution-commit.ts";
import { catalogOf, itemOf, hasFlag, consumesItem } from "../rules/item-catalog.ts";
import { itemQuantity, positiveQuantity, removeItems } from "../rules/inventory.ts";
import { resolveConfig } from "../rules/config.ts";
import { validatedContentIdentity } from "../flow/content-runtime.ts";
import { validateGameContent } from "../rules/save-schema.ts";
import type { Content, Member } from "../rules/types.ts";
import type { GameState } from "../rules/state.ts";
import type { Limits } from "../rules/limits.ts";
import type { ContentPort, GameStatePort } from "./ports.ts";
import type { EvolutionDecision, EvolutionView } from "./evolution-operation.ts";
import { EvolutionOperation } from "./evolution-operation.ts";

export interface EvolutionItemIntent { itemId: string; memberId: string; quantity: number }
export interface EventEvolutionIntent { event?: number; memberId?: string }
export interface TriggeredMemberResult { memberId: string; matched: boolean; evolved: boolean; cancelled: boolean }
export interface TriggeredResult {
  matched: boolean; evolved: boolean; members: TriggeredMemberResult[]; diagnostics: string[]; item?: ItemResult;
}
export interface TriggeredEvolutionView {
  token: string; revision: number; kind: "item" | "event"; phase: "growth" | "evolution" | "failed";
  selection?: ItemPending; evolution?: EvolutionView; error?: string; reloadRequired?: boolean;
}
export type TriggeredEvolutionOutcome = { status: "pending"; view: TriggeredEvolutionView }
  | { status: "committed" | "unchanged" | "technically-terminated"; token: string; result: TriggeredResult }
  | { status: "refused"; reason: string };
export type TriggeredDecision = { kind: "growth"; answer: LearningAnswer }
  | { kind: "retry" | "technical-terminate" };
interface Operation {
  token: string; generation: number; revision: number; kind: "item" | "event"; parent?: string; requestId?: string; requestKey?: string;
  intent?: EvolutionItemIntent; event?: number; ids: string[]; cursor: number; identity?: string;
  before?: GameState; world?: ItemWorldContext; answers: LearningAnswer[]; selection?: ItemPending;
  pendingWrite?: { before: GameState; next: GameState; activate: boolean };
  selected?: { memberId: string; token: string; before: GameState };
  primaryCommitted: boolean; results: TriggeredMemberResult[]; diagnostics: string[]; itemResult?: ItemResult;
  retired?: string; error?: string; reloadRequired: boolean;
}
interface Options {
  state: GameStatePort; content: ContentPort; generation: () => number; limits: Limits; evolutions: EvolutionOperation;
  enter: (parent?: string, memberId?: string) => void; leave: (parent?: string) => void; ownsParent: (token: string) => boolean;
  world: () => ItemWorldContext; facts: (member: Readonly<Member>, content: Content) => EvolutionFacts;
}
const hash = (value: unknown): string => semanticFingerprint(value);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export class TriggeredEvolutionOperation {
  private readonly options: Options;
  private operation: Operation | null = null;
  private sequence = 0;
  private resolving = false;
  private receiptParent = "";
  private readonly receipts = new Map<string, { fingerprint: string; outcome: TriggeredEvolutionOutcome }>();
  constructor(options: Options) { this.options = options; }
  get active(): boolean { return this.operation !== null; }
  matches(token: string): boolean { return this.operation?.token === token; }
  matchesContinuation(token: string): boolean { return this.operation?.selected?.token === token; }
  get view(): TriggeredEvolutionView | null {
    const op = this.operation; if (!op) return null;
    const evolution = this.options.evolutions.view;
    return clone({ token: op.token, revision: op.revision, kind: op.kind, phase: op.error || evolution?.phase === "failed" ? "failed" : evolution ? "evolution" : "growth",
      ...(op.selection ? { selection: op.selection } : {}), ...(evolution ? { evolution } : {}),
      ...(op.error || evolution?.error ? { error: op.error ?? evolution?.error, reloadRequired: op.reloadRequired || evolution?.reloadRequired } : {}) });
  }
  invalidate(): void { const op = this.operation; this.operation = null; this.receipts.clear(); this.receiptParent = ""; if (op) this.options.leave(op.parent); }
  private current(op: Operation): void { if (this.operation !== op || op.generation !== this.options.generation()) throw Error("stale-triggered-evolution"); }
  private pending(op: Operation): TriggeredEvolutionOutcome { this.current(op); return { status: "pending", view: this.view! }; }
  private result(op: Operation): TriggeredResult { return clone({ matched: op.results.some(r => r.matched) || !!op.selected,
    evolved: op.results.some(r => r.evolved), members: op.results, diagnostics: op.diagnostics, ...(op.itemResult ? { item: op.itemResult } : {}) }); }
  private finish(op: Operation, technical = false): TriggeredEvolutionOutcome {
    this.current(op); const outcome: TriggeredEvolutionOutcome = { status: technical ? "technically-terminated" : op.primaryCommitted ? "committed" : "unchanged", token: op.token, result: this.result(op) };
    this.options.evolutions.cancelPrepared(op.selected?.token ?? op.token); this.operation = null; this.options.leave(op.parent);
    if (op.kind === "item" && op.requestId) this.receipts.set(op.requestId, { fingerprint: op.requestKey!, outcome: clone(outcome) });
    return outcome;
  }
  private start(kind: "item" | "event", input: EvolutionItemIntent | EventEvolutionIntent, parent?: string, requestId?: string): Operation {
    if (this.active || this.resolving) throw Error("triggered-evolution-active");
    const op: Operation = { kind, token: `triggered:${this.options.generation()}:${++this.sequence}`, generation: this.options.generation(), revision: 1,
      ...(parent ? { parent, requestId, requestKey: hash(input), intent: clone(input as EvolutionItemIntent) } : { event: (input as EventEvolutionIntent).event ?? 0 }),
      ids: [], cursor: 0, answers: [], primaryCommitted: false, results: [], diagnostics: [], reloadRequired: false };
    this.operation = op;
    let entered = false;
    try {
      this.options.enter(op.parent, op.intent?.memberId); entered = true; this.current(op);
      const state = clone(this.options.state.read()); this.current(op); const content = this.content(op, true);
      const problems = validateGameContent(state, content); if (problems.length) throw Error(`invalid-action-state:${problems[0]!.path}`);
      op.before = state; op.world = clone(this.options.world()); this.current(op);
      return op;
    } catch (error) { if (this.operation === op) { this.operation = null; if (entered) this.options.leave(op.parent); } throw error; }
  }
  private content(op: Operation, initial = false): Content {
    this.current(op); if (op.retired) throw Error(op.retired);
    const { content } = this.options.content(); this.current(op); const identity = validatedContentIdentity(content);
    if (!identity || !initial && identity !== op.identity) { op.retired = "triggered-content-changed-or-unavailable"; throw Error(op.retired); }
    if (initial) op.identity = identity; return content;
  }
  beginItem(parent: string, requestId: string, intent: EvolutionItemIntent): TriggeredEvolutionOutcome {
    if (this.active || this.resolving) return { status: "refused", reason: "triggered-evolution-active" };
    if (!this.options.ownsParent(parent)) return { status: "refused", reason: "stale-inventory-parent" };
    if (!requestId || requestId.length > 64) return { status: "refused", reason: "invalid-request-id" };
    if (this.receiptParent === parent) {
      const old = this.receipts.get(requestId); if (old) return old.fingerprint === hash(intent) ? clone(old.outcome) : { status: "refused", reason: "request-conflict" };
      if (this.receipts.size >= 256) return { status: "refused", reason: "session-request-limit" };
    }
    let op: Operation | undefined;
    try {
      op = this.start("item", intent, parent, requestId);
      if (this.receiptParent !== parent) { this.receiptParent = parent; this.receipts.clear(); }
      return this.planItem(op);
    } catch (error) { return this.failStart(op, error); }
  }
  beginEvent(input: EventEvolutionIntent = {}): TriggeredEvolutionOutcome {
    let op: Operation | undefined;
    try {
      const intent = clone(input); if (!Number.isSafeInteger(intent.event ?? 0) || (intent.event ?? 0) < 0) throw Error("invalid-event-number");
      op = this.start("event", intent);
      if (intent.memberId && !op.before!.party.some(member => member.id === intent.memberId)) throw Error("absent-party-target");
      op.ids = intent.memberId ? [intent.memberId] : op.before!.party.filter(member => !member.isEgg && member.hp > 0).map(member => member.id);
      return this.nextEvent(op);
    } catch (error) { return this.failStart(op, error); }
  }
  private failStart(op: Operation | undefined, error: unknown): TriggeredEvolutionOutcome {
    if (op && this.operation === op && op.pendingWrite) { op.error = message(error); return this.pending(op); }
    if (op && this.operation === op) { this.options.evolutions.cancelPrepared(op.selected?.token ?? op.token); this.operation = null; this.options.leave(op.parent); }
    return { status: "refused", reason: message(error) };
  }
  private fresh(op: Operation, expected = op.before): Content {
    if (op.parent && !this.options.ownsParent(op.parent)) { op.retired = "stale-inventory-parent"; throw Error(op.retired); }
    const content = this.content(op), state = clone(this.options.state.read()); this.current(op);
    if (hash(state) !== hash(expected)) { op.retired = "stale-triggered-target-or-resources"; throw Error(op.retired); }
    const world = this.options.world(); this.current(op);
    if (hash(world) !== hash(op.world)) { op.retired = "triggered-item-world-changed"; throw Error(op.retired); }
    return this.content(op);
  }
  private selected(op: Operation, state: GameState, selection: EvolutionSelection, content: Content, cost?: { itemId: string; quantity: number }): boolean {
    const input = clone(state); if (cost) input.inventory = removeItems(input.inventory, cost.itemId, cost.quantity, catalogOf(content));
    const preflight = planEvolutionCommit({ state: input, memberId: selection.memberId, selection, content, limits: this.options.limits });
    if (preflight.status !== "ready") { op.diagnostics.push(`evolution-preflight:${preflight.reason}`); return false; }
    const errors = validateGameContent(preflight.state, content); if (errors.length) { op.diagnostics.push(`evolution-preflight:${errors[0]!.path}`); return false; }
    this.current(op); this.content(op);
    const token = `${op.token}:target:${op.cursor}`;
    this.options.evolutions.prepareSelected({ token, generation: op.generation, selected: true, ...(cost ? { cost } : {}) }, selection, content);
    op.selected = { memberId: selection.memberId, token, before: clone(state) };
    return true;
  }
  private check(op: Operation, state: GameState, member: Member, trigger: Parameters<typeof scanEvolution>[0]["trigger"], content: Content): EvolutionCheckResult {
    const facts = this.options.facts(member, content); this.current(op); this.content(op);
    return scanEvolution({ member, party: state.party, content, trigger, facts,
      shadow: op.world?.shadowIds?.includes(member.id) ?? false, friendshipSoftCap: resolveConfig(content.settings).AFFECTION_EFFECTS });
  }
  private planItem(op: Operation): TriggeredEvolutionOutcome {
    const content = this.fresh(op), state = op.before!, intent = op.intent!, member = state.party.find(value => value.id === intent.memberId);
    if (!member) throw Error("absent-party-target"); positiveQuantity(intent.quantity);
    const catalog = catalogOf(content), item = itemOf(catalog, intent.itemId); if (!item || item.fieldUse !== "member") throw Error("not-a-member-evolution-item");
    if (itemQuantity(state.inventory, item.id, catalog) < intent.quantity) throw Error("not-enough-items");
    const family = item.effect?.family;
    const stone = family === "evolution" || !family && hasFlag(item, "EvolutionStone");
    if (stone && item.effect && Object.keys(item.effect.parameters).length) throw Error("invalid-evolution-item-parameters");
    if (!["rare-candy", "exp-candy"].includes(family ?? "") && !stone) throw Error("not-an-evolution-action-item");
    if (stone || family === "rare-candy" && member.level === 100) {
      if (intent.quantity !== 1) throw Error("invalid-quantity");
      if (op.world?.hyperIds?.includes(member.id)) throw Error("hyper-mode");
      if (!stone && !resolveConfig(content.settings).RARE_CANDY_USABLE_AT_MAX_LEVEL) throw Error("max-level-candy-disabled");
      const selected = this.check(op, state, member, stone ? { family: "item", item: item.id } : { family: "level" }, content);
      if (selected.kind !== "target") throw Error(`evolution-${selected.kind}:${"reason" in selected ? selected.reason ?? "" : ""}`);
      const next = clone(state); if (consumesItem(item)) next.inventory = removeItems(next.inventory, item.id, 1, catalog);
      if (!this.selected(op, stone ? state : next, selected, content, stone && consumesItem(item) ? { itemId: item.id, quantity: 1 } : undefined)) throw Error(op.diagnostics.at(-1)!);
      if (stone) return this.activate(op);
      return this.write(op, state, next, true);
    }
    const plan = planItemUse(state, content, intent, { learning: op.answers }, op.world);
    if (plan.status === "pending") { op.selection = clone(plan.selection); return this.pending(op); }
    if (plan.status !== "ready") throw Error("unexpected-candy-cancellation");
    op.itemResult = plan.result; delete op.selection;
    const grown = plan.state.party.find(value => value.id === intent.memberId)!;
    let activate = false;
    if ((plan.result.newLevel ?? member.level) > member.level) {
      const selected = this.check(op, plan.state, grown, { family: "level" }, content);
      if (selected.kind === "target") activate = this.selected(op, plan.state, selected, content);
      else if (selected.kind !== "no-target") op.diagnostics.push(`candy-evolution:${selected.kind}:${selected.fact}:${selected.reason}`);
    }
    return this.write(op, state, plan.state, activate);
  }
  private nextEvent(op: Operation): TriggeredEvolutionOutcome {
    while (op.cursor < op.ids.length) {
      const state = clone(this.options.state.read()); this.current(op); const content = this.content(op), member = state.party.find(value => value.id === op.ids[op.cursor]);
      if (!member) { op.cursor++; continue; }
      const result = this.check(op, state, member, { family: "event", event: op.event }, content);
      if (result.kind === "target" && this.selected(op, state, result, content)) return this.activate(op);
      if (result.kind === "context-unavailable" || result.kind === "invalid") op.diagnostics.push(`event-evolution:${member.id}:${result.kind}:${result.fact}:${result.reason}`);
      op.results.push({ memberId: member.id, matched: result.kind === "target", evolved: false, cancelled: false }); op.cursor++;
    }
    return this.finish(op);
  }
  private write(op: Operation, before: GameState, next: GameState, activate: boolean): TriggeredEvolutionOutcome {
    op.pendingWrite = { before: clone(before), next: clone(next), activate }; return this.install(op);
  }
  private install(op: Operation): TriggeredEvolutionOutcome {
    const pending = op.pendingWrite!; this.current(op); if (op.retired) throw Error(op.retired);
    const actual = clone(this.options.state.read()); this.current(op);
    if (hash(actual) === hash(pending.next)) return this.installed(op);
    if (hash(actual) !== hash(pending.before)) { op.retired = "triggered-install-indeterminate"; op.reloadRequired = true; throw Error(op.retired); }
    const content = this.fresh(op), errors = validateGameContent(pending.next, content); if (errors.length) throw Error(`invalid-triggered-next:${errors[0]!.path}`);
    let failure: unknown;
    try { this.options.state.replace(clone(pending.next)); } catch (error) { failure = error; }
    let after: GameState;
    try { after = clone(this.options.state.read()); this.current(op); } catch (error) { this.current(op); op.reloadRequired = true; throw error; }
    if (hash(after) === hash(pending.next)) { if (failure) op.diagnostics.push(`installed-with-host-error:${message(failure)}`); return this.installed(op); }
    op.reloadRequired = hash(after) !== hash(pending.before); if (op.reloadRequired) op.retired = "triggered-install-indeterminate";
    throw Error(op.retired ?? message(failure ?? "triggered-install-not-confirmed"));
  }
  private installed(op: Operation): TriggeredEvolutionOutcome {
    const activate = op.pendingWrite!.activate; delete op.pendingWrite; op.primaryCommitted = true; op.error = undefined; op.reloadRequired = false;
    return activate ? this.activate(op) : this.finish(op);
  }
  private activate(op: Operation): TriggeredEvolutionOutcome {
    const result = this.options.evolutions.activate(op.selected!.token); this.current(op); op.revision++;
    if (result.status === "pending") return this.pending(op);
    throw Error("selected-evolution-not-activated");
  }
  resolve(token: string, revision: number, decision: TriggeredDecision): TriggeredEvolutionOutcome {
    const op = this.operation;
    if (!op || op.token !== token || op.revision !== revision || this.resolving) return { status: "refused", reason: "stale-triggered-decision" };
    this.resolving = true;
    try {
      this.current(op);
      if (decision.kind === "technical-terminate") {
        if (this.options.evolutions.view) return this.resolveContinuationInner(op, this.options.evolutions.view.revision, { kind: "technical-terminate" });
        if (op.pendingWrite) {
          const state = this.options.state.read(); this.current(op);
          if (![hash(op.pendingWrite.before), hash(op.pendingWrite.next)].includes(hash(state))) return { status: "refused", reason: "triggered-install-indeterminate:reload-required" };
          if (hash(state) === hash(op.pendingWrite.next)) op.primaryCommitted = true;
        }
        return this.finish(op, true);
      }
      if (op.pendingWrite) { if (decision.kind !== "retry") throw Error("retry-or-terminate-required"); return this.install(op); }
      if (decision.kind !== "growth" || !op.selection || op.kind !== "item") throw Error("growth-answer-required");
      const old = op.answers; op.answers = [...old.slice(0, op.selection.answerIndex ?? old.length), clone(decision.answer)];
      try { const result = this.planItem(op); op.revision++; return result.status === "pending" ? this.pending(op) : result; }
      catch (error) { if (this.operation === op && !op.pendingWrite) op.answers = old; throw error; }
    } catch (error) { return this.failure(op, error); } finally { this.resolving = false; }
  }
  resolveContinuation(token: string, revision: number, decision: EvolutionDecision): TriggeredEvolutionOutcome {
    const op = this.operation;
    if (!op || op.selected?.token !== token || this.resolving) return { status: "refused", reason: "stale-triggered-evolution" };
    this.resolving = true;
    try { return this.resolveContinuationInner(op, revision, decision); }
    catch (error) { return this.failure(op, error); } finally { this.resolving = false; }
  }
  private resolveContinuationInner(op: Operation, revision: number, decision: EvolutionDecision): TriggeredEvolutionOutcome {
    if (decision.kind !== "technical-terminate") this.content(op);
    const result = this.options.evolutions.resolve(op.selected!.token, revision, decision, () => {
      // The child first proves before/next. Never mistake an installed body with lost readback for stale authority.
      if (!this.options.evolutions.selectedBodyCommitted) this.fresh(op, op.selected!.before);
    }); this.current(op);
    if (result.status === "refused") return result;
    op.revision++; if (result.status === "pending") { op.error = undefined; return this.pending(op); }
    const selected = op.selected!;
    const record = { memberId: selected.memberId, matched: true, evolved: result.progress?.evolved ?? false,
      cancelled: result.progress?.cancelled ?? false };
    op.results.push(record); op.primaryCommitted ||= record.evolved || record.cancelled; delete op.selected;
    if (result.status === "technically-terminated") return this.finish(op, true);
    return op.kind === "event" ? (op.cursor++, this.nextEvent(op)) : this.finish(op);
  }
  private failure(op: Operation, error: unknown): TriggeredEvolutionOutcome {
    if (this.operation !== op || op.generation !== this.options.generation()) return { status: "refused", reason: "stale-triggered-evolution" };
    op.error = message(error); op.revision++; return this.pending(op);
  }
}
