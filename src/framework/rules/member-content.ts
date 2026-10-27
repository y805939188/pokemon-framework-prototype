/** Present-member content references shared by fresh reception and the final save gate. No state or migration. */
import { catalogOf, itemOf } from "./item-catalog.ts";
import type { ItemCatalog } from "./item-catalog.ts";
import { totalPp } from "./member-metadata.ts";
import { resolveAbility } from "./member-identity.ts";
import { speciesDataOf } from "./species-key.ts";
import type { Content, Member } from "./types.ts";

/** A synchronous validation's private directory. Never cached by content identity or shared with a later write. */
export interface MemberContentIndex {
  readonly catalog: ItemCatalog;
  readonly abilities: ReadonlySet<string | null>;
  readonly moves: ReadonlyMap<string, number>;
  readonly knownItems: Map<string, boolean>;
}

export function createMemberContentIndex(content: Content): MemberContentIndex {
  const abilities = new Set<string | null>();
  if (content.abilities !== undefined) for (const entry of Object.values(content.abilities)) {
    abilities.add(entry.id); abilities.add(entry.name);
  } else for (const data of Object.values(content.species)) {
    for (const ability of [...(data.abilities ?? []), ...(data.hiddenAbilities ?? [])]) abilities.add(ability);
  }
  const moves = new Map<string, number>();
  for (const data of Object.values(content.moves ?? {})) if (!moves.has(data.id)) moves.set(data.id, data.pp);
  return { catalog: catalogOf(content), abilities, moves, knownItems: new Map() };
}

export function memberContentProblems(m: Readonly<Member>, content: Content, path: string, index?: MemberContentIndex): { path: string; message: string }[] {
  const lookup = index ?? createMemberContentIndex(content);
  const out: { path: string; message: string }[] = [], species = speciesDataOf(content, m);
  if (!species) out.push({ path: `${path}.species`, message: "unmapped species/form; original save must be kept" });
  const abilityKnown = lookup.abilities.has(m.ability);
  const legalEmpty = m.ability === "" && !!species && m.effectiveAbilityIndex === null &&
    (m.abilityIndex === null ? [0, 1].some(slot => resolveAbility(m.personalID!, species, slot).ability === "") : resolveAbility(m.personalID!, species, m.abilityIndex!).ability === "");
  if (!legalEmpty && !abilityKnown) out.push({ path: `${path}.ability`, message: "unmapped ability; a trusted legacy override still requires the checked ability directory" });
  const itemKnown = (id: string): boolean => {
    const cached = lookup.knownItems.get(id);
    if (cached !== undefined) return cached;
    const known = !!itemOf(lookup.catalog, id); lookup.knownItems.set(id, known); return known;
  };
  if (m.item && !itemKnown(m.item)) out.push({ path: `${path}.item`, message: "unmapped held item" });
  if (m.ball && !itemKnown(m.ball)) out.push({ path: `${path}.ball`, message: "unmapped capture ball" });
  m.moves.forEach((move, i) => {
    const base = lookup.moves.get(move.id);
    if (!lookup.moves.has(move.id)) out.push({ path: `${path}.moves[${i}].id`, message: "unmapped move" });
    else if (base === undefined || move.maxpp !== totalPp(base, move.ppUps ?? 0)) out.push({ path: `${path}.moves[${i}].maxpp`, message: "max PP does not match checked base PP and PP Ups" });
  });
  (m.firstMoves ?? []).forEach((move, i) => { if (!lookup.moves.has(move)) out.push({ path: `${path}.firstMoves[${i}]`, message: "unmapped first move" }); });
  return out;
}
