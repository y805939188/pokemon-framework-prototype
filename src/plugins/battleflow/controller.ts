/** Renderless host lifecycle. The session is an opaque handle; no HP, inventory or battle rules live here. */
export interface BattleScenePorts {
  current(): boolean;
  active(): boolean;
  closedFailure(): unknown;
  hideInput(): void;
  appendLine(line: string): void;
  refreshStatus(): void;
  afterMessages(): void;
  abort(error: unknown): void;
  unusableView(error: unknown): void;
  now(): number;
  actionMeasured(kind: string, milliseconds: number): void;
}
/** A host-owned display step. It may paint, but never submits a battle action or writes game state. */
export interface BattleSceneVisualStep { kind: 'visual'; advance(now: number): boolean; cancel(): void; }
export type BattleScenePresentation = string | BattleSceneVisualStep;

export class BattleSceneController<Session = unknown> {
  phase = 'boot';
  ready = false;
  failure: unknown = null;
  queue: BattleScenePresentation[] = [];
  wait = 0;
  busy = false;
  session: Session | null = null;
  private epoch = 0;
  private retired = false;
  private opening = false;
  private ticking = false;
  private choosing = false;
  private failing = false;
  private abortSent = false;
  private clearing = false;

  private clearQueue(): void {
    const pending = this.queue.splice(0); this.clearing = true;
    try { for (const step of pending) if (typeof step !== 'string') {
      try { step.cancel(); } catch (error) { this.failure ||= error; }
    } } finally { this.clearing = false; }
  }

  constructor(private readonly ports: BattleScenePorts) {}
  /** Cleanup may inspect the captured host owner after retiring callbacks. It never adopts a successor. */
  ownsHost(): boolean { return this.ports.current(); }
  isCurrent(): boolean { return !this.retired && this.ownsHost(); }
  private at(epoch: number): boolean { return this.epoch === epoch && this.isCurrent(); }
  canChoose(): boolean {
    return this.isCurrent() && this.ready && !this.busy && !this.queue.length
      && this.phase !== 'boot' && this.phase !== 'messages'
      && (this.phase === 'end' || this.ports.active());
  }

  open(begin: () => Session | PromiseLike<Session>): boolean {
    if (!this.isCurrent() || !this.ports.active() || this.opening || this.ready) return false;
    const epoch = ++this.epoch;
    this.opening = true;
    const rejected = (error: unknown) => {
      if (!this.at(epoch)) return;
      this.opening = false; this.ready = true; this.failure = error || new Error(String(error));
    };
    try {
      const pending = begin();
      void Promise.resolve(pending).then(session => {
        if (!this.at(epoch)) return;
        this.opening = false; this.ready = true;
        if (!this.ports.active()) { this.failure = new Error('battle closed while opening'); return; }
        this.session = session;
      }, rejected);
    } catch (error) { rejected(error); }
    return true;
  }

  /** The host may close an operation without destroying its scene until the next update. */
  private observeClosedHost(): void {
    if (!this.isCurrent() || this.ports.active()
      || (this.failure && !this.busy && !this.opening && this.phase !== 'boot')) return;
    const reason = this.ports.closedFailure();
    if (this.phase === 'end' && !reason) return; // An already committed successful end stays successful.
    ++this.epoch; this.opening = false; this.ready = true; this.busy = false;
    this.abortSent = true; // The host already closed this operation; never abort its application twice.
    this.failure ||= reason;
    this.clearQueue(); this.wait = 0; this.phase = 'messages';
    this.ports.hideInput();
  }

