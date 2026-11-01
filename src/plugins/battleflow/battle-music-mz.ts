/* eslint-disable @typescript-eslint/no-explicit-any */
import { musicTrack } from './battle-music';
import type { BattleMusicPort, MusicTrack, MusicObservation, MusicLease, RawMusic } from './battle-music';

export interface MusicClock { now(): number; after(milliseconds: number, callback: () => void): unknown; clear(handle: unknown): void; }
/** Only this adapter accesses MZ's BGM registration/buffer pair. Preparation uses a private
 * buffer without autoplay. Publication uses the normal MZ channel and volume control, never
 * global SE/BGS/ME stop, master context teardown or loader hooks. Not installed in Scene yet. */
export function createBattleMusicMZ(G: any, nodeRequire: any, root: string, current: () => boolean,
  options: { clock?: MusicClock; defaultBgm?: RawMusic } = {}): BattleMusicPort {
  const audio = G.AudioManager, fs = nodeRequire('fs'), path = nodeRequire('path');
  const clock: MusicClock = options.clock ?? { now: () => G.performance.now(), after: (ms, cb) => G.setTimeout(cb, ms), clear: id => G.clearTimeout(id) };
  const override = options.defaultBgm === undefined ? null : musicTrack(options.defaultBgm);
  if (override && !override.name) throw new Error('invalid battle music default override');
  let expectedBuffer = audio?._bgmBuffer, expectedRecord = audio?._currentBgm, ordinal = 0;
  const pending = new Set<() => void>();
  const channelCurrent = () => audio?._bgmBuffer === expectedBuffer && audio?._currentBgm === expectedRecord;
  const owned = () => current() && channelCurrent();
  const inside = (parent: string, child: string) => { const relative = path.relative(parent, child); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
  const exists = (name: string): boolean => {
    if (!name || /[\u0000-\u001f\u007f\\:%?#]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('invalid battle music resource identity');
    const extension = audio.audioFileExt();
    if (typeof extension !== 'string' || !/^\.[a-z0-9]+$/i.test(extension)) throw new Error('invalid MZ audio extension');
    const encrypted = typeof G.Utils?.hasEncryptedAudio === 'function' ? G.Utils.hasEncryptedAudio() : G.Utils?.hasEncryptedAudio;
    const dir = path.join(root, 'audio', 'bgm'), file = path.join(dir, ...name.split('/')) + extension + (encrypted ? '_' : '');
    try {
      const realGame = fs.realpathSync(root), realDir = fs.realpathSync(dir), realFile = fs.realpathSync(file);
      if (!inside(realGame, realDir) || !inside(realDir, realFile)) throw new Error('battle music resource escapes audio directory');
      return fs.statSync(realFile).isFile();
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT' || (error as { code?: string }).code === 'ENOTDIR') return false;
      throw error;
    }
  };
  return {
    current: owned,
    currentTrack() { const track = audio?._currentBgm; return track && track.name ? musicTrack(track) : null; },
    position() { return audio?._bgmBuffer ? audio._bgmBuffer.seek() : 0; },
    request(logical: MusicTrack | null, position: number, terminal: boolean, observe: (row: MusicObservation) => void, valid: () => boolean = () => true): MusicLease {
      const id = ++ordinal;
      for (const cancel of [...pending]) cancel();
      let buffer: any = null, registration: any = null, timer: unknown, released = false, handedOff = false, finished = false;
      const state = (state: MusicObservation['state'], detail?: string) => observe({ state, ...(detail ? { detail } : {}) });
      const clear = () => { pending.delete(cancel); if (timer !== undefined) { clock.clear(timer); timer = undefined; } };
      const dispose = () => {
        if (!buffer) return;
        const value = buffer; buffer = null;
        // A newer caller may intentionally reuse the same buffer with a new record.
        if (audio._bgmBuffer === value && audio._currentBgm === registration) {
          audio._bgmBuffer = null; audio._currentBgm = null;
          if (expectedBuffer === value && expectedRecord === registration) { expectedBuffer = null; expectedRecord = null; }
        } else if (audio._bgmBuffer === value) return;
        value.destroy();
      };
      const cancel = () => { if (finished || released) return; released = true; clear(); dispose(); state('cancelled'); };
      const lease: MusicLease = { release() { if (handedOff || released) return; released = true; clear(); dispose(); if (!finished) state('cancelled'); } };
      const live = () => !released && id === ordinal && owned() && valid();
      try {
        if (!Number.isFinite(position) || position < 0 || typeof terminal !== 'boolean') throw new Error('invalid battle music playback request');
        if (!live()) { state('superseded'); return lease; }
        if (!logical && override) throw new Error('default BGM silent return requires the outer wrapper; not supported by this port batch');
        if (!logical) {
          if (terminal && audio?.stopBgm) { audio.stopBgm(); expectedBuffer = audio._bgmBuffer; expectedRecord = audio._currentBgm; }
          finished = true; handedOff = terminal; state('requested'); return lease;
        }
        const track = override ?? musicTrack(logical);
        if (!exists(track.name)) { finished = true; state('missing'); return lease; }
        if (!live()) { state('superseded'); return lease; }
        if (!audio?.createBuffer || !audio?.updateBufferParameters || !audio?.stopBgm) throw new Error('MZ BGM backend unavailable');
        buffer = audio.createBuffer('bgm/', track.name);
        if (!buffer || typeof buffer.addLoadListener !== 'function' || typeof buffer.isReady !== 'function' || typeof buffer.isError !== 'function') throw new Error('MZ BGM buffer unavailable');
        if (!live()) { lease.release(); return lease; }
        const began = clock.now(); if (!Number.isFinite(began)) throw new Error('invalid battle music clock');
        const end = (kind: 'failed' | 'timeout' | 'superseded', detail: string) => {
          if (finished || released) return;
          finished = true; clear();
          try { dispose(); } catch (cleanup) { detail += '; cleanup: ' + String(cleanup); }
          state(kind, detail);
        };
        const poll = () => {
          if (finished || released) return;
          try {
            if (timer !== undefined) { clock.clear(timer); timer = undefined; }
            if (!live()) { end('superseded', 'battle music owner or channel changed'); return; }
            const now = clock.now();
            if (!Number.isFinite(now) || now < began) throw new Error('battle music clock regressed');
            if (now - began >= 5000) { end('timeout', 'BGM decoding deadline'); return; }
            if (buffer.isError()) { end('failed', 'MZ BGM decoding failed'); return; }
            if (!buffer.isReady()) { timer = clock.after(Math.min(25, 5000 - (now - began)), poll); return; }
            audio.updateBufferParameters(buffer, audio.bgmVolume, track);
            if (!live()) { end('superseded', 'battle music owner changed during preparation'); return; }
            audio.stopBgm();
            if (!current() || !valid() || id !== ordinal) { end('superseded', 'battle music owner changed during channel handoff'); return; }
            // stopBgm is an external callback: do not overwrite any new channel it installed.
            if (audio._bgmBuffer || audio._currentBgm) { end('superseded', 'BGM channel replaced during handoff'); return; }
            expectedBuffer = buffer; audio._bgmBuffer = buffer;
            registration = { ...track, pos: position }; expectedRecord = registration; audio._currentBgm = registration;
            if (!audio._meBuffer) buffer.play(true, position);
            if (!live()) { end('superseded', 'battle music owner changed during play'); return; }
            finished = true; clear(); handedOff = terminal; state('requested');
          } catch (error) { end('failed', String(error instanceof Error ? error.message : error)); }
        };
        pending.add(cancel); state('loading');
        if (!live()) { cancel(); return lease; }
        buffer.addLoadListener(poll);
        // Cached resources may notify synchronously; a pending job always has a bounded independent timer.
        if (!finished && !released && timer === undefined) timer = clock.after(25, poll);
      } catch (error) {
        finished = true; clear();
        let detail = String(error instanceof Error ? error.message : error);
        try { dispose(); } catch (cleanup) { detail += '; cleanup: ' + String(cleanup); }
        state('failed', detail);
      }
      return lease;
    },
  };
}
