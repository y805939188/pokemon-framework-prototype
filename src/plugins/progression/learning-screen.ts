/** Presentation decisions only. The application owns compatibility, costs, installation and revision checks. */
import type { LearningView, LearningDecision, LearningOutcome } from '../../framework/app/learning-operation.ts';
import type { LearningAnswer, LearningPending } from '../../framework/rules/learning.ts';

export interface LearningRow { key: string; text: string; details?: string }
export interface LearningPage { kind: string; title: string; rows: LearningRow[]; cursor: number; error?: string }
export interface LearningScreenPort {
  resolve(token: string, revision: number, decision: LearningDecision): LearningOutcome;
  text(key: string, params?: Record<string, string | number>): string;
  move(id: string): string;
  close(outcome: LearningOutcome): void;
  reload(): void;
}
export class LearningScreen {
  page!: LearningPage;
  private view: LearningView | null = null;
  private actions = new Map<string, () => void>();
  private backAction: () => void = () => {};
  private nested: LearningAnswer[] = [];
  private initialPrompt = true;
  private final: LearningOutcome | null = null;
  constructor(private port: LearningScreenPort, outcome: LearningOutcome) { this.accept(outcome); }
  private set(kind: string, title: string, rows: [LearningRow, () => void][], back: () => void, error?: string) {
    this.page = { kind, title, rows: rows.map(row => row[0]), cursor: 0, ...(error ? { error } : {}) };
    this.actions = new Map(rows.map(([row, run]) => [row.key, run])); this.backAction = back;
  }
  private text(key: string, params?: Record<string, string | number>) { return this.port.text(key, params); }
  private row(key: string, text: string, run: () => void, details?: string): [LearningRow, () => void] {
    return [{ key, text, ...(details ? { details } : {}) }, run];
  }
  private confirm(title: string, yes: () => void, no: () => void) {
    this.set('confirm', title, [this.row('yes', this.text('yes'), yes), this.row('no', this.text('no'), no)], no);
  }
  private answer(decision: LearningDecision) {
    if (!this.view) return;
    const { token, revision } = this.view;
    this.accept(this.port.resolve(token, revision, decision));
  }
  accept(outcome: LearningOutcome) {
    if (outcome.status === 'refused') {
      if (this.view?.kind === 'forget' && outcome.reason === 'last-move') { this.render(); this.page.error = this.text('lastMove'); return; }
      if (this.view) { this.recovery(outcome.reason); return; }
      this.final = outcome; this.set('message', this.text('refused', { reason: outcome.reason }),
        [this.row('close', this.text('close'), () => this.port.close(outcome))], () => this.port.close(outcome)); return;
    }
    if (outcome.status !== 'pending') {
      this.view = null; this.final = outcome;
      this.set('message', this.text(outcome.status), [this.row('close', this.text('close'), () => this.port.close(outcome))], () => this.port.close(outcome)); return;
    }
    this.view = structuredClone(outcome.view);
    if (outcome.view.error) { this.recovery(outcome.view.error); return; }
    this.render();
  }
  recovery(reason: string) {
    this.set('recovery', this.text('failed'), [
      this.row('retry', this.text('retry'), () => this.answer({ kind: 'retry' })),
      this.row('terminate', this.text('terminate'), () => this.answer({ kind: 'technical-terminate' })),
      ...(this.view?.reloadRequired ? [this.row('reload', this.text('reload'), () => this.port.reload())] : []),
    ], () => this.answer({ kind: 'technical-terminate' }), reason);
  }
  private render() {
    const view = this.view!, s = view.selection;
    if (!s) { this.recovery('missing-learning-selection'); return; }
    if (view.kind === 'forget' && s.kind === 'forget') {
      this.set('forget', this.text('forget'), s.moves.map((move, index) => this.row(String(index), this.port.move(move.id),
        () => this.confirm(this.text('confirmForget', { move: this.port.move(move.id) }),
          () => this.answer({ kind: 'forget', slot: index }), () => this.render()), `${move.pp}/${move.maxpp} PP`)),
        () => this.answer({ kind: 'forget', slot: null })); return;
    }
    if (view.kind === 'relearn' && 'candidates' in s) {
      const exit = () => this.answer({ kind: 'relearn', answer: { kind: 'exit' } });
      if (s.kind === 'candidate') {
        this.nested = [];
        this.set('candidates', this.text('relearn'), [...s.candidates.map(id => this.row(id, this.port.move(id),
          () => this.answer({ kind: 'relearn', answer: { kind: 'select', moveId: id } }))),
        this.row('exit', this.text('close'), exit)], exit); return;
      }
      if (s.kind === 'exit') {
        this.confirm(this.text('confirmExit'), () => this.answer({ kind: 'relearn', answer: { kind: 'exit', confirmed: true } }),
          () => this.answer({ kind: 'relearn', answer: { kind: 'exit', confirmed: false } })); return;
      }
      if (s.kind === 'teach') {
        this.confirm(this.text('confirmTeach', { move: this.port.move(s.moveId!) }),
          () => { this.nested = []; this.answer({ kind: 'relearn', answer: { kind: 'select', moveId: s.moveId!, teach: true } }); },
          () => this.answer({ kind: 'relearn', answer: { kind: 'select', moveId: s.moveId!, teach: false } })); return;
      }
      if (s.kind === 'learning' && s.learning) {
        this.moves(s.learning, answer => {
          this.nested[s.learning!.answerIndex] = answer;
          this.answer({ kind: 'relearn', answer: { kind: 'select', moveId: s.moveId!, teach: true, learning: this.nested } });
        }); return;
      }
    }
    if (view.kind === 'teach' && (s.kind === 'learn' || s.kind === 'give-up')) {
      const send = (answer: LearningAnswer) => this.answer({ kind: 'learn', answer });
      if (this.initialPrompt && s.kind === 'learn') {
        this.initialPrompt = false;
        this.confirm(this.text('confirmReplace', { move: this.port.move(s.move.id) }), () => this.moves(s, send),
          () => send({ kind: 'decline', giveUp: true })); return;
      }
      this.moves(s, send); return;
    }
    this.recovery('invalid-learning-selection');
  }
  private moves(s: LearningPending, send: (answer: LearningAnswer) => void) {
    if (s.kind === 'give-up') {
      this.confirm(this.text('giveUp', { move: this.port.move(s.move.id) }),
        () => send({ kind: 'decline', giveUp: true }), () => send({ kind: 'decline', giveUp: false })); return;
    }
    const decline = () => send({ kind: 'decline' });
    this.set('moves', this.text('chooseMove', { move: this.port.move(s.move.id) }), [
      ...s.moves.map((move, index) => this.row(String(index), this.port.move(move.id), () => send({ kind: 'replace', slot: index }), `${move.pp}/${move.maxpp} PP`)),
      this.row('new', this.port.move(s.move.id), decline, this.text('keepOld')),
    ], decline, s.reason ? this.text(s.reason) : undefined);
  }
  select(key: string) { this.actions.get(key)?.(); }
  back() { this.backAction(); }
  terminate() { if (this.view) this.answer({ kind: 'technical-terminate' }); else if (this.final) this.port.close(this.final); }
}