  enqueue(lines: readonly BattleScenePresentation[]): boolean {
    if (!this.isCurrent() || this.clearing) return false;
    this.queue.push(...lines); this.phase = 'messages';
    this.ports.hideInput();
    return this.isCurrent();
  }
  show(phase: string): boolean {
    if (!this.isCurrent()) return false;
    this.phase = phase; return true;
  }
  present(callback: () => void): boolean {
    if (!this.isCurrent()) return false;
    try { callback(); return this.isCurrent(); }
    catch (error) { this.fail(error); return false; }
  }
  input(callback: () => void): boolean {
    if (this.choosing || !this.isCurrent()) return false;
    this.choosing = true;
    try {
      // MZ dispatches window handlers inside the base update, before our scene tick.
      if (!this.present(() => this.observeClosedHost()) || !this.canChoose()) return false;
      return this.present(callback);
    }
    finally { this.choosing = false; }
  }

  tick(fastForward: boolean, delay: number): void {
    if (!this.isCurrent() || this.ticking) return;
    this.ticking = true;
    const alreadyFailed = !!this.failure;
    try {
      this.observeClosedHost();
      if (!this.isCurrent() || this.busy || this.phase !== 'messages') return;
      if (this.queue.length) {
        const first = this.queue[0];
        if (typeof first !== 'string') {
          const epoch = this.epoch;
          const complete = first.advance(this.ports.now());
          if (this.at(epoch) && this.ports.active() && this.phase === 'messages' && this.queue[0] === first && complete) this.queue.shift();
          return;
        }
        if (fastForward) {
          // A reentrant renderer may append new text. Drain this batch, never an unbounded callback loop.
          const count = this.queue.length;
          for (let i = 0; i < count && this.queue.length; i++) {
            if (!this.isCurrent() || this.phase !== 'messages') return;
            if (typeof this.queue[0] !== 'string') break;
            this.ports.appendLine(this.queue.shift() as string);
          }
        } else if (this.wait > 0) this.wait--;
        else {
          const line = this.queue.shift() as string;
          this.wait = delay;
          this.ports.appendLine(line);
        }
        return;
      }
      this.ports.refreshStatus();
      if (this.isCurrent() && !this.busy && this.phase === 'messages') this.ports.afterMessages();
    } catch (error) {
      if (alreadyFailed) this.unusable(error);
      else this.fail(error);
    } finally { this.ticking = false; }
  }

  run(action: () => unknown, fulfilled: (result: unknown) => void, kind = 'other'): boolean {
    if (!this.canChoose()) return false;
    const epoch = ++this.epoch;
    this.busy = true;
    let start: number;
    try { this.ports.hideInput(); if (!this.at(epoch)) return false; start = this.ports.now(); }
    catch (error) { this.fail(error); return false; }
    void Promise.resolve().then(() => {
      if (!this.at(epoch) || !this.ports.active()) return;
      return action();
    }).then(result => {
      if (!this.at(epoch) || !this.ports.active()) return;
      const elapsed = this.ports.now() - start;
      if (!this.at(epoch) || !this.ports.active()) return;
      this.ports.actionMeasured(kind, elapsed);
      if (!this.at(epoch) || !this.ports.active()) return;
      fulfilled(result);
      if (this.at(epoch)) this.busy = false;
    }).catch(error => { if (this.at(epoch)) this.fail(error); });
    return true;
  }

  fail(error: unknown): boolean {
    if (!this.isCurrent() || this.failing) return false;
    this.failing = true;
    ++this.epoch; this.opening = false; this.busy = false; this.ready = true;
    this.failure = error || new Error(String(error)); this.clearQueue(); this.wait = 0; this.phase = 'messages';
    try {
      if (!this.abortSent) { this.abortSent = true; if (this.ports.active()) this.ports.abort(error); }
      if (this.isCurrent()) this.ports.hideInput();
    } catch (viewError) { this.unusable(viewError); }
    finally { this.failing = false; }
    return true;
  }
  private unusable(error: unknown): void {
    if (!this.isCurrent()) return;
    this.dispose();
    // The operation was aborted before attempting recovery from a second, broken error presentation.
    if (this.ownsHost()) { try { this.ports.unusableView(error); } catch { /* no successor or business state is touched */ } }
  }
  dispose(): void {
    this.retired = true; ++this.epoch; this.opening = false; this.busy = false;
    this.clearQueue(); this.wait = 0;
  }
}
