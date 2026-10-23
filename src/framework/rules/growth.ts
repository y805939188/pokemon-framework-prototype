/**
 * Game-rule side of growth: curves, stats, battle experience, EV, level-up.
 * Pure functions over plain records; no engine/Showdown/MZ dependency. Numbers follow the clean-room specs
 * (WP19 stat formula, WP30 curves and battle experience, defaults for Gen 8).
 * The engine is only told the outcome (battle/gateway applyGrowth) and cross-checked against it.
 */
import type { Content, CurveId, Member, PartialStats, StatKey, Stats } from "./types.ts";
import { toBattleMember } from "./species-key.ts";

export const MAX_LEVEL = 100;

// ---- WP30 3.2 curves (formulas valid for n <= 100; table authority beyond is out of scope) ----
export const CURVES: Record<CurveId, (n: number) => number> = {
  medium: (n) => n ** 3,
  fast: (n) => Math.floor((4 * n ** 3) / 5),
  slow: (n) => Math.floor((5 * n ** 3) / 4),
  parabolic: (n) => Math.floor((6 * n ** 3) / 5) - 15 * n ** 2 + 100 * n - 140,
  erratic: (n) => {
    if (n <= 50) return Math.floor((n ** 3 * (100 - n)) / 50);
    if (n <= 68) return Math.floor((n ** 3 * (150 - n)) / 100);
    if (n <= 98) return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
    return Math.floor((n ** 3 * (160 - n)) / 100);
  },
  fluctuating: (n) => {
    if (n <= 15) return Math.floor((n ** 3 * (24 + Math.floor((n + 1) / 3))) / 50);
    if (n <= 35) return Math.floor((n ** 3 * (14 + n)) / 50);
    return Math.floor((n ** 3 * (32 + Math.floor(n / 2))) / 50);
  },
};

/** The configured maximum level of the game (WP30 3.1: a configuration value, mechanically changeable). */
export const DEFAULT_MAX_LEVEL = MAX_LEVEL;
/** The level table has 101 entries (index 0..100); beyond it the curves' registered formulas apply (WP30 3.2). */
const TABLE_LAST = 100;

/**
 * Registered formulas beyond the table. Erratic and Fluctuating use DIFFERENT functions than their in-table
 * piecewise definitions (WP30 3.2): the piecewise description does not extrapolate. The other four continue unchanged.
 */
const BEYOND_TABLE: Record<CurveId, (n: number) => number> = {
  medium: CURVES.medium,
  fast: CURVES.fast,
  slow: CURVES.slow,
  parabolic: CURVES.parabolic,
  erratic: (n) => Math.floor((n ** 4 + 2000 * n ** 3) / 3500),
  fluctuating: (n) => Math.floor(((n ** 3 + Math.floor(n / 2) + 32) * 4) / (100 + n)),
};

/** Minimum exp of a level: the level is clamped to the maximum level first; table inside, registered formula beyond. */
export function minExp(curve: CurveId, level: number, maxLevel: number = DEFAULT_MAX_LEVEL): number {
  const L = Math.min(level, maxLevel);
  if (!(L >= 1)) throw new RangeError("level must be >= 1");
  if (L === 1) return 0;
  return L <= TABLE_LAST ? CURVES[curve](L) : BEYOND_TABLE[curve](L);
}
export const maxExp = (curve: CurveId, maxLevel: number = DEFAULT_MAX_LEVEL): number => minExp(curve, maxLevel, maxLevel);

export type Checked<T> = { ok: true; value: T } | { ok: false; error: "invalid-level" };

/**
 * Spec-level entry for "minimum exp of a level" (WP30 3.1): an empty, non-numeric or <= 0 level is an ERROR RESULT, not
 * an exception (the original hands back an error object that only fails when it is used as a number).
 */
export function minimumExpForLevel(curve: CurveId, level: unknown, maxLevel: number = DEFAULT_MAX_LEVEL): Checked<number> {
  if (typeof level !== "number" || !Number.isFinite(level) || level <= 0) return { ok: false, error: "invalid-level" };
  return { ok: true, value: minExp(curve, level, maxLevel) };
}

/**
 * exp -> level: the first level whose minimum exp is above the exp, minus one (so a non-monotonic curve cannot confuse
 * it); at or above the maximum exp it is the maximum level. An empty or negative exp throws (the original raises).
 */
export function levelForExp(curve: CurveId, exp: number, maxLevel: number = DEFAULT_MAX_LEVEL): number {
  // `null >= 0` is true in JavaScript: an empty exp must be refused explicitly (found by the Ruby differential, case GR-LFE-*-ENIL)
  if (typeof exp !== "number" || !(exp >= 0)) throw new RangeError("exp must be a number >= 0");
  if (exp >= maxExp(curve, maxLevel)) return maxLevel;
  let L = 1;
  while (L < maxLevel && minExp(curve, L + 1, maxLevel) <= exp) L++;
  return L;
}

