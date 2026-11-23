/** Successful E3 recovery composition. Materialized App births retain canonical opaque tokens. */
import type { WorldMapBirthLifecycle, WorldTravelLeaseCurrent } from '../../framework/app/ports';
import type { TravelEffectResult } from '../../framework/app/world-travel-operation';
import type { TransferHost } from './transfer-host';
import { readNativeTravelLease } from './travel-lease-registry-mz';

export function releaseRecoveredArrivalMZ(root: Record<string, unknown>, current: () => { readonly stateGeneration: number } | null,
  transfer: Pick<TransferHost, 'nativeLeaseSource' | 'releaseRecoveryArrival'>, physical: WorldTravelLeaseCurrent,
  observedBirth: WorldMapBirthLifecycle, guard: () => void, isProxy: (value: unknown) => boolean): TravelEffectResult {
  const own = (value: object, key: string): unknown => {
    if (isProxy(value)) throw Error('travel-recovery-own-data-required');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw Error('travel-recovery-own-data-required');
    return descriptor.value;
  };
  try {
    const app = current(), generation = app?.stateGeneration, flow = own(root, 'PSFlow');
    if (!app || !flow || typeof flow !== 'object') throw Error('travel-recovery-application-unavailable');
    const content = own(flow, '_content'), birth = readNativeTravelLease(transfer.nativeLeaseSource)?.mapBirth;
    const frame = birth?.frame, observed = observedBirth.frame;
    // The atomic adapter materializes a native view; its wrapper identity is not publication authority.
    // Resolve the actual canonical record only through this producer, retaining every opaque token.
    if (!birth || !frame || !observed || birth.birth !== observedBirth.birth || birth.queue !== observedBirth.queue
      || birth.manager !== observedBirth.manager || birth.scene !== observedBirth.scene || frame.map !== observed.map
      || frame.data !== observed.data || frame.player !== observed.player || frame.mapId !== observed.mapId)
      throw Error('travel-recovery-birth-unavailable');
    const check = (): void => {
      guard();
      const actual = current(), actualGeneration = app.stateGeneration;
      if (actual !== app || actualGeneration !== generation || own(root, 'PSFlow') !== flow || own(flow, '_app') !== app || own(flow, '_content') !== content
        || readNativeTravelLease(transfer.nativeLeaseSource)?.current !== physical || readNativeTravelLease(transfer.nativeLeaseSource)?.mapBirth !== birth)
        throw Error('travel-recovery-application-stale');
    };
    return transfer.releaseRecoveryArrival(physical, birth, check);
  } catch (error) { return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }; }
}
