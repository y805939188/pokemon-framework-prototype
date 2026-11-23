/** Schema-11 persistent blackout work. Runtime owners, leases and receipts are never serialized. */
import type { WorldLocation } from './world-data';
/** Frozen destination choice before resource lookup. */
export type BlackoutSelection = { branch: 'center' | 'home'; target: WorldLocation } | { branch: 'no-home' };
export type BlackoutOrigin = { kind: 'battle'; battleId: string; rawHash: string } | { kind: 'field'; sourceId: string };

export type BlackoutPhase = 'announce' | 'prepare' | 'ready' | 'awaiting-arrival';
export interface BlackoutCheckpoint {
  id: string;
  origin: BlackoutOrigin;
  selection: BlackoutSelection;
  phase: BlackoutPhase;
  /** Null only until announce's resource lookup and message have completed. */
  branch: 'center' | 'home' | 'no-home' | 'home-map-missing' | null;
}
function data(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid-blackout-checkpoint');
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) throw Error('invalid-blackout-checkpoint');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) throw Error('invalid-blackout-checkpoint');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !('value' in d)) throw Error('invalid-blackout-checkpoint');
    Object.defineProperty(result, key, { value: d.value, enumerable: true });
  }
  return result;
}
/** Strict schema-11 checkpoint read. Shape validation conveys no admission, transfer or battle authority. */
export function readBlackoutCheckpoint(value: unknown): BlackoutCheckpoint {
  const c = data(value, ['id', 'origin', 'selection', 'phase', 'branch']);
  if (typeof c.id !== 'string' || !c.id.length) throw Error('invalid-blackout-checkpoint');
  const rawOrigin = data(c.origin, Object.getOwnPropertyDescriptor(c.origin ?? {}, 'kind')?.value === 'battle' ? ['kind', 'battleId', 'rawHash'] : ['kind', 'sourceId']);
  let origin: BlackoutOrigin;
  if (rawOrigin.kind === 'battle' && typeof rawOrigin.battleId === 'string' && rawOrigin.battleId.length && typeof rawOrigin.rawHash === 'string' && /^[a-f0-9]{64}$/.test(rawOrigin.rawHash)) origin = { kind: 'battle', battleId: rawOrigin.battleId, rawHash: rawOrigin.rawHash };
  else if (rawOrigin.kind === 'field' && typeof rawOrigin.sourceId === 'string' && rawOrigin.sourceId.length) origin = { kind: 'field', sourceId: rawOrigin.sourceId };
  else throw Error('invalid-blackout-checkpoint');
  const rawSelection = data(c.selection, Object.getOwnPropertyDescriptor(c.selection ?? {}, 'branch')?.value === 'no-home' ? ['branch'] : ['branch', 'target']);
  let selection: BlackoutSelection;
  if (rawSelection.branch === 'no-home') selection = { branch: 'no-home' };
  else {
    const p = data(rawSelection.target, ['mapId', 'x', 'y', 'direction']);
    if (!Number.isSafeInteger(p.mapId) || typeof p.mapId !== 'number' || p.mapId < 1 || !Number.isSafeInteger(p.x) || typeof p.x !== 'number' || !Number.isSafeInteger(p.y) || typeof p.y !== 'number') throw Error('invalid-blackout-checkpoint');
    const direction = p.direction;
    if (direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8 || rawSelection.branch !== 'center' && rawSelection.branch !== 'home') throw Error('invalid-blackout-checkpoint');
    selection = { branch: rawSelection.branch, target: { mapId: p.mapId, x: p.x, y: p.y, direction } };
  }
  const phase = c.phase;
  if (phase !== 'announce' && phase !== 'prepare' && phase !== 'ready' && phase !== 'awaiting-arrival') throw Error('invalid-blackout-checkpoint');
  const branch = c.branch;
  if (phase === 'announce') { if (branch !== null) throw Error('invalid-blackout-checkpoint'); }
  else if (branch !== selection.branch && !(branch === 'home-map-missing' && selection.branch === 'home')) throw Error('invalid-blackout-checkpoint');
  if (phase === 'ready' || phase === 'awaiting-arrival') { if (branch !== 'center' && branch !== 'home') throw Error('invalid-blackout-checkpoint'); }
  if (branch !== null && branch !== 'center' && branch !== 'home' && branch !== 'no-home' && branch !== 'home-map-missing') throw Error('invalid-blackout-checkpoint');
  return { id: c.id, origin, selection, phase, branch };
}
