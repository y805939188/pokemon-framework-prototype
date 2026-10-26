/** A finite, transient post-battle continuation. No saved workflow and no authority from public answers. */
import { clone } from "../rules/value.ts";
import { planPostBattleEvolution } from "../rules/evolution.ts";
import type { EvolutionFacts, EvolutionSelection } from "../rules/evolution.ts";
import { planBattleReadiness } from "../rules/battle-consumption.ts";
import type { EffectsContextV2, ResolvedBattleEffects } from "../rules/battle-consumption.ts";
import { planEvolutionCommit } from "../rules/evolution-commit.ts";
import { planLearningQueue } from "../rules/learning.ts";
import type { LearningAnswer, LearningPending } from "../rules/learning.ts";
import { resolveConfig } from "../rules/config.ts";
import { catalogOf } from "../rules/item-catalog.ts";
import { removeItems } from "../rules/inventory.ts";
import { bumpStat } from "../rules/stats.ts";
import { own } from "../rules/own.ts";
import { validateGameContent } from "../rules/save-schema.ts";
import { validatedContentIdentity } from "../flow/content-runtime.ts";
import type { Content, Member } from "../rules/types.ts";
import type { Limits } from "../rules/limits.ts";
import type { GameState } from "../rules/state.ts";
import type { ContentPort, GameStatePort } from "./ports.ts";

export interface BattleEvolutionSeed {
  token: string; generation: number; context: EffectsContextV2; effects: ResolvedBattleEffects;
  eligibleHp: Record<string, number>; lateHeal: boolean; enabled: boolean;
}
/** A target already selected by an owned item/event action, without manufactured battle facts. */
export interface SelectedEvolutionSeed {
  token: string; generation: number; selected: true;
  cost?: { itemId: string; quantity: number };
}
export type EvolutionDecision = { kind: "complete" | "cancel" | "technical-terminate" | "retry" }
  | { kind: "learn"; answer: LearningAnswer };
export interface EvolutionView {
  token: string; revision: number; phase: "evolution" | "learning" | "failed";
  memberId?: string; selection?: EvolutionSelection; learning?: LearningPending;
  error?: string; reloadRequired?: boolean;
}
export type EvolutionResolution = { status: "pending"; view: EvolutionView; diagnostics: string[] }
  | { status: "complete" | "technically-terminated"; diagnostics: string[]; progress?: { evolved: boolean; cancelled: boolean } }
  | { status: "refused"; reason: string };
interface Prefix { state: GameState; cursor: number; selection?: EvolutionSelection; diagnostics: string[] }
type AfterInstall = { kind: "scan"; prefix: Prefix }
  | { kind: "evolved"; memberId: string; moves: string[] }
  | { kind: "learned" }
  | { kind: "cancelled" };
