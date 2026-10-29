/** Host-free ordinary NPC team construction (WP18 §4.3.1, WP19, WP24). */
import { computeStats, hpAfterRecalc } from "./growth";
import { createMember, initialMoves } from "./member-factory";
import type { CreateMemberInput, Random } from "./member-factory";
import { NATURE_ORDER, resolveAbility } from "./member-identity";
import { own } from "./own";
import { STAT_KEYS } from "./growth";
import type { Content, Member, MoveSlot, Owner, SpeciesData, TrainerBattleProjection, TrainerRecord, TrainerType } from "./types";

export interface BuildTrainerTeamInput {
  content: Content;
  /** Complete compiled registration order, including every alternate form placeholder. */
  registrationOrder: readonly { species: string; form: number }[];
  /** Explicit trainer-type registration order; never Object.keys or a national dex. */
  trainerTypeOrder: readonly string[];
  record: TrainerRecord;
  type: TrainerType;
  /** The NPC owner. There is deliberately no game.player input or fallback. */
  owner: Owner;
  random: Random;
  receivedAt: number;
  allocateId(index: number): string;
  context?: CreateMemberInput["context"];
}

function battleSpecies(content: Content, id: string, form: number): string {
  const mapped = own(own(content.forms, id), String(form)) ?? (form === 0 ? own(content.speciesIds, id) : undefined);
  const direct = mapped ?? (own(content.species, id) ? id : undefined);
  if (!direct || !own(content.species, direct) || (content.species[direct]!.form ?? 0) !== form) throw new Error(`trainer species "${id}" form ${form} is not assembled`);
  return direct;
}

function moveById(content: Content, id: string): { id: string; name: string; pp: number } {
  const canonical = id.replace(/-/g, ""); // Same normalization as the validated trainer/Dex reference.
  for (const move of Object.values(content.moves ?? {})) if (move.id === canonical) return move;
  throw new Error(`trainer move "${id}" is not assembled`);
}

function abilityById(content: Content, id: string): string {
  const ability = own(content.abilities, id.replace(/-/g, ""));
  if (!ability) throw new Error(`trainer ability "${id}" is not assembled`);
  return ability.name;
}

/** Silent learning preserves an existing slot's PP metadata, moves it to the end, and keeps only the last four. */
function learn(slots: MoveSlot[], id: string, content: Content): MoveSlot[] {
  id = id.replace(/-/g, "");
  const out = [...slots], existing = out.findIndex(move => move.id === id);
  let slot: MoveSlot;
  if (existing >= 0) slot = out.splice(existing, 1)[0]!;
  else {
    const move = moveById(content, id);
    slot = { id: move.id, pp: move.pp, maxpp: move.pp, ppUps: 0 };
  }
  out.push(slot);
  return out.length > 4 ? out.slice(out.length - 4) : out;
}

function allStats(defaultValue: number, override: Partial<Record<(typeof STAT_KEYS)[number], number>> | undefined): Record<(typeof STAT_KEYS)[number], number> {
  return Object.fromEntries(STAT_KEYS.map(key => [key, override?.[key] ?? defaultValue])) as Record<(typeof STAT_KEYS)[number], number>;
}

