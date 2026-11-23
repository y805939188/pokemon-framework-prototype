/** Real factory/reset composition. A reset never writes saved companions or actor followers. */
import { CompanionProjectionReset } from '../../framework/app/event-companion-projection-reset';
import type { CompanionResetApplication, CompanionResetSource, CompanionResetNativeResult, CompanionResetOptions } from '../../framework/app/event-companion-projection-reset';
import { createEventCompanionMZ } from './event-companion-mz';
import type { EventCompanionMZFactory, EventCompanionMZOptions } from './event-companion-mz';
import { hostRecord } from './host-access';

export interface EventCompanionResetMZOptions extends Omit<EventCompanionMZOptions, 'current' | 'reset'> {
  readonly application: CompanionResetApplication;
  /** Actual Flow App identity; capture this provider once at the real composition root. */
  currentApplication(): object | null;
  generation(): number;
  /** Actual App-owned canonical constructor; absent preserves the independent component path. */
  createResetController?(options: CompanionResetOptions): CompanionProjectionReset;
}
export interface EventCompanionResetMZ {
  readonly controller: CompanionProjectionReset;
  readonly projection: EventCompanionMZFactory;
}
const own = (value: unknown, key: string): unknown => {
  const object = hostRecord(value); if (!object) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
export function createEventCompanionResetMZ(rootValue: unknown, input: EventCompanionResetMZOptions): EventCompanionResetMZ {
  const root = hostRecord(rootValue); if (!root) throw Error('companion-reset-native-root-unavailable');
  const options = Object.freeze({ ...input }), application = options.application;
  const current = (): { owner: object; generation: number } | null => {
    const actual = options.currentApplication(), generation = options.generation();
    return actual === application && Number.isSafeInteger(generation) && generation >= 0
      ? { owner: actual, generation } : null;
  };
  const source = (): CompanionResetSource | null => {
    const before = current(); if (!before) return null;
    const map = own(root, '$gameMap'), data = own(root, '$dataMap'), player = own(root, '$gamePlayer');
    const scene = own(own(root, 'SceneManager'), '_scene'), mapId = own(map, '_mapId');
    const x = own(player, '_x'), y = own(player, '_y'), direction = own(player, '_direction');
    const transferring = own(player, '_transferring'), nextScene = own(own(root, 'SceneManager'), '_nextScene');
    const after = current();
    if (!after || before.owner !== after.owner || before.generation !== after.generation
      || ![map, data, player, scene].every(value => value !== null && typeof value === 'object')
      || typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || mapId < 1
      || typeof x !== 'number' || typeof y !== 'number' || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)
      || direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8
      || transferring !== false || nextScene !== null) return null;
    // Descriptor reads are repeated so a native getter/proxy cannot substitute a second source.
    if (map !== own(root, '$gameMap') || data !== own(root, '$dataMap') || player !== own(root, '$gamePlayer')
      || scene !== own(own(root, 'SceneManager'), '_scene') || mapId !== own(map, '_mapId')
      || x !== own(player, '_x') || y !== own(player, '_y') || direction !== own(player, '_direction')
      || transferring !== own(player, '_transferring') || nextScene !== own(own(root, 'SceneManager'), '_nextScene')) return null;
    return Object.freeze({ application, generation: before.generation, map: map as object, mapId, data: data as object, player: player as object, scene: scene as object,
      x, y, direction, transferring, nextScene });
  };
  let projection: EventCompanionMZFactory | null = null;
  let clear: EventCompanionMZFactory['resetProjection'] | null = null, retry: EventCompanionMZFactory['retryProjectionReset'] | null = null;
  const unavailable = (): CompanionResetNativeResult => ({ status: 'rejected', reason: 'companion-reset-capability-unavailable', diagnostics: [],
    resources: { hadSurface: null, spritesRemaining: null, charactersRemaining: null, motionsRemaining: null, maskDetached: null } });
  const create = options.createResetController ?? ((input: CompanionResetOptions) => new CompanionProjectionReset(input));
  const controller = create({ application, generation: options.generation, source,
    clear: binding => projection && clear ? Reflect.apply(clear, projection, [binding]) as CompanionResetNativeResult : unavailable(),
    retry: binding => projection && retry ? Reflect.apply(retry, projection, [binding]) as CompanionResetNativeResult : unavailable() });
  projection = createEventCompanionMZ(root, { ...options, current, reset: controller });
  clear = projection.resetProjection; retry = projection.retryProjectionReset;
  return Object.freeze({ controller, projection });
}
