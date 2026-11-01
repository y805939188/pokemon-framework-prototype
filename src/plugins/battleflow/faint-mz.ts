/* eslint-disable @typescript-eslint/no-explicit-any */
import { planFaintSchedule } from './faint-schedule';
import type { FaintCryObservation, FaintCrySlot, FaintScheduleResult } from './faint-schedule';
import type { FaintMedia } from './faint-media';

/** Private adapter to the pinned MZ audio context. It never closes that borrowed
 * context or stops shared SEs. Decoded seconds are explicitly a host estimate;
 * this is not a replacement for every legacy file-header reader quirk. */
export function createFaintMediaMZ(G: any, nodeRequire: any, root: string,
  identity: { species: string; form: number } | null, current: () => boolean,
  trace: (row: any) => void = () => {}): FaintMedia {
  identity = identity && { species: identity.species, form: identity.form };
  const fs = nodeRequire('fs'), path = nodeRequire('path');
  let retired = false, origin: number | null = null, selected: FaintCrySlot | null = null, lastNow = -1;
  let scheduled: FaintScheduleResult | null = null, cryRequested = false, effectRequested = false;
  const observations: Record<FaintCrySlot, FaintCryObservation> = {
    dedicatedForm: { state: 'missing' }, dedicatedBase: { state: 'missing' },
    ordinaryForm: { state: 'missing' }, ordinaryBase: { state: 'missing' },
  };
  interface Sound { assetId: string; state: 'pending' | 'ready' | 'failed'; buffer: any; error?: string; playPending: boolean; pitch: number; }
  interface Voice { source: any; gain: any; released: boolean; started: boolean; }
  const voices = new Set<Voice>(), errors: string[] = [], cleanupErrors: string[] = [];
  let cry: Sound | null = null, effect: Sound | null = null;
  const live = () => !retired && current();
  const guard = () => { if (!live()) throw new Error('stale faint audio owner'); };
  const inside = (parent: string, file: string) => { const rel = path.relative(parent, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
  const resolve = (name: string): string | null => {
    guard();
    const base = path.join(root, 'audio', 'se');
    const encrypted = typeof G.Utils?.hasEncryptedAudio === 'function' ? G.Utils.hasEncryptedAudio() : G.Utils?.hasEncryptedAudio;
    // Dedicated SE resolver order, including the literal path, is explicit.
    for (const suffix of ['.wav', '.ogg', '.mp3', '.wma', '']) {
      const candidate = path.join(base, ...name.split('/')) + suffix + (encrypted ? '_' : '');
      try {
        const stat = fs.statSync(candidate); guard();
        if (!stat.isFile()) continue;
        const real = fs.realpathSync(candidate), realBase = fs.realpathSync(base), realGame = fs.realpathSync(root);
        guard(); if (!inside(realGame, realBase) || !inside(realBase, real)) throw new Error('faint audio outside game resources');
        return real;
      } catch (error: any) { if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error; }
    }
    return null;
  };
  const release = (voice: Voice) => {
    if (voice.released) return; voice.released = true; voices.delete(voice);
    for (const run of [() => { if (voice.source) voice.source.onended = null; }, () => { if (voice.started) voice.source?.stop(); },
      () => voice.source?.disconnect(), () => voice.gain?.disconnect()]) {
      try { run(); } catch (error) { cleanupErrors.push(String(error)); }
    }
  };
  const play = (sound: Sound) => {
    if (!live()) return;
    if (sound.state === 'pending') { sound.playPending = true; return; }
    if (sound.state !== 'ready') return;
    const voice: Voice = { source: null, gain: null, released: false, started: false }; voices.add(voice);
    try {
      guard(); const context = G.WebAudio?._context, master = G.WebAudio?._masterGainNode;
      if (!context || !master) throw new Error('MZ audio context unavailable');
      const source = context.createBufferSource();
      if (!live() || voice.released) { source.disconnect(); throw new Error('stale faint source allocation'); }
      voice.source = source; guard();
      const gain = context.createGain();
      if (!live() || voice.released) { gain.disconnect(); throw new Error('stale faint gain allocation'); }
      voice.gain = gain; guard();
      voice.source.buffer = sound.buffer; voice.source.playbackRate.value = sound.pitch / 100; guard();
      const volume = G.AudioManager?.seVolume;
      if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('invalid MZ SE volume');
      voice.gain.gain.value = .8 * volume / 100; guard();
      voice.source.connect(voice.gain); guard(); voice.gain.connect(master); guard();
      voice.source.onended = () => release(voice); guard(); voice.started = true;
      try { voice.source.start(); } catch (error) { voice.started = false; throw error; }
      guard();
      trace({ kind: 'faint-audio-start', assetId: sound.assetId, pitch: sound.pitch, volume: .8 * volume,
        durationSource: 'mz-decoded-v1', fileSeconds: sound.buffer.duration });
    } catch (error) { release(voice); errors.push(String(error)); if (live()) trace({ kind: 'faint-audio-play-failed', assetId: sound.assetId, error: String(error) }); }
  };
  const load = (assetId: string, file: string, pitch: number): Sound => {
    const sound: Sound = { assetId, state: 'pending', buffer: null, playPending: false, pitch };
    try {
      guard(); const bytes = fs.readFileSync(file); guard();
      let data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const encrypted = typeof G.Utils?.hasEncryptedAudio === 'function' ? G.Utils.hasEncryptedAudio() : G.Utils?.hasEncryptedAudio;
      if (encrypted) { data = G.Utils.decryptArrayBuffer(data); guard(); }
      const context = G.WebAudio?._context;
      if (!context?.decodeAudioData) throw new Error('MZ audio decoding unavailable');
      const decoded = context.decodeAudioData(data);
      void Promise.resolve(decoded).then(buffer => {
        if (!live()) return;
        if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration < 0) throw new Error('invalid decoded audio duration');
        sound.buffer = buffer; sound.state = 'ready';
        if (sound.playPending) { sound.playPending = false; play(sound); }
      }).catch(error => { if (live()) { sound.state = 'failed'; sound.error = String(error); } });
      guard();
    } catch (error) { sound.state = 'failed'; sound.error = String(error); }
    return sound;
  };
  const prepare = () => {
    guard();
    if (identity !== null && (typeof identity.species !== 'string' || !identity.species || /[\u0000-\u001f\\/]/.test(identity.species)
      || identity.species === '.' || identity.species === '..' || !Number.isSafeInteger(identity.form) || identity.form < 0)) throw new Error('invalid faint species resource identity');
    if (identity) {
      const base = identity.species, form = identity.form > 0 ? base + '_' + identity.form : null;
      const rows: [FaintCrySlot, string | null][] = [['dedicatedForm', form && form + '_faint'], ['dedicatedBase', base + '_faint'], ['ordinaryForm', form], ['ordinaryBase', base]];
      for (const [slot, name] of rows) {
        if (!name) continue;
        const file = resolve('Cries/' + name);
        if (!file) continue;
        selected = slot; cry = load('Cries/' + name, file, slot.startsWith('dedicated') ? 100 : 75);
        observations[slot] = { state: 'pending' }; break;
      }
    }
    const file = resolve('Pkmn faint');
    if (file) effect = load('Pkmn faint', file, 100);
  };
  return {
    poll(now) {
      if (!live()) return { state: 'failed', slot: null, code: 'resource-failed', detail: 'retired faint media' };
      if (!Number.isFinite(now) || now < 0) throw new Error('invalid faint preparation clock');
      if (now < lastNow) throw new Error('faint preparation clock regressed');
      lastNow = now;
      if (origin === null) { origin = now; prepare(); }
      if (now < origin) throw new Error('faint preparation clock regressed');
      if (scheduled?.state === 'ready') return scheduled;
      if (selected && cry) {
        observations[selected] = cry.state === 'ready' ? { state: 'resolved', assetId: cry.assetId, fileSeconds: cry.buffer.duration }
          : cry.state === 'failed' ? { state: 'failed', reason: cry.error || 'faint decode failed' }
          : now - origin >= 5000 ? { state: 'failed', reason: 'faint decode timeout' } : { state: 'pending' };
      }
      scheduled = planFaintSchedule({ candidates: observations, battleEffects: true });
      return scheduled;
    },
    playCry() {
      if (!live() || cryRequested) return; cryRequested = true;
      if (scheduled?.state !== 'ready') throw new Error('faint cry requested before preparation');
      trace({ kind: 'faint-cry', assetId: cry?.assetId ?? null, status: cry ? cry.state : 'missing', pitch: scheduled.plan.cry?.pitchPercent ?? null });
      if (cry) play(cry);
    },
    playEffect() {
      if (!live() || effectRequested) return; effectRequested = true;
      trace({ kind: 'faint-effect', assetId: 'Pkmn faint', status: effect?.state ?? 'missing' });
      if (effect) play(effect);
    },
    dispose() {
      if (retired) return; retired = true;
      if (cry) { cry.playPending = false; cry.buffer = null; }
      if (effect) { effect.playPending = false; effect.buffer = null; }
      for (const voice of [...voices]) release(voice);
      if (cleanupErrors.length) throw new Error('owned faint audio cleanup: ' + cleanupErrors.join('; '));
    },
    snapshot: () => ({ version: 'faint-media-mz-v1', durationSource: 'mz-decoded-v1', retired, selected,
      cry: cry && { assetId: cry.assetId, state: cry.state, fileSeconds: cry.buffer?.duration ?? null },
      cryRequested, effectRequested, voices: voices.size, errors: [...errors], cleanupErrors: [...cleanupErrors] }),
  };
}
