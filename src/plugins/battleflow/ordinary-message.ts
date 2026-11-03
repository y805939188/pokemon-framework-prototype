import type { BattleSceneVisualStep } from './controller';

interface MessagePorts {
  current(): boolean;
  update(): number;
  useOrBack(): boolean;
  paint(text: string): void;
  close(): void;
}

/** Plain, ordinary messages only (WP67-A 9.1). No command, pause or brief semantics. */
export class OrdinaryMessageStep implements BattleSceneVisualStep {
  readonly kind = 'visual' as const;
  private readonly points: string[];
  private startedAt: number | null = null;
  private fullAt: number | null = null;
  private visible = 0;
  private lastUpdate = -1;
  private done = false;

  constructor(text: string, private readonly ports: MessagePorts) { this.points = Array.from(text); }

  snapshot() {
    return { implementation: 'ordinary-message-v1', phase: this.done ? 'done' : this.fullAt === null ? 'typing' : 'full',
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
      if (input || now - this.fullAt >= 1000) { this.cancel(); return true; }
      return false;
    }
    // 30 ms per Unicode code point is the default presenter speed, not a battle rule.
    const count = input ? this.points.length : Math.min(this.points.length, Math.floor((now - this.startedAt!) / 30));
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
