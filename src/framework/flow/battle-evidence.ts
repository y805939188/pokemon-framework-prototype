/** Finite companion recording for this capability batch, not a persistent workflow/event bus. */
import { clone, resultHash } from "../rules/state.ts";
import type { BattleResult } from "../rules/state.ts";
import type { BattleEvidence, BattleEvidenceContext, BattleObservation, EvidenceBinding, EvidenceIssue, ObservationBatch } from "../rules/battle-evidence.ts";

export class EvidenceRecorder {
  value: BattleEvidence;
  private readonly members: Set<string>;
  constructor(context: BattleEvidenceContext, memberIds: string[]) {
    this.members = new Set(memberIds);
    this.value = { context: clone(context), rawHash: "", records: [], issues: [], critical: Object.fromEntries(context.playerIds.map(id => [id, 0])), damage: Object.fromEntries(context.playerIds.map(id => [id, 0])), fainted: [], friendship: {} };
  }
  issue(group: EvidenceIssue["group"], reason: string, memberId?: string): void {
    const issue = { group, reason, ...(memberId ? { memberId } : {}) };
    if (this.value.issues.some(x => JSON.stringify(x) === JSON.stringify(issue))) return;
    if (this.value.issues.length < 128) this.value.issues.push(issue);
    else this.value.issues[127] = { group: "identity", reason: "evidence-issue-capacity-exceeded" };
  }
  blocked(group: EvidenceIssue["group"], id?: string): boolean {
    return this.value.issues.some(x => x.group === "identity" || x.group === group && (!x.memberId || x.memberId === id));
  }
  record(batch: ObservationBatch): void {
    for (const issue of batch.issues) this.issue(issue.group, issue.reason, issue.memberId);
    for (const fact of batch.records) {
      if (!this.members.has(fact.target.id) || (fact.kind === "hit" && fact.source && !this.members.has(fact.source.id))) { this.issue("identity", "unknown-observation-member"); continue; }
      if (this.value.records.length >= 16384) { this.issue("identity", "evidence-capacity-exceeded"); break; }
      this.value.records.push(clone(fact));
      this.count(fact);
    }
  }
  private count(fact: BattleObservation): void {
    const ours = this.value.context.playerIds;
    if (fact.kind === "hit" && fact.source && ours.includes(fact.source.id) && fact.critical) {
      this.value.critical[fact.source.id] = (this.value.critical[fact.source.id] ?? 0) + 1;
    }
    if (ours.includes(fact.target.id)) {
      if (fact.kind === "hit" || fact.kind === "confusion") this.value.damage[fact.target.id] = (this.value.damage[fact.target.id] ?? 0) + fact.loss;
      if (fact.kind === "faint") {
        this.value.damage[fact.target.id] = 0;
        if (!this.value.fainted.includes(fact.target.id)) this.value.fainted.push(fact.target.id);
      }
    }
  }
  snapshot(): BattleEvidence { return clone(this.value); }
  restore(value: BattleEvidence): void { this.value = clone(value); }
  seal(raw: BattleResult, binding: EvidenceBinding): BattleEvidence | null {
    const context = this.value.context;
    if (binding.battleId !== context.battleId || binding.generation !== context.generation || raw.battleId !== context.battleId || binding.rawHash !== resultHash(raw)) return null;
    const sealed = clone({ ...this.value, rawHash: binding.rawHash });
    for (const id of context.playerIds) {
      if (this.blocked("critical", id)) delete sealed.critical[id];
      if (this.blocked("damage", id)) delete sealed.damage[id];
      if (this.blocked("friendship", id)) delete sealed.friendship[id];
    }
    if (this.blocked("identity")) sealed.fainted = [];
    return sealed;
  }
}
