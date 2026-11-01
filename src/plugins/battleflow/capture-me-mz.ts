/* eslint-disable @typescript-eslint/no-explicit-any */
import { CAPTURE_ME_WAIT_MS } from './capture-melody';
import { musicTrack } from './battle-music';
import type { MusicTrack } from './battle-music';
import type { MusicClock } from './battle-music-mz';

export type CaptureMEStatus = 'loading' | 'playing' | 'ended' | 'missing' | 'failed' | 'timeout' | 'stopped' | 'cancelled' | 'superseded';
export interface CaptureMEView {
  version: 'capture-me-mz-v1'; status: CaptureMEStatus; track: MusicTrack;
  phaseStartedAt: number; deadline: number; deadlineReached: boolean; playRequestedAt: number | null;
  retired: boolean; stopConfirmed: boolean; fault: string | null; errors: string[];
}
export interface CaptureMELease { snapshot(): CaptureMEView; release(): CaptureMEView; }
// MZ has no ME registration object. An internal claim also distinguishes sibling
// adapters that deliberately reuse a buffer. Ordinary external MZ ME uses fresh buffers.
const claims = new WeakMap<object, { buffer: any; token: object }>();

/** Internal adapter, not a Scene or capture authority. Private decode; one request
 * per phase; actual deadline and owner checked again before every publication.
 * It never owns/destroys BGM, stops global SE/BGS, or closes shared audio context. */
