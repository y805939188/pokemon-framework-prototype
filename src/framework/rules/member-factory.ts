/**
 * Creating an individual from species + level (step 4): the minimum of WP18 §4.1/§4.2 and WP36 §6 step 1 that the
 * playable slice needs. Pure; every random draw goes through the injected `random(n)` (an integer in [0, n)).
 *
 * Draw order (fixed, so a scripted random reproduces a member): personal id high 16 bits, low 16 bits, then the six
 * IVs in the order hp, atk, def, spa, spd, spe (each 0..31, WP19 §5.2).
 * Derived from the personal id (WP19): nature = id mod 25 in the registered order (§3.5); gender = low 8 bits < female
 * chance -> female, fixed for single-gender/genderless species (§3.2); ability = natural slot (id & 1), slot 0 when
 * slot 1 is empty (§3.4). Level -> exp is the level's minimum (WP30), HP is full, EVs 0, no held item, Poké Ball,
 * friendship 70 (the content has no happiness field; WP18 §4.1 uses 70 when it is omitted), moves = WP20 §5.1.
 * Not in this slice (WP36 §6 steps 2-5, recorded as deferred): wild held items, shiny rerolls, Pokérus, ability-based
 * gender/nature overrides; the personal id itself is not stored (nothing derives from it later in this build).
 */
import { computeStats, minExp } from "./growth.ts";
import { newMember } from "./state.ts";
import type { Content, GenderRule, Member, MoveSlot, SpeciesData } from "./types.ts";

/** An integer in [0, n). Tests inject a scripted or seeded one; the MZ host uses its own generator. */
export type Random = (n: number) => number;

export const NATURE_ORDER: readonly string[] = [
  "hardy", "lonely", "brave", "adamant", "naughty", "bold", "docile", "relaxed", "impish", "lax", "timid", "hasty", "serious",
  "jolly", "naive", "modest", "mild", "quiet", "bashful", "rash", "calm", "gentle", "sassy", "careful", "quirky",
];

const MEMBER_ID = /^[A-Za-z0-9#._:-]{1,18}$/;

/** `random(n)` checked: a value outside [0, n) or not an integer is a broken generator, not a draw. */
export function draw(random: Random, n: number): number {
  const v = random(n);
  if (!Number.isInteger(v) || v < 0 || v >= n) throw new RangeError(`random(${n}) returned ${String(v)} (expected an integer from 0 to ${n - 1})`);
  return v;
}

/** 32-bit personal id from two 16-bit draws (unsigned). */
export function personalId(random: Random): number {
  return draw(random, 65536) * 65536 + draw(random, 65536);
}

export function deriveFromPersonalId(pid: number, species: { gender: GenderRule; abilities: readonly string[] }): { nature: string; gender: string; ability: string } {
  const nature = NATURE_ORDER[pid % 25]!;
  const g = species.gender;
  const gender = typeof g === "number" ? ((pid & 0xff) < g ? "F" : "M") : g;
  const ability = species.abilities[pid & 1] ?? species.abilities[0]!;
  return { nature, gender, ability };
}

/** WP20 §5.1 reset_moves: learnset entries with level <= `level`, in order, a repeated move keeps its latest place, the last four. */
export function initialMoves(species: Pick<SpeciesData, "learnset">, level: number, content: Pick<Content, "moves">): MoveSlot[] {
  const names: string[] = [];
  const levels = Object.keys(species.learnset).map(Number).filter((l) => l <= level).sort((a, b) => a - b);
  for (const l of levels) for (const name of species.learnset[l] ?? []) {
    const at = names.indexOf(name);
    if (at >= 0) names.splice(at, 1);
    names.push(name);
  }
  return names.slice(-4).map((name) => {
    const mv = content.moves?.[name];
    if (!mv) throw new Error(`no move data for "${name}" in the content (assemble the content with the pinned Showdown data)`);
    return { id: mv.id, pp: mv.pp, maxpp: mv.pp };
  });
}

export interface CreateMemberInput {
  id: string;
  species: string;
  level: number;
  ball?: string;
  ot?: string;
}

export function createMember(input: CreateMemberInput, content: Content, random: Random): Member {
  const { id, species, level } = input;
  if (typeof id !== "string" || !MEMBER_ID.test(id)) throw new Error(`member id "${id}" must be 1-18 characters of A-Z a-z 0-9 # . _ : -`);
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new RangeError(`level must be an integer from 1 to 100 (got ${String(level)})`);
  const sp = content.species[species];
  if (!sp) throw new Error(`species "${species}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  const missing = [...(!sp.abilities || !sp.abilities.length ? ["abilities"] : []), ...(sp.gender === undefined ? ["gender"] : [])];
  if (missing.length) throw new Error(`species "${species}" has no creation data (${missing.join(", ")}) in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  const moves = initialMoves(sp, level, content);
  const pid = personalId(random);
  const ivs = { hp: draw(random, 32), atk: draw(random, 32), def: draw(random, 32), spa: draw(random, 32), spd: draw(random, 32), spe: draw(random, 32) };
  const { nature, gender, ability } = deriveFromPersonalId(pid, { gender: sp.gender!, abilities: sp.abilities! });
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const stats = computeStats(sp.base, ivs, evs, level, nature);
  return newMember({
    id, species, level, exp: minExp(sp.growth, level), hp: stats.hp, status: "", statusCount: 0, moves, item: "", ability, nature, gender,
    ivs, evs, friendship: 70, ball: input.ball ?? "pokeball", ot: input.ot ?? "player",
  });
}
