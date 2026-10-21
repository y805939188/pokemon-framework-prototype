/**
 * Statistics record and the global step counter (WP06 §4; field directory wp06-stats-directory.md, 74 declared fields).
 * Step 5.0 delivers the record, its initial values, validation and persistence (save schema 4). Which fields are
 * written where is decided by the batch that builds the feature; see docs/step5/5.0.md for what is wired now.
 * Field names are the reference's data identifiers (WP02 §1: data identifiers, not an API promise). Pure.
 */

/** The 72 numeric fields: counts and sums start at 0 (wp06-stats-directory.md §1–§9). */
export const STAT_COUNTERS = [
  // travel (8)
  "distance_walked", "distance_cycled", "distance_surfed", "distance_slid_on_ice", "bump_count", "cycle_count", "surf_count", "dive_count",
  // field moves (10)
  "fly_count", "cut_count", "flash_count", "rock_smash_count", "rock_smash_battles", "headbutt_count", "headbutt_battles", "strength_push_count", "waterfall_count", "waterfalls_descended",
  // item activity (9)
  "repel_count", "itemfinder_count", "fishing_count", "fishing_battles", "poke_radar_count", "poke_radar_longest_chain", "berry_plants_picked", "max_yield_berry_plants", "berries_planted",
  // NPC (3)
  "poke_center_count", "revived_fossil_count", "lottery_prize_count",
  // Pokémon (11)
  "eggs_hatched", "evolution_count", "evolutions_cancelled", "trade_count", "moves_taught_by_item", "moves_taught_by_tutor", "moves_taught_by_reminder", "day_care_deposits", "day_care_levels_gained", "pokerus_infections", "shadow_pokemon_purified",
  // battle (10)
  "wild_battles_won", "wild_battles_lost", "trainer_battles_won", "trainer_battles_lost", "total_exp_gained", "battle_money_gained", "battle_money_lost", "blacked_out_count", "mega_evolution_count", "failed_poke_ball_count",
  // money (11)
  "money_spent_at_marts", "money_earned_at_marts", "mart_items_bought", "premier_balls_earned", "drinks_bought", "drinks_won", "coins_won", "coins_lost", "battle_points_won", "battle_points_spent", "soot_collected",
  // special: the scalar ones (7 of 9)
  "elite_four_attempts", "hall_of_fame_entry_count", "time_to_enter_hall_of_fame", "safari_pokemon_caught", "most_captures_per_safari_game", "bug_contest_count", "bug_contest_wins",
  // play time (3)
  "play_time", "play_sessions", "time_last_saved",
] as const;

export type StatCounter = (typeof STAT_COUNTERS)[number];

/** Seconds, not counts: the reference accumulates them from run time, so they need not be integers. */
export const STAT_SECONDS: readonly StatCounter[] = ["time_to_enter_hall_of_fame", "play_time", "time_last_saved"];

export type GameStats = Record<StatCounter, number> & {
  /** One counter per gym (a 50-element zero array when created). */
  gym_leader_attempts: number[];
  /** Play time (seconds) at which each badge was earned, indexed by badge; unset indices are null. */
  times_to_get_badges: (number | null)[];
};

export const GYM_ATTEMPT_SLOTS = 50;

/** Every declared field (74): the counters plus the two arrays. */
export const STAT_FIELDS: readonly string[] = [...STAT_COUNTERS, "gym_leader_attempts", "times_to_get_badges"];

export function newStats(): GameStats {
  const out = Object.fromEntries(STAT_COUNTERS.map((k) => [k, 0])) as Record<StatCounter, number>;
  return { ...out, gym_leader_attempts: new Array<number>(GYM_ATTEMPT_SLOTS).fill(0), times_to_get_badges: [] };
}

/** A copy of `stats` with `key` raised by `n` (n >= 0). */
export function bumpStat(stats: GameStats, key: StatCounter, n = 1): GameStats {
  if (!(Number.isFinite(n) && n >= 0)) throw new RangeError(`a statistic only grows (got ${String(n)} for ${key})`);
  return { ...stats, [key]: stats[key] + n };
}

/** The global step counter wraps in the non-negative range at 2^31 (WP06 §4.1 step 2): 2147483647 + 1 -> 0. */
export const STEP_MODULUS = 2 ** 31;

export function addSteps(steps: number, n = 1): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`steps must be a non-negative integer (got ${String(n)})`);
  return (steps + n) % STEP_MODULUS;
}

type Problem = { path: string; message: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isSeconds = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Located problems of a stored statistics record and step counter (schema 4). */
export function validateStats(stats: unknown, steps: unknown, out: Problem[]): void {
  if (!isCount(steps) || (steps as number) >= STEP_MODULUS) out.push({ path: "$.steps", message: `must be an integer from 0 to ${STEP_MODULUS - 1}` });
  if (!isObj(stats)) { out.push({ path: "$.stats", message: "must be the statistics record (74 fields)" }); return; }
  for (const k of Object.keys(stats)) if (!STAT_FIELDS.includes(k)) out.push({ path: `$.stats.${k}`, message: "unknown statistic" });
  for (const k of STAT_COUNTERS) {
    const seconds = STAT_SECONDS.includes(k);
    if (!(seconds ? isSeconds(stats[k]) : isCount(stats[k]))) out.push({ path: `$.stats.${k}`, message: seconds ? "must be a number of seconds >= 0" : "must be an integer >= 0" });
  }
  const gym = stats["gym_leader_attempts"];
  if (!Array.isArray(gym) || gym.some((x) => !isCount(x))) out.push({ path: "$.stats.gym_leader_attempts", message: "must be an array of integers >= 0" });
  const badges = stats["times_to_get_badges"];
  if (!Array.isArray(badges) || badges.some((x) => x !== null && !isSeconds(x))) out.push({ path: "$.stats.times_to_get_badges", message: "must be an array of seconds >= 0 (or null for a badge not earned)" });
}
