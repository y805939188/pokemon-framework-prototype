/** Native projection ownership only. Actual App admission and all saved writes stay in the service. */
import { createEventCompanionHost } from './event-companion-host';
import type { EventCompanionNativeHost } from './event-companion-host';
import type { CompanionHost } from '../../framework/app/event-companion-operation';
import type { CompanionApplicationBinding, EventCompanionApplicationService } from '../../framework/app/event-companion-ports';
import type { CompanionTrailPorts } from '../../framework/rules/event-companions';
import type { EventCompanionState } from '../../framework/rules/world-state';
import type { WorldFact } from '../../framework/rules/world-data';
import { hostRecord, invoke } from './host-access';
import type { CompanionProjectionReset, CompanionResetBinding, CompanionResetNativeResult, CompanionResetResources } from '../../framework/app/event-companion-projection-reset';

export interface EventCompanionMZOptions {
  /** The actual App-owned service instance, never a caller supplied boolean per bind.
   * Capture this instance and its original reader once, including across plugin IIFEs. */
  readonly service: Pick<EventCompanionApplicationService, 'isBindingIssued'>;
  current(): Readonly<{ owner: object; generation: number }> | null;
  readCompanions(): readonly EventCompanionState[];
  relation: CompanionTrailPorts['relation'];
  canEnter: CompanionTrailPorts['canEnter'];
  placement?(actualRelative: import('../../framework/rules/world-data').WorldLocation): WorldFact<import('../../framework/rules/companion-placement').CompanionPlacement>;
  iceSliding?(): WorldFact<boolean>;
  diagnostic?(reason: string): void;
  /** Actual reset controller, captured once; no per-call issuer/boolean injection. */
  readonly reset?: Pick<CompanionProjectionReset, 'isBindingIssued' | 'isRetirementIssued' | 'retirementAttempt'>;
}
export interface EventCompanionMZFactory {
  bind(binding: CompanionApplicationBinding): CompanionHost;
  retireProjection(binding: CompanionApplicationBinding): void;
  /** The author's unmasked native intent, never the effective isVisible() result. */
  authorVisible(): boolean;
  update(): void;
  syncPresentation(): void;
  dispose(): void;
  resetProjection(binding: CompanionResetBinding): CompanionResetNativeResult;
  retryProjectionReset(binding: CompanionResetBinding): CompanionResetNativeResult;
}
interface Surface {
  readonly owner: object; readonly generation: number; readonly serial: object;
  native: EventCompanionNativeHost | null; binding: Bound | null; revoked: boolean; firstProjectCompleted: boolean;
}
interface Bound {
  readonly binding: CompanionApplicationBinding; readonly owner: object; readonly generation: number;
  readonly running: CompanionApplicationBinding['isOperationCurrent'];
  readonly retiring: CompanionApplicationBinding['isProjectionRetiring'];
  readonly surface: Surface; readonly serial: object;
  host: CompanionHost | null; retired: boolean;
}
export function createEventCompanionMZ(rootValue: unknown, options: EventCompanionMZOptions): EventCompanionMZFactory {
  const root = hostRecord(rootValue);
  if (!root) throw Error('companion-mz-root-unavailable');
  const service = options.service, readIssued = service?.isBindingIssued;
  const readPresentation = (service as Partial<import('../../framework/app/event-companion-ports').EventCompanionApplicationService>)?.runtimePresentation;
  let presentedSurface: Surface | null = null, presentedRevision = -1;
  if (!service || typeof readIssued !== 'function') throw Error('companion-mz-issuer-unavailable');
  const isIssued = (binding: CompanionApplicationBinding): boolean => Reflect.apply(readIssued, service, [binding]) === true;
  const reset = options.reset, readReset = reset?.isBindingIssued, readRetiring = reset?.isRetirementIssued, readAttempt = reset?.retirementAttempt;
  if (reset && (typeof readReset !== 'function' || typeof readRetiring !== 'function' || typeof readAttempt !== 'function')) throw Error('companion-reset-capability-unavailable');
  const resets = new WeakMap<object, { readonly target: Surface | null; readonly serial: object | null;
    first: CompanionResetNativeResult | null; readonly retries: WeakMap<object, CompanionResetNativeResult> }>();
  const unknownResources: CompanionResetResources = Object.freeze({ hadSurface: null, spritesRemaining: null, charactersRemaining: null, motionsRemaining: null, maskDetached: null });
  const rejected = (reason: string): CompanionResetNativeResult => ({ status: 'rejected', reason, resources: unknownResources, diagnostics: [] });
  const bindings = new WeakMap<object, Bound>(), owners = new WeakMap<object, Bound>();
  let surface: Surface | null = null, bindingNow = false;
  const diagnose = (message: string): void => { try { options.diagnostic?.(message); } catch { /* Diagnostics do not own cleanup. */ } };
  const context = () => {
    const actual = options.current();
    if (!actual || !actual.owner || typeof actual.owner !== 'object' || !Number.isSafeInteger(actual.generation) || actual.generation < 0) throw Error('companion-mz-context-unavailable');
    return actual;
  };
  const currentSurface = (candidate: Surface): boolean => {
    if (surface !== candidate || candidate.revoked) return false;
    try { const actual = context(); return surface === candidate && !candidate.revoked && actual.owner === candidate.owner && actual.generation === candidate.generation; }
    catch { return false; }
  };
  const sameBinding = (bound: Bound): boolean => {
    const object = bound.binding;
    return bindings.get(object) === bound && owners.get(bound.owner) === bound && isIssued(object) && Object.isFrozen(object)
      && object.owner === bound.owner && object.generation === bound.generation
      && object.isOperationCurrent === bound.running && object.isProjectionRetiring === bound.retiring;
  };
  const active = (bound: Bound): boolean => {
    if (!sameBinding(bound) || bound.retired || bound.surface.binding !== bound || bound.surface.serial !== bound.serial || !currentSurface(bound.surface)) return false;
    const allowed = Reflect.apply(bound.running, bound.binding, [bound.owner, bound.generation]) === true;
    return allowed && sameBinding(bound) && !bound.retired && bound.surface.binding === bound && currentSurface(bound.surface);
  };
  const retirement = (bound: Bound): boolean => {
    if (!sameBinding(bound) || bound.surface.serial !== bound.serial) return false;
    const allowed = Reflect.apply(bound.retiring, bound.binding, [bound.owner, bound.generation]) === true;
    return allowed && sameBinding(bound) && bound.surface.serial === bound.serial;
  };
  const revoke = (target: Surface): void => {
    // Revoke the exact resource before native hooks can reenter and install a successor.
    target.revoked = true;
    if (surface === target) surface = null;
    target.native?.dispose();
  };
  const own = (value: unknown, key: string): unknown => { const object = hostRecord(value); if (!object) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(object, key); return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined; };
  const resetCurrent = (binding: CompanionResetBinding, retiring: boolean): boolean => {
    try {
      const reader = retiring ? readRetiring : readReset;
      if (!reset || typeof reader !== 'function' || Reflect.apply(reader, reset, [binding]) !== true) return false;
      const actual = context(), map = own(root, '$gameMap'), manager = own(root, 'SceneManager');
      return actual.owner === binding.application && actual.generation === binding.generation
        && (retiring || map === binding.map && own(map, '_mapId') === binding.mapId && own(root, '$dataMap') === binding.data
        && own(root, '$gamePlayer') === binding.player && own(manager, '_scene') === binding.scene
        && own(binding.player, '_x') === binding.x && own(binding.player, '_y') === binding.y
        && own(binding.player, '_direction') === binding.direction && own(binding.player, '_transferring') === binding.transferring
        && own(manager, '_nextScene') === binding.nextScene)
        && Reflect.apply(reader, reset, [binding]) === true;
    } catch { return false; }
  };
  const cleanupReset = (binding: CompanionResetBinding, record: { readonly target: Surface | null; readonly serial: object | null }, retiring: boolean): CompanionResetNativeResult => {
    if (!resetCurrent(binding, retiring) || record.target && record.target.serial !== record.serial) return rejected('companion-reset-source-stale');
    let result: CompanionResetNativeResult;
    try {
      const report = record.target?.native?.retireProjection();
      const resources: CompanionResetResources = Object.freeze({ hadSurface: record.target !== null,
        spritesRemaining: report?.spritesRemaining ?? 0, charactersRemaining: report?.charactersRemaining ?? 0,
        motionsRemaining: report?.motionsRemaining ?? 0, maskDetached: report?.maskDetached ?? true });
      const diagnostics = report?.diagnostics ?? [];
      result = { status: diagnostics.length || resources.spritesRemaining || resources.charactersRemaining || resources.motionsRemaining || !resources.maskDetached ? 'fallback' : 'cleared', resources, diagnostics };
    } catch (error) { const reason = error instanceof Error ? error.message : String(error); result = { status: 'fallback', reason, resources: unknownResources, diagnostics: [reason] }; }
    return resetCurrent(binding, retiring) && (!record.target || record.target.serial === record.serial) ? result : { ...result, status: 'rejected', reason: 'companion-reset-source-stale-after-cleanup' };
  };
  const factory: EventCompanionMZFactory = {
    bind(binding) {
      if (bindingNow) throw Error('companion-mz-bind-reentrant');
      bindingNow = true;
      try {
        if (!binding || !Object.isFrozen(binding) || !binding.owner || typeof binding.owner !== 'object' || !Number.isSafeInteger(binding.generation)
          || typeof binding.isOperationCurrent !== 'function' || typeof binding.isProjectionRetiring !== 'function') throw Error('companion-mz-binding-invalid');
        const existing = bindings.get(binding);
        if (existing) { if (!active(existing) || !existing.host) throw Error('companion-mz-binding-stale'); return existing.host; }
        if (owners.has(binding.owner) || !isIssued(binding) || binding.isOperationCurrent(binding.owner, binding.generation) !== true || !isIssued(binding)) throw Error('companion-mz-binding-unissued');
        const actual = context();
        if (actual.generation !== binding.generation) throw Error('companion-mz-binding-stale');
        if (surface && !currentSurface(surface)) revoke(surface);
        if (!surface) {
          const next: Surface = { owner: actual.owner, generation: actual.generation, serial: Object.freeze({}), native: null, binding: null, revoked: false, firstProjectCompleted: false };
          surface = next;
          next.native = createEventCompanionHost(root, {
            owner: next.owner, generation: next.generation,
            isSurfaceCurrent: (owner, generation) => owner === next.owner && generation === next.generation && currentSurface(next),
            readCompanions: options.readCompanions, relation: options.relation, canEnter: options.canEnter,
            ...(options.placement ? { placement: options.placement } : {}),
            ...(options.iceSliding ? { iceSliding: options.iceSliding } : {}),
            // A real native handle slot has not been installed in the atomic lifecycle yet.
            observeLocation: () => diagnose('companion-forced-location-unwired'), diagnostic: diagnose,
          });
        }
        const held = surface;
        const bound: Bound = { binding, owner: binding.owner, generation: binding.generation, running: binding.isOperationCurrent,
          retiring: binding.isProjectionRetiring, surface: held, serial: held.serial, host: null, retired: false };
        bindings.set(binding, bound); owners.set(bound.owner, bound); held.binding = bound;
        if (!active(bound) || !held.native) throw Error('companion-mz-binding-stale');
        const native = held.native.bind({ owner: bound.owner, generation: bound.generation,
          isOperationCurrent: (owner, generation) => owner === bound.owner && generation === bound.generation && active(bound) });
        bound.host = { source: origin => native.source(origin), trail: native.trail, move: entry => native.move(entry),
          project: async projection => {
            await native.project(projection);
            // active() rechecks the exact surface/serial/binding and actual App/gen
            // after the asynchronous native work; an old completion cannot mark a successor.
            if (active(bound)) {
              held.firstProjectCompleted = true;
              factory.syncPresentation();
            }
          } };
        if (!active(bound)) throw Error('companion-mz-binding-stale');
        return bound.host;
      } finally { bindingNow = false; }
    },
    retireProjection(binding) {
      const bound = bindings.get(binding);
      if (!bound || !retirement(bound)) throw Error('companion-mz-retirement-unissued');
      if (bound.retired) return;
      if (surface !== bound.surface || bound.surface.binding !== bound || !sameBinding(bound)) throw Error('companion-mz-retirement-superseded');
      bound.retired = true;
      revoke(bound.surface);
      if (!retirement(bound)) throw Error('companion-mz-retirement-stale-after-cleanup');
      // Never assign surface after cleanup: its callbacks may have installed a different serial.
    },
    authorVisible() {
      const followers = hostRecord(invoke(root.$gamePlayer, 'followers')), author = followers?._visible;
      if (typeof author !== 'boolean') throw Error('companion-author-visibility-unavailable');
      return author;
    },
    syncPresentation() {
      // Before the first project finishes, native followers/mask installation may
      // still await a source read. Native updates must keep running during that wait.
      const target = surface; if (!target?.native || !target.firstProjectCompleted || !currentSurface(target) || typeof readPresentation !== 'function') return;
      const state = Reflect.apply(readPresentation, service, []);
      if (!currentSurface(target) || state.generation !== target.generation || !Number.isSafeInteger(state.revision)
        || !Array.isArray(state.transferHidden) || !state.transferHidden.every((id: unknown) => typeof id === 'string') || typeof state.turnTowardPlayer !== 'boolean') return;
      if (presentedSurface === target && presentedRevision === state.revision) return;
      target.native.presentation(state.transferHidden, state.turnTowardPlayer);
      if (currentSurface(target)) { presentedSurface = target; presentedRevision = state.revision; }
    },
    update() { const current = surface; factory.syncPresentation(); current?.native?.update(); },
    dispose() { const current = surface; if (current) revoke(current); },
    resetProjection(binding) {
      if (!binding || typeof binding !== 'object' || !Object.isFrozen(binding)) return rejected('companion-reset-binding-unissued');
      const previous = resets.get(binding); if (previous?.first) return previous.first;
      if (!resetCurrent(binding, false)) return rejected('companion-reset-binding-unissued');
      const target = surface;
      // Empty loaded records need not bind a new surface. The real reset may still
      // retire this factory's exact older-generation projection for the same App.
      // It cannot borrow another App's surface or a current/newer generation.
      const older = target !== null && !target.revoked && target.owner === binding.application
        && target.generation < binding.generation;
      if (target && (!currentSurface(target) && !older || target.binding && active(target.binding))) return rejected('companion-reset-projection-active');
      if (!resetCurrent(binding, false) || target !== surface) return rejected('companion-reset-source-stale');
      const record = { target, serial: target?.serial ?? null, first: null as CompanionResetNativeResult | null, retries: new WeakMap<object, CompanionResetNativeResult>() };
      resets.set(binding, record);
      if (target) { target.revoked = true; if (surface === target) surface = null; }
      record.first = cleanupReset(binding, record, false);
      return record.first;
    },
    retryProjectionReset(binding) {
      const record = resets.get(binding);
      if (!record || !record.first || !resetCurrent(binding, true)) return rejected('companion-reset-retirement-unissued');
      const attempt: unknown = typeof readAttempt === 'function' ? Reflect.apply(readAttempt, reset, [binding]) : null;
      if (!attempt || typeof attempt !== 'object' || !resetCurrent(binding, true)) return rejected('companion-reset-retirement-unissued');
      const previous = record.retries.get(attempt); if (previous) return previous;
      const result = cleanupReset(binding, record, true); record.retries.set(attempt, result); return result;
    },
  };
  return factory;
}
