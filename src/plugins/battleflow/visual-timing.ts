/** D2 display-only clocks. Inputs are already published values, never a session or persisted state. */
export type HpColour = 'red' | 'yellow' | 'green';
const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`invalid ${label}`);
  return value;
};
const identity = (value: string): string => {
  if (typeof value !== 'string' || !value.length) throw new Error('missing display identity');
  return value;
};
function totalHp(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('invalid total HP');
  return value;
}
export function hpColour(displayHp: number, total: number): HpColour {
  totalHp(total); finite(displayHp, 'display HP');
  if (displayHp > total) throw new Error('display HP exceeds total');
  return displayHp <= Math.floor(total / 4) ? 'red' : displayHp <= Math.floor(total / 2) ? 'yellow' : 'green';
}
export function pictureUnitsToMilliseconds(units: number): number {
  const result = finite(units, 'picture units') * 50;
  if (!Number.isFinite(result)) throw new Error('picture duration overflow');
  return result;
}
class DisplayClock {
  private origin: number | null = null;
  private previous: number | null = null;
  elapsed(now: number): number {
    finite(now, 'monotonic clock');
    if (this.previous !== null && now < this.previous) throw new Error('display clock moved backwards');
    this.origin ??= now; this.previous = now;
    return now - this.origin;
  }
}

export interface HpFrame {
  memberId: string; value: number; total: number; colour: HpColour; complete: boolean; cancelled: boolean;
}
export class HpPresentation {
  private readonly clock = new DisplayClock();
  private readonly id: string;
  private readonly from: number;
  private readonly to: number;
  private readonly total: number;
  private value: number;
  private cancelled = false;
  constructor(input: { memberId: string; from: number; to: number; total: number }) {
    this.id = identity(input.memberId); this.total = totalHp(input.total);
    hpColour(input.from, input.total); hpColour(input.to, input.total);
    this.from = input.from; this.to = input.to; this.value = this.from;
  }
  sample(now: number): HpFrame {
    const elapsed = this.clock.elapsed(now);
    const progress = this.from === this.to ? 1 : Math.min(1, elapsed / 1000);
    if (!this.cancelled) this.value = this.from + (this.to - this.from) * progress;
    return { memberId: this.id, value: this.value, total: this.total, colour: hpColour(this.value, this.total), complete: this.cancelled || progress === 1, cancelled: this.cancelled };
  }
  cancel(): void { this.cancelled = true; }
}

export interface ExperienceFrame {
  memberId: string; level: number; ratio: number; phase: 'bar' | 'flash' | 'done';
  complete: boolean; cancelled: boolean; cues: ('exp-gain' | 'exp-full')[];
}
/** One supplied level segment. The caller supplies further levels/learning; no growth calculation lives here. */
export class ExperiencePresentation {
  private readonly clock = new DisplayClock();
  private readonly id: string;
  private readonly level: number;
  private readonly from: number;
  private readonly to: number;
  private readonly duration: number;
  private readonly flash: boolean;
  private gainSent = false;
  private fullSent = false;
  private cancelled = false;
  private ratio: number;
  constructor(input: { memberId: string; level: number; from: number; to: number; visible: boolean }) {
    this.id = identity(input.memberId);
    if (!Number.isSafeInteger(input.level) || input.level < 1) throw new Error('invalid display level');
    if (typeof input.visible !== 'boolean') throw new Error('invalid experience visibility');
    finite(input.from, 'experience fraction'); finite(input.to, 'experience fraction');
    if (input.from > input.to || input.to > 1) throw new Error('invalid experience interval');
    this.level = input.level; this.from = input.from; this.to = input.to;
    this.duration = input.visible ? (input.to - input.from) * 1750 : 0;
    this.flash = this.duration > 0 && input.to === 1;
    this.ratio = input.from;
  }
  sample(now: number): ExperienceFrame {
    const elapsed = this.clock.elapsed(now), cues: ExperienceFrame['cues'] = [];
    if (this.cancelled) return { memberId: this.id, level: this.level, ratio: this.ratio, phase: 'done', complete: true, cancelled: true, cues };
    if (this.duration > 0 && !this.gainSent) { this.gainSent = true; cues.push('exp-gain'); }
    const progress = this.duration === 0 ? 1 : Math.min(1, elapsed / this.duration);
    this.ratio = this.from + (this.to - this.from) * progress;
    if (this.flash && elapsed >= this.duration && !this.fullSent) { this.fullSent = true; cues.push('exp-full'); }
    const complete = elapsed >= this.duration + (this.flash ? 200 : 0);
    return { memberId: this.id, level: this.level, ratio: this.ratio,
      phase: complete ? 'done' : this.flash && elapsed >= this.duration ? 'flash' : 'bar', complete, cancelled: false, cues };
  }
  cancel(): void { this.cancelled = true; }
}

export type BasicPictureKind = 'send-out' | 'recall' | 'faint' | 'capture' | 'blocked-ball' | 'move-effect';
export interface PictureTrackInput { id: string; kind: BasicPictureKind; startUnits: number; durationUnits: number; }
export interface PictureFrame { id: string; kind: BasicPictureKind; progress: number; started: boolean; complete: boolean; }
/** Only the parallel picture consumer uses WP67-A's next-update completion observation. */
export class BasicPictureGroup {
  private readonly clock = new DisplayClock();
  private readonly tracks: { id: string; kind: BasicPictureKind; start: number; duration: number }[];
  private observedEnded = false;
  private cancelled = false;
  constructor(inputs: readonly PictureTrackInput[], effects: boolean) {
    if (typeof effects !== 'boolean') throw new Error('invalid battle effects flag');
    const ids = new Set<string>();
    this.tracks = inputs.map(input => {
      const id = identity(input.id);
      if (ids.has(id)) throw new Error('duplicate picture identity'); ids.add(id);
      if (!['send-out', 'recall', 'faint', 'capture', 'blocked-ball', 'move-effect'].includes(input.kind)) throw new Error('invalid basic picture kind');
      return { id, kind: input.kind, start: pictureUnitsToMilliseconds(input.startUnits), duration: pictureUnitsToMilliseconds(input.durationUnits) };
    }).filter(input => effects || input.kind !== 'move-effect');
    if (this.tracks.some(input => !Number.isFinite(input.start + input.duration))) throw new Error('picture end overflow');
  }
  sample(now: number): { frames: PictureFrame[]; complete: boolean; cancelled: boolean } {
    const elapsed = this.clock.elapsed(now);
    if (this.cancelled) return { frames: [], complete: true, cancelled: true };
    const frames = this.tracks.map(track => {
      const started = elapsed >= track.start;
      const progress = !started ? 0 : track.duration === 0 ? 1 : Math.min(1, (elapsed - track.start) / track.duration);
      return { id: track.id, kind: track.kind, progress, started, complete: started && progress === 1 };
    });
    const allEnded = frames.every(frame => frame.complete);
    const complete = this.tracks.length === 0 || this.observedEnded;
    this.observedEnded = allEnded;
    return { frames, complete, cancelled: false };
  }
  cancel(): void { this.cancelled = true; }
}
