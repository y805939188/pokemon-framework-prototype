/** A local visual resource, never an F/field owner, state writer or entry coordinator. */
import type { WorldFact } from '../../framework/rules/world-data';
import type { FieldMoveDarkMask } from './field-move-host';
import type { FieldDarknessAdapter, FieldDarknessOptions } from './field-native-default-resource-ports';

interface Frame {
  readonly application: object; readonly generation: number; readonly manager: object; readonly scene: object;
  readonly map: object; readonly mapId: number; readonly player: object; readonly data: object; readonly window: object;
  readonly width: number; readonly height: number; readonly dark: boolean; readonly flashUsed: boolean;
}
interface Layer {
  readonly frame: Frame; readonly mask: FieldMoveDarkMask;
  bitmap: object | null; sprite: object | null; radius: number; revoked: boolean; failed: boolean;
  expansion: Promise<void> | null;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export function createFieldDarknessMZ(root: Record<string, unknown>, options: FieldDarknessOptions): FieldDarknessAdapter {
  const read = options.current, nextFrame = options.nextFrame, isProxy = options.isProxy, diagnostic = options.diagnostic;
  const initial = options.initialRadius ?? 64, maximum = options.expandedRadius ?? 176, duration = options.expansionFrames ?? 20;
  if (![initial, maximum].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 8192)
    || maximum <= initial || !positive(duration) || duration > 600 || typeof read !== 'function' || typeof nextFrame !== 'function'
    || typeof isProxy !== 'function' || typeof diagnostic !== 'function') throw Error('field-darkness-options-invalid');
  const object = (value: unknown): value is object => value !== null && (typeof value === 'object' || typeof value === 'function') && !isProxy(value);
  const own = (value: unknown, key: string): unknown => {
    if (!object(value)) throw Error('field-darkness-object-required');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw Error(`field-darkness-own-data-required:${key}`);
    return descriptor.value;
  };
  const value = (owner: unknown, key: string): unknown => {
    if (!object(owner)) throw Error('field-darkness-object-required');
    return Reflect.get(owner, key);
  };
  const call = (owner: unknown, key: string, args: readonly unknown[] = []): unknown => {
    const method = value(owner, key);
    if (typeof method !== 'function' || isProxy(method)) throw Error(`field-darkness-method-unavailable:${key}`);
    return Reflect.apply(method, owner, args);
  };
  const asObject = (value: unknown): object => { if (!object(value)) throw Error('field-darkness-native-object-unavailable'); return value; };
  let current: Layer | null = null, intent: object = {}, lastDiagnostic: string | null = null;
  const resources = new Set<Layer>(), validity = { revision: 0 };
  const note = (reason: string): void => { if (lastDiagnostic === reason) return; lastDiagnostic = reason; try { diagnostic(reason); } catch { /* No authority in diagnostics. */ } };
  const observation = (): Pick<Frame, 'application' | 'generation' | 'mapId' | 'dark' | 'flashUsed'> => {
    const fact: unknown = read();
    if (own(fact, 'status') !== 'value') throw Error('field-darkness-business-observation-unavailable');
    const state = own(fact, 'value'), application = asObject(own(state, 'application')), generation = own(state, 'generation'), mapId = own(state, 'mapId');
    const metadata = own(state, 'darkMap'), status = own(metadata, 'status'), flashUsed = own(state, 'flashUsed');
    const dark = status === 'absent' ? false : status === 'value' ? own(metadata, 'value') : undefined;
    if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0 || !positive(mapId)
      || typeof dark !== 'boolean' || typeof flashUsed !== 'boolean') throw Error('field-darkness-business-observation-unavailable');
    return { application, generation, mapId, dark, flashUsed };
  };
  const capture = (): Frame => {
    const before = observation(), { mapId } = before;
    const manager = asObject(own(root, 'SceneManager')), scene = asObject(own(manager, '_scene'));
    const map = asObject(own(root, '$gameMap')), player = asObject(own(root, '$gamePlayer')), data = asObject(own(root, '$dataMap'));
    const MapClass = own(root, 'Scene_Map'), window = asObject(own(scene, '_windowLayer')), graphics = own(root, 'Graphics');
    const width = value(graphics, 'width'), height = value(graphics, 'height');
    if (typeof MapClass !== 'function' || isProxy(MapClass) || !(scene instanceof MapClass) || call(scene, 'isStarted') !== true
      || own(manager, '_nextScene') !== null || own(player, '_transferring') !== false || call(map, 'mapId') !== mapId
      || !positive(width) || !positive(height) || width > 8192 || height > 8192) throw Error('field-darkness-map-not-ready');
    if (own(root, 'SceneManager') !== manager || own(manager, '_scene') !== scene || own(root, '$gameMap') !== map
      || own(root, '$gamePlayer') !== player || own(root, '$dataMap') !== data || own(scene, '_windowLayer') !== window
      || own(manager, '_nextScene') !== null || own(player, '_transferring') !== false) throw Error('field-darkness-native-source-changed');
    const after = observation();
    if (before.application !== after.application || before.generation !== after.generation || before.mapId !== after.mapId
      || before.dark !== after.dark || before.flashUsed !== after.flashUsed) throw Error('field-darkness-business-observation-changed');
    return { ...before, manager, scene, map, player, data, window, width, height };
  };
  const same = (a: Frame, b: Frame): boolean => a.application === b.application && a.generation === b.generation && a.manager === b.manager
    && a.scene === b.scene && a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.data === b.data
    && a.window === b.window && a.width === b.width && a.height === b.height;
  const valid = (layer: Layer): boolean => {
    if (current !== layer || layer.revoked || layer.failed || !layer.bitmap || !layer.sprite) return false;
    try {
      const now = capture();
      return now.dark && same(layer.frame, now) && value(layer.sprite, 'bitmap') === layer.bitmap && value(layer.sprite, 'parent') === now.scene
        && value(layer.bitmap, 'width') === now.width && value(layer.bitmap, 'height') === now.height
        && current === layer && !layer.revoked && !layer.failed;
    } catch { return false; }
  };
  const check = (layer: Layer): void => { if (!valid(layer)) throw Error('field-darkness-resource-stale'); };
  const retire = (layer: Layer): void => {
    layer.revoked = true; validity.revision++;
    if (current === layer) current = null;
    try {
      if (layer.sprite) {
        Reflect.set(layer.sprite, 'visible', false);
        const parent = value(layer.sprite, 'parent');
        if (object(parent)) call(parent, 'removeChild', [layer.sprite]);
        // The Sprite texture must stop borrowing this Bitmap before either native destroy.
        if (!Reflect.set(layer.sprite, 'bitmap', null) || value(layer.sprite, 'bitmap') !== null) throw Error('field-darkness-detach-bitmap-failed');
        call(layer.sprite, 'destroy'); layer.sprite = null;
      }
      if (layer.bitmap) { call(layer.bitmap, 'destroy'); layer.bitmap = null; }
      resources.delete(layer);
    } catch (error) { note(`field-darkness-retained-resource:${why(error)}`); }
  };
  const paint = (layer: Layer, radius: number, guard: () => void): void => {
    guard(); check(layer);
    const x = call(layer.frame.player, 'screenX'), y = call(layer.frame.player, 'screenY'), tile = call(layer.frame.map, 'tileHeight');
    guard(); check(layer);
    if (![x, y, tile].every(n => typeof n === 'number' && Number.isFinite(n)) || typeof x !== 'number' || typeof y !== 'number' || typeof tile !== 'number' || tile <= 0) throw Error('field-darkness-player-screen-position-invalid');
    const bitmap = layer.bitmap!, context = asObject(value(bitmap, 'context'));
    call(bitmap, 'clear'); guard(); check(layer);
    call(bitmap, 'fillAll', ['black']); guard(); check(layer);
    call(context, 'save');
    try {
      if (!Reflect.set(context, 'globalCompositeOperation', 'destination-out')) throw Error('field-darkness-composite-unavailable');
      guard(); check(layer);
      call(bitmap, 'drawCircle', [x, y - tile / 2, radius, 'black']);
    } finally { call(context, 'restore'); }
    guard(); check(layer); layer.radius = radius;
  };
  const renderFailure = (layer: Layer, error: unknown): void => { layer.failed = true; validity.revision++; note(`field-darkness-render-failed:${why(error)}`); };
  const expand = (layer: Layer, guard: () => void): Promise<void> => {
    if (layer.expansion) return layer.expansion;
    const pending = Promise.resolve().then(async () => {
      const checkBoth = (): void => { guard(); check(layer); };
      checkBoth();
      if (!capture().flashUsed) throw Error('field-darkness-flash-not-committed');
      const from = layer.radius;
      if (from >= maximum) return;
      for (let step = 1; step <= duration; step++) {
        const frame = nextFrame(checkBoth);
        if (!object(frame) || typeof value(frame, 'then') !== 'function') throw Error('field-darkness-frame-promise-unavailable');
        await frame; checkBoth();
        try { paint(layer, from + (maximum - from) * step / duration, checkBoth); }
        catch (error) { if (current === layer && !layer.revoked) renderFailure(layer, error); throw error; }
      }
    });
    layer.expansion = pending;
    // A failed/cancelled call stays settled for this exact resource. No per-frame retry loop.
    return pending;
  };
  const unavailable = (reason: string): WorldFact<FieldMoveDarkMask> => ({ status: 'unavailable', reason });
  const provider = (): WorldFact<FieldMoveDarkMask> => {
    try {
      const now = capture();
      if (!now.dark) return { status: 'absent' };
      return current && valid(current) ? { status: 'value', value: current.mask } : unavailable('field-darkness-current-mask-unavailable');
    } catch (error) { return unavailable(why(error)); }
  };
  return Object.freeze({
    observation: validity,
    synchronize(): WorldFact<FieldMoveDarkMask> {
      const attempt = {}; intent = attempt;
      let next: Layer | null = null;
      try {
        const frame = capture();
        if (intent !== attempt) throw Error('field-darkness-synchronize-superseded');
        if (current && same(current.frame, frame) && frame.dark) return provider();
        const previous = current; if (previous) retire(previous);
        if (intent !== attempt || !same(frame, capture())) throw Error('field-darkness-synchronize-superseded');
        if (!frame.dark) return { status: 'absent' };
        const radius = frame.flashUsed ? maximum : initial;
        const layer: Layer = { frame, bitmap: null, sprite: null, radius, revoked: false, failed: false, expansion: null,
          mask: Object.freeze({ mapId: frame.mapId, valid: () => valid(layer), expand: (guard: () => void) => expand(layer, guard), expanded: () => valid(layer) && layer.radius >= maximum }) };
        next = layer; resources.add(layer);
        const Bitmap = own(root, 'Bitmap'), Sprite = own(root, 'Sprite');
        if (typeof Bitmap !== 'function' || typeof Sprite !== 'function' || isProxy(Bitmap) || isProxy(Sprite)) throw Error('field-darkness-native-constructor-unavailable');
        layer.bitmap = asObject(Reflect.construct(Bitmap, [frame.width, frame.height]));
        if (intent !== attempt || !same(frame, capture())) throw Error('field-darkness-synchronize-superseded');
        layer.sprite = asObject(Reflect.construct(Sprite, [layer.bitmap]));
        if (intent !== attempt || !same(frame, capture())) throw Error('field-darkness-synchronize-superseded');
        const index = call(frame.scene, 'getChildIndex', [frame.window]);
        if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) throw Error('field-darkness-window-layer-unavailable');
        call(frame.scene, 'addChildAt', [layer.sprite, index]);
        if (intent !== attempt || !same(frame, capture())) throw Error('field-darkness-synchronize-superseded');
        current = layer; validity.revision++;
        paint(layer, radius, () => { if (intent !== attempt) throw Error('field-darkness-synchronize-superseded'); });
        lastDiagnostic = null; return { status: 'value', value: layer.mask };
      } catch (error) { if (next) retire(next); note(why(error)); return unavailable(why(error)); }
    },
    darkMask: provider,
    update(): void {
      const layer = current; if (!layer || layer.revoked || layer.failed) return;
      if (!valid(layer)) { retire(layer); return; }
      try { paint(layer, layer.radius, () => check(layer)); }
      catch (error) { if (current === layer && !layer.revoked) renderFailure(layer, error); }
    },
    release(scene: object): void {
      const held = [...resources].filter(layer => layer.frame.scene === scene);
      if (current?.frame.scene === scene) { intent = {}; current.revoked = true; current = null; }
      for (const layer of held) retire(layer);
    },
  });
}