export function createCaptureMEMZ(G: any, nodeRequire: any, root: string, current: () => boolean,
  clock: MusicClock = { now: () => G.performance.now(), after: (ms, fn) => G.setTimeout(fn, ms), clear: id => G.clearTimeout(id) }) {
  const audio = G.AudioManager, fs = nodeRequire('fs'), path = nodeRequire('path');
  if (!audio || (typeof audio !== 'object' && typeof audio !== 'function')) throw new Error('MZ ME backend unavailable');
  let sequence = 0;
  const pending = new Set<CaptureMELease>();
  const inside = (parent: string, file: string): boolean => { const r = path.relative(parent, file); return r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
  const exists = (name: string): boolean => {
    if (!name || /[\u0000-\u001f\u007f\\:%?#]/.test(name) || name.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('invalid capture ME resource identity');
    const ext = audio.audioFileExt(); if (typeof ext !== 'string' || !/^\.[a-z0-9]+$/i.test(ext)) throw new Error('invalid MZ ME extension');
    const encrypted = typeof G.Utils?.hasEncryptedAudio === 'function' ? G.Utils.hasEncryptedAudio() : G.Utils?.hasEncryptedAudio;
    const dir = path.join(root, 'audio/me'), file = path.join(dir, ...name.split('/')) + ext + (encrypted ? '_' : '');
    try {
      const base = fs.realpathSync(root), realDir = fs.realpathSync(dir), real = fs.realpathSync(file);
      if (!inside(base, realDir) || !inside(realDir, real)) throw new Error('capture ME resource escapes audio/me');
      return fs.statSync(real).isFile();
    } catch (error: any) { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false; throw error; }
  };
  return {
    request(raw: MusicTrack, phaseStartedAt: number): CaptureMELease {
      const track = musicTrack(raw);
      const start = clock.now();
      if (!Number.isFinite(start) || start < 0 || start > Number.MAX_SAFE_INTEGER || !Number.isFinite(phaseStartedAt) || phaseStartedAt < 0 ||
          phaseStartedAt > start || phaseStartedAt > Number.MAX_SAFE_INTEGER - CAPTURE_ME_WAIT_MS) throw new Error('invalid capture ME phase clock');
      const deadline = phaseStartedAt + CAPTURE_ME_WAIT_MS, id = ++sequence, token = {};
      let status: CaptureMEStatus = 'loading', buffer: any = null, expected: any = null, published = false;
      let timer: unknown, retired = false, naturalEnded = false, destroying = false, stopConfirmed = true;
      let displaced: any = null, resumeOwed = false;
      let last = start, playRequestedAt: number | null = null, deadlineReached = false, fault: string | null = null;
      const errors: string[] = [];
      const diagnostic = (error: unknown) => { if (errors.length < 32) errors.push(String(error instanceof Error ? error.message : error)); };
      const clear = () => { if (timer !== undefined) { const value = timer; timer = undefined; clock.clear(value); } };
      const snapshot = (): CaptureMEView => ({ version: 'capture-me-mz-v1', status, track: { ...track }, phaseStartedAt, deadline,
        deadlineReached, playRequestedAt, retired, stopConfirmed: stopConfirmed && fault === null, fault, errors: [...errors] });
      const now = () => { const value = clock.now(); if (!Number.isFinite(value) || value < last || value > Number.MAX_SAFE_INTEGER) throw new Error('capture ME clock regressed or invalid'); last = value; return value; };
      const sameChannel = () => {
        if (!published && expected && !audio._meBuffer) expected = null; // preceding ME ended/cleared; no successor to overwrite
        return !published ? audio._meBuffer === expected : audio._meBuffer === buffer && claims.get(audio)?.token === token;
      };
      const owner = () => { try { return current(); } catch (error) { fault ??= 'ME owner check failed: ' + String(error); throw error; } };
      const live = () => !retired && id === sequence && owner() && (status !== 'loading' && status !== 'playing' || sameChannel());
      const resumeBGM = () => {
        if (audio._meBuffer) return;
        if (audio._bgmSequence) { audio._duckBgmSequence(1); if (audio._meBuffer) return; }
        const bgm = audio._bgmBuffer, record = audio._currentBgm;
        if (bgm && record && !bgm.isPlaying() && !audio._meBuffer && audio._bgmBuffer === bgm && audio._currentBgm === record) {
          bgm.play(true, record.pos);
          if (!audio._meBuffer && audio._bgmBuffer === bgm && audio._currentBgm === record) bgm.fadeIn(audio._replayFadeTime);
        }
      };
      const cleanup = () => {
        if (!buffer || destroying) return;
        const value = buffer, claim = claims.get(audio);
        if (claim && claim.buffer === value && claim.token !== token || audio._meBuffer === value && claim?.token !== token) {
          buffer = null; stopConfirmed = true; resumeOwed = false; return; // successor adopted the same object
        }
        const wasChannel = audio._meBuffer === value;
        if (wasChannel) { audio._meBuffer = null; resumeOwed = true; }
        if (claim?.token === token) claims.delete(audio);
        destroying = true;
        try { value.destroy(); if (value.isPlaying() !== false) throw new Error('MZ ME buffer still playing after destroy'); buffer = null; stopConfirmed = true; if (fault?.startsWith('ME stop failed:')) fault = null; }
        catch (error) { stopConfirmed = false; const detail = 'ME stop failed: ' + String(error); fault ??= detail; diagnostic(detail); }
        finally { destroying = false; }
      };
      const finishResume = () => {
        if (!resumeOwed || !stopConfirmed || displaced) return;
        try { resumeBGM(); resumeOwed = false; if (fault?.startsWith('ME BGM resume failed:')) fault = null; }
        catch (error) { const detail = 'ME BGM resume failed: ' + String(error); fault ??= detail; diagnostic(detail); }
      };
      const retire = (reason: CaptureMEStatus) => {
        retired = true; status = reason; pending.delete(lease);
        try { clear(); } catch (error) { fault ??= 'ME timer cleanup failed: ' + String(error); diagnostic(fault); }
        cleanup(); finishResume();
      };
      const lease: CaptureMELease = { snapshot, release() {
        retire(retired ? status : 'cancelled');
        // Keep the exact failed predecessor reachable. Retry only when no new ME
        // occupies the channel, because its native stop listener is not our lease.
        if (displaced && !audio._meBuffer) {
          try { displaced.destroy(); displaced = null; resumeOwed = true; }
          catch (error) { diagnostic('preceding ME retry failed: ' + String(error)); }
        }
        finishResume(); return snapshot();
      } };
      // A retry is explicit release() after a failed own-buffer destroy; never an automatic loop.
      for (const old of [...pending]) old.release();
      expected = audio._meBuffer; pending.add(lease);
      const schedule = () => { if (!retired && timer === undefined) timer = clock.after(Math.max(0, Math.min(25, deadline - last)), poll); };
      const poll = () => {
        if (retired) return;
        try {
          clear();
          if (!live()) { retire('superseded'); return; }
          const time = now();
          if (time >= deadline) { deadlineReached = true; retire(status === 'loading' ? 'timeout' : status === 'playing' ? 'stopped' : status); return; }
          if (naturalEnded) { cleanup(); finishResume(); naturalEnded = false; status = 'ended'; if (fault) { retire('failed'); return; } }
          if (status === 'loading' && buffer) {
            let error: boolean, ready: boolean;
            try { error = buffer.isError(); ready = buffer.isReady(); }
            catch (cause) { diagnostic(cause); status = 'failed'; cleanup(); schedule(); return; }
            if (error) { diagnostic('MZ ME decoding failed'); status = 'failed'; cleanup(); }
            else if (ready) {
              const volume = audio.meVolume;
              if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('invalid MZ ME volume');
              audio.updateBufferParameters(buffer, volume, track);
              if (!live() || now() >= deadline) { deadlineReached = last >= deadline; retire(deadlineReached ? 'timeout' : 'superseded'); return; }
              if (expected) {
                const preceding = expected; audio._meBuffer = null; expected = null;
                try { preceding.destroy(); } catch (error) { displaced = preceding; stopConfirmed = false; fault ??= 'preceding ME stop failed: ' + String(error); throw error; }
                // Native stopMe resumes the pending BGM before a replacement ME
                // captures/pauses it again, preserving its recorded position.
                try { resumeBGM(); } catch (error) { fault ??= 'preceding ME BGM resume failed: ' + String(error); throw error; }
                if (!live() || now() >= deadline) { deadlineReached = last >= deadline; retire(deadlineReached ? 'timeout' : 'superseded'); return; }
              }
              const bgm = audio._bgmBuffer, record = audio._currentBgm;
              if (bgm && record) {
                const position = bgm.seek();
                if (!live() || audio._bgmBuffer !== bgm || audio._currentBgm !== record) { retire('superseded'); return; }
                record.pos = position; bgm.stop();
              }
              if (audio._bgmSequence) audio._duckBgmSequence(audio.BGM_SEQUENCE_ME_DUCK);
              if (!live() || now() >= deadline) { deadlineReached = last >= deadline; retire(deadlineReached ? 'timeout' : 'superseded'); return; }
              audio._meBuffer = buffer; claims.set(audio, { buffer, token }); published = true; stopConfirmed = false;
              const value = buffer;
              // Never hand MZ an unguarded global stopMe callback. Defer natural end so
              // an outer native stopMe/playMe can finish publishing its successor first.
              value.addStopListener(() => { if (!retired && !destroying && buffer === value) naturalEnded = true; });
              if (!live() || now() >= deadline || naturalEnded) { deadlineReached = last >= deadline; retire(deadlineReached ? 'timeout' : naturalEnded ? 'ended' : 'superseded'); return; }
              value.play(false, 0); playRequestedAt = last; status = 'playing';
              if (!live() || now() >= deadline) { deadlineReached = last >= deadline; retire(deadlineReached ? 'stopped' : 'superseded'); return; }
            }
          }
          schedule();
        } catch (error) { diagnostic(error); fault ??= 'capture ME failed: ' + String(error); retire('failed'); }
      };
      try {
        if (!live()) retire('superseded');
        else if (now() >= deadline) { deadlineReached = true; retire('timeout'); }
        else {
          if (!exists(track.name)) status = 'missing';
          else if (live()) {
            if (now() >= deadline) { deadlineReached = true; retire('timeout'); return lease; }
            buffer = audio.createBuffer('me/', track.name); if (buffer) stopConfirmed = false;
            if (!live()) retire('superseded');
            else if (buffer === expected) throw new Error('MZ ME preparation returned a published buffer');
            else if (!buffer || typeof buffer.isReady !== 'function' || typeof buffer.isError !== 'function' || typeof buffer.addLoadListener !== 'function' || typeof buffer.addStopListener !== 'function' || typeof buffer.isPlaying !== 'function' || typeof buffer.destroy !== 'function') throw new Error('MZ ME buffer unavailable');
            else { buffer.addLoadListener(poll); if (!retired) poll(); }
          } else retire('superseded');
          schedule();
        }
      } catch (error) { diagnostic(error); if (fault) retire('failed'); else { status = 'failed'; cleanup(); schedule(); } }
      return lease;
    },
  };
}
