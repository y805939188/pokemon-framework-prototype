/** Native-only fishing image lease. It owns images, never application state or admission. */
import { hostRecord } from './host-access';

type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;
interface CharacterProfile { readonly name: string; readonly index: number }
interface NativeReaders { readonly name: NativeMethod; readonly index: NativeMethod }
interface NativeImage extends CharacterProfile { readonly readers: NativeReaders }
interface VisualSource {
  readonly flow: object; readonly app: object; readonly generation: number; readonly game: object; readonly content: object;
  readonly player: Record<string, unknown>; readonly map: object; readonly mapId: number; readonly scene: object; readonly surfing: boolean;
}
export interface FishingCharacterLease {
  /** The active elapsed clock pauses together with the existing fishing loop. */
  start(surfing: boolean, elapsed: () => number): () => boolean;
  owned<T>(action: () => T): T;
  restore(): void;
  dispose(): void;
}
export interface FishingCharacters {
  begin(player: Record<string, unknown>, current: () => boolean): FishingCharacterLease;
  /** Called by the current map initialization/pump, never by an old session continuation. */
  reproject(current?: () => boolean): void;
}
function data(owner: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw Error('fishing-character-own-data-required:' + key);
  return descriptor.value;
}
function profile(raw: unknown): CharacterProfile {
  if (raw === undefined || raw === '') throw Error('fishing-character-not-configured');
  if (typeof raw !== 'string') throw Error('fishing-character-json-required');
  const value: unknown = JSON.parse(raw), record = hostRecord(value);
  if (!record || Array.isArray(value) || Object.keys(record).some(key => key !== 'name' && key !== 'index')) throw Error('fishing-character-invalid');
  const name = data(record, 'name'), index = data(record, 'index');
  if (typeof name !== 'string' || !name.length || /[\u0000-\u001f\\/:]/u.test(name) || name === '.' || name === '..' ||
      typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index > 7) throw Error('fishing-character-invalid');
  return { name, index };
}
function same(a: CharacterProfile, b: CharacterProfile): boolean { return a.name === b.name && a.index === b.index; }

