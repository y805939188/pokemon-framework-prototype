import { hpColour } from './visual-timing';
import type { BattleDisplayCard } from './display';

/** WP67-A §9.2, current singles scope. Inputs are published display values only.
 * This module neither queries a Session/Dex nor infers identity from a name.
 * The caller must bind publicly available, current appearance metadata to the
 * same side + stable member id (including any published disguise).
 * Missing metadata stays unknown; Mega/primal and multi-seat layouts are outside
 * this batch. No Scene, paint, animation, input or lifetime is owned here.
 */
export interface StatusCardMetadata {
  readonly id: string;
  readonly side: 'p1' | 'p2';
  readonly gender?: string | null;
  readonly shiny?: boolean | null;
  /** Already resolved against the player's owned-species record by the caller.
   * Seen alone, a form number, nickname or a battle result is not ownership. */
  readonly owned?: boolean | null;
}

export type StatusCardCondition = 'psn' | 'tox' | 'brn' | 'par' | 'slp' | 'frz';
/** Inject localized badge text; this module adds no global translation keys. */
export type StatusCardLabels = Readonly<Record<StatusCardCondition | 'unknown', string>>;

export interface StatusCardView {
  id: string;
  side: 'p1' | 'p2';
  visible: boolean;
  opacity: number;
  name: string;
  level: number;
  gender: { kind: 'male' | 'female' | 'genderless' | 'unknown'; symbol: string | null; colour: 'blue' | 'red' | null };
  condition: { kind: StatusCardCondition | 'none' | 'unknown'; label: string | null };
  /** null means unavailable, not a known negative. Only true requests a marker. */
  shiny: boolean | null;
  /** Only the opponent has an ownership marker; player-side value is null. */
  owned: boolean | null;
  hp: { ratio: number; colour: 'red' | 'yellow' | 'green'; numbers: { current: number; total: number } | null };
  experience: { ratio: number; flash: boolean } | null;
  experienceUnavailable: 'outside-level-interval' | null;
}

function condition(status: string, labels: StatusCardLabels): StatusCardView['condition'] {
  switch (status) {
    case '': return { kind: 'none', label: null };
    case 'psn': case 'tox': case 'brn': case 'par': case 'slp': case 'frz':
      return { kind: status, label: labels[status] };
    default: return { kind: 'unknown', label: labels.unknown };
  }
}

const knownFlag = (value: boolean | null | undefined): boolean | null =>
  value === true ? true : value === false ? false : null;

/** Pure, detached projection of the current single-seat card.
 * HP uses the published animated value, including fractional HP; ceiling is for
 * player-side numbers only. The existing playback still owns all timing.
 * A missing/out-of-interval EXP projection never becomes a fabricated zero bar.
 */
export function projectStatusCard(
  card: Readonly<BattleDisplayCard>, metadata: StatusCardMetadata | null | undefined, labels: StatusCardLabels,
): StatusCardView {
  if (!card.id || card.side !== 'p1' && card.side !== 'p2') throw new Error('invalid status-card identity');
  if (metadata && (metadata.id !== card.id || metadata.side !== card.side)) throw new Error('status-card metadata identity mismatch');
  if (!Number.isSafeInteger(card.level) || card.level < 1) throw new Error('invalid status-card level');
  if (card.ratio !== null && (!Number.isFinite(card.ratio) || card.ratio < 0 || card.ratio > 1)) throw new Error('invalid status-card experience');
  const opacity = card.boxOpacity ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('invalid status-card opacity');
  const colour = hpColour(card.hp, card.maxhp);
  const gender: StatusCardView['gender'] = metadata?.gender === 'M' ? { kind: 'male', symbol: '♂', colour: 'blue' }
    : metadata?.gender === 'F' ? { kind: 'female', symbol: '♀', colour: 'red' }
    : metadata?.gender === 'N' ? { kind: 'genderless', symbol: null, colour: null }
    : { kind: 'unknown', symbol: null, colour: null };
  const player = card.side === 'p1';
  const unavailable = player ? card.experienceUnavailable ?? null : null;
  return {
    id: card.id, side: card.side, visible: card.active && opacity > 0, opacity, name: card.name, level: card.level,
    gender, condition: condition(card.status, labels), shiny: knownFlag(metadata?.shiny),
    owned: player ? null : knownFlag(metadata?.owned),
    hp: { ratio: card.hp / card.maxhp, colour, numbers: player ? { current: Math.ceil(card.hp), total: card.maxhp } : null },
    experience: player && card.ratio !== null && unavailable === null ? { ratio: card.ratio, flash: card.flash === true } : null,
    experienceUnavailable: unavailable,
  };
}
