import type { Stats } from "../rules/types";
import type { GrowthMessage, SessionMessage } from "../battle/protocol";
import type { BattleSession } from './session';
import { catalogOf } from '../rules/item-catalog';
import { planLearningQueue } from '../rules/learning';

export interface BattleLearnProtection {
  version: 1; memberId: string; slot: number; moveId: string; reason: 'hm-protected';
}

/** The current validated author catalog supplies HM identities; no display-name or Gen8-name guess.
 * This is a detached read-only explanation. The Session repeats the same check before a decision.
 */
export function readBattleLearnProtection(session: Pick<BattleSession, 'pendingLearn' | 'party' | 'content'>, slot: number): BattleLearnProtection | null {
  const pending = session.pendingLearn;
  if (!pending || !Number.isSafeInteger(slot) || slot < 0 || slot > 3) return null;
  const member = session.party.find(member => member.id === pending.memberId);
  if (!member?.moves[slot]) return null;
  const hmMoves = Object.values(catalogOf(session.content)).filter(item => item.fieldUse === 'hm' && typeof item.move === 'string').map(item => item.move!);
  const plan = planLearningQueue(member, [pending.move], { kind: 'battle' },
    { shadow: false, hmMoves, keepMachinePp: false }, [{ kind: 'replace', slot }]);
  return plan.status === 'pending' && plan.selection.reason === 'hm-protected'
    ? { version: 1, memberId: member.id, slot, moveId: member.moves[slot]!.id, reason: 'hm-protected' } : null;
}

/** Applied results only. Reading this projection grants no battle or persistence operation. */
export interface GrowthDisplay {
  version: 1; fromExp: number; toExp: number; fromLevel: number; toLevel: number; hp: number; maxhp: number; ratio: number;
  segments: { level: number; from: number; to: number; levelUp?: { level: number; hp: number; maxhp: number; stats?: { before: Stats; after: Stats } } }[];
}
type Published = { wire: string; display: GrowthDisplay };
type Bound = Published & { owner: object; epoch: number };
const epochs = new WeakMap<object, number>();
const published = new WeakMap<object, Bound>();
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function wire(message: object): string | null {
  try { return JSON.stringify(message); } catch { return null; }
}

/** Internal producer; deliberately excluded from the public facade and protocol-v1 messages. */
export function _publishGrowthDisplay(owner: object, message: GrowthMessage, display: GrowthDisplay): void {
  const encoded = wire(message);
  if (encoded === null) throw new Error("growth presentation requires a JSON message");
  published.set(message, { owner, epoch: epochs.get(owner) ?? 0, wire: encoded, display: copy(display) });
}

/** Read only the actual message from this Session, with a fresh detached result on every call.
 * JSON replays and messages from another Session have no projection. A restore retires old handles.
 */
export function readGrowthDisplay(owner: object, message: object): GrowthDisplay | null {
  const entry = published.get(message);
  if (!entry || entry.owner !== owner || entry.epoch !== (epochs.get(owner) ?? 0) || entry.wire !== wire(message)) return null;
  return copy(entry.display);
}

/** In-memory rollback companion, not a save format or additional protocol-v1 field. */
export function _capturePresentation(owner: object, messages: SessionMessage[]): (Published | null)[] {
  return messages.map(message => {
    const display = readGrowthDisplay(owner, message);
    return display ? { wire: JSON.stringify(message), display } : null;
  });
}
export function _restorePresentation(owner: object, messages: SessionMessage[], snapshot?: (Published | null)[]): void {
  epochs.set(owner, (epochs.get(owner) ?? 0) + 1);
  messages.forEach((message, index) => {
    const entry = snapshot?.[index];
    if (message.kind === "growth" && entry && entry.wire === wire(message)) _publishGrowthDisplay(owner, message, entry.display);
  });
}
