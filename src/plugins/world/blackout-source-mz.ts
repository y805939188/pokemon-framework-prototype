import type { BlackoutNonTransferSourceObservation } from './blackout-save-collector';
/** Genuine native Map observations and App-issued F source handoffs; no second native registry. */
import type { BlackoutApplicationQueries, BlackoutSourceContext } from '../../framework/app/blackout-ports';
import type { TravelEffectResult } from '../../framework/app/world-travel-operation';
import type { WorldMapBirthLifecycle, WorldTravelLeaseCurrent } from '../../framework/app/ports';
import type { NativeMapObservation } from './world-travel-scene-mz';
import { readNativeTravelLease } from './travel-lease-registry-mz';
import type { createNativeTravelLeaseRegistry } from './travel-lease-registry-mz';

type Publication = ReturnType<typeof createNativeTravelLeaseRegistry>;
interface SourceEntry {
  readonly owner: object; readonly context: BlackoutSourceContext; readonly app: BlackoutApplicationQueries;
  readonly serial: object; readonly idle: () => void;
  readonly physicalAtArm: WorldTravelLeaseCurrent | null; physicalReleased: boolean;
  candidate: object | null; target: WorldMapBirthLifecycle | null; phase: 'armed' | 'ready'; used: boolean; failed: string | null; retired: boolean;
}
const own = (value: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !('value' in descriptor)) throw Error('blackout-native-own-data-required');
  return descriptor?.value;
};
const object = (value: unknown): value is object => value !== null && (typeof value === 'object' || typeof value === 'function');
const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);
const sameBirth = (a: WorldMapBirthLifecycle | null, scene: object, birth: object, queue: object): a is WorldMapBirthLifecycle => a !== null && a.scene === scene && a.birth === birth && a.queue === queue;
export function createBlackoutSourceMZ(root: Record<string, unknown>, publication: Publication,
  current: () => BlackoutApplicationQueries | null, isProxy: (value: unknown) => boolean,
  captureEpoch: (player: object) => () => void) {
  let entry: SourceEntry | null = null, currentBirth: WorldMapBirthLifecycle | null = null, loadedWitness: WorldMapBirthLifecycle | null = null;
  let arming: object | null = null;
  const manager = own(root, 'SceneManager');
  if (!object(manager) || isProxy(manager)) throw Error('blackout-native-manager-invalid');
  const invalidate = (record: SourceEntry, why: string): void => {
    if (entry !== record || record.retired) return;
    record.failed ??= why;
    const claim = readNativeTravelLease(publication.source)?.sourceHandoff;
    if (claim?.owner === record.owner && claim.context === record.context && claim.serial === record.serial) publication.publishSourceHandoff(null);
  };
  const check = (record: SourceEntry, queued?: object): void => {
    if (entry !== record || record.retired || record.failed) throw Error(record.failed ?? 'blackout-native-source-stale');
    if (current() !== record.app || record.app.isBlackoutOwner(record.owner) !== true || record.app.isBlackoutSourceContext(record.owner, record.context) !== true) throw Error('blackout-native-owner-stale');
    if (entry !== record || record.retired || record.failed) throw Error(record.failed ?? 'blackout-native-source-reentered');
    record.idle();
    const context = record.context, scene = own(manager, '_scene'), next = own(manager, '_nextScene');
    if (own(root, 'SceneManager') !== manager || own(root, '$gameMap') !== context.map || own(root, '$gamePlayer') !== context.player ||
      own(context.map, '_mapId') !== context.mapId || own(context.player, '_x') !== context.x || own(context.player, '_y') !== context.y ||
      scene !== context.scene && scene !== record.target?.scene || next !== null && next !== undefined && next !== queued && next !== record.target?.scene) throw Error('blackout-native-source-changed');
    if (scene === context.scene && context.data !== null && own(root, '$dataMap') !== context.data) throw Error('blackout-native-source-data-changed');
  };
  const publish = (record: SourceEntry): void => {
    check(record);
    publication.publishSourceHandoff({ owner: record.owner, context: record.context, generation: record.context.generation,
      serial: record.serial, sourceScene: record.context.scene, phase: record.phase, target: record.target });
  };
  const moveBirth = (value: WorldMapBirthLifecycle): void => {
    const record = entry, old = currentBirth;
    currentBirth = publication.publishMapBirth(value);
    if (record && old && record.target === old && currentBirth && old.scene === currentBirth.scene && old.birth === currentBirth.birth && old.queue === currentBirth.queue) {
      if (record.phase === 'ready') { invalidate(record, 'blackout-native-bound-source-changed'); return; }
      record.target = currentBirth;
      if (record.phase === 'armed') { try { publish(record); } catch (error) { invalidate(record, reason(error)); } }
    }
  };
  const invalidateBirth = (scene: object, birth: object, queue: object, why: string): void => {
    if (!sameBirth(currentBirth, scene, birth, queue)) return;
    currentBirth = publication.publishMapBirth(null); loadedWitness = null;
    const record = entry;
    if (sameBirth(record?.target ?? null, scene, birth, queue) && record) invalidate(record, why);
  };
  const readFrame = (): NonNullable<WorldMapBirthLifecycle['frame']> => {
    const map = own(root, '$gameMap'), player = own(root, '$gamePlayer'), data = own(root, '$dataMap');
    if (!object(map) || !object(player) || !object(data) || typeof data !== 'object' || Array.isArray(data) || isProxy(map) || isProxy(player) || isProxy(data)) throw Error('blackout-native-loaded-frame-unavailable');
    const mapId = own(map, '_mapId');
    if (typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || mapId <= 0) throw Error('blackout-native-map-id-invalid');
    return Object.freeze({ map, mapId, player, data });
  };
  const observation: NativeMapObservation = {
    queued(scene, birth, queue) { loadedWitness = null; moveBirth({ manager, scene, birth, queue, frame: null }); },
    activated(scene, birth, queue) {
      if (sameBirth(currentBirth, scene, birth, queue)) moveBirth({ ...currentBirth, frame: null });
      else { currentBirth = publication.publishMapBirth(null); loadedWitness = null; }
    },
    loaded(scene, birth, queue) {
      if (!sameBirth(currentBirth, scene, birth, queue) || own(manager, '_scene') !== scene) return;
      try {
        // The witness is captured only after this birth's one genuine load body returned.
        // Native performTransfer may legitimately have changed mapId/coordinates in that body.
        loadedWitness = Object.freeze({ ...currentBirth, frame: readFrame() });
      } catch (error) { invalidateBirth(scene, birth, queue, reason(error)); }
    },
    ready(scene, birth, queue) {
      if (!sameBirth(currentBirth, scene, birth, queue) || own(manager, '_scene') !== scene) return;
      try {
        const witness = loadedWitness, actual = readFrame();
        if (!sameBirth(witness, scene, birth, queue) || !witness.frame || witness.frame.map !== actual.map || witness.frame.mapId !== actual.mapId || witness.frame.player !== actual.player || witness.frame.data !== actual.data) throw Error('blackout-native-loaded-witness-changed');
        if (currentBirth.frame === null) moveBirth(witness);
      } catch (error) { invalidateBirth(scene, birth, queue, reason(error)); }
    },
    invalid(scene, birth, queue) { invalidateBirth(scene, birth, queue, 'blackout-native-load-repeated'); },
    lost() {
      currentBirth = publication.publishMapBirth(null); loadedWitness = null;
      const record = entry; if (record?.phase === 'armed' && record.target) invalidate(record, 'blackout-native-map-membership-lost');
    },
  };
  return {
    observation,
    armSource(owner: object, context: BlackoutSourceContext): TravelEffectResult {
      if (arming) return { status: 'failed', reason: 'blackout-native-source-arm-reentered' };
      const token = {}; arming = token;
      try {
        const app = current();
        if (!app || !object(context) || isProxy(context) || app.isBlackoutOwner(owner) !== true || app.isBlackoutSourceContext(owner, context) !== true) throw Error('blackout-native-context-unissued');
        for (const key of ['generation', 'kind', 'map', 'mapId', 'player', 'scene', 'x', 'y', 'data', 'birth', 'battleHandle', 'ancestor']) own(context, key);
        if (!Number.isSafeInteger(context.generation) || context.generation < 0 || !Number.isSafeInteger(context.mapId) || context.mapId <= 0 || !Number.isSafeInteger(context.x) || !Number.isSafeInteger(context.y) ||
          !object(context.map) || !object(context.player) || !object(context.scene) || isProxy(context.map) || isProxy(context.player) || isProxy(context.scene) ||
          context.data !== null && (!object(context.data) || isProxy(context.data))) throw Error('blackout-native-context-invalid');
        if (entry?.owner === owner && entry.context === context) { check(entry); return { status: 'done' }; }
        const record: SourceEntry = { owner, context, app, serial: Object.freeze({}), idle: captureEpoch(context.player), physicalAtArm: readNativeTravelLease(publication.source)?.current ?? null, physicalReleased: false, candidate: null, target: null, phase: 'armed', used: false, failed: null, retired: false };
        const mapConstructor = own(root, 'Scene_Map');
        if (!object(mapConstructor) || isProxy(mapConstructor)) throw Error('blackout-native-map-class-invalid');
        const mapPrototype = own(mapConstructor, 'prototype');
        let prototype: object | null = Object.getPrototypeOf(context.scene), isMap = false;
        for (let depth = 0; prototype && depth < 32; depth++) {
          if (isProxy(prototype)) throw Error('blackout-native-map-prototype-invalid');
          if (prototype === mapPrototype) { isMap = true; break; }
          prototype = Object.getPrototypeOf(prototype);
        }
        if (isMap) {
          if (!currentBirth || currentBirth.scene !== context.scene || currentBirth.birth !== context.birth || own(manager, '_scene') !== context.scene) throw Error('blackout-native-map-unissued');
          record.target = currentBirth; record.used = true;
        }
        if (context.kind === 'field' && !isMap) throw Error('blackout-native-field-map-required');
        entry = record; publish(record); return { status: 'done' };
      } catch (error) { return { status: 'failed', reason: reason(error) }; }
      finally { if (arming === token) arming = null; }
    },
    async waitSource(owner: object, context: BlackoutSourceContext, nextFrame: (guard: () => void) => Promise<void>): Promise<TravelEffectResult> {
      const record = entry;
      try {
        if (!record || record.owner !== owner || record.context !== context) throw Error('blackout-native-source-unissued');
        const guard = (): void => { check(record); };
        await nextFrame(guard); // Existing members also require an actual post-arm native frame.
        for (;;) {
          guard(); const target = record.target;
          if (target && target === currentBirth && target.frame === null && own(target.scene, '_started') === true) throw Error('blackout-native-map-load-unissued');
          if (record.phase === 'ready' && target !== currentBirth) throw Error('blackout-native-bound-source-changed');
          if (target && target === currentBirth && target.frame && own(manager, '_scene') === target.scene && own(manager, '_nextScene') === null &&
            own(context.player, '_transferring') === false && own(target.scene, '_started') === true && own(target.scene, '_active') === true && target.frame.map === context.map && target.frame.mapId === context.mapId &&
            target.frame.player === context.player && own(root, '$dataMap') === target.frame.data) {
            if (record.phase !== 'ready') { record.phase = 'ready'; publish(record); } return { status: 'done' };
          }
          await nextFrame(guard);
        }
      } catch (error) { if (record) invalidate(record, reason(error)); return { status: 'failed', reason: reason(error) }; }
    },
    retireSource(owner: object, context: BlackoutSourceContext): TravelEffectResult {
      const record = entry;
      if (!record || record.owner !== owner || record.context !== context) return { status: 'done' };
      record.retired = true;
      const claim = readNativeTravelLease(publication.source)?.sourceHandoff;
      if (claim?.owner === owner && claim.context === context && claim.serial === record.serial) publication.publishSourceHandoff(null);
      // Retain this one retired entry as the epoch marker; a successor arm replaces it.
      return { status: 'done' }; // Observational Map birth and any native transfer/successor remain untouched.
    },
    releasedPhysical(physical: WorldTravelLeaseCurrent): void {
      const record = entry;
      // Called only by the producer's exact own releaseArrival path, before its pure unpublish.
      if (record && record.physicalAtArm === physical && physical.phase === 'arrived') record.physicalReleased = true;
    },
    captureNonTransferSource(owner: object): BlackoutNonTransferSourceObservation {
      const record = entry, initial = readNativeTravelLease(publication.source), handoff = initial?.sourceHandoff;
      if (!record || record.owner !== owner || record.retired || record.failed || record.phase !== 'ready' || !handoff ||
        handoff.owner !== owner || handoff.context !== record.context || handoff.serial !== record.serial || handoff.phase !== 'ready' || handoff.target !== record.target) throw Error('blackout-native-nontransfer-source-unissued');
      const guard = (): void => {
        // F owner is deliberately already retired. Its App-issued completion nonce is checked by
        // the save coordinator; this is only the actual producer's native/source observation.
        if (current() !== record.app || entry !== record || record.failed || record.phase !== 'ready') throw Error('blackout-native-nontransfer-source-stale');
        record.idle();
        const snapshot = readNativeTravelLease(publication.source), birth = currentBirth, target = record.target, context = record.context;
        const frame = target?.frame;
        if (!snapshot || !target || !frame || birth !== target || snapshot.mapBirth !== target ||
          own(root, 'SceneManager') !== manager || own(manager, '_scene') !== target.scene || own(manager, '_nextScene') !== null ||
          own(root, '$gameMap') !== frame.map || own(frame.map, '_mapId') !== frame.mapId || own(root, '$gamePlayer') !== frame.player ||
          own(root, '$dataMap') !== frame.data || own(frame.player, '_x') !== context.x || own(frame.player, '_y') !== context.y || own(frame.player, '_transferring') !== false)
          throw Error('blackout-native-nontransfer-frame-changed');
        if (record.retired ? snapshot.sourceHandoff !== null : snapshot.sourceHandoff !== handoff) throw Error('blackout-native-nontransfer-claim-changed');
        if (snapshot.current !== record.physicalAtArm && !(record.physicalReleased && record.physicalAtArm !== null && snapshot.current === null))
          throw Error('blackout-native-nontransfer-physical-changed');
      };
      guard(); return Object.freeze({ handoff, physical: record.physicalAtArm, guard });
    },
    constructionLease(): { readonly identity: object; readonly sourceScene: object } | null {
      const record = entry;
      if (!record || record.phase !== 'armed' || record.target?.scene === record.context.scene || own(manager, '_scene') !== record.context.scene) return null;
      try { check(record, record.target?.scene ?? record.candidate ?? undefined); return { identity: record.serial, sourceScene: record.context.scene }; }
      catch (error) { invalidate(record, reason(error)); return null; }
    },
    constructed(identity: object, scene: object): void {
      const record = entry;
      if (!record || record.serial !== identity || record.used || record.candidate || scene === record.context.scene) throw Error('blackout-native-construction-stale');
      check(record); record.candidate = scene;
    },
    accepted(identity: object, scene: object): void {
      const record = entry;
      if (!record || record.serial !== identity) throw Error('blackout-native-construction-stale');
      try {
        if (record.used || record.candidate !== scene || !currentBirth || currentBirth.scene !== scene) throw Error('blackout-native-construction-unissued');
        check(record, scene); record.target = currentBirth; record.used = true; publish(record);
      } catch (error) { invalidate(record, reason(error)); throw error; }
    },
    invalidated(identity: object): void { const record = entry; if (record?.serial === identity) invalidate(record, 'blackout-native-scene-source-invalid'); },
  };
}
export type NativeBlackoutSource = ReturnType<typeof createBlackoutSourceMZ>;
