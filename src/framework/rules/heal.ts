/**
 * Full heal (WP20 §3.2 heal / heal_party, WP61 §7.3): HP to the maximum from the current stats, status and its counter
 * cleared, every move back to its maximum PP. Nothing else changes (friendship, moves, EVs, origin). The party heal does
 * not touch the boxes (the interpreter's "recover all" that also heals stored members is not part of this build).
 * Pure and idempotent: healing a healed party gives an equal state.
 */
import { computeStats } from "./growth.ts";
import { speciesDataOf } from "./species-key.ts";
import { clone } from "./value.ts";
import type { MemberCollection } from "./storage.ts";
import type { Content, Member } from "./types.ts";

export function healMember(m: Member, content: Content, options: { preserveReadyToEvolve?: boolean } = {}): Member {
  if (m.isEgg) return clone(m);
  const sp = speciesDataOf(content, m);
  if (!sp) throw new Error(`member ${m.id}: species "${m.species}" (form ${m.form ?? 0}) is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  const maxhp = computeStats(sp.base, m.ivs, m.evs, m.level, m.nature).hp;
  return { ...clone(m), ...(m.readyToEvolve !== undefined && !options.preserveReadyToEvolve ? { readyToEvolve: false } : {}), hp: maxhp, status: "", statusCount: 0, moves: m.moves.map((mv) => ({ ...mv, pp: mv.maxpp })) };
}

export function healParty<T extends { party: Member[] }>(state: T, content: Content): T {
  const next = clone(state);
  next.party = state.party.map((m) => healMember(m, content));
  return next;
}

/** WP61 §7.3: Gen8 default deposit healing is off, so RecoverAll explicitly includes the boxes. */
export function recoverAll<T extends MemberCollection>(state: T, content: Content, depositHeal = false): T {
  const next = healParty(state, content);
  if (!depositHeal) for (const box of next.storage.boxes) box.slots = box.slots.map((m) => m ? healMember(m, content) : null);
  return next;
}