export function buildTrainerTeam(input: BuildTrainerTeamInput): Member[] {
  const { content, record, type } = input;
  if (record.type !== type.id) throw new Error("trainer record/type mismatch");
  if (!Number.isSafeInteger(input.receivedAt) || input.receivedAt < 0) throw new Error("receivedAt must be integer seconds >= 0");
  const typeIndex = input.trainerTypeOrder.indexOf(type.id);
  if (typeIndex < 0) throw new Error(`trainer type "${type.id}" is absent from the explicit registration order`);
  const team: Member[] = [];
  for (const [index, entry] of record.party.entries()) {
    if (entry.shadow === true) throw new Error("Shadow trainer members are unsupported (C2)");
    // Ordinary base-species creation comes first, including its creation-form draw even when Form is explicit.
    const created = createMember({ id: input.allocateId(index), species: battleSpecies(content, entry.species, 0), level: entry.level, owner: input.owner,
      withMoves: false, context: { ...input.context, receivedAt: input.receivedAt, playerId: input.owner.id } }, content, input.random);
    const form = entry.form ?? created.form ?? 0;
    const speciesName = battleSpecies(content, entry.species, form);
    const species = content.species[speciesName]!;
    // Simple stored form (including explicit 0), then item, then explicit non-empty moves or level defaults.
    let moves: MoveSlot[] = [];
    if (entry.moves !== undefined && entry.moves.length > 0) for (const id of entry.moves) moves = learn(moves, id, content);
    else moves = initialMoves(species, entry.level, content).map(move => ({ ...move, ppUps: 0 }));
    // Ability slot / explicit ability, with omitted slot fixed to zero rather than PID parity.
    const abilityIndex = entry.abilityIndex ?? 0;
    const resolved = resolveAbility(created.personalID!, species, abilityIndex);
    const ability = entry.ability === undefined ? resolved.ability : abilityById(content, entry.ability);
    const effectiveAbilityIndex = entry.ability !== undefined && ability !== resolved.ability ? null : resolved.effectiveAbilityIndex;
    // Fixed-gender species ignore the attempted override. Unknown trainer-type gender is non-male, hence attempts F.
    const gender = typeof species.gender === "string" ? species.gender : entry.gender ?? (type.gender === 0 ? "M" : "F");
    // Ordinary shiny precedes super shiny; super=true forces ordinary=true. Shadow is rejected above.
    const superShiny = entry.superShiny ?? false;
    const shiny = superShiny || (entry.shiny ?? false);
    const speciesIndex = input.registrationOrder.findIndex(key => key.species === entry.species && key.form === 0);
    if (speciesIndex < 0) throw new Error(`species "${entry.species}" is absent from complete registrationOrder`);
    const nature = entry.nature?.toLowerCase() ?? NATURE_ORDER[(speciesIndex + typeIndex) % NATURE_ORDER.length]!;
    if (!NATURE_ORDER.includes(nature)) throw new Error(`unknown trainer nature "${entry.nature}"`);
    const ivs = allStats(Math.min(Math.floor(entry.level / 2), 31), entry.ivs);
    const evs = allStats(Math.min(Math.floor((3 * entry.level) / 2), 85), entry.evs);
    const friendship = entry.friendship ?? created.friendship ?? 70;
    if (!Number.isSafeInteger(friendship) || friendship < 0 || (entry.friendship !== undefined && friendship > 255)) throw new Error("trainer friendship override must be an integer from 0 to 255; inherited friendship must be nonnegative and safe");
    if (entry.nickname !== undefined && (!entry.nickname.trim() || Array.from(entry.nickname).length > 10)) throw new Error("trainer nickname must be non-empty and at most 10 characters");
    if (entry.ball !== undefined && content.items?.[entry.ball]?.battleUse !== "ball") throw new Error(`unknown trainer ball "${entry.ball}"`);
    // Final recalculation uses the overridden form, nature, IV and EV. Creation was at full HP, so the result stays full.
    const oldMax = computeStats(content.species[created.species]!.base, created.ivs, created.evs, entry.level, created.nature).hp;
    const stats = computeStats(species.base, ivs, evs, entry.level, nature);
    const member: Member = {
      ...created, species: speciesName, form, item: entry.item ?? "", moves, ability, abilityIndex, effectiveAbilityIndex,
      gender, shiny, superShiny, nature, ivs, evs, friendship,
      nickname: entry.nickname ?? null, ball: entry.ball ?? "pokeball",
      owner: { ...input.owner }, origin: created.origin ? { ...created.origin } : created.origin,
      hp: hpAfterRecalc(created.hp, oldMax, stats.hp),
    };
    team.push(member);
  }
  return team;
}

/** Actual A-M1 projection consumers are explicitly named; C/D behavior is not claimed complete. */
export function trainerBattleProjection(record: TrainerRecord, type: TrainerType): TrainerBattleProjection {
  return {
    id: record.id, version: record.version, type: type.id, name: record.name, baseMoney: type.baseMoney,
    ai: { skillLevel: type.skillLevel, flags: [...type.flags], items: (record.items ?? type.items).map(item => ({ ...item })) },
    presentation: Object.fromEntries(["battleBgm", "victoryBgm", "introBgm", "openingText", "winText", "loseText"]
      .filter(key => type[key as keyof TrainerType] !== undefined)
      .map(key => [key, type[key as keyof TrainerType]])) as TrainerBattleProjection["presentation"],
  };
}

export function findTrainerRecord(content: Content, id: string, version: number): { record: TrainerRecord; type: TrainerType } | null {
  const record = own(content.trainers, id)?.find(candidate => candidate.version === version);
  if (!record) return null;
  const type = own(content.trainerTypes, record.type);
  return type ? { record, type } : null;
}
