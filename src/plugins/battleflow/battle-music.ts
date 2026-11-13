import { selectBattleAudio } from './battle-audio-selection';
import type { BattleAudioContext, BattleAudioMetadata, TrainerAudioFields } from './battle-audio-selection';

/** Internal request DTOs. No audio backend, timer, application or save state in this module. */
export interface MusicTrack { readonly name: string; readonly volume: number; readonly pitch: number; readonly pan: number; readonly sequence?: number | string; readonly looped?: true; }
export type RawMusic = string | { readonly name: string; readonly volume?: number; readonly pitch?: number; readonly pan?: number };
export interface MusicMemo { track: MusicTrack | null; position: number; }
export interface IntroMemory {
  memo: MusicMemo | null;
  pending: { readonly track: MusicTrack; cancel(): void } | null;
}
export type MusicStatus = 'loading' | 'requested' | 'missing' | 'failed' | 'timeout' | 'cancelled' | 'superseded';
export interface MusicObservation { state: MusicStatus; detail?: string; }
export interface MusicLease { release(): void; }
export interface BattleMusicPort {
  current(): boolean;
  currentTrack(): MusicTrack | null;
  position(): number;
  /** terminal transfers a successfully started return track to the world owner. */
  request(track: MusicTrack | null, position: number, terminal: boolean, observe: (row: MusicObservation) => void, valid?: () => boolean): MusicLease;
}
export interface BattleMusicConfig {
  readonly context: BattleAudioContext;
  readonly presets: Readonly<Partial<Record<'battle' | 'victory' | 'capture', MusicTrack>>>;
}
const object = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('invalid battle music record');
  return x as Record<string, unknown>;
};
const number = (x: unknown, fallback: number, label: string): number => {
  if (x === undefined) x = fallback;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new Error('invalid battle music ' + label);
  return x;
};
/** WP15: parsed preset records keep embedded parameters; ordinary string playback defaults to 100/100. */
export function musicTrack(value: RawMusic, parseStringParameters = false): MusicTrack {
  const string = typeof value === 'string', raw = string ? null : object(value);
  const text = string ? value : raw!.name;
  if (typeof text !== 'string') throw new Error('invalid battle music name');
  let name = text, volume = 100, pitch = 100;
  if (string) {
    const parts = text.split(':');
    if (parts.length > 3 || parts.slice(1).some(x => !/^\d+(?:\.\d+)?$/.test(x))) throw new Error('invalid battle music parameters');
    name = parts[0];
    if (parseStringParameters) { volume = Number(parts[1] ?? 100); pitch = Number(parts[2] ?? 100); }
  }
  const pan = raw?.pan ?? 0;
  if (typeof pan !== 'number' || !Number.isFinite(pan) || pan < -100 || pan > 100) throw new Error('invalid battle music pan');
  return Object.freeze({ name, volume: number(raw?.volume, volume, 'volume'), pitch: number(raw?.pitch, pitch, 'pitch'), pan });
}
/** Copy a host world memo without admitting sequence fields to author presets. */
export function savedWorldTrack(value: RawMusic | MusicTrack): MusicTrack {
  const plain = musicTrack(value), raw = typeof value === 'string' ? null : object(value);
  const sequence = raw?.sequence;
  if (sequence !== undefined && !(typeof sequence === 'number' && Number.isSafeInteger(sequence) && sequence > 0 ||
      typeof sequence === 'string' && /^library:\d+$/.test(sequence) && Number(sequence.slice(8)) > 0 && Number.isSafeInteger(Number(sequence.slice(8))))) throw new Error('invalid battle music sequence');
  if (sequence !== undefined && raw?.looped !== undefined && typeof raw.looped !== 'boolean') throw new Error('invalid battle music sequence looped');
  return Object.freeze({ ...plain, ...(sequence === undefined ? {} : { sequence: sequence as number | string, ...(raw?.looped === true ? { looped: true as const } : {}) }) });
}
/** Author-provided metadata, not inferred map/terrain information. Snapshot only, no preset consumption. */
export function battleMusicConfig(value: unknown = {}): BattleMusicConfig {
  const raw = object(value), presets: Partial<Record<'battle' | 'victory' | 'capture', MusicTrack>> = {};
  const names: Partial<Record<'battle' | 'victory' | 'capture', string>> = {};
  if (raw.presets !== undefined && raw.presets !== null) {
    const source = object(raw.presets);
    for (const slot of ['battle', 'victory', 'capture'] as const) {
      const value = source[slot]; if (value === undefined || value === null) continue;
      const track = musicTrack(value as RawMusic, true);
      if (track.name) { presets[slot] = track; names[slot] = track.name; }
    }
  }
  const metadata = (value: unknown): Readonly<BattleAudioMetadata> => {
    const source = object(value), result: Record<string, string | null> = {};
    for (const key of ['wildBattle', 'wildVictory', 'wildCapture', 'trainerBattle', 'trainerVictory']) {
      const value = source[key]; if (value === undefined) continue;
      if (value !== null && typeof value !== 'string') throw new Error('invalid battle music metadata');
      result[key] = value;
    }
    return Object.freeze(result);
  };
  const map = raw.map === null || raw.map === undefined ? null : metadata(raw.map);
  return Object.freeze({ context: Object.freeze({ presets: Object.freeze(names), map, global: metadata(raw.global ?? {}) }), presets: Object.freeze(presets) });
}

