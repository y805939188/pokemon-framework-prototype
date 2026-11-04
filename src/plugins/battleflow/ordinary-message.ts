import type { BattleSceneVisualStep } from './controller';

interface MessagePorts {
  current(): boolean;
  update(): number;
  useOrBack(): boolean;
  paint(text: string): void;
  close(): void;
}

interface PauseOptions {
  battleEnded(): boolean;
  confirmed(): void;
  instant(): boolean; // Existing test-only fast presentation; not replay semantics.
}

/** WP67-A 9.1 ordinary/paused text. Commands and brief residency remain separate. */
export class OrdinaryMessageStep implements BattleSceneVisualStep {
  readonly kind = 'visual' as const;
  private readonly points: string[];
  private startedAt: number | null = null;
  private fullAt: number | null = null;
  private visible = 0;
  private lastUpdate = -1;
  private done = false;

  constructor(text: string, private readonly ports: MessagePorts, private readonly pause?: PauseOptions) { this.points = Array.from(text); }

  snapshot() {
    return { implementation: this.pause ? 'paused-message-v1' : 'ordinary-message-v1', phase: this.done ? 'done' : this.fullAt === null ? 'typing' : 'full',
      visible: this.visible, total: this.points.length, fullyShownAt: this.fullAt };
  }

  advance(now: number): boolean {
    if (this.done) return true;
    if (!this.ports.current()) { this.cancel(); return true; }
    const update = this.ports.update();
    if (update === this.lastUpdate) return false;
    this.lastUpdate = update;
    const first = this.startedAt === null;
    if (first) this.startedAt = now;
    const input = !first && this.ports.useOrBack();
    if (this.fullAt !== null) {
      if (input) {
        this.pause?.confirmed();
        this.cancel(); return true;
      }
      if (this.pause?.instant() || (!this.pause?.battleEnded() && now - this.fullAt >= (this.pause ? 3000 : 1000))) { this.cancel(); return true; }
      return false;
    }
    // 30 ms per Unicode code point is the default presenter speed, not a battle rule.
    const count = input || this.pause?.instant() ? this.points.length : Math.min(this.points.length, Math.floor((now - this.startedAt!) / 30));
    if (first || count !== this.visible) {
      this.visible = count;
      this.ports.paint(this.points.slice(0, count).join(''));
      if (!this.ports.current() || this.done) { this.cancel(); return true; }
    }
    // Start dwell at the actual full paint, even when a host frame arrives late.
    // The input which reveals the remainder never also closes it.
    if (count === this.points.length) this.fullAt = now;
    return false;
  }

  cancel(): void {
    if (this.done) return;
    this.done = true;
    this.ports.close();
  }
}

export class PausedMessageStep extends OrdinaryMessageStep {
  constructor(text: string, ports: MessagePorts, options: PauseOptions) { super(text, ports, options); }
}
