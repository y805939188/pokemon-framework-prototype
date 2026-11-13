/** Private observation companion. Delivery, JSON and request reads cannot mint provenance. */
import type { BattleDriver, DriverCheckpoint, DriverRequestSource, GatewayMessage } from './driver';
import type { ShowdownBattle } from './showdown-types';

interface Source {
  battle: ShowdownBattle; domain: number; serial: number; refreshing: number; closed: boolean;
  authority: object; logical?: DriverRequestSource; request?: object;
}
const SOURCES = new WeakMap<BattleDriver, Source>();
const BATTLES = new WeakMap<object, Source>();
const MESSAGES = new WeakMap<object, { authority: object; source: DriverRequestSource }>();
const CHECKPOINTS = new WeakMap<DriverCheckpoint, { logical?: DriverRequestSource; queue: (DriverRequestSource | undefined)[] }>();
const MESSAGE_GROUPS = new WeakMap<object, { source?: DriverRequestSource; projection: string }[]>();
let domain = 0;
const copy = (s: DriverRequestSource): DriverRequestSource => ({ ...s });
const forced = (request: any): boolean => !!request && !request.wait && Array.isArray(request.forceSwitch) && request.forceSwitch.some(Boolean);
function pending(s: Source): boolean {
  const b = s.battle;
  return !s.closed && !b.ended && b.gen === 8 && b.gameType === 'singles' && b.requestState === 'switch'
    && forced(b.sides[0]?.activeRequest) && s.request === b.sides[0].activeRequest;
}

export function attachRequestSource(driver: BattleDriver, battle: ShowdownBattle): void {
  if (BATTLES.has(battle)) return;
  const s: Source = { battle, domain: ++domain, serial: 0, refreshing: 0, closed: false, authority: {} };
  const original = battle.makeRequest;
  Object.defineProperty(battle, 'makeRequest', { configurable: true, writable: true, enumerable: false,
    value: function(this: ShowdownBattle, ...args: unknown[]): unknown {
      const result = original.apply(this, args);
      if (this === battle) {
        const request = battle.sides[0]?.activeRequest;
        if (!battle.ended && battle.gen === 8 && battle.gameType === 'singles' && battle.requestState === 'switch' && forced(request)) {
          if (!s.refreshing) {
            const serial = ++s.serial;
            s.logical = Number.isSafeInteger(s.domain) && Number.isSafeInteger(serial)
              ? Object.freeze({ version: 'player-forced-choice-source-v1', side: 'p1', occurrenceId: `p1-forced/${s.domain}/${serial}` }) : undefined;
          }
          s.request = request;
        } else { s.logical = undefined; s.request = undefined; }
      }
      return result;
    } });
  SOURCES.set(driver, s); BATTLES.set(battle, s);
}

/** The only technical range; no external callback is accepted by the public driver. */
export function technicalRequestRefresh<T>(driver: BattleDriver, refresh: () => T): T {
  const s = SOURCES.get(driver);
  if (!s) return refresh();
  if (!pending(s)) { s.logical = undefined; s.request = undefined; }
  s.refreshing++;
  try { return refresh(); } finally { s.refreshing--; }
}

/** Read raw choice fields only: isChoiceDone() itself can append pass actions. */
export function currentGatewayRequestSource(driver: BattleDriver): DriverRequestSource | undefined {
  const s = SOURCES.get(driver);
  return s && pending(s) && s.logical && s.battle.sides[0].choice.actions.length === 0 ? copy(s.logical) : undefined;
}
function bindMessage(driver: BattleDriver, message: GatewayMessage, source?: DriverRequestSource): void {
  if (message.kind !== 'request' || message.side !== 'p1' || !forced(message.request) || !source) return;
  const authority = SOURCES.get(driver)?.authority; if (!authority) return;
  const value = Object.freeze(copy(source));
  // Preserve protocol-v1 observed Object.keys/JSON shapes; the header is internal only.
  Object.defineProperty(message, 'source', { value, enumerable: false, configurable: false });
  MESSAGES.set(message, { authority, source: value });
}
export function tagRequestMessage(driver: BattleDriver, message: GatewayMessage): void {
  if (message.kind !== 'request' || message.side !== 'p1' || !forced(message.request)) return;
  const s = SOURCES.get(driver), source = currentGatewayRequestSource(driver);
  if (s && source && JSON.stringify(message.request) === JSON.stringify(s.battle.sides[0]?.activeRequest)) {
    bindMessage(driver, message, source);
  }
}
export function readRequestMessageSource(driver: BattleDriver, message: GatewayMessage): DriverRequestSource | undefined {
  const entry = MESSAGES.get(message);
  return entry && entry.authority === SOURCES.get(driver)?.authority && message.kind === 'request' && message.source === entry.source ? copy(entry.source) : undefined;
}
export function checkpointRequestSource(driver: BattleDriver, token: DriverCheckpoint, queue: GatewayMessage[]): void {
  const s = SOURCES.get(driver);
  CHECKPOINTS.set(token, { ...(s && pending(s) && s.logical ? { logical: copy(s.logical) } : {}),
    queue: queue.map(m => readRequestMessageSource(driver, m)) });
}
export function restoreRequestSource(driver: BattleDriver, token: DriverCheckpoint, queue: GatewayMessage[]): void {
  const s = SOURCES.get(driver), cp = CHECKPOINTS.get(token);
  if (!s || !cp) return; // Plain/legacy snapshot never grants source capability.
  const request = s.battle.sides[0]?.activeRequest;
  if (forced(request) && s.battle.requestState === 'switch' && !s.battle.ended) { s.logical = cp.logical && Object.freeze(copy(cp.logical)); s.request = request; }
  queue.forEach((m, i) => bindMessage(driver, m, cp.queue[i]));
}
export function closeRequestSource(driver: BattleDriver): void {
  const s = SOURCES.get(driver); if (s) { s.closed = true; s.logical = undefined; s.request = undefined; }
}

/** Session-owned private companion for JSON-cloned held/out arrays. Capture cannot mint a header. */
export function checkpointRequestMessages(driver: BattleDriver, token: object, messages: readonly object[]): void {
  MESSAGE_GROUPS.set(token, messages.map(m => { const source = readRequestMessageSource(driver, m as GatewayMessage); return { source, projection: source ? JSON.stringify(m) : '' }; }));
}
export function restoreRequestMessages(driver: BattleDriver, token: object, messages: readonly object[]): void {
  const entries = MESSAGE_GROUPS.get(token);
  if (!SOURCES.has(driver) || !entries || entries.length !== messages.length) return;
  messages.forEach((m, i) => { const entry = entries[i]!; if (entry.source && JSON.stringify(m) === entry.projection) bindMessage(driver, m as GatewayMessage, entry.source); });
}
