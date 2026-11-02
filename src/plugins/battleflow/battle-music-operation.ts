import { BattleMusicPlayback, musicTrack, savedWorldTrack } from './battle-music';
import type { BattleMusicConfig, BattleMusicPort, IntroMemory, MusicMemo, MusicTrack, RawMusic } from './battle-music';
import type { TrainerAudioFields } from './battle-audio-selection';

export interface MusicOwner { readonly app: unknown; readonly generation: number | undefined; }
export interface MusicSettings { readonly config: BattleMusicConfig; readonly defaultBgm?: MusicTrack; }
export interface MusicPreparation { readonly memo: MusicMemo | null; }
interface Entry {
  owner: MusicOwner; op: object | null; token: number; phase: 'intro' | 'battle' | 'return';
  memory: IntroMemory; port: BattleMusicPort | null; player: BattleMusicPlayback | null;
  settledFrame: number | null; error: string | null;
}
interface Ports {
  current(owner: MusicOwner, op: object | null): boolean;
  frame(): number;
  makePort(current: () => boolean, defaultBgm?: MusicTrack): BattleMusicPort;
}
const copyMemo = (memo: MusicMemo | null): MusicMemo | null => memo ? { track: memo.track ? savedWorldTrack(memo.track) : null, position: memo.position } : null;

/** A single host timeline. Return ownership survives Scene exit, never app/generation or op replacement. */
export class BattleMusicOperations {
  private entry: Entry | null = null;
  private sequence = 0;
  private last: ReturnType<BattleMusicOperations['view']> | null = null;
  constructor(private readonly ports: Ports) {}
  private current(e: Entry): boolean { return this.entry === e && this.ports.current(e.owner, e.op); }
  private frame(): number {
    const value = this.ports.frame();
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid battle music frame');
    return value;
  }
  private view(e: Entry) {
    return { version: 'battle-music-operation-v1' as const, token: e.token, phase: e.phase,
      generation: e.owner.generation ?? null, current: this.current(e) && !!e.port?.current(),
      settledFrame: e.settledFrame, error: e.error, player: e.player?.snapshot() ?? null };
  }
  snapshot() { return this.entry ? this.view(this.entry) : this.last ? { ...this.last, current: false,
    player: this.last.player ? { ...this.last.player, logical: this.last.player.logical ? { ...this.last.player.logical } : null,
      memo: copyMemo(this.last.player.memo), requests: this.last.player.requests.map(r => ({ ...r, logical: r.logical ? { ...r.logical } : null })) } : null } : null; }
  retire(): void {
    const e = this.entry; if (!e) return;
    this.entry = null; // retire before resource callbacks can reenter a successor
    e.player?.cancel(); this.last = this.view(e);
  }
  private take(owner: MusicOwner, requireIntroReady: boolean): MusicPreparation {
    const e = this.entry;
    if (e && e.owner.app === owner.app && e.owner.generation === owner.generation && this.current(e) && e.port?.current()) {
      if (requireIntroReady && e.phase === 'intro' && !this.introReady(e.token)) throw new Error('trainer-intro-not-ready');
      const last = e.player?.snapshot().requests.at(-1);
      const memo = e.phase === 'intro' || e.phase === 'return' && last?.state !== 'requested' ? copyMemo(e.memory.memo) : null;
      this.retire(); return Object.freeze({ memo });
    }
    this.retire(); return Object.freeze({ memo: null });
  }
  /** Called before openBattle publishes its op. A same-frame intro cannot be silently overwritten. */
  capture(owner: MusicOwner): MusicPreparation { return this.take(owner, true); }
  private create(owner: MusicOwner, op: object | null, phase: Entry['phase'], memo: MusicMemo | null, defaultBgm?: MusicTrack): Entry | null {
    if (!this.ports.current(owner, op)) return null;
    if (!Number.isSafeInteger(this.sequence + 1)) throw new Error('battle music token exhausted');
    const e: Entry = { owner: { ...owner }, op, phase, token: ++this.sequence,
      memory: { memo: copyMemo(memo), pending: null }, port: null, player: null, settledFrame: null, error: null };
    this.entry = e;
    try {
      const base = this.ports.makePort(() => this.current(e), defaultBgm);
      e.port = base;
      const port: BattleMusicPort = {
        current: () => this.current(e) && base.current(), currentTrack: () => base.currentTrack(), position: () => base.position(),
        request: (track, position, terminal, observe, valid) => base.request(track, position, terminal, row => {
          if (this.current(e) && e.phase === 'intro' && row.state !== 'loading') {
            try { e.settledFrame = this.frame(); } catch (error) { e.error = String(error); }
          }
          observe(row);
        }, valid),
      };
      e.player = new BattleMusicPlayback(port, e.memory);
      if (!this.current(e)) e.player.cancel();
    } catch (error) { e.error = String(error instanceof Error ? error.message : error); }
    return e;
  }
  intro(owner: MusicOwner, value: RawMusic | null | undefined, defaultBgm?: MusicTrack): number | null {
    if (value === null || value === undefined || !musicTrack(value).name) return null;
    this.frame(); // fail before changing music/memo when the host frame source is unusable
    const prepared = this.take(owner, false), e = this.create(owner, null, 'intro', prepared.memo, defaultBgm);
    e?.player?.intro(value); return e?.token ?? null;
  }
  introReady(token: number): boolean {
    const e = this.entry;
    if (!e || e.token !== token || e.phase !== 'intro' || !this.current(e) || e.port && !e.port.current()) return true;
    if (e.error) return true;
    const row = e.player?.snapshot().requests.at(-1);
    if (row?.state === 'loading') return false;
    if (e.settledFrame === null) { e.settledFrame = this.frame(); return false; }
    return this.frame() > e.settledFrame;
  }
  start(owner: MusicOwner, op: object, prepared: MusicPreparation, settings: MusicSettings, trainers?: readonly TrainerAudioFields[]): void {
    if (this.entry?.op === op && this.entry.phase === 'battle') return;
    this.retire();
    const e = this.create(owner, op, 'battle', prepared.memo, settings.defaultBgm);
    e?.player?.start(settings.config, trainers);
  }
  finish(op: object, normal: boolean): void {
    const e = this.entry; if (!e || e.op !== op) return;
    if (!normal || !this.current(e) || !e.port?.current()) { this.retire(); return; }
    if (e.phase === 'return') return;
    e.phase = 'return'; e.player?.restore();
  }
  victory(op: object, settings: MusicSettings, trainers?: readonly TrainerAudioFields[]): void {
    const e = this.entry;
    if (!e || e.op !== op || e.phase !== 'battle' || !this.current(e) || !e.port?.current()) return;
    e.player?.victory(settings.config, trainers);
  }
}
