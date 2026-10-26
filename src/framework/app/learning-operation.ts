/** Finite teaching/reminder/forgetting transaction. Answers carry no resource or compatibility authority. */
import { planTeachingAction, planRelearningAction, planForgettingAction } from "../rules/learning-actions.ts";
import type { TeachingActionContext } from "../rules/learning-actions.ts";
import type { LearningAnswer, LearningPending, RelearningAnswer, RelearningPending } from "../rules/learning.ts";
import type { Content, Member, MoveSlot } from "../rules/types.ts";
import type { GameState } from "../rules/state.ts";
import type { ContentPort, GameStatePort } from "./ports.ts";
import type { ItemWorldContext } from "../rules/item-effects.ts";
import { catalogOf, itemOf } from "../rules/item-catalog.ts";
import { clone } from "../rules/value.ts";
import { semanticFingerprint } from "../rules/semantic.ts";
import { resolveConfig } from "../rules/config.ts";
import { bumpStat } from "../rules/stats.ts";
import { validateGameContent } from "../rules/save-schema.ts";
import { validatedContentIdentity } from "../flow/content-runtime.ts";

export type LearningParent = { kind: "inventory" | "management"; token: string };
export type LearningIntent = { memberId: string } & (
  | { kind: "teach"; source: { kind: "generic" | "tutor"; moveId: string } | { kind: "machine"; itemId: string; entry: "bag" | "party" } }
  | { kind: "relearn" | "forget" });
export type LearningDecision = { kind: "learn"; answer: LearningAnswer }
  | { kind: "relearn"; answer: RelearningAnswer } | { kind: "forget"; slot: number | null }
  | { kind: "retry" | "technical-terminate" };
export interface LearningView {
  token: string; revision: number; memberId: string; kind: LearningIntent["kind"];
  selection?: LearningPending | RelearningPending | { kind: "forget"; moves: MoveSlot[] };
  error?: string; reloadRequired?: boolean;
}
export type LearningOutcome = { status: "pending"; view: LearningView }
  | { status: "committed" | "unchanged" | "cancelled" | "empty" | "technically-terminated"; token: string; revision: number }
  | { status: "refused"; reason: string };
interface Operation {
  token: string; generation: number; revision: number; intent: LearningIntent; parent?: LearningParent;
  before?: GameState; contentIdentity?: string; worldIdentity?: string; context?: TeachingActionContext;
  answers: LearningAnswer[]; reminder: RelearningAnswer[]; slot?: number | null;
  selection?: LearningView["selection"]; next?: GameState; error?: string; reloadRequired: boolean;
  retired?: string;
}
type Options = { generation: () => number; enter: (parent: LearningParent | undefined, intent: LearningIntent) => void;
  leave: (parent?: LearningParent) => void; world: () => ItemWorldContext };
