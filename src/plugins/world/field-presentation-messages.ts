/** Read-only native field text. Names come from the current Content/native target directory. */
import { defaultTranslator } from '../../framework/i18n';
import type { Params } from '../../framework/i18n';
import { hostRecord } from './host-access';

export interface FieldPresentationText { readonly message: string; readonly choices?: readonly [string, string]; assertCurrent(): void }
type ProxyCheck = (value: unknown) => boolean;
function data(value: unknown, key: string, isProxy: ProxyCheck): unknown {
  const record = hostRecord(value);
  if (!record) return undefined;
  if (isProxy(record)) throw Error('field-presentation-own-data-required');
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw Error('field-presentation-own-data-required');
  return descriptor.value;
}
function label(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value) && !value.includes('[missing:');
}
function context(root: Record<string, unknown>, current: () => void, isProxy: ProxyCheck) {
  current();
  const flow = data(root, 'PSFlow', isProxy), application = data(flow, '_app', isProxy), content = data(flow, '_content', isProxy);
  const manager = data(root, 'SceneManager', isProxy), scene = data(manager, '_scene', isProxy), nextScene = data(manager, '_nextScene', isProxy);
  const messages = data(root, '$gameMessage', isProxy);
  const names: { readonly owner: unknown; readonly key: string; readonly value: unknown }[] = [];
  const nameData = (owner: unknown, key: string): unknown => {
    const value = data(owner, key, isProxy); names.push({ owner, key, value }); return value;
  };
  const guard = (): void => {
    current();
    if (data(root, 'PSFlow', isProxy) !== flow || data(flow, '_app', isProxy) !== application || data(flow, '_content', isProxy) !== content ||
      data(root, 'SceneManager', isProxy) !== manager || data(manager, '_scene', isProxy) !== scene || data(manager, '_nextScene', isProxy) !== nextScene ||
      data(root, '$gameMessage', isProxy) !== messages) throw Error('field-presentation-source-changed');
    for (const name of names) if (data(name.owner, name.key, isProxy) !== name.value) throw Error('field-presentation-name-changed');
    current();
  };
  const factory = data(flow, 'translator', isProxy);
  if (factory !== undefined && (typeof factory !== 'function' || isProxy(factory))) throw Error('field-presentation-translator-invalid');
  const translator: unknown = factory === undefined ? defaultTranslator() : Reflect.apply(factory, flow, []);
  guard();
  const tOr = data(translator, 'tOr', isProxy);
  if (typeof tOr !== 'function' || isProxy(tOr)) throw Error('field-presentation-translator-invalid');
  const text = (key: string, params?: Params): string => {
    guard();
    const fallback = defaultTranslator().t(key, params);
    const result: unknown = Reflect.apply(tOr, translator, [key, fallback, params]);
    guard();
    if (!label(result)) throw Error('field-presentation-translation-invalid');
    return result;
  };
  const moveName = (id: string): string => {
    const moves = nameData(content, 'moves'), record = hostRecord(moves);
    let name: string | undefined;
    if (record) {
      if (isProxy(record)) throw Error('field-presentation-own-data-required');
      for (const key of Object.keys(record)) {
        const move = nameData(record, key);
        if (nameData(move, 'id') !== id) continue;
        const candidate = nameData(move, 'name');
        if (label(candidate) && candidate !== id) name = candidate;
        break;
      }
    }
    guard();
    return name ?? text('world.fieldMove.move');
  };
  const targetName = (mapId: number): string => {
    const maps = nameData(root, '$dataMapInfos'), target = nameData(maps, String(mapId));
    const name = nameData(target, 'name');
    guard();
    return label(name) ? name : text('world.travel.destination');
  };
  const choices = (): readonly [string, string] => [text('inventory.yes'), text('inventory.no')];
  return { guard, text, moveName, targetName, choices };
}
export function fieldMoveText(root: Record<string, unknown>, kind: 'confirm-direct' | 'flash' | 'used-move', move: string,
  current: () => void, isProxy: ProxyCheck): FieldPresentationText {
  const c = context(root, current, isProxy);
  const message = kind === 'flash' ? c.text('world.fieldMove.flash') : c.text('world.fieldMove.' + (kind === 'confirm-direct' ? 'confirm' : 'used'), { move: c.moveName(move) });
  const choices = kind === 'confirm-direct' ? c.choices() : undefined;
  c.guard(); return { message, ...(choices ? { choices } : {}), assertCurrent: c.guard };
}
export function travelText(root: Record<string, unknown>, kind: 'escape-rope' | 'fly' | 'teleport' | 'dig',
  current: () => void, isProxy: ProxyCheck, targetMapId?: number): FieldPresentationText {
  const c = context(root, current, isProxy);
  const message = kind === 'escape-rope' ? c.text('world.travel.escapeRope') : targetMapId === undefined
    ? c.text('world.fieldMove.used', { move: c.moveName(kind) })
    : c.text('world.travel.confirm', { move: c.moveName(kind), destination: c.targetName(targetMapId) });
  const choices = targetMapId === undefined ? undefined : c.choices();
  c.guard(); return { message, ...(choices ? { choices } : {}), assertCurrent: c.guard };
}