export function createFishingCharacters(root: Record<string, unknown>, parameters: Record<string, unknown>, diagnostic: (reason: string) => void = () => {}): FishingCharacters {
  let proxyCheck: ((value: unknown) => boolean) | null = null;
  // Descriptor reads reject accessor hooks before executing them. The actual Node detector also rejects Proxy functions/bitmaps.
  const method = (owner: object, key: string): NativeMethod => {
    if (proxyCheck?.(owner)) throw Error('fishing-character-proxy-refused');
    let cursor: object | null = owner;
    while (cursor) {
      if (proxyCheck?.(cursor)) throw Error('fishing-character-proxy-refused');
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
      if (descriptor) {
        if (!('value' in descriptor) || typeof descriptor.value !== 'function' || proxyCheck?.(descriptor.value)) throw Error('fishing-character-method-invalid:' + key);
        return descriptor.value as NativeMethod;
      }
      cursor = Object.getPrototypeOf(cursor);
    }
    throw Error('fishing-character-method-unavailable:' + key);
  };
  const call = (owner: object, key: string, args: readonly unknown[] = []): unknown => Reflect.apply(method(owner, key), owner, args);
  try {
    const util = hostRecord(call(root, 'require', ['node:util'])), types = util && hostRecord(data(util, 'types'));
    const detector = types && data(types, 'isProxy');
    if (typeof detector === 'function') proxyCheck = detector as (value: unknown) => boolean;
  } catch { /* Missing detector is a resource failure when a built-in image is requested. */ }
  const readProfile = (key: string): CharacterProfile => {
    if (!proxyCheck || proxyCheck(parameters)) throw Error('fishing-character-parameters-unverified');
    return profile(data(parameters, key));
  };
  const readerMethods = (player: object): NativeReaders => ({ name: method(player, 'characterName'), index: method(player, 'characterIndex') });
  const sameReaders = (player: object, before: NativeReaders): boolean => method(player, 'characterName') === before.name && method(player, 'characterIndex') === before.index;
  const storedImage = (player: object): CharacterProfile => {
    if (proxyCheck?.(player)) throw Error('fishing-character-proxy-refused');
    const name = data(player, '_characterName'), index = data(player, '_characterIndex');
    if (typeof name !== 'string' || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index > 7) throw Error('fishing-character-native-image-invalid');
    return { name, index };
  };
  const sameStored = (player: object, before: CharacterProfile): boolean => data(player, '_characterName') === before.name && data(player, '_characterIndex') === before.index;
  // Typed native methods are capabilities, not image authors. Execute them only in a guarded
  // observation, then finish with descriptor/data checks; never call them from owns().
  const image = (player: object, guard: () => void = () => {}): NativeImage => {
    guard();
    const before = storedImage(player), readers = readerMethods(player);
    const name = Reflect.apply(readers.name, player, []); guard();
    if (!sameStored(player, before) || !sameReaders(player, readers) || name !== before.name) throw Error('fishing-character-native-reader-invalid');
    const index = Reflect.apply(readers.index, player, []); guard();
    if (!sameStored(player, before) || !sameReaders(player, readers) || index !== before.index) throw Error('fishing-character-native-reader-invalid');
    return { ...before, readers };
  };
  const ready = (bitmap: object, guard: () => void): boolean => {
    guard();
    if (!proxyCheck || proxyCheck(bitmap)) throw Error('fishing-character-loader-invalid');
    const state = data(bitmap, '_loadingState');
    if (data(bitmap, '_degradedToBlank') === true) throw Error('fishing-character-degraded-blank');
    if (state === 'error') throw Error('fishing-character-load-failed');
    // Do not invoke hooks on an accessor/degraded record, even if its isReady would return true.
    const isError = method(bitmap, 'isError'), isReady = method(bitmap, 'isReady');
    const error = Reflect.apply(isError, bitmap, []); guard();
    data(bitmap, '_loadingState');
    if (data(bitmap, '_degradedToBlank') === true) throw Error('fishing-character-degraded-blank');
    const loaded = Reflect.apply(isReady, bitmap, []); guard();
    if (typeof error !== 'boolean' || typeof loaded !== 'boolean') throw Error('fishing-character-loader-state-invalid');
    if (error) throw Error('fishing-character-load-failed');
    if (data(bitmap, '_degradedToBlank') === true) throw Error('fishing-character-degraded-blank');
    return data(bitmap, '_loadingState') === 'loaded' && loaded;
  };
  const fourFrames = (value: CharacterProfile, guard: () => void): void => {
    guard();
    const system = hostRecord(data(root, '$dataSystem')), base = hostRecord(data(root, 'Game_CharacterBase'));
    if (!proxyCheck || !system || !base || proxyCheck(system) || proxyCheck(base) || data(system, 'rrMultiFrames') !== true) throw Error('fishing-character-four-frame-support-unavailable');
    const count = call(base, 'rrFramesOf', [value.name]); guard();
    if (count !== 4 || data(root, '$dataSystem') !== system || data(root, 'Game_CharacterBase') !== base || data(system, 'rrMultiFrames') !== true) throw Error('fishing-character-four-frame-profile-required');
  };
  const load = (value: CharacterProfile, guard: () => void): object => {
    guard();
    const manager = hostRecord(root.ImageManager);
    if (!manager || !proxyCheck) throw Error('fishing-character-loader-unavailable');
    const bitmap = hostRecord(call(manager, 'loadCharacter', [value.name]));
    guard();
    if (root.ImageManager !== manager || !bitmap || proxyCheck(bitmap)) throw Error('fishing-character-loader-invalid');
    return bitmap;
  };
  const source = (): VisualSource => {
    const flow = hostRecord(root.PSFlow), app = hostRecord(flow && data(flow, '_app')), player = hostRecord(root.$gamePlayer), map = hostRecord(root.$gameMap), scene = hostRecord(hostRecord(root.SceneManager)?._scene);
    if (!flow || !app || !player || !map || !scene) throw Error('fishing-character-source-unavailable');
    const generation = app.stateGeneration, game = hostRecord(call(flow, 'game')), content = hostRecord(call(flow, 'content')), world = game && hostRecord(data(game, 'world'));
    const surfing = world && data(world, 'surfing');
    if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || !game || !content || typeof surfing !== 'boolean') throw Error('fishing-character-source-invalid');
    const mapId = call(map, 'mapId');
    if (typeof mapId !== 'number' || !Number.isSafeInteger(mapId)) throw Error('fishing-character-map-invalid');
    return { flow, app, generation, game, content, player, map, mapId, scene, surfing };
  };
  const sameSource = (before: VisualSource): boolean => {
    try { const after = source(); return Object.keys(before).every(key => before[key as keyof VisualSource] === after[key as keyof VisualSource]); }
    catch { return false; }
  };
  interface RetiredImage { readonly player: object; readonly expected: CharacterProfile; owns(): boolean; version(): number; inFlight(): boolean; release(): void }
  let retired: RetiredImage | null = null, recoveryDiagnostic = '';
  let lastRecovery: { readonly pending: RetiredImage; readonly source: VisualSource; readonly version: number; readonly action: NativeMethod | null; readonly setter: NativeMethod | null; readonly nameReader: NativeMethod | null; readonly indexReader: NativeMethod | null; readonly opportunity: (() => boolean) | undefined } | null = null;
  const host: FishingCharacters = {
    begin(player, current) {
      host.reproject(current);
      if (retired) throw Error('fishing-character-reprojection-pending');
      let snapshot: CharacterProfile | null = null, expected: CharacterProfile | null = null, surfRestore: CharacterProfile | null = null;
      let original: PropertyDescriptor | undefined, watched: NativeMethod | null = null;
      let patternUpdate: { readonly original: PropertyDescriptor | undefined; readonly guarded: NativeMethod } | null = null, heldPattern = false;
      let serial = 0, ownedSerial = -1, projecting = 0, claiming = false, restoreAttempted = false, released = false, disposed = false;
      let restoreFailure: { readonly error: unknown } | null = null;
      let writeAttempt: { readonly value: CharacterProfile; readonly before: CharacterProfile; readonly serial: number; readonly entry: NativeMethod; readonly readers: NativeReaders; used: boolean; revoked: boolean } | null = null;
      const guard = (): void => { if (disposed || !current()) throw Error('stale-fishing-character-owner'); };
      const baseSetter = (): NativeMethod | null => original ? ('value' in original && typeof original.value === 'function' ? original.value as NativeMethod : null) :
        method(Object.getPrototypeOf(player) as object, 'setImage');
      const owns = (): boolean => {
        try {
          if (released || expected === null || serial !== ownedSerial || !watched) return false;
          // The final receipt check is descriptor/data-only. Calling native readers here could reenter
          // after the serial check and silently re-authorize an identical external image write.
          return data(player, '_characterName') === expected.name && data(player, '_characterIndex') === expected.index;
        } catch { return false; }
      };
      const checkedImage = (): NativeImage => {
        const beforeSerial = serial, observed = image(player, guard);
        if (serial !== beforeSerial || expected !== null && !owns()) throw Error('fishing-character-image-receipt-replaced');
        return observed;
      };
      const release = (): void => {
        if (released) return;
        released = true; heldPattern = false;
        if (patternUpdate && data(player, 'updatePattern') === patternUpdate.guarded) {
          if (patternUpdate.original) Object.defineProperty(player, 'updatePattern', patternUpdate.original); else delete player.updatePattern;
        }
        patternUpdate = null;
        if (watched && data(player, 'setImage') === watched) {
          if (original) Object.defineProperty(player, 'setImage', original); else delete player.setImage;
        }
      };
      const capture = (): void => {
        guard();
        if (snapshot) return;
        snapshot = image(player, guard); guard();
        if (data(player, '_characterName') !== snapshot.name || data(player, '_characterIndex') !== snapshot.index) throw Error('fishing-character-capture-changed');
        method(player, 'setImage'); original = Object.getOwnPropertyDescriptor(player, 'setImage');
        watched = function(this: unknown, ...args: unknown[]): unknown {
          const attempt = writeAttempt;
          const ownTarget = attempt && this === player && args[0] === attempt.value.name && args[1] === attempt.value.index;
          if (ownTarget) {
            guard();
            if (method(player, 'setImage') !== attempt.entry || !sameReaders(player, attempt.readers)) throw Error('fishing-character-native-capability-changed');
            if (attempt.used || attempt.revoked || serial !== attempt.serial ||
                data(player, '_characterName') !== attempt.before.name || data(player, '_characterIndex') !== attempt.before.index) {
              attempt.revoked = true; ownedSerial = -1; throw Error('fishing-character-setter-reentered');
            }
            attempt.used = true;
          } else if (attempt) attempt.revoked = true;
          serial++;
          // Installation alone does not write an image. Every observed external write still revokes,
          // including identical name/index and writes before/after the delegated owned call.
          if (ownTarget) ownedSerial = serial; else ownedSerial = -1;
          const expectedSerial = serial;
          try { const actual = baseSetter(); if (!actual) throw Error('fishing-character-setter-unavailable'); return Reflect.apply(actual, this, args); }
          finally { if (claiming && !attempt && this === player && current() && serial === expectedSerial) {
            const writtenImage = storedImage(player); guard();
            if (serial === expectedSerial && sameStored(player, writtenImage)) { expected = writtenImage; ownedSerial = expectedSerial; }
          } }
        };
        Object.defineProperty(player, 'setImage', { configurable: true, writable: true, value: watched });
      };
      const holdPattern = (): void => {
        if (!patternUpdate) {
          const original = method(player, 'updatePattern');
          const guarded: NativeMethod = function(this: unknown, ...args: unknown[]): unknown {
            if (this === player && heldPattern && owns() && current() && owns()) return undefined;
            return Reflect.apply(original, this, args);
          };
          patternUpdate = { original: Object.getOwnPropertyDescriptor(player, 'updatePattern'), guarded };
          Object.defineProperty(player, 'updatePattern', { configurable: true, writable: true, value: guarded });
        }
        heldPattern = true;
      };
      const project = (value: CharacterProfile, requireOwned = false): boolean => {
        guard();
        if (requireOwned && !owns()) return false;
        const observed = checkedImage();
        if (!requireOwned && snapshot && (serial !== 0 || data(player, '_characterName') !== snapshot.name || data(player, '_characterIndex') !== snapshot.index)) throw Error('fishing-character-initial-image-replaced');
        if (!watched) throw Error('fishing-character-setter-replaced');
        const previousImage = expected, entry = method(player, 'setImage');
        const attempt = { value, before: previousImage ?? snapshot!, serial, entry, readers: observed.readers, used: false, revoked: false };
        expected = value; writeAttempt = attempt; projecting++;
        const nextSerial = serial + 1;
        try {
          // Preserve and dispatch through a legitimate later wrapper. Success must cross our actual
          // native write observer exactly once; a no-op wrapper is not a successful projection.
          Reflect.apply(entry, player, [value.name, value.index]);
          if (!attempt.used || attempt.revoked || serial !== nextSerial) throw Error('fishing-character-setter-reentered');
        } catch (error) {
          if (previousImage && !attempt.revoked && (serial === attempt.serial || serial === nextSerial) &&
              data(player, '_characterName') === previousImage.name && data(player, '_characterIndex') === previousImage.index) {
            expected = previousImage; ownedSerial = serial;
          } else if (!attempt.used || attempt.revoked || serial !== nextSerial) ownedSerial = -1;
          throw error;
        } finally {
          writeAttempt = null; projecting--;
          if (disposed && attempt.used && !attempt.revoked && serial === nextSerial &&
              data(player, '_characterName') === value.name && data(player, '_characterIndex') === value.index) {
            expected = value; ownedSerial = serial; retired = { player, expected: value, owns, version: () => serial, inFlight: () => projecting > 0, release };
          }
        }
        const after = checkedImage(); guard();
        if (!sameReaders(player, after.readers) || !owns()) throw Error('fishing-character-projection-failed');
        return true;
      };
      const restore = (): void => {
        if (restoreAttempted) { if (restoreFailure) throw restoreFailure.error; return; }
        if (!snapshot || !owns()) return;
        if (!current()) return;
        heldPattern = false; restoreAttempted = true;
        try { project(surfRestore ?? snapshot, true); expected = null; }
        catch (error) { restoreFailure = { error }; throw error; }
      };
      capture();
      return {
        owned<T>(action: () => T): T { guard(); const before = claiming; claiming = true; try { const value = action(); guard(); return value; } finally { claiming = before; } },
        start(surfing, elapsed) {
          guard(); capture();
          const target = readProfile(surfing ? 'SurfFishingCharacter' : 'FishingCharacter');
          surfRestore = surfing ? readProfile('SurfCharacter') : null;
          fourFrames(target, guard);
          const bitmap = load(target, guard), restored = surfRestore ? load(surfRestore, guard) : null;
          const started = elapsed(); let projected = false;
          return () => {
            guard(); fourFrames(target, guard); checkedImage(); if (projected) return true;
            const loaded = ready(bitmap, guard), restoreLoaded = restored === null || ready(restored, guard); guard();
            if (!loaded || !restoreLoaded) { if (elapsed() - started >= 5000) throw Error('fishing-character-loading-timeout'); return false; }
            fourFrames(target, guard);
            if (expected !== null && owns() && same(expected, target)) { holdPattern(); projected = true; return true; }
            if (!project(target, expected !== null)) throw Error('fishing-character-image-lease-replaced');
            holdPattern(); projected = true; return true;
          };
        },
        restore,
        dispose() {
          if (disposed) return;
          try { if (!restoreAttempted) restore(); }
          finally {
            disposed = true; heldPattern = false;
            if (expected && (owns() || projecting > 0)) {
              retired?.release(); retired = { player, expected, owns, version: () => serial, inFlight: () => projecting > 0, release };
            } else release();
          }
        },
      };
    },
    reproject(current) {
      const pending = retired;
      if (!pending || pending.inFlight()) return;
      if (!pending.owns()) { pending.release(); if (retired === pending) retired = null; return; }
      let before: VisualSource;
      try {
        before = source();
        if (before.player !== pending.player) { pending.release(); if (retired === pending) retired = null; return; }
        const manager = hostRecord(root.SceneManager);
        if (!manager || call(manager, 'isSceneChanging') !== false || call(before.player, 'isTransferring') !== false || (!current && call(before.flow, 'operationPending') !== false)) return;
        if (current && !current()) return;
        const guard = (): void => { // Source/current callbacks may author a new image. Finish with a data-only receipt check.
          if (retired !== pending || !pending.owns() || !sameSource(before) || current && !current() || !pending.owns()) throw Error('fishing-character-reproject-stale'); };
        guard();
        const actionName = before.surfing ? 'setImage' : 'refresh';
        const action = method(before.player, actionName), setter = method(before.player, 'setImage'), readers = readerMethods(before.player);
        const last = lastRecovery;
        if (last && last.pending === pending && last.version === pending.version() && last.action === action && last.setter === setter &&
            last.nameReader === readers.name && last.indexReader === readers.index && last.opportunity === current && sameSource(last.source)) return;
        let applied = false, phase: 'reader' | 'resource' | 'write' = 'reader';
        // Only records a rejected capability for the retry fence; null is never invoked or accepted.
        const methodOrNull = (key: string): NativeMethod | null => { try { return method(before.player, key); } catch { return null; } };
        try {
          const version = pending.version(), observed = image(before.player, guard);
          if (pending.version() !== version || !pending.owns()) throw Error('fishing-character-reproject-stale');
          phase = 'resource';
          let args: readonly unknown[] = [];
          if (before.surfing) {
            const normal = readProfile('SurfCharacter'), bitmap = load(normal, guard);
            if (!ready(bitmap, guard)) return;
            args = [normal.name, normal.index];
          }
          guard();
          phase = 'write';
          if (method(before.player, actionName) !== action || method(before.player, 'setImage') !== setter || !sameReaders(before.player, observed.readers)) throw Error('fishing-character-reproject-method-changed');
          Reflect.apply(action, before.player, args);
          const sourceGuard = (): void => { if (retired !== pending || !sameSource(before) || current && !current()) throw Error('fishing-character-reproject-stale'); };
          const after = image(before.player, sourceGuard); sourceGuard();
          if (!sameReaders(before.player, after.readers) || pending.owns()) throw Error('fishing-character-reproject-not-applied');
          applied = true;
        } finally {
          // Capture post-attempt methods: a failing reader that installs another reader must not
          // manufacture a new automatic retry on every frame. An external change or new owner
          // opportunity still differs from this fence and can recover normally.
          if (!applied && phase !== 'resource') lastRecovery = { pending, source: before, version: pending.version(), action: methodOrNull(actionName), setter: methodOrNull('setImage'),
            nameReader: methodOrNull('characterName'), indexReader: methodOrNull('characterIndex'), opportunity: current };
        }
        pending.release(); if (retired === pending) retired = null; recoveryDiagnostic = ''; lastRecovery = null;
      } catch (error) {
        const reason = 'fishing-character-reprojection:' + String(error);
        if (reason !== recoveryDiagnostic) { recoveryDiagnostic = reason; diagnostic(reason); }
      }
    },
  };
  return host;
}