/** Exp addition with the helper-entry semantics: the result is clamped to [0, max exp] (a raw setter does not clamp). */
export function addExp(curve: CurveId, current: number, amount: number, maxLevel: number = DEFAULT_MAX_LEVEL): number {
  return Math.min(Math.max(current + amount, 0), maxExp(curve, maxLevel));
}

// ---- WP19 5.4 stats ----
export const NATURES: Record<string, PartialStats> = {
  hardy: {}, docile: {}, serious: {}, bashful: {}, quirky: {},
  lonely: { atk: 110, def: 90 }, brave: { atk: 110, spe: 90 }, adamant: { atk: 110, spa: 90 }, naughty: { atk: 110, spd: 90 },
  bold: { def: 110, atk: 90 }, relaxed: { def: 110, spe: 90 }, impish: { def: 110, spa: 90 }, lax: { def: 110, spd: 90 },
  timid: { spe: 110, atk: 90 }, hasty: { spe: 110, def: 90 }, jolly: { spe: 110, spa: 90 }, naive: { spe: 110, spd: 90 },
  modest: { spa: 110, atk: 90 }, mild: { spa: 110, def: 90 }, quiet: { spa: 110, spe: 90 }, rash: { spa: 110, spd: 90 },
  calm: { spd: 110, atk: 90 }, gentle: { spd: 110, def: 90 }, sassy: { spd: 110, spe: 90 }, careful: { spd: 110, spa: 90 },
};
/** Compatibility spelling is case-insensitive; unknown/prototype keys never resolve to data. */
export function natureModifiers(nature: string): PartialStats {
  const key = String(nature).toLowerCase();
  return Object.hasOwn(NATURES, key) ? NATURES[key]! : {};
}
export const STAT_KEYS: readonly StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];

export function computeStats(base: Stats, ivs: PartialStats | undefined, evs: PartialStats | undefined, level: number, nature: string): Stats {
  const out = {} as Stats;
  const mods = natureModifiers(nature);
  for (const k of STAT_KEYS) {
    const inner = Math.floor(((2 * base[k] + (ivs?.[k] ?? 31) + Math.floor((evs?.[k] ?? 0) / 4)) * level) / 100);
    if (k === "hp") out.hp = base.hp === 1 ? 1 : inner + level + 10;
    else out[k] = Math.floor(((inner + 5) * (mods[k] ?? 100)) / 100);
  }
  return out;
}

/**
 * WP19 5.5: current HP after a recalculation (persistent rule, independent of the engine).
 * Deliberate difference (user decision 2026-10-18): the reference "revives" a 0-HP member when max HP
 * grows; we keep fainted members fainted unless `reviveFainted` (compat switch, default off).
 */
export function hpAfterRecalc(curHp: number, oldMax: number, newMax: number, { reviveFainted = false }: { reviveFainted?: boolean } = {}): number {
  let hp: number;
  if (curHp > 0) hp = Math.max(curHp + (newMax - oldMax), 1);
  else hp = reviveFainted && newMax > oldMax ? newMax - oldMax : 0;
  return Math.min(Math.max(hp, 0), newMax);
}

// ---- WP30 4.2 battle experience (Gen 8 defaults: scaled formula on, split off, trainer bonus off) ----
export interface ExpRules {
  scaled: boolean;
  splitAmongParticipants: boolean;
  trainerBonus: boolean;
}
export const DEFAULT_RULES: ExpRules = { scaled: true, splitAmongParticipants: false, trainerBonus: false };

export interface BattleExpInput {
  foe: { level: number; baseExp: number };
  receiver: { level: number };
  participants: number;
  rules?: ExpRules;
  trainer?: boolean;
  luckyEgg?: boolean;
}

/**
 * Only the paths step 2.3 exercises: participant/sharer share, trainer bonus, scaling, +1.
 * Returns the integer exp for one receiver (0 => nothing happens).
 */
export function battleExp({ foe, receiver, participants, rules = DEFAULT_RULES, trainer = false, luckyEgg = false }: BattleExpInput): number {
  const a = foe.level * foe.baseExp;
  // shares: participants only (no shared-exp holders in this path)
  let share = rules.splitAmongParticipants ? Math.floor(a / participants) : a;
  if (share <= 0) return 0; // early return before every later modifier
  if (trainer && rules.trainerBonus) share = Math.floor(share * 1.5);
  if (rules.scaled) {
    share = Math.floor(share / 5);
    const factor = Math.pow((2 * foe.level + 10) / (receiver.level + foe.level + 10), 2.5);
    share = Math.floor(share * factor) + 1; // +1 for participants/sharers
  } else {
    share = Math.floor(share / 7);
  }
  if (luckyEgg) share = Math.floor((share * 3) / 2);
  return share;
}

