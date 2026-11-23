import type { WorldOperationOutcome } from '../../framework/app';
import type { WorldMapEntry } from '../../framework/rules/world-state';
import type { WorldApplication } from './world-host';

export function createWorldEntryCoordinator(beforeEntry?: () => void) {
  let owner: WorldApplication | null = null, generation = -1, sequence = 0, previousMapId: number | null = null;
  let pending: Readonly<{ cause: 'new-game' | 'load' }> | null = null;
  return {
    loaded(): void { pending = { cause: 'load' }; },
    newGame(): void { pending = { cause: 'new-game' }; },
    mapLoaded(application: WorldApplication, mapId: number, transferring: boolean, rebuilt: boolean, scene?: object): WorldOperationOutcome | null {
      if (!Number.isSafeInteger(mapId) || mapId <= 0 || transferring) return null;
      if (owner !== application || generation !== application.stateGeneration) { owner = application; generation = application.stateGeneration; previousMapId = null; sequence = 0; }
      const pendingEntry = pending;
      const cause = pendingEntry?.cause ?? (previousMapId !== null && previousMapId !== mapId ? 'transfer' : null);
      if (!cause) { previousMapId = mapId; return null; }
      const entry: WorldMapEntry = { id: `mz-map:${generation}:${++sequence}`, cause, previousMapId: cause === 'new-game' ? null : cause === 'load' ? mapId : previousMapId, mapId, rebuilt };
      // This is the observed physical route, even while App is busy applying an earlier notice.
      previousMapId = mapId;
      const epoch = generation;
      // Only an actual App-private completed F target claim may suppress this native duplicate.
      // Source entries deliberately follow the ordinary FIFO and its F-owned prefix drain.
      if (scene && application.ownsBlackoutNativeEntry?.(entry, scene) === true) {
        if (owner === application && epoch === application.stateGeneration && pending === pendingEntry) pending = null;
        return { status: 'duplicate' };
      }
      beforeEntry?.();
      if (owner !== application || epoch !== application.stateGeneration) return { status: 'refused', reason: 'stale-world-map-entry' };
      const result = application.observeWorldMapEntry(entry);
      if (result.status !== 'refused' && owner === application && epoch === application.stateGeneration && pending === pendingEntry) pending = null;
      return result;
    },
  };
}
