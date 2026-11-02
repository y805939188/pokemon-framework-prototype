/* eslint-disable @typescript-eslint/no-explicit-any */
import { musicTrack, savedWorldTrack } from './battle-music';
import type { BattleMusicPort, MusicTrack, MusicObservation, MusicLease, RawMusic } from './battle-music';

export interface MusicClock { now(): number; after(milliseconds: number, callback: () => void): unknown; clear(handle: unknown): void; }
/** Only this adapter accesses MZ's BGM registration/buffer pair. Preparation uses a private
 * buffer without autoplay. Publication uses the normal MZ channel and volume control, never
 * global SE/BGS/ME stop, master context teardown or loader hooks. */
export function createBattleMusicMZ(G: any, nodeRequire: any, root: string, current: () => boolean,
  options: { clock?: MusicClock; defaultBgm?: RawMusic } = {}): BattleMusicPort {
  const audio = G.AudioManager, fs = nodeRequire('fs'), path = nodeRequire('path');
  const clock: MusicClock = options.clock ?? { now: () => G.performance.now(), after: (ms, cb) => G.setTimeout(cb, ms), clear: id => G.clearTimeout(id) };
  const override = options.defaultBgm === undefined ? null : musicTrack(options.defaultBgm);
  if (override && !override.name) throw new Error('invalid battle music default override');
  let expectedBuffer = audio?._bgmBuffer, expectedRecord = audio?._currentBgm, expectedSequence = audio?._bgmSequence, expectedPending = audio?._pendingBgmSequence, ordinal = 0;
  let transferPublished: (() => void) | null = null;
  const pending = new Set<() => void>();
  const channelCurrent = () => audio?._bgmBuffer === expectedBuffer && audio?._currentBgm === expectedRecord && audio?._bgmSequence === expectedSequence && audio?._pendingBgmSequence === expectedPending;
  const owned = () => current() && channelCurrent();
  const stopOwnedChannel = (): boolean => {
    const beforeBuffer = audio._bgmBuffer, beforeRecord = audio._currentBgm;
    audio.stopBgm();
    // MZ only clears the registration when a buffer exists. Its unchanged,
    // bufferless "BGM: None" record is not a successor installed by stopBgm.
    // A retained buffer or a newly installed record must still block handoff.
    return !audio._bgmSequence && !audio._pendingBgmSequence && !audio._bgmBuffer && (!audio._currentBgm || (!beforeBuffer && beforeRecord?.name === '' && audio._currentBgm === beforeRecord));
  };
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
    currentTrack() { const track = audio?._bgmSequence || audio?._pendingBgmSequence ? audio.saveBgm() : audio?._currentBgm; return track && (track.name || track.sequence !== undefined) ? savedWorldTrack(track) : null; },
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
        if (!logical && terminal && override) {
          // WP15 default override suppresses host stop. Transfer any still-owned
          // default output to the world instead of destroying it during Scene cleanup.
          transferPublished?.(); finished = true; handedOff = true;
          state('requested', 'default BGM suppresses silent return stop'); return lease;
        }
        if (!logical) {
          if (terminal && audio?.stopBgm) {
            const stopped = stopOwnedChannel();
            if (!current() || !valid() || id !== ordinal || !stopped) {
              finished = true; state('superseded', 'BGM owner or channel changed during silent return'); return lease;
            }
            audio._currentBgm = null;
            expectedBuffer = audio._bgmBuffer; expectedRecord = audio._currentBgm; expectedSequence = audio._bgmSequence; expectedPending = audio._pendingBgmSequence;
          }
          finished = true; handedOff = terminal; state('requested'); return lease;
        }
        const track = override ?? (terminal ? savedWorldTrack(logical) : musicTrack(logical));
        if (track.sequence !== undefined) {
          if (!terminal || typeof audio.playBgm !== 'function' || typeof audio._advanceBgmSequence !== 'function' || typeof audio._startBgmSequenceTrack !== 'function' || typeof audio.stopBgmSequence !== 'function') throw new Error('saved world sequence restore backend unavailable');
          const stopped = stopOwnedChannel();
          if (!current() || !valid() || id !== ordinal || !stopped) { finished = true; state('superseded', 'sequence return owner/channel changed'); return lease; }
          expectedBuffer = audio._bgmBuffer; expectedRecord = audio._currentBgm; expectedSequence = audio._bgmSequence; expectedPending = audio._pendingBgmSequence;
          const oldStop = audio.stopBgm, oldAdvance = audio._advanceBgmSequence, oldCreate = audio.createBuffer, oldPlay = audio.playBgm, oldTrack = audio._startBgmSequenceTrack;
          const allocated = new Set<any>();
          let created: any = null, stopping = false, advancing = 0, playDepth = 0, captureNext = false;
          const lost = () => !current() || !valid() || id !== ordinal;
          const interrupted = new Error('sequence return interrupted');
          const stop = function (this: any, ...args: any[]) {
            if (stopping || advancing || playDepth > 1) return oldStop.apply(this, args); // a genuine nested successor uses the native operation
            stopping = true; let value;
            try { value = oldStop.apply(this, args); } finally { stopping = false; }
            if (lost() || audio._bgmBuffer || audio._currentBgm || audio._bgmSequence || audio._pendingBgmSequence) throw interrupted;
            return value;
          };
          const advance = function (this: any, ...args: any[]) {
            if (playDepth === 1) created ??= this._bgmSequence;
            if (this._bgmSequence === created && lost()) throw interrupted;
            advancing++; try { return oldAdvance.apply(this, args); } finally { advancing--; }
          };
          const create = function (this: any, ...args: any[]) {
            const ours = captureNext; captureNext = false;
            const value = oldCreate.apply(this, args); if (ours) allocated.add(value); return value;
          };
          const play = function (this: any, ...args: any[]) { playDepth++; try { return oldPlay.apply(this, args); } finally { playDepth--; } };
          const startTrack = function (this: any, state: any, ...args: any[]) {
            const previous = captureNext; captureNext = !!created && state === created;
            try { return oldTrack.call(this, state, ...args); } finally { captureNext = previous; }
          };
          const retireCreated = () => {
            if (!created) return;
            if (audio._bgmSequence === created) audio.stopBgmSequence();
            const foreign = audio._bgmSequence;
            for (const value of new Set([...allocated, ...created.buffers, ...(created.retiring ?? []).map((r: any) => r.buffer)])) {
              if (value === audio._bgmBuffer || value === audio._meBuffer || foreign?.buffers?.includes(value) || foreign?.retiring?.some((r: any) => r.buffer === value)) continue;
              if (!value._rrRetired) audio._destroyBgmSequenceBuffer(value);
            }
          };
          let failure: unknown, failed = false;
          audio.stopBgm = stop; audio._advanceBgmSequence = advance; audio.createBuffer = create; audio.playBgm = play; audio._startBgmSequenceTrack = startTrack;
          try { audio.playBgm({ ...track, pos: position }, position); }
          catch (error) { failed = true; failure = error; }
          finally { if (audio.stopBgm === stop) audio.stopBgm = oldStop; if (audio._advanceBgmSequence === advance) audio._advanceBgmSequence = oldAdvance; if (audio.createBuffer === create) audio.createBuffer = oldCreate; if (audio.playBgm === play) audio.playBgm = oldPlay; if (audio._startBgmSequenceTrack === startTrack) audio._startBgmSequenceTrack = oldTrack; }
          if (failed || lost()) {
            // Only the state actually created by this call may be retired.
            retireCreated();
            finished = true; state(failure === interrupted || lost() ? 'superseded' : 'failed', String(failure ?? 'sequence return owner changed')); return lease;
          }
          const saved = audio.saveBgm();
          if (saved.sequence !== track.sequence || created && audio._bgmSequence !== created) { retireCreated(); finished = true; state('superseded', 'host sequence successor or definition changed'); return lease; }
          expectedBuffer = audio._bgmBuffer; expectedRecord = audio._currentBgm; expectedSequence = audio._bgmSequence; expectedPending = audio._pendingBgmSequence;
          finished = true; handedOff = true; state('requested', 'host world sequence restarted/deferred; native looped flag preserved'); return lease;
        }
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
            const stopped = stopOwnedChannel();
            if (!current() || !valid() || id !== ordinal) { end('superseded', 'battle music owner changed during channel handoff'); return; }
            // stopBgm is an external callback: do not overwrite any new channel it installed.
            if (!stopped) { end('superseded', 'BGM channel replaced during handoff'); return; }
            expectedSequence = audio._bgmSequence; expectedPending = audio._pendingBgmSequence;
            expectedBuffer = buffer; audio._bgmBuffer = buffer;
            registration = { ...track, pos: position }; expectedRecord = registration; audio._currentBgm = registration;
            if (!audio._meBuffer) buffer.play(true, position);
            if (!live()) { end('superseded', 'battle music owner changed during play'); return; }
            finished = true; clear(); handedOff = terminal;
            transferPublished = () => { if (audio._bgmBuffer === buffer && audio._currentBgm === registration) handedOff = true; };
            state('requested');
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
