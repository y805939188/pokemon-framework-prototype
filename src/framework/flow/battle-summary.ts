/** Own working state only. Static identity/origin/nature remain application-owned metadata. */
import type { BattleSession } from './session';
import type { Member, Stats } from '../rules/types';
import { clone } from '../rules/value';
import { requiredOwnSummaryItem } from './required-settlement';

export interface BattleSummaryState {
  id: string;
  level: number;
  exp: number;
  hp: number;
  status: string;
  statusCount: number;
  moves: Member['moves'];
  evs: Member['evs'];
  friendship: number;
  item: string;
  heldItemKnown: boolean;
  stats: Stats;
}

/** A copy for the idle owner's summary; never a battle-time save or a new protocol-v1 method. */
export function readBattleSummary(session: BattleSession, id: string): BattleSummaryState | null {
  if (session.finished || session.broken || session._operation) return null;
  const member = session.party.find(m => m.id === id);
  if (!member) return null; // Own participants only, including stable IDs after engine reordering.
  const live = session.gw.readState('p1').find(m => m.id === id);
  if (!live) return null;
  const moves = member.moves.map(move => ({ ...move, pp: live.pp[move.id] }));
  if (moves.some(move => !Number.isSafeInteger(move.pp) || move.pp < 0 || move.pp > move.maxpp)) return null;
  let item: string | undefined;
  try { item = requiredOwnSummaryItem(session, session.gw, id); } catch { item = undefined; }
  return clone({ id, level: live.level, exp: member.exp, hp: live.hp, status: live.status,
    statusCount: live.statusCount, moves, evs: member.evs, friendship: member.friendship ?? 70,
    item: item ?? '', heldItemKnown: item !== undefined, stats: { ...live.stats, hp: live.maxhp } });
}
