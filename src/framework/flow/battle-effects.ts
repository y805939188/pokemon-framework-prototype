/** Finite transient V2 source receipts. This owner is independent of the legacy optional evidence copy. */
import { clone, resultHash } from "../rules/state";
import { own, setOwn } from "../rules/own";
import type { BattleResult } from "../rules/state";
import type { Member } from "../rules/types";
import type { BattleEvidenceContext, BattleObservation, EvidenceIssue, FriendEvidence, ObservationBatch } from "../rules/battle-evidence";
import type { EffectsSealV2, EffectsBindingV2, EffectsContextV2, EffectCell, FaintCellV2, BattleAppearanceV2, BattleDefeatV2, FriendshipReceiptV2 } from "../rules/battle-consumption";

/** Serializable recorder snapshot; exported so BattleSession's public checkpoint type can be named in declarations. */
export interface SourceState {
  context: EffectsContextV2;
  facts: BattleObservation[];
  issues: EvidenceIssue[];
  observationStarted: boolean;
  controlStarted: boolean;
  controlFaintFailure: string | null;
  controlOrder: number;
  controlFaints: Record<string, FaintCellV2["positiveOccurrences"]>;
  friendship: Record<string, FriendshipReceiptV2>;
  friendshipFailures: Record<string, string>;
}
const complete = <T>(value: T): EffectCell<T> => ({ status: "complete", value });
const unavailable = (reason: string): { status: "unavailable"; reason: string } => ({ status: "unavailable", reason });
const validCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export class BattleEffectsRecorder {
  private data: SourceState;
  private readonly binding: Pick<EffectsBindingV2, "battleId" | "generation" | "contentIdentity">;
  constructor(binding: Pick<EffectsBindingV2, "battleId" | "generation" | "contentIdentity">, context: BattleEvidenceContext, party: readonly Member[], foes: readonly Member[]) {
    this.binding = clone(binding);
    this.data = { context: { playerIds: [...context.playerIds], L0: clone(context.initialLevels), engineRosterIds: party.map(m => m.id), foeIds: foes.map(m => m.id), internalBattle: true },
      facts: [], issues: [], observationStarted: false, controlStarted: false, controlFaintFailure: null, controlOrder: 0, controlFaints: {}, friendship: {}, friendshipFailures: {} };
    for (const m of party) {
      const before = m.friendship ?? 70;
      if (!Number.isSafeInteger(before) || before < 0 || before > 255) setOwn(this.data.friendshipFailures, m.id, "friendship-out-of-domain");
      else setOwn(this.data.friendship, m.id, { before, current: before, changes: [] });
    }
  }
  startControl(available: boolean): void {
    this.data.controlStarted = available;
    if (!available) this.controlFaintFailed("control-capability-unavailable");
  }
  controlFaintFailed(reason: string): void { this.data.controlFaintFailure ??= reason; }
  friendshipFailed(id: string, reason: string): void { setOwn(this.data.friendshipFailures, id, reason); }
  /** Called only after the complete canonical hook/public batch was validated, before optional observation copying. */
  controlFaint(fact: Extract<BattleObservation, { kind: "faint" }>): void {
    const id = fact.target.id;
    if (!this.data.context.engineRosterIds.includes(id)) return;
    if (fact.target.side !== "p1" || fact.target.hp !== 0 || !fact.hookKey) { this.controlFaintFailed("control-faint-association-unavailable"); return; }
    const list = own(this.data.controlFaints, id) ?? [];
    if (list.some(x => x.hookKey === fact.hookKey)) { this.controlFaintFailed("duplicate-control-faint"); return; }
    list.push({ memberId: id, source: "control", occurrenceOrdinal: list.length + 1, sourceOrder: ++this.data.controlOrder, hookKey: fact.hookKey });
    setOwn(this.data.controlFaints, id, list);
  }
  /** The actual successful ACK, not an observer reconstruction or a read of the final working member. */
  friendshipReceipt(id: string, method: FriendEvidence["changes"][number]["method"], before: number, after: number): void {
    const receipt = own(this.data.friendship, id);
    if (!receipt || receipt.current !== before || !validCount(after) || after > 255) { this.friendshipFailed(id, "control-friendship-chain-broken"); return; }
    ++this.data.controlOrder;
    receipt.changes.push({ method, before, after });
    receipt.current = after;
  }
  observerFailed(reason: string): void { this.issue({ group: "identity", reason }); }
  private issue(issue: EvidenceIssue): void {
    if (this.data.issues.length < 128) this.data.issues.push(clone(issue));
    else this.data.issues[127] = { group: "identity", reason: "effects-issue-capacity-exceeded" };
  }
  observe(batch: ObservationBatch): void {
    this.data.observationStarted = true;
    for (const issue of batch.issues) this.issue(issue);
    for (const fact of batch.records) {
      if (!["hit", "faint", "item", "appearance", "display", "confusion"].includes(fact.kind)) { this.observerFailed("effects-unknown-observation-kind"); continue; }
      const expected = fact.target.side === "p1" ? this.data.context.engineRosterIds : fact.target.side === "p2" ? this.data.context.foeIds : [];
      const validActor = (a: BattleObservation["target"]) => Number.isSafeInteger(a.level) && a.level >= 1 && a.level <= 100 && validCount(a.hp) && validCount(a.slot) && a.slot < 24 && typeof a.active === "boolean";
      if (!expected.includes(fact.target.id) || !validActor(fact.target)) { this.issue({ group: "identity", reason: "effects-unknown-observer-member" }); continue; }
      if (fact.kind === "hit" && fact.source && !(fact.source.side === "p1" ? this.data.context.engineRosterIds : fact.source.side === "p2" ? this.data.context.foeIds : []).includes(fact.source.id)) {
        this.issue({ group: "identity", reason: "effects-unknown-observer-source" }); continue;
      }
      if (fact.kind === "hit" && fact.source && !validActor(fact.source)) { this.observerFailed("effects-invalid-observer-source"); continue; }
      if (this.data.facts.length >= 16384) { this.observerFailed("effects-observer-capacity-exceeded"); break; }
      this.data.facts.push(clone(fact));
    }
  }
  snapshot(): SourceState { return clone(this.data); }
  restore(data: SourceState): void { this.data = clone(data); }

  seal(raw: BattleResult, binding: EffectsBindingV2, unavailableFriends: readonly string[]): EffectsSealV2 | null {
    if (binding.battleId !== this.binding.battleId || binding.generation !== this.binding.generation || binding.contentIdentity !== this.binding.contentIdentity || raw.battleId !== binding.battleId || resultHash(raw) !== binding.rawHash) return null;
    const d = this.data, ids = [...d.context.engineRosterIds, ...d.context.foeIds];
    const appearances: EffectsSealV2["observer"]["appearances"] = {}, defeats: EffectsSealV2["observer"]["defeats"] = {};
    const observerMembers: EffectsSealV2["observer"]["members"] = {}, controlMembers: EffectsSealV2["control"]["members"] = {};
    const blocked = (group: EvidenceIssue["group"], id: string) => !d.observationStarted || d.issues.some(i => i.group === "identity" || i.group === group && (!i.memberId || i.memberId === id));
    for (const id of ids) {
      const shown: BattleAppearanceV2[] = [], fallen: BattleDefeatV2[] = [], positives: FaintCellV2["positiveOccurrences"] = [];
      let critical = 0, damage = 0, criticalMissing = false, displayMissing = false, faintMissing = false, damageMissing = false;
      for (const [index, fact] of d.facts.entries()) {
        if (fact.kind === "hit" && fact.source?.id === id) {
          if (typeof fact.critical !== "boolean" || !validCount(fact.hit) || fact.hit < 1 || !["body", "substitute"].includes(fact.domain)) criticalMissing = true;
          else if (fact.critical) ++critical;
        }
        if (fact.target.id !== id) continue;
        if (fact.kind === "hit" || fact.kind === "confusion") {
          if (validCount(fact.loss) && Number.isSafeInteger(damage + fact.loss)) damage += fact.loss;
          else damageMissing = true;
        }
        if (fact.kind === "appearance" || fact.kind === "display") {
          if (fact.display) shown.push({ memberId: id, sourceOrder: index + 1, display: clone(fact.display) });
          else displayMissing = true;
        }
        if (fact.kind === "faint") {
          if (!fact.hookKey || fact.target.hp !== 0 || positives.some(x => x.hookKey === fact.hookKey)) { faintMissing = true; continue; }
          const occurrenceOrdinal = positives.length + 1;
          positives.push({ memberId: id, source: "observer", occurrenceOrdinal, sourceOrder: index + 1, hookKey: fact.hookKey });
          damage = 0;
          if (fact.display) fallen.push({ memberId: id, sourceOrder: index + 1, occurrenceOrdinal, hookKey: fact.hookKey, display: clone(fact.display) });
          else displayMissing = true;
        }
      }
      const badDisplay = blocked("display", id) || displayMissing;
      setOwn(appearances, id, badDisplay ? unavailable("display-coverage-unavailable") : complete(shown));
      if (d.context.foeIds.includes(id)) setOwn(defeats, id, badDisplay || faintMissing ? unavailable("defeat-coverage-unavailable") : complete(fallen));
      if (d.context.engineRosterIds.includes(id)) {
        const coverage = blocked("identity", id) || faintMissing ? unavailable("observer-faint-coverage-unavailable") : { status: "complete" as const };
        setOwn(observerMembers, id, {
          critical: blocked("critical", id) || criticalMissing ? unavailable("critical-coverage-unavailable") : complete(critical),
          damage: blocked("damage", id) || faintMissing || damageMissing ? unavailable("damage-or-reset-coverage-unavailable") : complete({ total: damage, resetCoverage: "complete" as const }),
          faint: { positiveOccurrences: positives, coverage },
        });
        const failure = own(d.friendshipFailures, id), receipt = own(d.friendship, id);
        setOwn(controlMembers, id, {
          friendship: failure || unavailableFriends.includes(id) || !d.controlStarted || !receipt ? unavailable(failure ?? "control-friendship-coverage-unavailable") : complete(clone(receipt)),
          faint: { positiveOccurrences: clone(own(d.controlFaints, id) ?? []), coverage: !d.controlStarted || d.controlFaintFailure ? unavailable(d.controlFaintFailure ?? "control-faint-coverage-unavailable") : { status: "complete" } },
        });
      }
    }
    return { version: 2, binding: clone(binding), context: clone(d.context), observer: { appearances, defeats, members: observerMembers }, control: { members: controlMembers } };
  }
}
