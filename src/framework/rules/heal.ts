/**
 * Full heal (WP20 §3.2 heal / heal_party, WP61 §7.3): HP to the maximum from the current stats, status and its counter
 * cleared, every move back to its maximum PP. Nothing else changes (friendship, moves, EVs, origin). The party heal does
 * not touch the boxes (the interpreter's "recover all" that also heals stored members is not part of this build).
 * Pure and idempotent: healing a healed party gives an equal state.
 */
import { computeStats } from "./growth.ts";
import { own } from "./own.ts";
import { clone } from "./state.ts";
import type { GameState } from "./state.ts";
import type { Content, Member } from "./types.ts";

export function healMember(m: Member, content: Content): Member {
  const sp = own(content.species, m.species);
  if (!sp) throw new Error(`member ${m.id}: species "${m.species}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  const maxhp = computeStats(sp.base, m.ivs, m.evs, m.level, m.nature).hp;
  return { ...clone(m), hp: maxhp, status: "", statusCount: 0, moves: m.moves.map((mv) => ({ ...mv, pp: mv.maxpp })) };
}

export function healParty(state: GameState, content: Content): GameState {
  const next = clone(state);
  next.party = state.party.map((m) => healMember(m, content));
  return next;
}
