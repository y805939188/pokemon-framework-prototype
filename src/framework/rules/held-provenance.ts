/** Capture settlement replays authenticated item handoffs, never equating two same-name items. */
interface Journal {
  readonly members: readonly { id: string; initial: string; current: string; recycle: string }[];
  readonly events: readonly { id: string; sourceId: string | null; reason: string;
    before: { current: string; recycle: string };
    after: { current: string; recovery: string; recycle: string } }[];
}

interface Token { readonly owner: string; readonly item: string; live: boolean }
interface Cell { current: Token | null; recovery: Token | null; recycle: Token | null }
export interface CaptureHeldClaims {
  claim(id: string, field: "current" | "recovery", heldOnly?: boolean): string | null;
  claimRemainingCurrent(ids: readonly string[]): string[];
}

/** A token is one initial roster object's item. Consumption retires it; Recycle/Harvest revive that token.
 * This is derived only from the already authenticated, complete journal; it adds no protocol/save fields.
 * null means unavailable/already claimed, while an empty string is an actual empty slot.
 */
export function captureHeldClaims(facts: Journal): CaptureHeldClaims {
  const cells = new Map<string, Cell>(), released = new Map<string, Token>();
  const fail = (): never => { throw new Error("held-capture-provenance-unavailable"); };
  for (const member of facts.members) {
    const token: Token | null = member.initial ? { owner: member.id, item: member.initial, live: true } : null;
    cells.set(member.id, { current: token, recovery: token, recycle: null });
  }
  for (const event of facts.events) {
    const cell = cells.get(event.id); if (!cell) fail();
    const c = cell!;
    if ((c.current?.item ?? "") !== event.before.current || (c.recycle?.item ?? "") !== event.before.recycle) fail();
    switch (event.reason) {
      case "temporary-remove":
        if (!c.current) fail();
        released.set(event.id, c.current!); c.current = null;
        break;
      case "consume": case "consume-no-recycle": case "permanent-loss": {
        const token = c.current; if (!token) fail();
        token!.live = false;
        if (c.recovery === token) c.recovery = null;
        if (event.reason === "consume") c.recycle = token;
        c.current = null;
        break;
      }
      case "clear-recycle":
        if (c.recycle) released.set(event.id, c.recycle);
        c.recycle = null;
        break;
      case "transfer-release": c.recovery = null; break;
      case "temporary-receive": case "permanent-gain": {
        // sourceId is the tracker-bound donor object, not the source shown in battle text.
        const source = event.sourceId ?? event.id, token = released.get(source);
        if (!token || token.item !== event.after.current || [...cells.values()].some(other => other.current === token)) fail();
        released.delete(source);
        // Pickup revives the consumed item exactly as Recycle does.
        token!.live = true; c.current = token!;
        if (event.reason === "permanent-gain") c.recovery = token!;
        break;
      }
      case "recycle": case "harvest": {
        const token = c.recycle;
        if (!token || [...cells.values()].some(other => other.current === token)) fail();
        token!.live = true; c.current = token; c.recycle = null;
        if (event.after.recovery && (!c.recovery || !c.recovery.live)) c.recovery = token;
        break;
      }
      default: fail();
    }
    if ((c.current?.item ?? "") !== event.after.current || (c.recycle?.item ?? "") !== event.after.recycle) fail();
  }
  for (const member of facts.members) {
    const cell = cells.get(member.id)!;
    if ((cell.current?.item ?? "") !== member.current || (cell.recycle?.item ?? "") !== member.recycle) fail();
  }
  const claimed = new Set<Token>();
  return { claim(id, field, heldOnly = false) {
    const cell = cells.get(id); if (!cell) return fail();
    const token = cell[field];
    if (!token) return "";
    if (!token.live || claimed.has(token) || heldOnly && ![...cells.values()].some(other => other.current === token)) return null;
    claimed.add(token); return token.item;
  }, claimRemainingCurrent(ids) {
    const remaining: string[] = [];
    for (const id of [...ids].sort()) {
      const cell = cells.get(id); if (!cell) return fail();
      const token = cell.current;
      if (token?.live && !claimed.has(token)) { claimed.add(token); remaining.push(token.item); }
    }
    return remaining;
  } };
}
