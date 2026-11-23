/** Production field effects. App remains the only business writer and operation owner. */
import type { FieldMoveExecutionPort, FieldMoveHostOperation, FieldMoveHostResult } from '../../framework/app/field-move-operation';
import type { WorldFact } from '../../framework/rules/world-data';
import type { WorldMapMetadata } from '../../framework/rules/world-state';
import type { MZTerrainMeanings } from './runtime-inputs-mz';
import { createFieldMoveHost } from './field-move-host';
import { createFieldMoveFramesMZ } from './field-move-frames-mz';
import { createFieldMoveDataMZ } from './field-move-data-mz';
import { createFieldFactsObservation } from './field-facts-observation-mz';
import type { FieldFactsObservation } from './field-facts-observation-mz';
import { createDefaultFieldSoundsMZ } from './field-native-default-resources-mz';
import { createFieldDarknessMZ } from './field-darkness-mz';
import type { FieldDarknessAdapter, FieldDarknessObservation } from './field-native-default-resource-ports';
import { createSurfPassageMZ } from './surf-passage-mz';
import { parseSurfPassageMode } from './configured-transfer-mz';
import { createStrengthInteractionMZ } from './strength-interaction-mz';
import { hostRecord, invoke } from './host-access';
import { fieldMoveText } from './field-presentation-messages';

