/** WP18/19 individual creation. Random order: PID high/low, six IVs hp/atk/def/spa/spd/spe,
 * then the optional WP21 B-family form draw. Identity allocation never consumes this RNG.
 * Context supplies time/owner/environment; no clock or host data is read here. */
import { computeStats, minExp } from "./growth.ts";
import { own } from "./own.ts";
import { newMember } from "./state.ts";
import { creationForm } from "./creation-form.ts";
import type { CreationEnvironment } from "./creation-form.ts";
import { COMPATIBLE_PLAYER, deriveIndividual, NATURE_ORDER, shinyFromPersonalId, uint32 } from "./member-identity.ts";
import type { Content, GenderRule, Member, MoveSlot, Owner, SpeciesData } from "./types.ts";

/** An integer in [0, n). Tests inject a scripted or seeded one; the MZ host uses its own generator. */
export type Random = (n: number) => number;

export { NATURE_ORDER } from "./member-identity.ts";

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

export function deriveFromPersonalId(pid: number, species: { gender: GenderRule; abilities: readonly (string | null)[] }): { nature: string; gender: string; ability: string } {
  const { nature, gender, ability } = deriveIndividual(pid, { ...species, abilities: [...species.abilities] });
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
  owner?: Owner;
  /** Explicit 0 suppresses creation recheck, as does an explicit nonzero form. */
  form?: number;
  context?: CreationEnvironment & { playerId?: number; map?: number; receivedAt?: number; fateful?: boolean };
  nature?: string;
  gender?: string;
  ability?: string;
  abilityIndex?: number;
  shiny?: boolean;
  superShiny?: boolean;
}

export function createMember(input: CreateMemberInput, content: Content, random: Random): Member {
  const { id, species, level } = input;
  if (typeof id !== "string" || !MEMBER_ID.test(id)) throw new Error(`member id "${id}" must be 1-18 characters of A-Z a-z 0-9 # . _ : -`);
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new RangeError(`level must be an integer from 1 to 100 (got ${String(level)})`);
  let sp = own(content.species, species);
  if (!sp) throw new Error(`species "${species}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  const missing = [...(!sp.abilities || !sp.abilities.length ? ["abilities"] : []), ...(sp.gender === undefined ? ["gender"] : [])];
  if (missing.length) throw new Error(`species "${species}" has no creation data (${missing.join(", ")}) in the content${content.meta ? ` "${content.meta.id}"` : ""}`);
  if (sp.happiness !== undefined && (!Number.isSafeInteger(sp.happiness) || sp.happiness < 0)) throw new Error("initial friendship must be a nonnegative safe integer");
  const owner = { ...(input.owner ?? { ...COMPATIBLE_PLAYER, name: input.ot ?? "player" }) };
  uint32(owner.id);
  if (typeof owner.name !== "string" || ![0, 1, 2].includes(owner.gender) || !Number.isSafeInteger(owner.language) || owner.language < 0) throw new Error("invalid owner");
  if (input.context?.receivedAt !== undefined && (!Number.isSafeInteger(input.context.receivedAt) || input.context.receivedAt < 0)) throw new Error("receivedAt must be integer seconds >= 0");
  if (input.context?.map !== undefined && (!Number.isSafeInteger(input.context.map) || input.context.map < 0)) throw new Error("map must be a nonnegative integer");
  if (input.nature !== undefined && !NATURE_ORDER.includes(input.nature)) throw new Error("unknown nature");
  if (input.gender !== undefined && !["M", "F", "N"].includes(input.gender)) throw new Error("unknown gender");
  if (input.form !== undefined && (!Number.isInteger(input.form) || input.form < 0 || input.form > 999)) throw new Error("invalid form");
  const pid = personalId(random);
  const ivs = { hp: draw(random, 32), atk: draw(random, 32), def: draw(random, 32), spa: draw(random, 32), spd: draw(random, 32), spe: draw(random, 32) };
  const nature = input.nature ?? NATURE_ORDER[pid % 25]!;
  const contentId = sp.contentId ?? species;
  // Rule family, battle form name and author ID are separate. Legacy fixtures may use a canonical base name.
  const form = input.form ?? (sp.form || creationForm(sp.ruleSpecies ?? species, nature, input.context?.playerId ?? owner.id, random, input.context));
  let finalName = species;
  if (form !== (sp.form ?? 0)) {
    const record = own(content.forms, contentId);
    const name = record ? own(record, String(form)) : undefined;
    if (!name || !own(content.species, name)) throw new Error(`species "${contentId}" form ${form}: missing creation form in the content`);
    finalName = name; sp = content.species[name]!;
  }
  const baseName = own(own(content.forms, contentId), "0") ?? own(content.speciesIds, contentId);
  const inheritedHappiness = baseName ? own(content.species, baseName)?.happiness : undefined;
  const derived = deriveIndividual(pid, { ...sp, gender: sp.gender ?? "N" }, input.abilityIndex);
  const gender = typeof sp.gender === "string" ? sp.gender : input.gender ?? derived.gender;
  const ability = input.ability ?? derived.ability;
  const moves = initialMoves(sp, level, content);
  const colors = shinyFromPersonalId(pid, owner.id);
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const stats = computeStats(sp.base, ivs, evs, level, nature);
  const created = newMember({
    id, species: finalName, form, level, exp: minExp(sp.growth, level), hp: stats.hp, status: "", statusCount: 0, moves, item: "", ability, nature, gender,
    ivs, evs, friendship: sp.happiness ?? inheritedHappiness ?? 70, ball: input.ball ?? "pokeball",
    personalID: pid, owner, ownerCompatibilityDefault: false, abilityIndex: derived.abilityIndex, effectiveAbilityIndex: derived.effectiveAbilityIndex,
    shiny: input.shiny ?? (input.superShiny === true ? true : colors.shiny), superShiny: input.superShiny ?? colors.superShiny,
    origin: { method: input.context?.fateful ? 4 : 0, map: input.context?.map ?? 0, text: "", level, receivedAt: input.context?.receivedAt ?? null, hatchedMap: 0, hatchedAt: null, compatibilityDefault: false },
    firstMoves: [], markings: [], ribbons: [], cannotStore: false, cannotRelease: false, isEgg: false, mail: null, readyToEvolve: false,
  });
  return {...created,statNature:null,moves:created.moves.map(move=>({...move,ppUps:0}))};
}
