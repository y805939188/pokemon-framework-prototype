/** Native scheduling only; all actions are issued by the actual application. */
import type { HostApplication } from '../application-host';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';
import { readNativeTravelLease } from './travel-lease-registry-mz';
import type { CompanionMotionNotice } from './event-companion-motion-mz';
import type { CompanionProductionMZ } from './event-companion-production-mz';
type App = Pick<HostApplication, 'stateGeneration' | 'saveBlocked' | 'encounterBlocked' | 'initializeBlackoutCompanions' | 'restoreEventCompanionsAtMap' | 'advanceEventCompanions' | 'recoverEventCompanionProjection'>;
export interface CompanionIngressMZOptions {
  readonly root: Record<string, unknown>; readonly source: WorldTravelLeaseSource; readonly isProxy: (value: unknown) => boolean;
  application(): App | null; runtime(): CompanionProductionMZ | null;
  loadPending(): boolean; followed?(): void; diagnostic(reason: string): void;
}
interface Birth { readonly app: App; readonly generation: number; readonly birth: object; readonly scene: object; phase: 'waiting' | 'running' | 'settled' }
export function createCompanionIngressMZ(options: CompanionIngressMZOptions) {
  const { root, isProxy } = options;
  const own = (v: unknown, key: string): unknown => {
    if (v === null || typeof v !== 'object' && typeof v !== 'function' || isProxy(v)) return undefined;
    const d = Object.getOwnPropertyDescriptor(v, key); return d && 'value' in d ? d.value : undefined;
  };
  const report = (error: unknown): void => { try { options.diagnostic(error instanceof Error ? error.message : String(error)); } catch { /* Diagnostic only. */ } };
  let birth: Birth | null = null, follow: Pick<CompanionMotionNotice, 'application' | 'generation' | 'guard'> | null = null;
  let running: object | null = null, epoch = Object.freeze({});
  let initialized: { readonly app: App; readonly generation: number } | null = null;
  const same = (e: Birth): boolean => {
    const app = options.application(), map = readNativeTravelLease(options.source)?.mapBirth;
    return birth === e && app === e.app && app.stateGeneration === e.generation && map?.birth === e.birth && map.scene === e.scene;
  };
  const frame = () => {
    const app = options.application(), snapshot = readNativeTravelLease(options.source), b = snapshot?.mapBirth, f = b?.frame;
    const manager = own(root, 'SceneManager'), scene = own(manager, '_scene');
    if (!app || !b || !f || snapshot?.current !== null || snapshot.sourceHandoff || b.manager !== manager || b.scene !== scene
      || own(manager, '_nextScene') !== null || f.map !== own(root, '$gameMap') || f.player !== own(root, '$gamePlayer')
      || f.data !== own(root, '$dataMap') || f.mapId !== own(f.map, '_mapId') || own(f.player, '_transferring') !== false) return null;
    return { app, b, started: own(scene, '_started') === true && own(scene, '_active') === true };
  };
  const restore = (e: Birth): void => {
    if (running || e.phase !== 'waiting' || !same(e) || options.loadPending() || e.app.saveBlocked || e.app.encounterBlocked) return;
    const token = Object.freeze({}), localEpoch = epoch; running = token; e.phase = 'running';
    void (async () => {
      try {
        // Bootstrap releases its private projection intent before the genuine-birth repair starts.
        if (!initialized || initialized.app !== e.app || initialized.generation !== e.generation) {
          const result = await e.app.initializeBlackoutCompanions();
          if (!same(e) || epoch !== localEpoch) return;
          if (result.status === 'failed') report(Error(`companion-initialize:${result.reason}`));
          else initialized = { app: e.app, generation: e.generation };
        }
        const result = await e.app.restoreEventCompanionsAtMap(e.birth);
        if (!same(e) || epoch !== localEpoch) return;
        if (result.status === 'failed') report(Error(`companion-restore:${result.reason}`));
      } catch (error) { report(error); }
      finally { if (running === token) running = null; if (same(e) && epoch === localEpoch) e.phase = 'settled'; }
    })();
  };
  const move = (): void => {
    const notice = follow, actual = frame();
    if (!notice || running || !actual?.started || birth?.phase !== 'settled' || options.loadPending()) return;
    if (actual.app !== notice.application || actual.app.stateGeneration !== notice.generation) { if (follow === notice) follow = null; return; }
    if (actual.app.saveBlocked || actual.app.encounterBlocked) return;
    try { notice.guard(); } catch (error) { if (follow === notice) follow = null; report(error); return; }
    const token = Object.freeze({}), localEpoch = epoch; follow = null; running = token;
    void (async () => {
      try {
        const result = await actual.app.advanceEventCompanions();
        if (epoch !== localEpoch || options.application() !== actual.app || actual.app.stateGeneration !== notice.generation) return;
        if (result.status !== 'failed' && result.status !== 'cancelled') options.followed?.();
        if (result.status === 'failed') {
          report(Error(`companion-follow:${result.reason}`));
          // One current-generation repair attempt, never an unbounded per-frame retry.
          const repair = await actual.app.recoverEventCompanionProjection();
          if (repair.status === 'failed') report(Error(`companion-follow-repair:${repair.reason}`));
        }
      } catch (error) { report(error); }
      finally { if (running === token) running = null; }
    })();
  };
  const ready = (): void => {
    const actual = frame(); if (!actual) return;
    if (!birth || birth.app !== actual.app || birth.generation !== actual.app.stateGeneration || birth.birth !== actual.b.birth)
      birth = { app: actual.app, generation: actual.app.stateGeneration, birth: actual.b.birth, scene: actual.b.scene, phase: 'waiting' };
  };
  return Object.freeze({
    /** Scheduling only, after a genuine loaded witness and before native start/display. */
    ready,
    /** Runs before each actual Map.update; factory animation keeps running while its App action awaits it. */
    mapFrame(): void {
      options.runtime()?.update();
      ready(); const actual = frame(); if (!actual || !birth) return;
      if (actual.started) { restore(birth); move(); }
    },
    started(_notice: CompanionMotionNotice): void { options.runtime()?.syncPresentation(); },
    completed(notice: CompanionMotionNotice): void { notice.guard(); follow = notice; },
    connectionCompleted(guard: () => void): void {
      const actual = frame(); if (!actual) throw Error('companion-connection-map-not-ready');
      guard(); follow = Object.freeze({ application: actual.app, generation: actual.app.stateGeneration, guard });
    },
    pending(): boolean { return birth?.phase === 'waiting' || birth?.phase === 'running' || running !== null || follow !== null; },
    invalidate(): void { epoch = Object.freeze({}); birth = null; follow = null; running = null; initialized = null; },
  });
}