/** Owns requests within one host operation. The caller supplies the op/generation guard,
 * including the return phase after Scene exit; it must retire this instance on replacement.
 * This is not the general WP15 mutable 247/248 memo API or the WP16 world transition wrapper. */
export class BattleMusicPlayback {
  private closed = false;
  private restoring = false;
  private started = false;
  private victoryStarted = false;
  private entering = false;
  private readonly leases: MusicLease[] = [];
  private readonly rows: { kind: string; logical: MusicTrack | null; position: number; state: MusicStatus; detail?: string }[] = [];
  private logical: MusicTrack | null = null;
  constructor(private readonly port: BattleMusicPort, private readonly memory: IntroMemory = { memo: null, pending: null }) {}
  private live(): boolean { return !this.closed && this.port.current(); }
  private remember(): boolean {
    if (!this.live()) return false;
    if (this.memory.memo) return true;
    const pending = this.memory.pending;
    if (pending) {
      const track = savedWorldTrack(pending.track);
      pending.cancel();
      if (!this.live()) return false;
      this.memory.pending = null;
      this.memory.memo = { track, position: 0 };
    } else {
      const track = this.port.currentTrack(); if (!this.live()) return false;
      let position = 0;
      try { position = this.port.position(); } catch { /* only the position query has the formal zero fallback */ }
      if (!this.live()) return false;
      if (!Number.isFinite(position) || position < 0) throw new Error('invalid battle music position');
      this.memory.memo = { track: track ? savedWorldTrack(track) : null, position };
    }
    return this.live();
  }
  private deliver(kind: string, track: MusicTrack | null, position = 0, terminal = false): void {
    if (!this.live()) return;
    const row = { kind, logical: track, position, state: 'loading' as MusicStatus, detail: undefined as string | undefined };
    this.rows.push(row); if (this.rows.length > 64) this.rows.shift();
    this.logical = track;
    try {
      const lease = this.port.request(track, position, terminal, observation => {
        row.state = observation.state; row.detail = observation.detail;
      }, () => !this.closed); // port itself owns op/channel checks, including its handoff critical section
      if (!this.live()) { try { lease.release(); } finally { this.cancel(); } }
      else this.leases.push(lease);
    } catch (error) { row.state = 'failed'; row.detail = String(error instanceof Error ? error.message : error); }
  }
  intro(value: RawMusic | null | undefined): void {
    if (this.entering || !this.live() || this.restoring || value === undefined || value === null) return;
    this.entering = true;
    try {
      const track = musicTrack(value); if (!track.name) return;
      if (this.remember()) this.deliver('intro', track);
    } finally { this.entering = false; }
  }
  start(config: BattleMusicConfig, trainers?: readonly TrainerAudioFields[]): void {
    if (this.entering || !this.live() || this.restoring || this.started) return;
    this.entering = true;
    try {
      const choice = trainers === undefined ? selectBattleAudio({ entry: 'wild-battle', context: config.context })
        : selectBattleAudio({ entry: 'trainer-battle', context: config.context, trainers });
      const track = choice.origin === 'preset' ? config.presets.battle! : musicTrack(choice.logicalName);
      if (!this.remember()) return;
      this.started = true; this.deliver('battle', track);
    } finally { this.entering = false; }
  }
  /** A presentation cue within the same battle owner; never memorize the battle song as the world. */
  victory(config: BattleMusicConfig, trainers?: readonly TrainerAudioFields[]): void {
    if (this.entering || !this.live() || this.restoring || !this.started || this.victoryStarted) return;
    this.entering = true;
    try {
      const choice = trainers === undefined ? selectBattleAudio({ entry: 'wild-victory', context: config.context })
        : selectBattleAudio({ entry: 'trainer-victory', context: config.context, trainers });
      const track = choice.origin === 'preset' ? config.presets.victory! : musicTrack(choice.logicalName);
      this.victoryStarted = true; this.deliver('victory', track);
    } finally { this.entering = false; }
  }
  /** Normal return only. Does not erase shared next-battle presets or claim the WP16 wrapper is complete. */
  restore(): void {
    if (this.entering || !this.live() || this.restoring || !this.memory.memo) return;
    const memo = this.memory.memo; this.restoring = true;
    this.deliver('return', memo.track, memo.position, true);
  }
  cancel(): void {
    if (this.closed) return; this.closed = true;
    for (const lease of this.leases.splice(0)) {
      try { lease.release(); } catch (error) {
        this.rows.push({ kind: 'cleanup', logical: null, position: 0, state: 'failed', detail: String(error) });
        if (this.rows.length > 64) this.rows.shift();
      }
    }
  }
  snapshot() {
    return { version: 'battle-music-playback-v1' as const, closed: this.closed, restoring: this.restoring, started: this.started, victoryStarted: this.victoryStarted,
      logical: this.logical ? { ...this.logical } : null,
      memo: this.memory.memo ? { track: this.memory.memo.track ? { ...this.memory.memo.track } : null, position: this.memory.memo.position } : null,
      pending: !!this.memory.pending, requests: this.rows.map(row => ({ ...row, logical: row.logical ? { ...row.logical } : null })) };
  }
}
