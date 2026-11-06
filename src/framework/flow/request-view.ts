/** Passive Session request projection. All lifecycle data stays outside rollback state and protocol v1. */
import type { BattleDriver, DriverRequestSource, GatewayMessage } from '../battle/driver';
import { currentGatewayRequestSource, readRequestMessageSource, checkpointRequestMessages, restoreRequestMessages } from '../battle/request-source';

type Request = Record<string, unknown>;
interface Session {
  gw: BattleDriver; requests?: Record<string, Request>; held: GatewayMessage[]; out: object[];
  _operation: boolean; _restoring: boolean; finished: boolean; ended: unknown; broken: unknown;
}
interface Pair { request: Request; source?: DriverRequestSource }
interface View { epoch: number; state: 'active' | 'restoring' | 'unavailable'; pair?: Pair; reason?: string }
const VIEWS = new WeakMap<object, View>();
const CHECKPOINTS = new WeakMap<object, { session: Session; pair?: Pair; held: object; out: object }>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export interface SessionRequestContext {
  status: 'available' | 'none' | 'unavailable'; requestViewEpoch: number | null;
  request?: Request; source?: DriverRequestSource; reason?: string;
}
export function initializeRequestView(session: object): void { VIEWS.set(session, { epoch: 1, state: 'active' }); }
export function clearRequestView(session: object): void { const view = VIEWS.get(session); if (view) view.pair = undefined; }
export function publishRequestView(session: Session, message: GatewayMessage): void {
  const view = VIEWS.get(session);
  if (view && message.kind === 'request' && message.side === 'p1') {
    const source = readRequestMessageSource(session.gw, message);
    view.pair = source ? { request: clone(message.request), source } : undefined;
  }
}
export function checkpointRequestView(session: Session, checkpoint: object): void {
  const view = VIEWS.get(session), held = {}, out = {};
  checkpointRequestMessages(session.gw, held, session.held);
  checkpointRequestMessages(session.gw, out, session.out);
  CHECKPOINTS.set(checkpoint, { session, ...(view?.pair ? { pair: clone(view.pair) } : {}), held, out });
}
/** Called after the existing read-only owner preflight, before any restore mutation/await. */
export function beginRequestViewRestore(session: object): void {
  const view = VIEWS.get(session);
  if (view) { view.epoch++; view.state = 'restoring'; view.pair = undefined; }
}
export function finishRequestViewRestore(session: Session, checkpoint: object): void {
  const view = VIEWS.get(session), saved = CHECKPOINTS.get(checkpoint);
  if (!view) return;
  if (!saved || saved.session !== session || !Number.isSafeInteger(view.epoch)) { view.state = 'unavailable'; view.reason = 'checkpoint-source-unavailable'; return; }
  restoreRequestMessages(session.gw, saved.held, session.held);
  restoreRequestMessages(session.gw, saved.out, session.out);
  view.pair = saved.pair && clone(saved.pair); view.state = 'active'; view.reason = undefined;
}
export function failRequestViewRestore(session: object): void {
  const view = VIEWS.get(session); if (view) { view.state = 'unavailable'; view.pair = undefined; view.reason = 'restore-failed'; }
}
/** One atomic read; a forged JSON header or a fake driver cannot supply a private Gateway source. */
export function readSessionRequestContext(session: Session): SessionRequestContext {
  const view = VIEWS.get(session), epoch = view?.epoch ?? null;
  const unavailable = (reason: string): SessionRequestContext => ({ status: 'unavailable', requestViewEpoch: epoch, reason });
  if (!view || view.state !== 'active') return unavailable(view?.reason ?? view?.state ?? 'source-view-unavailable');
  if (!Number.isSafeInteger(epoch) || session._restoring || session._operation) return unavailable('request-view-busy');
  if (session.broken) return unavailable('session-broken');
  if (session.finished || session.ended) return { status: 'none', requestViewEpoch: epoch };
  const request = session.requests?.p1;
  if (!request || request.wait || !Array.isArray(request.forceSwitch) || !request.forceSwitch.some(Boolean)) return { status: 'none', requestViewEpoch: epoch };
  const pair = view.pair, current = currentGatewayRequestSource(session.gw);
  if (!pair?.source || !current || pair.source.occurrenceId !== current.occurrenceId) return unavailable('forced-source-unavailable');
  if (JSON.stringify(request) !== JSON.stringify(pair.request)) return unavailable('request-view-changed');
  return { status: 'available', requestViewEpoch: epoch, request: clone(pair.request), source: { ...pair.source } };
}
