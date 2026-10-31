import type { GrowthMessage, SessionMessage } from "../battle/protocol";

/** Applied results only. Reading this projection grants no battle or persistence operation. */
export interface GrowthDisplay {
  version: 1; fromExp: number; toExp: number; fromLevel: number; toLevel: number; hp: number; maxhp: number; ratio: number;
  segments: { level: number; from: number; to: number; levelUp?: { level: number; hp: number; maxhp: number } }[];
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