interface Operation {
  seed: BattleEvolutionSeed | SelectedEvolutionSeed; identity: string; ids: string[]; cursor: number; activated: boolean; revision: number;
  selection?: EvolutionSelection; learning?: { memberId: string; moves: string[]; cursor: number; answers: LearningAnswer[]; pending?: LearningPending };
  pendingWrite?: { before: GameState; next: GameState; after: AfterInstall };
  error?: string; reloadRequired: boolean; diagnostics: string[];
  progress?: { evolved: boolean; cancelled: boolean };
}
const identity = (state: GameState): string => JSON.stringify(state, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, (value as Record<string, unknown>)[key]])) : value);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export class EvolutionOperation {
  private operation: Operation | null = null;
  private resolving = false;
  private readonly ports: {
    state: GameStatePort; content: ContentPort; generation: () => number;
    facts: (member: Readonly<Member>, content: Content) => EvolutionFacts;
    limits: Limits;
  };
  constructor(ports: EvolutionOperation["ports"]) { this.ports = ports; }
  get active(): boolean { return this.operation !== null; }
  matches(token: string): boolean { return this.operation?.seed.token === token; }
  invalidate(): void { this.operation = null; }
  discardPrepared(): void { if (this.operation && !this.operation.activated) this.operation = null; }
  cancelPrepared(token: string): void { if (this.matches(token)) this.discardPrepared(); }
  get view(): EvolutionView | null {
    const op = this.operation;
    if (!op?.activated) return null;
    return clone({ token: op.seed.token, revision: op.revision, phase: op.error ? "failed" : op.learning ? "learning" : "evolution",
      ...(op.selection ? { memberId: op.selection.memberId, selection: op.selection } : {}),
      ...(op.learning ? { memberId: op.learning.memberId, ...(op.learning.pending ? { learning: op.learning.pending } : {}) } : {}),
      ...(op.error ? { error: op.error, reloadRequired: op.reloadRequired } : {}) });
  }
  /** Called with the original battle owner already held, before its primary install. */
  prepare(seed: BattleEvolutionSeed, state: GameState, content: Content): GameState {
    if (this.operation?.activated) throw new Error("evolution-operation-active");
    this.operation = null;
    const key = validatedContentIdentity(content);
    if (!seed.enabled || !seed.context.internalBattle || !key) return state;
    const op: Operation = { seed: clone(seed), identity: key, ids: state.party.map(m => m.id), cursor: 0, activated: false,
      revision: 1, reloadRequired: false, diagnostics: [] };
    this.operation = op;
    const prefix = this.scan(op, state, content);
    this.assertCurrent(op);
    op.cursor = prefix.cursor; op.selection = prefix.selection; op.diagnostics.push(...prefix.diagnostics);
    // The initial prefix's readiness transitions share the primary install. Later members are scanned only after
    // preceding selected evolutions, against the then-current party, while the same continuation stays reserved.
    return prefix.state;
  }
  /** Reserve before the action installs its growth/entry cost; activation occurs only after that write is proved. */
  prepareSelected(seed: SelectedEvolutionSeed, selection: EvolutionSelection, content: Content): void {
    if (this.operation) throw new Error("evolution-operation-active");
    const key = validatedContentIdentity(content); if (!key) throw new Error("evolution-content-identity-unavailable");
    this.operation = { seed: clone(seed), identity: key, ids: [], cursor: 0, activated: false, revision: 1,
      selection: clone(selection), reloadRequired: false, diagnostics: [], progress: { evolved: false, cancelled: false } };
  }
  activate(token: string): EvolutionResolution {
    const op = this.operation;
    if (!op || op.seed.token !== token) return { status: "complete", diagnostics: [] };
    this.assertCurrent(op); op.activated = true;
    if (!op.selection) return this.complete(op);
    return this.pending(op);
  }
  private assertCurrent(op: Operation): void {
    if (this.operation !== op || op.seed.generation !== this.ports.generation()) throw new Error("stale-evolution-operation");
  }
  private content(op: Operation): Content {
    const content = this.ports.content().content; this.assertCurrent(op);
    if (validatedContentIdentity(content) !== op.identity) throw new Error("evolution-content-changed: terminate or reload the operation");
    return content;
  }
  private scan(op: Operation, state: GameState, content: Content): Prefix {
    const next = clone(state), diagnostics: string[] = [], config = resolveConfig(content.settings);
    if (!("context" in op.seed)) return { state: next, cursor: 0, diagnostics };
    let cursor = op.cursor;
    for (; cursor < op.ids.length; cursor++) {
      const id = op.ids[cursor]!, member = next.party.find(m => m.id === id);
      // A newly received entity has no initial player level or player K/D interval. This is legal absence,
      // not a damaged expected record and never permission to inherit the old party slot's achievements.
      if (!member || member.isEgg || !op.seed.context.playerIds.includes(id)) continue;
      const effects = op.seed.effects;
      const external = this.ports.facts(member, content); this.assertCurrent(op);
      const critical = own(effects.critical, id), damage = own(effects.damage, id);
      const absent = { status: "unavailable" as const, reason: "battle-fact-not-supplied" };
      const facts: EvolutionFacts = { ...external,
        criticalHits: critical?.status === "complete" ? { status: "value", value: critical.value } : critical ?? absent,
        damageTaken: damage?.status === "complete" ? { status: "value", value: damage.value.total } : damage ?? absent };
      const l0 = own(op.seed.context.L0, id);
      const result = planPostBattleEvolution({ member, content, party: next.party, facts,
        levelBefore: l0 !== undefined ? { status: "value", value: l0 } : op.seed.context.playerIds.includes(id)
          ? { status: "unavailable", reason: "expected-initial-level-missing" } : { status: "absent" },
        checkFainted: config.CHECK_EVOLUTION_FOR_FAINTED_POKEMON, eligibleHp: op.seed.lateHeal ? own(op.seed.eligibleHp, id) ?? member.hp : member.hp,
        friendshipSoftCap: config.AFFECTION_EFFECTS });
      const complete = result.kind === "target" || result.kind === "no-target";
      const faint = own(effects.faint, id) ?? { positiveOccurrences: [], coverage: absent };
      const readiness = planBattleReadiness({ member, faint, damage, healed: op.seed.lateHeal,
        scan: { status: complete ? "complete" : result.kind === "invalid" ? "invalid" : "unavailable",
          permitsNewReady: complete && result.readiness?.readyToEvolve === true } });
      member.readyToEvolve = readiness.readyToEvolve; member.evolutionReadiness = readiness.evolutionReadiness;
      if (!complete) diagnostics.push(`evolution:${id}:${result.kind}:${result.fact}:${result.reason}`);
      if (result.kind === "target") return { state: next, cursor: cursor + 1, selection: result, diagnostics };
    }
    return { state: next, cursor, diagnostics };
  }
  private pending(op: Operation): EvolutionResolution { this.assertCurrent(op); return { status: "pending", view: this.view!, diagnostics: [...op.diagnostics] }; }
  private complete(op: Operation, terminated = false): EvolutionResolution {
    this.assertCurrent(op); this.operation = null;
    return { status: terminated ? "technically-terminated" : "complete", diagnostics: [...op.diagnostics], ...(op.progress ? { progress: { ...op.progress } } : {}) };
  }
  resolve(token: string, revision: number, decision: EvolutionDecision): EvolutionResolution {
    const op = this.operation;
    if (!op?.activated || op.seed.token !== token || op.seed.generation !== this.ports.generation()) return { status: "refused", reason: "stale-operation" };
    if (op.revision !== revision) return { status: "refused", reason: "stale-decision" };
    if (this.resolving) return { status: "refused", reason: "evolution-resolution-active" };
    this.resolving = true;
    try {
      if (decision.kind === "technical-terminate") return this.terminate(op);
      if (op.pendingWrite) {
        if (decision.kind !== "retry") return { status: "refused", reason: "retry-or-terminate-required" };
        return this.install(op);
      }
      op.error = undefined;
      const state = this.ports.state.read(); this.assertCurrent(op);
      const content = this.content(op);
      if (decision.kind === "retry") {
        op.revision++;
        if (op.learning) return this.learn(op, state, content);
        return op.selection ? this.pending(op) : this.advance(op, state, content);
      }
      if (op.learning) {
        if (decision.kind !== "learn") return { status: "refused", reason: "learning-answer-required" };
        if (!op.learning.pending) return { status: "refused", reason: "retry-or-terminate-required" };
        const previous = op.learning.answers;
        const answerIndex = op.learning.pending?.answerIndex ?? previous.length;
        op.learning.answers = [...previous.slice(0, answerIndex), clone(decision.answer)];
        const resolved = this.learn(op, state, content);
        if (resolved.status === "refused") op.learning.answers = previous;
        return resolved;
      }
      const selection = op.selection;
      if (!selection) return this.advance(op, state, content);
      if (decision.kind === "cancel") {
        if (!selection.cancellable) return { status: "refused", reason: "evolution-cannot-cancel" };
        if (!Number.isSafeInteger(state.stats.evolutions_cancelled + 1)) throw new Error("evolution-cancellation-count-overflow");
        const next = clone(state); next.stats = bumpStat(next.stats, "evolutions_cancelled");
        return this.write(op, state, next, { kind: "cancelled" });
      }
      if (decision.kind !== "complete") return { status: "refused", reason: "evolution-decision-required" };
      const input = clone(state);
      if ("selected" in op.seed && op.seed.cost) input.inventory = removeItems(input.inventory, op.seed.cost.itemId, op.seed.cost.quantity, catalogOf(content));
      const plan = planEvolutionCommit({ state: input, memberId: selection.memberId, selection, content, limits: this.ports.limits });
      if (plan.status !== "ready") { op.error = plan.reason; op.revision++; return this.pending(op); }
      op.diagnostics.push(...plan.diagnostics);
      return this.write(op, state, plan.state, { kind: "evolved", memberId: selection.memberId, moves: [...plan.learning.moves] });
    } catch (error) {
      if (this.operation !== op || op.seed.generation !== this.ports.generation()) return { status: "refused", reason: "stale-operation" };
      op.error = message(error); op.revision++; return this.pending(op);
    } finally { this.resolving = false; }
  }
  private write(op: Operation, before: GameState, next: GameState, after: AfterInstall): EvolutionResolution {
    op.pendingWrite = { before: clone(before), next: clone(next), after };
    return this.install(op);
  }
  private install(op: Operation): EvolutionResolution {
    const pending = op.pendingWrite!;
    const current = this.ports.state.read(); this.assertCurrent(op);
    if (identity(current) === identity(pending.next)) return this.installed(op);
    if (identity(current) !== identity(pending.before)) { op.reloadRequired = true; op.error = "evolution-state-install-indeterminate: reload last complete save"; op.revision++; return this.pending(op); }
    const content = this.content(op), problems = validateGameContent(pending.next, content);
    if (problems.length) { op.error = `invalid-evolution-next:${problems[0]!.path}:${problems[0]!.message}`; op.revision++; return this.pending(op); }
    this.assertCurrent(op);
    let failure: unknown;
    try { this.ports.state.replace(clone(pending.next)); } catch (error) { failure = error; }
    let actual: GameState;
    try { actual = this.ports.state.read(); } catch (error) { op.reloadRequired = true; op.error = message(error); op.revision++; return this.pending(op); }
    this.assertCurrent(op);
    if (identity(actual) === identity(pending.next)) {
      if (failure) op.diagnostics.push(`evolution-installed-with-host-error:${message(failure)}`);
      return this.installed(op);
    }
    op.reloadRequired = identity(actual) !== identity(pending.before);
    op.error = op.reloadRequired ? "evolution-state-install-indeterminate: reload last complete save" : message(failure ?? "evolution-state-not-installed");
    op.revision++; return this.pending(op);
  }
  private installed(op: Operation): EvolutionResolution {
    const { after, next: state } = op.pendingWrite!; delete op.pendingWrite; op.error = undefined; op.reloadRequired = false;
    op.revision++;
    if (after.kind === "scan") {
      op.cursor = after.prefix.cursor; op.selection = after.prefix.selection; op.diagnostics.push(...after.prefix.diagnostics);
      return op.selection ? this.pending(op) : this.complete(op);
    }
    if (after.kind === "evolved") {
      if (op.progress) op.progress.evolved = true;
      op.selection = undefined; op.learning = { memberId: after.memberId, moves: after.moves, cursor: 0, answers: [] };
      return this.learn(op, state, this.content(op));
    }
    if (after.kind === "learned") { op.learning!.cursor++; op.learning!.answers = []; delete op.learning!.pending; return this.learn(op, state, this.content(op)); }
    if (after.kind === "cancelled" && op.progress) op.progress.cancelled = true;
    op.selection = undefined;
    return this.advance(op, state, this.content(op));
  }
  private learn(op: Operation, state: GameState, content: Content): EvolutionResolution {
    const learning = op.learning!;
    const member = state.party.find(m => m.id === learning.memberId);
    if (!member) throw new Error("evolution-learning-member-missing");
    const moveData = Object.values(content.moves ?? {}), config = resolveConfig(content.settings);
    const resolve = (id: string) => moveData.find(move => move.id === id || move.name === id);
    const hmMoves = Object.values(catalogOf(content)).filter(item => item.fieldUse === "hm").flatMap(item => {
      const move = item.move && resolve(item.move); return move ? [move.id] : [];
    });
    while (learning.cursor < learning.moves.length) {
      const move = resolve(learning.moves[learning.cursor]!);
      if (!move) throw new Error("unmapped-evolution-learning-move");
      const plan = planLearningQueue(member, [move], { kind: "evolution" }, { shadow: false, hmMoves, keepMachinePp: config.TAUGHT_MACHINES_KEEP_OLD_PP }, learning.answers);
      if (plan.status === "refused") return { status: "refused", reason: `evolution-learning:${plan.reason}` };
      if (plan.status === "pending") { learning.pending = plan.selection; op.revision++; return this.pending(op); }
      if (plan.outcomes.some(outcome => outcome.outcome === "learned")) {
        const next = clone(state), target = next.party.find(m => m.id === member.id)!; target.moves = plan.patch.moves;
        return this.write(op, state, next, { kind: "learned" });
      }
      learning.cursor++; learning.answers = []; delete learning.pending;
    }
    op.learning = undefined;
    return this.advance(op, state, content);
  }
  private advance(op: Operation, state: GameState, content: Content): EvolutionResolution {
    const prefix = this.scan(op, state, content);
    if (identity(prefix.state) !== identity(state)) return this.write(op, state, prefix.state, { kind: "scan", prefix });
    op.cursor = prefix.cursor; op.selection = prefix.selection; op.diagnostics.push(...prefix.diagnostics); op.revision++;
    return op.selection ? this.pending(op) : this.complete(op);
  }
  private terminate(op: Operation): EvolutionResolution {
    if (op.pendingWrite) {
      const state = this.ports.state.read(); this.assertCurrent(op);
      if (identity(state) === identity(op.pendingWrite.next)) {
        if (op.progress && op.pendingWrite.after.kind === "evolved") op.progress.evolved = true;
        if (op.progress && op.pendingWrite.after.kind === "cancelled") op.progress.cancelled = true;
        // The installed state already includes its resources/statistics. A technical exit must not auto-learn
        // another move or scan another member merely to acknowledge that complete write.
        return this.complete(op, true);
      } else if (identity(state) !== identity(op.pendingWrite.before)) return { status: "refused", reason: "state-install-indeterminate: reload-required" };
    }
    return this.complete(op, true);
  }
}
