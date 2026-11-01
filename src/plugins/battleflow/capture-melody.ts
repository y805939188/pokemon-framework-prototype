import { selectBattleAudio } from './battle-audio-selection';
import type { BattleAudioSelection } from './battle-audio-selection';
import { musicTrack } from './battle-music';
import type { BattleMusicConfig, MusicTrack } from './battle-music';

/** WP67-A 8.1/9.3: a logical melody phase, independent of media availability. */
export const CAPTURE_ME_WAIT_MS = 3500;
export interface CaptureMelodyPlan {
  readonly version: 'capture-melody-plan-v1';
  readonly channel: 'me';
  readonly track: MusicTrack;
  readonly selection: Readonly<BattleAudioSelection>;
  readonly waitMs: typeof CAPTURE_ME_WAIT_MS;
}

/** Called only for a confirmed successful capture. No selection/preset consumption for trainers. */
export function captureMelodyPlan(kind: 'wild' | 'trainer', config: BattleMusicConfig): CaptureMelodyPlan | null {
  if (kind !== 'wild' && kind !== 'trainer') throw new Error('invalid capture melody battle kind');
  if (kind === 'trainer') return null;
  const selected = selectBattleAudio({ entry: 'wild-capture', context: config.context });
  const track = selected.origin === 'preset' ? musicTrack(config.presets.capture!) : musicTrack(selected.logicalName);
  return Object.freeze({ version: 'capture-melody-plan-v1', channel: 'me', track,
    selection: Object.freeze({ ...selected }), waitMs: CAPTURE_ME_WAIT_MS });
}

export type CaptureMelodyPhase = 'idle' | 'waiting' | 'stopping' | 'done' | 'cancelled';
export interface CaptureMelodyView {
  version: 'capture-melody-wait-v1'; phase: CaptureMelodyPhase;
  busy: boolean; playAllowed: boolean; stopRequired: boolean;
  elapsedMs: number; remainingMs: number;
}

/** No clock/timer/backend of its own. The host begins after the Gotcha brief,
 * before issuing its ME request, even if the resource is missing. A late decode
 * must advance with current time and then recheck playAllowed. Normal completion requires explicit stop acknowledgement;
 * polling never consumes the stop requirement. Host owner/lease checks are a later adapter. */
export class CaptureMelodyWait {
  private phase: CaptureMelodyPhase = 'idle';
  private startedAt: number | null = null;
  private last: number | null = null;
  private stopRequired = false;
  private checked(now: number): number {
    if (typeof now !== 'number' || !Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER ||
        this.last !== null && now < this.last) throw new Error('invalid capture melody monotonic time');
    return now;
  }
  begin(now: number): CaptureMelodyView {
    const value = this.checked(now);
    if (this.phase !== 'idle') return this.advance(value);
    if (value > Number.MAX_SAFE_INTEGER - CAPTURE_ME_WAIT_MS) throw new Error('invalid capture melody deadline');
    this.startedAt = value; this.last = value; this.phase = 'waiting';
    return this.snapshot();
  }
  advance(now: number): CaptureMelodyView {
    const value = this.checked(now);
    if (this.phase !== 'waiting' && this.phase !== 'stopping') return this.snapshot();
    this.last = value;
    if (this.phase === 'waiting' && value - this.startedAt! >= CAPTURE_ME_WAIT_MS) {
      this.phase = 'stopping'; this.stopRequired = true;
    }
    return this.snapshot();
  }
  /** Retires display/audio permission, not a domain abort or a release of the root save lock. */
  cancel(): CaptureMelodyView {
    if (this.phase === 'done' || this.phase === 'cancelled') return this.snapshot();
    this.stopRequired = this.phase !== 'idle'; this.phase = 'cancelled';
    return this.snapshot();
  }
  /** Only after the host has stopped/released this stage's own handle (or it never existed). */
  acknowledgeStop(): CaptureMelodyView {
    if (this.phase === 'idle' || this.phase === 'waiting') throw new Error('capture melody stop is not due');
    this.stopRequired = false;
    if (this.phase === 'stopping') this.phase = 'done';
    return this.snapshot();
  }
  snapshot(): CaptureMelodyView {
    const elapsedMs = this.startedAt === null ? 0 : Math.min(CAPTURE_ME_WAIT_MS, this.last! - this.startedAt);
    return { version: 'capture-melody-wait-v1', phase: this.phase,
      busy: this.phase === 'waiting' || this.phase === 'stopping', playAllowed: this.phase === 'waiting',
      stopRequired: this.stopRequired, elapsedMs,
      remainingMs: this.phase === 'cancelled' || this.phase === 'done' ? 0 : CAPTURE_ME_WAIT_MS - elapsedMs };
  }
}