interface SurfCharacter { readonly name: string; readonly index: number }
interface SurfLandingSlot { readonly app: object; readonly requestId: string }
function character(raw: unknown): WorldFact<SurfCharacter> {
  try {
    if (raw === undefined || raw === '') return { status: 'unavailable', reason: 'surf-character-not-configured' };
    if (typeof raw !== 'string') throw Error('surf-character-json-required');
    const value: unknown = JSON.parse(raw), record = hostRecord(value);
    if (!record || Array.isArray(value) || Object.keys(record).some(key => !['name', 'index'].includes(key)) ||
      typeof record.name !== 'string' || !record.name.length || /[\u0000-\u001f\\/:]/u.test(record.name) || record.name === '.' || record.name === '..' ||
      typeof record.index !== 'number' || !Number.isSafeInteger(record.index) || record.index < 0 || record.index > 7) throw Error('surf-character-invalid');
    return { status: 'value', value: { name: record.name, index: record.index } };
  } catch (error) { return { status: 'invalid', reason: String(error) }; }
}
const unavailable = (reason: string): FieldMoveHostResult => ({ status: 'unavailable', reason, completedStages: 0 });
export function createFieldMoveMZ(root: Record<string, unknown>, meanings: MZTerrainMeanings, parameters: Record<string, unknown>, diagnose: (reason: string) => void) {
  const profile = character(parameters.SurfCharacter), frames = createFieldMoveFramesMZ(root);
  let frameFailure = '', passageFailure = '', active: FieldMoveHostOperation | null = null;
  let landing: SurfLandingSlot | null = null, landingSequence = 0n;
  const landingContexts = new WeakMap<object, SurfLandingSlot>();
  const resource: { bitmap: object | null; darkness: { readonly revision: number } | null } = { bitmap: null, darkness: null };
  let darkness: FieldDarknessAdapter | undefined;
  let nativeIsProxy: ((value: unknown) => boolean) | null = null, factsObservation: FieldFactsObservation | undefined;
  let copyData: <T>(value: T) => T = () => { throw Error('field-native-data-capability-unavailable'); };
  try {
    const util = hostRecord(invoke(root, 'require', ['node:util'])), check = hostRecord(util?.types)?.isProxy;
    if (typeof check !== 'function') throw Error('field-native-proxy-detection-unavailable');
    nativeIsProxy = check as (value: unknown) => boolean;
    copyData = createFieldMoveDataMZ(nativeIsProxy, Object.getPrototypeOf(util));
    if (profile.status === 'value') { const bitmap = hostRecord(invoke(root.ImageManager, 'loadCharacter', [profile.value.name])); if (!bitmap || nativeIsProxy(bitmap)) throw Error('surf-character-loader-invalid'); resource.bitmap = bitmap; }
    factsObservation = createFieldFactsObservation(root, nativeIsProxy, [...['_loadingState', '_degradedToBlank', '_url'].map(key => ({ owner: resource, path: ['bitmap', key] })), { owner: resource, path: ['darkness', 'revision'] }]);
  } catch (error) { diagnose(String(error)); }
  try { frames.install(); } catch (error) { frameFailure = String(error); diagnose(frameFailure); }
  const authority = () => {
    try {
      const flow = root.PSFlow, app = invoke(flow, 'app'), facts = hostRecord(invoke(app, 'worldFacts')), surfing = hostRecord(facts?.surfing);
      const runtime = hostRecord(invoke(app, 'worldFieldRuntime'));
      if (surfing?.status !== 'value' || typeof surfing.value !== 'boolean' || typeof runtime?.endingSurf !== 'boolean') throw Error('surf-business-facts-unavailable');
      return { status: 'value' as const, value: { surfing: surfing.value, endingSurf: runtime.endingSurf } };
    } catch (error) { return { status: 'unavailable' as const, reason: String(error) }; }
  };
  const passageMode = (() => { try { return parseSurfPassageMode(parameters.SurfPassage); } catch (error) { passageFailure = String(error); diagnose(passageFailure); return 'none' as const; } })();
  const surf = createSurfPassageMZ(root, meanings, passageMode, authority, diagnose);
  try { surf.install(); } catch (error) { passageFailure = String(error); diagnose(passageFailure); }
  // This visual reader uses the actual installed state/content directly. It never asks field facts
  // for the mask it is currently producing (which would recurse through capture -> darkMask).
  const flow = hostRecord(root.PSFlow), gameReader = flow?.game, contentReader = flow?.content;
  const visual = (): WorldFact<FieldDarknessObservation> => {
    try {
      if (!flow || typeof gameReader !== 'function' || typeof contentReader !== 'function') throw Error('field-darkness-readers-unavailable');
      const app = hostRecord(flow._app), generation = app?.stateGeneration;
      const game = hostRecord(Reflect.apply(gameReader, flow, [])), content = hostRecord(Reflect.apply(contentReader, flow, []));
      const world = hostRecord(game?.world), id = invoke(root.$gameMap, 'mapId'), metadataSource = hostRecord(content?.mapMetadata), maps = hostRecord(metadataSource?.maps);
      if (!app || !Number.isSafeInteger(generation) || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !world || typeof world.flashUsed !== 'boolean') throw Error('field-darkness-business-unavailable');
      const descriptor = maps && Object.getOwnPropertyDescriptor(maps, String(id));
      if (descriptor && !('value' in descriptor)) throw Error('field-darkness-metadata-own-data-required');
      const metadata = hostRecord(descriptor?.value), dark = metadata && Object.getOwnPropertyDescriptor(metadata, 'darkMap');
      if (dark && (!('value' in dark) || typeof dark.value !== 'boolean')) throw Error('field-darkness-metadata-invalid');
      if (root.PSFlow !== flow || flow._app !== app || app.stateGeneration !== generation || Reflect.apply(gameReader, flow, []) !== game || Reflect.apply(contentReader, flow, []) !== content) throw Error('field-darkness-business-changed');
      return { status: 'value', value: { application: app, generation: generation as number, mapId: id, flashUsed: world.flashUsed,
        darkMap: !maps ? { status: 'unavailable', reason: 'field-map-metadata-unavailable' } : { status: 'value', value: dark?.value === true } } };
    } catch (error) { return { status: 'unavailable', reason: String(error) }; }
  };
  try {
    if (!nativeIsProxy) throw Error('field-native-proxy-detection-unavailable');
    darkness = createFieldDarknessMZ(root, { current: visual, nextFrame: frames.nextFrame, isProxy: nativeIsProxy, diagnostic: diagnose });
    resource.darkness = darkness.observation;
  } catch (error) { diagnose(String(error)); }
  const sounds = nativeIsProxy ? createDefaultFieldSoundsMZ({ isProxy: nativeIsProxy }) : undefined;
  const flashAnimation = parameters.FlashAnimationId === undefined || parameters.FlashAnimationId === '' ? 40 : Number(parameters.FlashAnimationId);
  const nativeVehicle = (player: unknown): boolean => { const result = invoke(player, 'isInVehicle'); if (typeof result !== 'boolean') throw Error('field-native-vehicle-unavailable'); return result; };
  const projectionReady = (): WorldFact<boolean> => {
    if (profile.status !== 'value') return profile;
    try {
      const bitmap = hostRecord(invoke(root.ImageManager, 'loadCharacter', [profile.value.name]));
      if (!bitmap || !nativeIsProxy || nativeIsProxy(bitmap)) throw Error('surf-character-loader-invalid');
      resource.bitmap = bitmap;
      const own = (key: string): unknown => { const descriptor = Object.getOwnPropertyDescriptor(bitmap, key); if (!descriptor) return undefined; if (!('value' in descriptor)) throw Error('surf-character-own-data-required'); return descriptor.value; };
      // Reactor Bitmap.isReady derives from this same state, but can watchdog-degrade a missing file to blank.
      // A missing profile must not become a successful Surf projection through that fallback.
      const state = own('_loadingState');
      if (own('_degradedToBlank') === true) return { status: 'unavailable', reason: 'surf-character-degraded-blank' };
      return state === 'loaded' ? { status: 'value', value: true } : { status: 'unavailable', reason: state === 'error' ? 'surf-character-load-failed' : 'surf-character-loading' };
    } catch (error) { return { status: 'unavailable', reason: String(error) }; }
  };
  const host = createFieldMoveHost(root, {
    factsObservation,
    metadata: mapId => {
      try {
        const facts = hostRecord(invoke(invoke(root.PSFlow, 'app'), 'worldFacts')), currentMap = hostRecord(facts?.mapId), metadata = hostRecord(facts?.mapMetadata);
        if (currentMap?.status !== 'value' || currentMap.value !== mapId || !metadata) return { status: 'unavailable', reason: 'field-map-metadata-unavailable' };
        if (metadata.status === 'absent') return { status: 'absent' };
        const value = hostRecord(metadata.value);
        if (metadata.status !== 'value' || !value || ['darkMap', 'alwaysBicycle'].some(key => value[key] !== undefined && typeof value[key] !== 'boolean')) return { status: 'unavailable', reason: 'field-map-metadata-invalid' };
        const result: Pick<WorldMapMetadata, 'darkMap' | 'alwaysBicycle'> = { ...(typeof value.darkMap === 'boolean' ? { darkMap: value.darkMap } : {}), ...(typeof value.alwaysBicycle === 'boolean' ? { alwaysBicycle: value.alwaysBicycle } : {}) };
        return { status: 'value', value: result };
      } catch (error) { return { status: 'unavailable', reason: String(error) }; }
    },
    terrain: surf.terrain, surfPassage: input => {
      const ready = projectionReady();
      if (frameFailure || passageFailure || ready.status !== 'value') return { status: 'unavailable', reason: frameFailure || passageFailure || ('reason' in ready ? ready.reason : undefined) || 'surf-character-unavailable' };
      if (nativeVehicle(input.player)) return { status: 'unavailable', reason: 'framework-surf-cannot-own-native-vehicle' };
      return surf.transitionPassage(input);
    },
    nextFrame: guard => frames.nextFrame(guard),
    nativeJump(player, x, y) {
      const operation = active, flow = hostRecord(root.PSFlow);
      const descriptor = flow && Object.getOwnPropertyDescriptor(flow, 'ownedFieldMovementJump');
      const jump = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      if (!operation || typeof jump !== 'function' || !nativeIsProxy || nativeIsProxy(jump)) throw Error('field-movement-start-capability-unavailable');
      operation.assertCurrent();
      return Reflect.apply(jump, flow, [operation, player, x, y]);
    },
    animate: async (move, _member, guard) => {
      guard(); if (move !== 'flash') return false; // Other optional plans retain their original text fallback.
      if (!Number.isSafeInteger(flashAnimation) || flashAnimation <= 0 || !hostRecord(root.$dataAnimations)?.[flashAnimation]) throw Error('flash-animation-resource-unavailable');
      const player = root.$gamePlayer, temp = root.$gameTemp, animations = root.$dataAnimations;
      if (invoke(player, 'isAnimationPlaying') !== false) throw Error('flash-animation-occupied');
      guard();
      invoke(temp, 'requestAnimation', [[player], flashAnimation]); guard();
      if (root.$gameTemp !== temp || root.$gamePlayer !== player || root.$dataAnimations !== animations || invoke(player, 'isAnimationPlaying') !== true) throw Error('flash-animation-not-started');
      while (invoke(player, 'isAnimationPlaying') === true) { await frames.nextFrame(guard); guard(); }
      guard(); return true;
    },
    text: async (kind, move, guard) => {
      guard(); const message = root.$gameMessage;
      if (!nativeIsProxy) throw Error('field-native-proxy-detection-unavailable');
      const visible = fieldMoveText(root, kind, move, guard, nativeIsProxy), check = visible.assertCurrent; check();
      const initiallyBusy = invoke(message, 'isBusy'); check();
      if (initiallyBusy !== false) throw Error('field-message-active');
      const busy = (): boolean => { check(); if (root.$gameMessage !== message) throw Error('field-message-replaced'); const value = invoke(message, 'isBusy'); check(); if (typeof value !== 'boolean') throw Error('field-message-invalid'); return value; };
      let choice: number | undefined;
      invoke(message, 'add', [visible.message]); check();
      if (kind === 'confirm-direct') {
        invoke(message, 'setChoices', [visible.choices, 1, 1]); check();
        invoke(message, 'setChoiceCallback', [(value: unknown) => { if (value === 0 || value === 1) choice = value; }]); check();
      }
      while (busy() || kind === 'confirm-direct' && choice === undefined) { await frames.nextFrame(check); check(); }
      check(); return kind !== 'confirm-direct' || choice === 0;
    },
    cancelVehicles: async (player, guard) => { guard(); if (nativeVehicle(player)) throw Error('framework-surf-cannot-own-native-vehicle'); invoke(player, 'refresh'); guard(); return { status: 'completed' }; },
    projectSurfing: async (surfing, player, guard) => {
      guard(); if (!surfing) { invoke(player, 'refresh'); guard(); return { status: 'completed' }; }
      if (profile.status !== 'value') throw Error('reason' in profile ? profile.reason : 'surf-character-unavailable');
      for (;;) { const ready = projectionReady(); guard(); if (ready.status === 'value') break; if ('reason' in ready && ready.reason !== 'surf-character-loading') throw Error(ready.reason); await frames.nextFrame(guard); guard(); }
      invoke(player, 'setImage', [profile.value.name, profile.value.index]); guard();
      if (invoke(player, 'characterName') !== profile.value.name || invoke(player, 'characterIndex') !== profile.value.index) throw Error('surf-character-projection-failed');
      return { status: 'completed' };
    },
    // Presentation default only; WP59 specifies red screen but no fixed color/duration.
    // The host waits for native Game_Screen.updateFlash via actual Map frames.
    redScreen: () => ({ status: 'value', value: { color: [255, 0, 0, 128], durationFrames: 30 } }),
    sound: kind => sounds ? sounds.sound(kind) : { status: 'unavailable', reason: 'field-sound-native-capability-unavailable' },
    darkMask: () => darkness?.darkMask() ?? { status: 'unavailable', reason: 'field-darkness-native-capability-unavailable' },
  }, value => copyData(value));
  let strength: ReturnType<typeof createStrengthInteractionMZ> | undefined;
  const guarded = (operation: FieldMoveHostOperation): FieldMoveHostOperation => strength?.guard(operation) ?? operation;
  const runs = new WeakMap<object, Promise<FieldMoveHostResult>>();
  const run = (operation: FieldMoveHostOperation, effect: () => Promise<FieldMoveHostResult>): Promise<FieldMoveHostResult> => {
    const old = runs.get(operation); if (old) return old;
    let accept!: (value: FieldMoveHostResult | PromiseLike<FieldMoveHostResult>) => void, fail!: (error: unknown) => void;
    const pending = new Promise<FieldMoveHostResult>((resolve, reject) => { accept = resolve; fail = reject; }); runs.set(operation, pending);
    try {
      if (frameFailure) { accept(unavailable(frameFailure)); return pending; }
      const previous = active;
      if (previous && previous !== operation) {
        try { previous.assertCurrent(); }
        catch { if (active === previous) active = null; }
        if (active && active !== operation) { accept(unavailable('field-native-operation-active')); return pending; }
      }
      active = operation;
      // Shared frame waits retain their own guards. Ending an old operation must not cancel a successor's waits.
      void Promise.resolve().then(effect).then(result => { if (active === operation) active = null; accept(result); }, error => { if (active === operation) active = null; fail(error); });
    } catch (error) { if (active === operation) active = null; fail(error); }
    return pending;
  };
  const execution: FieldMoveExecutionPort = {
    facts: host.facts,
    run: (plan, operation) => run(operation, async () => {
      if (plan.moveId === 'surf') { operation.assertCurrent(); const ready = projectionReady(); operation.assertCurrent(); if (ready.status !== 'value') return unavailable('reason' in ready ? ready.reason ?? 'surf-character-unavailable' : 'surf-character-unavailable'); }
      return host.run(plan, guarded(operation));
    }),
    pushStrength: (input, operation) => run(operation, () => host.pushStrength(input, guarded(operation))),
    landSurf: operation => { if (landing) landingContexts.set(operation, landing); return run(operation, () => host.landSurf(operation)); },
    // The App's completed-step child supplies this actual notification; never substitute root.$gamePlayer.
    cleanupSurf: (operation, notificationPlayer) => run(operation, () => host.cleanupSurf(notificationPlayer, operation)),
  };
  const playerPrototype = hostRecord(hostRecord(root.Game_Player)?.prototype), executeMove = playerPrototype?.executeMove;
  if (playerPrototype && typeof executeMove === 'function') playerPrototype.executeMove = function(this: unknown, direction: unknown): unknown {
    if (this !== root.$gamePlayer || ![2, 4, 6, 8].includes(direction as number)) return Reflect.apply(executeMove, this, [direction]);
    const business = authority();
    if (business.status !== 'value' || !business.value.surfing || business.value.endingSurf) return Reflect.apply(executeMove, this, [direction]);
    try {
      if (nativeVehicle(this)) return Reflect.apply(executeMove, this, [direction]);
      if (landing || active || invoke(this, 'canMove') !== true || invoke(this, 'isMoving') !== false || invoke(this, 'isJumping') !== false) return undefined;
      invoke(this, 'setDirection', [direction]);
      if (invoke(this, 'direction') !== direction) { diagnose('surf-landing-direction-fixed'); return Reflect.apply(executeMove, this, [direction]); }
      const facts = execution.facts(), terrain = facts.facingTerrain;
      if (terrain?.status !== 'value' || facts.facingPassable?.status !== 'value') throw Error('surf-landing-facts-unavailable');
      if (terrain.value.canSurf) return Reflect.apply(executeMove, this, [direction]);
      const app = hostRecord(invoke(root.PSFlow, 'app')); if (!app) throw Error('surf-landing-application-unavailable');
      const current = { app, requestId: `mz-surf-land:${++landingSequence}` }; landing = current;
      try {
        const result = invoke(app, 'runFieldMove', [current.requestId, { kind: 'surf-land' }]);
        if (!result || typeof hostRecord(result)?.then !== 'function') throw Error('surf-landing-promise-unavailable');
        void Promise.resolve(result).then(outcome => { if (landing !== current) return; landing = null; const status = hostRecord(outcome)?.status; if (status !== 'completed' && status !== 'not-landed') diagnose(String(hostRecord(outcome)?.reason ?? 'surf-landing-failed')); }, error => { if (landing === current) { landing = null; diagnose(String(error)); } });
      } catch (error) { if (landing === current) landing = null; throw error; }
      return undefined;
    } catch (error) { diagnose(String(error)); return undefined; }
  };
  const interactions = createStrengthInteractionMZ(root, diagnose); strength = interactions;
  return { execution, retireLanding(context: object): void { const own = landingContexts.get(context); if (own && landing === own) landing = null; }, pending: () => active !== null || landing !== null || interactions.pending(), update: () => { interactions.update(); darkness?.synchronize(); darkness?.update(); frames.update(); }, releaseScene: (scene: object) => darkness?.release(scene), stateReplaced: () => {
    interactions.stateReplaced();
    const old = landing; landing = null; if (old) invoke(old.app, 'cancelFieldMove', [old.requestId]);
    frames.cancel('field-native-state-replaced');
  } };
}
