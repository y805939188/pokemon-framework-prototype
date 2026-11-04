import type { BattleSceneVisualStep } from './controller';

export interface BriefMessagePorts {
  current(): boolean;
  update(): number;
  useOrBack(): boolean;
  paint(text: string): void;
  /** Clear only this message's captured presentation, never a successor's window. */
  close(): void;
}

export interface BriefMessageOptions {
  /** Text-only fast-forward, e.g. a noninteractive scene; residency still waits. */
  instantText(): boolean;
}

/**
 * WP67-A 9.1: full text releases the visual step while its presentation stays.
 * The host retains this object until replacement/animation/owner cleanup.
 * Queue beforeNextMessage() before the next message; cancel() clears immediately.
 * This module does not own a Scene, input mapping, battle state or message queue.
 */
export class BriefMessageStep implements BattleSceneVisualStep {
  readonly kind = 'visual' as const;
  private readonly points: string[];
  private startedAt: number | null = null;
  private fullAt: number | null = null;
  private replacementAt: number | null = null;
  private visible = 0;
  private lastUpdate = -1;
  private phase: 'typing' | 'resident' | 'waiting' | 'done' = 'typing';
  private readonly replacement: BattleSceneVisualStep = {
    kind: 'visual',
    advance: now => this.advanceReplacement(now),
    cancel: () => this.cancel(),
  };

  constructor(text: string, private readonly ports: BriefMessagePorts, private readonly options?: BriefMessageOptions) {
    this.points = Array.from(text);
  }

  snapshot() {
    return { implementation: 'brief-message-v1', phase: this.phase, visible: this.visible,
      total: this.points.length, fullyShownAt: this.fullAt, replacementRequestedAt: this.replacementAt };
  }

  advance(now: number): boolean {
    if (this.phase === 'done') return true;
    if (!this.ports.current()) { this.cancel(); return true; }
    if (this.phase !== 'typing') return true;
    const update = this.ports.update();
    if (update === this.lastUpdate) return false;
    this.lastUpdate = update;
    const first = this.startedAt === null;
    if (first) this.startedAt = now;
    const input = !first && this.ports.useOrBack();
    // The existing presenter default is 30 ms per Unicode code point.
    const count = input || this.options?.instantText() ? this.points.length
      : Math.min(this.points.length, Math.floor((now - this.startedAt!) / 30));
    if (first || count !== this.visible) {
      this.visible = count;
      this.ports.paint(this.points.slice(0, count).join(''));
      if (!this.ownsPresentation()) { this.cancel(); return true; }
    }
    if (count !== this.points.length) return false;
    this.fullAt = now;
    this.phase = 'resident';
    return true; // No ordinary-message dwell, close or extra input at this boundary.
  }

  /** One stable gate per brief. Its first eligible update starts a fresh 1 s wait. */
  beforeNextMessage(): BattleSceneVisualStep { return this.replacement; }

  private ownsPresentation(): boolean { return this.phase !== 'done' && this.ports.current(); }

  private advanceReplacement(now: number): boolean {
    if (this.phase === 'done') return true;
    if (!this.ports.current()) { this.cancel(); return true; }
    if (this.fullAt === null) throw new Error('brief text must finish before replacement');
    const update = this.ports.update();
    if (update === this.lastUpdate) return false;
    this.lastUpdate = update;
    if (this.replacementAt === null) {
      this.replacementAt = now;
      this.phase = 'waiting';
    }
    // Time already spent resident during other work does not consume this wait.
    // USE/BACK does not turn a brief replacement wait into ordinary close input.
    if (now - this.replacementAt < 1000) return false;
    this.cancel();
    return true;
  }

  cancel(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.ports.close();
  }
}