const fingerprint = (value: unknown): string => semanticFingerprint(value);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export class LearningOperation {
  private operation: Operation | null = null;
  private sequence = 0;
  private resolving = false;
  private receipts = new Map<string, { revision: number; decision: string; outcome: LearningOutcome }>();
  constructor(privateState: GameStatePort, privateContent: ContentPort, privateOptions: Options) {
    this.state = privateState; this.content = privateContent; this.options = privateOptions;
  }
  private readonly state: GameStatePort;
  private readonly content: ContentPort;
  private readonly options: Options;
  get active(): boolean { return this.operation !== null; }
  get view(): LearningView | null {
    const op = this.operation;
    return op ? clone({ token: op.token, revision: op.revision, memberId: op.intent.memberId, kind: op.intent.kind,
      ...(op.selection ? { selection: op.selection } : {}), ...(op.error ? { error: op.error, reloadRequired: op.reloadRequired } : {}) }) : null;
  }
  invalidate(): void { const op = this.operation; this.operation = null; this.receipts.clear(); if (op) this.options.leave(op.parent); }
  private current(op: Operation): void {
    if (this.operation !== op || this.options.generation() !== op.generation) throw Error("stale-learning-operation");
  }
  private pending(op: Operation): LearningOutcome { this.current(op); return { status: "pending", view: this.view! }; }
  private finish(op: Operation, status: "committed" | "unchanged" | "cancelled" | "empty" | "technically-terminated"): LearningOutcome {
    this.current(op); this.operation = null; this.options.leave(op.parent); return { status, token: op.token, revision: op.revision };
  }
  begin(intent: LearningIntent, parent?: LearningParent): LearningOutcome {
    if (this.active || this.resolving) return { status: "refused", reason: "learning-operation-active" };
    if (!intent || typeof intent.memberId !== "string" || !["teach", "relearn", "forget"].includes(intent.kind)
      || parent && !["inventory", "management"].includes(parent.kind)) return { status: "refused", reason: "invalid-learning-intent" };
    // Reserve before the first callback. The application excludes only this reservation from its enter check.
    const op: Operation = { token: `learning:${this.options.generation()}:${++this.sequence}`, generation: this.options.generation(),
      revision: 1, intent: clone(intent), ...(parent ? { parent: clone(parent) } : {}), answers: [], reminder: [], reloadRequired: false };
    this.operation = op;
    let entered = false;
    try {
      this.options.enter(parent, intent); entered = true; this.current(op);
      const before = clone(this.state.read()); this.current(op);
      const { content } = this.content(); this.current(op);
      const key = validatedContentIdentity(content); if (!key) throw Error("learning-content-identity-unavailable");
      const problems = validateGameContent(before, content); if (problems.length) throw Error("invalid-learning-state");
      const member = before.party.find(member => member.id === intent.memberId); if (!member) throw Error("absent-party-target");
      const world = clone(this.options.world()); this.current(op);
      op.before = before; op.contentIdentity = key; op.worldIdentity = fingerprint(world);
      const catalog = catalogOf(content);
      op.context = { shadow: world.shadowIds?.includes(member.id) ?? false,
        friendship: { mapId: world.mapId, AFFECTION_EFFECTS: resolveConfig(content.settings).AFFECTION_EFFECTS },
        friendshipSource: { item: itemOf(catalog, member.item)?.battleId ?? member.item,
          ball: member.ball ? itemOf(catalog, member.ball)?.battleId ?? member.ball : undefined, origin: member.origin } };
      const result = this.plan(op, content, member);
      if (result.status === "refused") this.finish(op, "technically-terminated");
      return result;
    } catch (error) {
      if (this.operation === op && op.next) { op.error = message(error); return this.pending(op); }
      if (this.operation === op) { this.operation = null; if (entered) this.options.leave(op.parent); }
      return { status: "refused", reason: message(error) };
    }
  }
  private fresh(op: Operation): { content: Content; state: GameState } {
    this.current(op); if (op.retired) throw Error(op.retired);
    const retire = (reason: string): never => { op.retired = reason; throw Error(reason); };
    const { content } = this.content(); this.current(op);
    if (validatedContentIdentity(content) !== op.contentIdentity) retire("learning-content-changed");
    const world = this.options.world(); this.current(op);
    if (fingerprint(world) !== op.worldIdentity) retire("learning-world-changed");
    const state = clone(this.state.read()); this.current(op);
    if (fingerprint(state) !== fingerprint(op.before)) retire("stale-learning-target-or-resources");
    // Neither port read may hide a content change that happened in another callback.
    if (validatedContentIdentity(this.content().content) !== op.contentIdentity) retire("learning-content-changed"); this.current(op);
    const finalWorld = this.options.world(); this.current(op);
    if (fingerprint(finalWorld) !== op.worldIdentity) retire("learning-world-changed");
    return { content, state };
  }
  private plan(op: Operation, content: Content, member: Member): LearningOutcome {
    const plan = op.intent.kind === "teach" ? planTeachingAction(member, content,
      op.intent.source.kind === "machine" ? { ...op.intent.source, inventory: op.before!.inventory } : op.intent.source, op.context!, op.answers)
      : op.intent.kind === "relearn" ? planRelearningAction(member, content, { shadow: op.context!.shadow }, op.reminder)
      : planForgettingAction(member, op.slot);
    this.current(op);
    if (plan.status === "refused") return { status: "refused", reason: plan.reason };
    if (plan.status === "pending") {
      op.selection = "selection" in plan ? clone(plan.selection) : { kind: "forget", moves: clone(plan.moves) };
      return this.pending(op);
    }
    if (plan.status === "empty") return this.finish(op, "empty");
    if (plan.status === "cancelled" || plan.status === "exited") return this.finish(op, "cancelled");
    const next = clone(op.before!), index = next.party.findIndex(value => value.id === member.id);
    next.party[index] = clone(plan.member);
    if ("inventory" in plan && plan.inventory) next.inventory = clone(plan.inventory);
    if ("effects" in plan) for (const [counter, value] of Object.entries(plan.effects.statistics)) if (value) {
      next.stats = bumpStat(next.stats, counter as keyof typeof plan.effects.statistics, value);
    }
    if (fingerprint(next) === fingerprint(op.before)) return this.finish(op, "unchanged");
    // Only statistics remain deltas; member friendship and machine resources are already in the pure plan.
    op.next = next; return this.install(op);
  }
  private install(op: Operation): LearningOutcome {
    this.current(op);
    if (!op.next || !op.before) throw Error("learning-plan-not-ready");
    if (op.retired) { op.error = op.retired; return this.pending(op); }
    let actual: GameState;
    try { actual = clone(this.state.read()); this.current(op); }
    catch (error) { this.current(op); op.error = message(error); return this.pending(op); }
    if (fingerprint(actual) === fingerprint(op.next)) return this.finish(op, "committed");
    if (fingerprint(actual) !== fingerprint(op.before)) {
      op.error = op.retired = "learning-state-indeterminate: reload the last complete save"; op.reloadRequired = true; return this.pending(op);
    }
    try {
      const { content } = this.fresh(op);
      const problems = validateGameContent(op.next, content); if (problems.length) throw Error(`invalid-learning-next: ${problems[0]!.path}`);
      this.current(op); this.state.replace(clone(op.next)); this.current(op);
    } catch (error) { this.current(op); op.error = message(error); }
    try { actual = clone(this.state.read()); this.current(op); }
    catch (error) { this.current(op); op.error = message(error); return this.pending(op); }
    if (op.retired) return this.pending(op);
    if (fingerprint(actual) === fingerprint(op.next)) return this.finish(op, "committed");
    op.reloadRequired = fingerprint(actual) !== fingerprint(op.before);
    if (op.reloadRequired) op.retired = "learning-state-indeterminate: reload the last complete save";
    op.error ??= op.reloadRequired ? "learning-state-indeterminate: reload the last complete save" : "learning-install-not-confirmed";
    return this.pending(op);
  }
  resolve(token: string, revision: number, decision: LearningDecision): LearningOutcome {
    if (this.resolving) return { status: "refused", reason: "learning-resolution-active" };
    const old = this.receipts.get(token);
    if (old) return old.revision === revision && old.decision === fingerprint(decision) ? clone(old.outcome) : { status: "refused", reason: "stale-learning-answer" };
    const op = this.operation;
    if (!op || op.token !== token || op.revision !== revision) return { status: "refused", reason: "stale-learning-answer" };
    this.resolving = true;
    try {
      this.current(op);
      let result: LearningOutcome;
      if (decision.kind === "technical-terminate") {
        // No content/world dependency can prevent exit before writing. After a write was attempted, prove the outcome.
        if (op.next) {
          const actual = clone(this.state.read()); this.current(op);
          if (![fingerprint(op.before), fingerprint(op.next)].includes(fingerprint(actual))) return { status: "refused", reason: "learning-state-indeterminate: reload required" };
        }
        result = this.finish(op, "technically-terminated");
      } else if (op.next) {
        if (decision.kind !== "retry") return { status: "refused", reason: "learning-retry-or-terminate-required" };
        result = this.install(op);
      } else {
        const { content } = this.fresh(op), member = op.before!.party.find(value => value.id === op.intent.memberId)!;
        const previous = { answers: clone(op.answers), reminder: clone(op.reminder), slot: op.slot };
        if (decision.kind === "learn" && op.intent.kind === "teach" && op.selection && "answerIndex" in op.selection) op.answers[op.selection.answerIndex] = clone(decision.answer);
        else if (decision.kind === "relearn" && op.intent.kind === "relearn" && op.selection && "answerIndex" in op.selection) op.reminder[op.selection.answerIndex] = clone(decision.answer);
        else if (decision.kind === "forget" && op.intent.kind === "forget") op.slot = decision.slot;
        else return { status: "refused", reason: "wrong-learning-decision" };
        result = this.plan(op, content, member);
        if (result.status === "refused") { op.answers = previous.answers; op.reminder = previous.reminder; op.slot = previous.slot; return result; }
      }
      if (result.status === "pending") { op.revision++; result = this.pending(op); }
      else if (result.status !== "refused") {
        this.receipts.set(token, { revision, decision: fingerprint(decision), outcome: clone(result) });
        if (this.receipts.size > 32) this.receipts.delete(this.receipts.keys().next().value!);
      }
      return result;
    } catch (error) {
      if (this.operation !== op) return { status: "refused", reason: "stale-learning-operation" };
      op.error = message(error); op.revision++; return this.pending(op);
    } finally { this.resolving = false; }
  }
}
