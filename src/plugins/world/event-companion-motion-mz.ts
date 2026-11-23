/** Actual player motion observations. Notices request work; they never authorize App writes. */
import { semanticFingerprint } from '../../framework/rules/semantic';
import type { Content } from '../../framework/rules/types';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';
import { readNativeTravelLease } from './travel-lease-registry-mz';

type Method = (this: unknown, ...args: unknown[]) => unknown;
export interface CompanionMotionCurrent {
  readonly application: object; readonly generation: number; readonly content: Content;
}
export interface CompanionMotionNotice {
  readonly application: object; readonly generation: number; readonly serial: object;
  readonly player: object; readonly map: object; readonly data: object; readonly scene: object; readonly mapId: number;
  readonly from: Readonly<{ x: number; y: number }>; readonly to: Readonly<{ x: number; y: number }>;
  readonly kind: 'straight' | 'diagonal' | 'jump'; readonly displaced: boolean;
  readonly completedStepId: string | null;
  /** Native outside-final source check only. App still issues and validates its own intent. */
  guard(): void;
}
export interface CompanionMotionMZOptions {
  readonly root: Record<string, unknown>; readonly source: WorldTravelLeaseSource;
  readonly isProxy: (value: unknown) => boolean;
  current(): CompanionMotionCurrent | null;
  /** Same private runtime ownership query as native START; external/frozen inputs are not credentials. */
  ownedContentIdentity?(content: unknown): string | undefined;
  captureReservationGuard(player: object): () => void;
  started(notice: CompanionMotionNotice): void;
  completed(notice: CompanionMotionNotice): void;
  diagnostic(reason: string): void;
}
interface Frame {
  readonly player: object; readonly from: Readonly<{ x: number; y: number }>;
  readonly initial: Running | null; readonly guard: () => void;
  readonly source: Omit<CompanionMotionNotice, 'kind' | 'from' | 'to' | 'displaced' | 'completedStepId' | 'guard'>;
  stepId: string | null;
}
interface Running { readonly notice: CompanionMotionNotice; motionDone: boolean; stepDone: boolean }
export interface CompanionMotionMZ {
  /** Only the already-running actual native call frame can accept this D marker. */
  tracked(player: object, id: string): void;
  /** The exact real D context calls after its native/App completion, never increaseSteps. */
  settled(player: object, id: string): void;
  cancelled(player: object, id: string): void;
  invalidate(): void;
}
export function installCompanionMotionMZ(options: CompanionMotionMZOptions): CompanionMotionMZ {
  const { root, isProxy } = options;
  const object = (raw: unknown): object => {
    if (raw === null || typeof raw !== 'object' && typeof raw !== 'function' || isProxy(raw)) throw Error('companion-motion-reference-unavailable');
    return raw as object;
  };
  const own = (raw: unknown, key: string): unknown => {
    const d = Object.getOwnPropertyDescriptor(object(raw), key);
    if (!d || !('value' in d)) throw Error(`companion-motion-own-data-required:${key}`);
    return d.value;
  };
  const integer = (raw: unknown): number => {
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) throw Error('companion-motion-integer-unavailable');
    return raw;
  };
  const point = (player: object) => Object.freeze({ x: integer(own(player, '_x')), y: integer(own(player, '_y')) });
  const equal = (a: Readonly<{ x: number; y: number }>, b: Readonly<{ x: number; y: number }>): boolean => a.x === b.x && a.y === b.y;
  const diagnose = (error: unknown): void => {
    let reason = 'companion-motion-observation-unavailable';
    if (error !== null && typeof error === 'object' && !isProxy(error)) {
      const d = Object.getOwnPropertyDescriptor(error, 'message'); if (d && 'value' in d && typeof d.value === 'string') reason = d.value;
    }
    try { options.diagnostic(reason); } catch { /* Reporting has no cleanup ownership. */ }
  };
  const pureData = (raw: unknown, visiting = new Set<object>()): void => {
    if (raw === null || ['string', 'number', 'boolean'].includes(typeof raw)) return;
    const value = object(raw); if (typeof raw === 'function' || visiting.has(value)) throw Error('companion-motion-content-unavailable');
    visiting.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw Error('companion-motion-content-key-invalid');
      const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !('value' in d)) throw Error('companion-motion-content-data-required');
      if (d.value !== undefined) pureData(d.value, visiting);
    }
    visiting.delete(value);
  };
  const contentIdentityOf = (content: Content): string => {
    const owned = options.ownedContentIdentity?.(content);
    if (owned !== undefined) return owned;
    pureData(content); return semanticFingerprint(content);
  };
  const prototype = object(own(own(root, 'Game_Player'), 'prototype')) as Record<string, unknown>;
  const method = (name: string): Method => {
    for (let target: object | null = prototype; target; target = Object.getPrototypeOf(target) as object | null) {
      object(target); const d = Object.getOwnPropertyDescriptor(target, name); if (!d) continue;
      if ('value' in d && typeof d.value === 'function' && !isProxy(d.value)) return d.value as Method;
      break;
    }
    throw Error(`companion-motion-native-method-unavailable:${name}`);
  };
  let current: Running | null = null, epoch: object = Object.freeze({});
  const stack: (Frame | null)[] = [];
  const capture = (player: object): Frame => {
    if (own(root, '$gamePlayer') !== player) throw Error('companion-motion-player-changed');
    const actual = options.current(); if (!actual || !Number.isSafeInteger(actual.generation) || actual.generation < 0) throw Error('companion-motion-application-unavailable');
    object(actual.application);
    const contentIdentity = contentIdentityOf(actual.content), native = readNativeTravelLease(options.source), birth = native?.mapBirth, frame = birth?.frame;
    const manager = object(own(root, 'SceneManager')), scene = object(own(manager, '_scene'));
    const map = object(own(root, '$gameMap')), mapId = integer(own(map, '_mapId')), data = object(own(root, '$dataMap'));
    if (!birth || !frame || birth.manager !== manager || birth.scene !== scene || frame.map !== map || frame.mapId !== mapId
      || frame.player !== player || frame.data !== data || own(manager, '_nextScene') !== null || own(player, '_transferring') !== false) throw Error('companion-motion-genuine-map-required');
    const reservation = options.captureReservationGuard(player), localEpoch = epoch;
    const guard = (): void => {
      const after = options.current(); reservation();
      if (!after || after.application !== actual.application || after.generation !== actual.generation || after.content !== actual.content || localEpoch !== epoch) throw Error('companion-motion-owner-changed');
      const now = readNativeTravelLease(options.source), latest = now?.mapBirth;
      if (contentIdentityOf(after.content) !== contentIdentity || now?.nativeEpoch !== native?.nativeEpoch || !latest
        || latest.birth !== birth.birth || latest.queue !== birth.queue || latest.scene !== scene || latest.frame?.map !== map || latest.frame.data !== data
        || own(root, 'SceneManager') !== manager || own(manager, '_scene') !== scene || own(manager, '_nextScene') !== null
        || own(root, '$gameMap') !== map || own(map, '_mapId') !== mapId || own(root, '$dataMap') !== data || own(root, '$gamePlayer') !== player
        || own(player, '_transferring') !== false) throw Error('companion-motion-source-changed');
      reservation();
    };
    guard();
    return { player, from: point(player), initial: current, source: { application: actual.application, generation: actual.generation,
      serial: Object.freeze({}), player, map, data, scene, mapId }, guard, stepId: null };
  };
  const moving = (player: object): boolean => {
    const p = point(player), x = own(player, '_realX'), y = own(player, '_realY'), jump = integer(own(player, '_jumpCount'));
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) throw Error('companion-motion-real-position-unavailable');
    return p.x !== x || p.y !== y || jump > 0;
  };
  const finish = (running: Running): void => {
    if (current !== running || !running.motionDone || !running.stepDone) return;
    try {
      running.notice.guard();
      if (!equal(point(running.notice.player), running.notice.to)) throw Error('companion-motion-completion-position-changed');
      if (current !== running) return;
      current = null; // Consume before unknown consumers; their successor always wins.
      options.completed(running.notice);
    } catch (error) { if (current === running) current = null; diagnose(error); }
  };
  for (const [name, kind] of [['moveStraight', 'straight'], ['moveDiagonally', 'diagonal'], ['jump', 'jump']] as const) {
    const original = method(name);
    prototype[name] = function(this: unknown, ...args: unknown[]): unknown {
      let frame: Frame | null = null;
      try { frame = capture(object(this)); } catch { /* Native startup/nonplayer work is not an observation. */ }
      stack.push(frame); let returned = false;
      try { const result = Reflect.apply(original, this, args); returned = true; return result; }
      finally {
        stack.pop();
        if (frame && returned) try {
          frame.guard(); const to = point(frame.player), displaced = !equal(frame.from, to);
          if ((displaced || moving(frame.player)) && !(current !== frame.initial && current && equal(current.notice.to, to))) {
            const notice: CompanionMotionNotice = Object.freeze({ ...frame.source, from: frame.from, to, kind, displaced,
              completedStepId: frame.stepId, guard: () => { frame!.guard(); if (!equal(point(frame!.player), to)) throw Error('companion-motion-target-changed'); } });
            const running: Running = { notice, motionDone: !moving(frame.player), stepDone: frame.stepId === null };
            current = running;
            try { options.started(notice); } catch (error) { diagnose(error); }
            finish(running);
          }
        } catch (error) { diagnose(error); }
      }
    };
  }
  for (const name of ['updateMove', 'updateJump'] as const) {
    const original = method(name);
    prototype[name] = function(this: unknown, ...args: unknown[]): unknown {
      const result = Reflect.apply(original, this, args), running = current;
      if (running && this === running.notice.player) try {
        if (!moving(running.notice.player)) { running.motionDone = true; finish(running); }
      } catch (error) { if (current === running) current = null; diagnose(error); }
      return result;
    };
  }
  return Object.freeze<CompanionMotionMZ>({
    tracked(player, id) {
      const frame = stack[stack.length - 1];
      if (frame?.player === player && typeof id === 'string' && id.length) frame.stepId = id;
    },
    settled(player, id) {
      const running = current;
      if (running?.notice.player === player && running.notice.completedStepId === id) { running.stepDone = true; finish(running); }
    },
    cancelled(player, id) { const running = current; if (running?.notice.player === player && running.notice.completedStepId === id) current = null; },
    invalidate() { epoch = Object.freeze({}); current = null; },
  });
}