/** WP30 4.4 EV gain: per stat clamp to per-stat and total caps. Returns a NEW evs object. */
export function gainEvs(evs: PartialStats, yieldTable: PartialStats, { perStat = 252, total = 510, multiplier = 1 } = {}): PartialStats {
  const out: PartialStats = { ...evs };
  for (const k of STAT_KEYS) {
    const add = (yieldTable[k] ?? 0) * multiplier;
    if (!add) continue;
    const sum = STAT_KEYS.reduce((s, x) => s + (out[x] ?? 0), 0);
    const room = Math.max(0, Math.min(perStat - (out[k] ?? 0), total - sum));
    out[k] = (out[k] ?? 0) + Math.max(0, Math.min(add, room));
  }
  return out;
}

export interface LevelUp {
  level: number;
  maxhp: number;
  hp: number;
  stats: Stats;
}
export interface ExpLog {
  gained: number;
  levels: LevelUp[];
  learned: string[];
  pendingMoves: { level: number; move: string }[];
}
export interface ApplyExpResult {
  member: Member;
  log: ExpLog;
  before: { level: number; exp: number; hp: number; stats: Stats };
  after: { level: number; exp: number; stats: Stats; hp: number };
}

/**
 * Apply an exp gain to a member record (pure: returns a new record plus the change log).
 * IDENTITY (decision D5-3): `member` and `prior` are BATTLE records, whose species is the Showdown name (what a
 * session holds; the session's growth and protocol v1 are unchanged). For a persistent member (content id + form)
 * use `applyExpPersistent`, which converts at this boundary. `content` supplies base stats, growth curve and learnset.
 * `member` is the record AFTER this battle's EV gain; `prior` is the record BEFORE it (default: the same
 * record). The "old max HP" of the recalculation must come from `prior` (WP19 5.5: the stored values before
 * the recalculation), otherwise an EV gain that crosses a multiple of 4 shifts the HP rule by one point.
 */
export function applyExp(member: Member, amount: number, content: Content, prior: Member = member): ApplyExpResult {
  const sp = Object.hasOwn(content.species, member.species) ? content.species[member.species] : undefined;
  if (!sp) throw new Error(member.form !== undefined
    ? `unknown battle species "${member.species}" (form ${member.form}): applyExp takes a battle record (Showdown name); for a persistent member use applyExpPersistent`
    : `unknown species ${member.species}`);
  const curve = sp.growth;
  const maxE = maxExp(curve);
  const before = { level: prior.level, exp: prior.exp, hp: prior.hp, stats: computeStats(sp.base, prior.ivs, prior.evs, prior.level, prior.nature) };
  const exp = Math.min(Math.max(prior.exp + amount, 0), maxE);
  const delta = exp - prior.exp;
  const log: ExpLog = { gained: delta, levels: [], learned: [], pendingMoves: [] };
  const newLevel = delta > 0 ? levelForExp(curve, exp) : prior.level;
  if (newLevel < prior.level) throw new Error("new level below current level (data contradiction)");
  let cur: Member = { ...member, exp };
  let oldStats = before.stats;
  for (let L = prior.level + 1; L <= newLevel; L++) {
    const stats = computeStats(sp.base, cur.ivs, cur.evs, L, cur.nature);
    cur = { ...cur, level: L, hp: hpAfterRecalc(cur.hp, oldStats.hp, stats.hp) };
    log.levels.push({ level: L, maxhp: stats.hp, hp: cur.hp, stats });
    for (const mv of sp.learnset[L] ?? []) log.pendingMoves.push({ level: L, move: mv });
    oldStats = stats;
  }
  // no level change (or no exp at all): stats are still recalculated against the same level because the EVs
  // changed, and current HP follows the same rule
  const after = { level: cur.level, exp: cur.exp, stats: computeStats(sp.base, cur.ivs, cur.evs, cur.level, cur.nature) };
  if (newLevel === prior.level && after.stats.hp !== before.stats.hp) cur = { ...cur, hp: hpAfterRecalc(cur.hp, before.stats.hp, after.stats.hp) };
  return { member: cur, log, before, after: { ...after, hp: cur.hp } };
}

/**
 * `applyExp` for a PERSISTENT member (content id + form, D5-3): the species data come from the content mapping (a form
 * the content lacks falls back to the base form, WP03 §3.2) and the returned member keeps its persistent identity.
 */
export function applyExpPersistent(member: Member, amount: number, content: Content, prior: Member = member): ApplyExpResult {
  const r = applyExp(toBattleMember(member, content), amount, content, toBattleMember(prior, content));
  return { ...r, member: { ...r.member, species: member.species, form: member.form ?? 0 } };
}
