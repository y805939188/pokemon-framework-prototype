/** Ordinary actions and F reset share one actual App service, source and native projection. */
import type { BlackoutProjectionChannel, BlackoutProjectionConnection } from '../../framework/app/blackout-projection-ports';
import type { EventCompanionPrepared, EventCompanionProductionChannel } from '../../framework/app/event-companion-public-ports';
import type { WorldCompanionPreparedOriginLifecycle, WorldTravelLeaseSource } from '../../framework/app/ports';
import type { CompanionNativeFactsMZOptions } from './event-companion-native-facts-mz';
import { CompanionProductionSourceMZ } from './event-companion-production-source-mz';
import { createEventCompanionResetMZ } from './event-companion-reset-mz';
import { readNativeTravelLease } from './travel-lease-registry-mz';

export interface CompanionProductionMZOptions extends CompanionNativeFactsMZOptions {
  diagnostic?(reason: string): void;
}
/** This capability is passed directly by createTransferHost, never placed on PSFlow/source. */
export interface CompanionOriginPublisherMZ {
  readonly source: WorldTravelLeaseSource;
  publish(source: object, observation: object): WorldCompanionPreparedOriginLifecycle;
  retire(expected: WorldCompanionPreparedOriginLifecycle): boolean;
}
export interface CompanionProductionMZ {
  readonly channel: BlackoutProjectionChannel;
  /** Sole native frame caller; creating this module does not install an update hook. */
  update(): void;
  syncPresentation(): void;
}
interface Preparation {
  readonly value: EventCompanionPrepared;
  readonly epoch: object;
  origin: WorldCompanionPreparedOriginLifecycle | null;
  closed: boolean;
}
export function createEventCompanionProductionMZ(root: unknown, connection: BlackoutProjectionConnection,
  options: CompanionProductionMZOptions, nativeIsProxy: (value: unknown) => boolean,
  publisher: CompanionOriginPublisherMZ): CompanionProductionMZ {
  const current = options.current, generation = connection.generation;
  const actual = () => {
    const frame = current();
    return frame && frame.application === connection.application && frame.generation === generation()
      ? frame : null;
  };
  const source = new CompanionProductionSourceMZ(root, { ...options, current: actual }, nativeIsProxy);
  const native = createEventCompanionResetMZ(root, {
    application: connection.application, service: connection.service,
    currentApplication: () => actual()?.application ?? null, generation,
    readCompanions: connection.readRecords, createResetController: connection.createResetController,
    relation: (a, b) => source.relation(a, b), canEnter: (point, direction) => source.canEnter(point, direction), placement: point => source.placement(point),
    iceSliding: () => source.iceSliding(), diagnostic: options.diagnostic,
  });
  const issued = new WeakMap<object, Preparation>();
  const publications = new WeakSet<object>();
  let disposed = false;
  const epoch = (): object => {
    const snapshot = readNativeTravelLease(publisher.source);
    if (disposed || !snapshot || snapshot.current !== null || !snapshot.nativeEpoch) throw Error('companion-production-native-epoch-unavailable');
    return snapshot.nativeEpoch;
  };
  const entry = (prepared: EventCompanionPrepared): Preparation => {
    const record = issued.get(prepared);
    if (!record || record.closed || disposed || epoch() !== record.epoch || !source.isCurrent(prepared)
      || epoch() !== record.epoch) throw Error('companion-production-channel-preparation-stale');
    return record;
  };
  const retire = (origin: WorldCompanionPreparedOriginLifecycle): void => {
    if (publications.has(origin)) publisher.retire(origin);
  };
  const companions = Object.freeze<EventCompanionProductionChannel>({
    async prepare(intent, records) {
      const before = epoch(), result = await source.prepare(intent, records);
      if (disposed || epoch() !== before) {
        if (result.status === 'value') source.close(result.value);
        return { status: 'unavailable', reason: 'companion-production-native-epoch-changed' };
      }
      if (result.status === 'value') issued.set(result.value, { value: result.value, epoch: before, origin: null, closed: false });
      return result;
    },
    bind(prepared, binding) {
      entry(prepared);
      const host = native.projection.bind(binding);
      entry(prepared);
      return source.guardHost(prepared, host);
    },
    publishOrigin(prepared) {
      const record = entry(prepared), observation = source.prepareOrigin(prepared);
      if (!observation) return null;
      entry(prepared);
      const published = publisher.publish(source, observation);
      publications.add(published); record.origin = published;
      try {
        entry(prepared);
        if (readNativeTravelLease(publisher.source)?.companionPreparedOrigin !== published
          || published.source !== source || published.origin !== observation || published.prepared !== prepared) {
          throw Error('companion-production-origin-publication-stale');
        }
        return published;
      } catch (error) { retire(published); throw error; }
    },
    retireOrigin: retire,
    close(prepared) {
      const record = issued.get(prepared);
      if (!record || record.closed) return;
      record.closed = true;
      if (record.origin) retire(record.origin);
      source.close(prepared);
    },
  });
  const channel: BlackoutProjectionChannel = Object.freeze({
    companions, controller: native.controller,
    bind: native.projection.bind, retireProjection: native.projection.retireProjection,
    authorVisible: native.projection.authorVisible,
    dispose() {
      if (disposed) return;
      disposed = true; source.invalidate();
      // Exact source membership, rather than record shape, protects any later publication.
      const origin = readNativeTravelLease(publisher.source)?.companionPreparedOrigin;
      if (origin?.source === source) retire(origin);
      native.projection.dispose();
    },
  });
  return Object.freeze({ channel, update() { if (!disposed) native.projection.update(); }, syncPresentation() { if (!disposed) native.projection.syncPresentation(); } });
}
