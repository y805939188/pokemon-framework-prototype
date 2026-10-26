/** Present-member content references shared by fresh reception and the final save gate. No state or migration. */
import { catalogOf, itemOf } from "./item-catalog.ts";
import { baseMovePp, totalPp } from "./member-metadata.ts";
import { resolveAbility } from "./member-identity.ts";
import { speciesDataOf } from "./species-key.ts";
import type { Content, Member } from "./types.ts";

export function memberContentProblems(m: Readonly<Member>, content: Content, path: string): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [], species = speciesDataOf(content, m), catalog = catalogOf(content);
  if (!species) out.push({ path: `${path}.species`, message: "unmapped species/form; original save must be kept" });
  const abilityKnown = content.abilities !== undefined
    ? Object.values(content.abilities).some(entry => entry.id === m.ability || entry.name === m.ability)
    : Object.values(content.species).some(data => [...(data.abilities ?? []), ...(data.hiddenAbilities ?? [])].includes(m.ability));
  const legalEmpty = m.ability === "" && !!species && m.effectiveAbilityIndex === null &&
    (m.abilityIndex === null ? [0, 1].some(slot => resolveAbility(m.personalID!, species, slot).ability === "") : resolveAbility(m.personalID!, species, m.abilityIndex!).ability === "");
  if (!legalEmpty && !abilityKnown) out.push({ path: `${path}.ability`, message: "unmapped ability; a trusted legacy override still requires the checked ability directory" });
  if (m.item && !itemOf(catalog, m.item)) out.push({ path: `${path}.item`, message: "unmapped held item" });
  if (m.ball && !itemOf(catalog, m.ball)) out.push({ path: `${path}.ball`, message: "unmapped capture ball" });
  const moves = Object.values(content.moves ?? {});
  m.moves.forEach((move, i) => {
    const base = baseMovePp(content, move.id);
    if (!moves.some(data => data.id === move.id)) out.push({ path: `${path}.moves[${i}].id`, message: "unmapped move" });
    else if (base === undefined || move.maxpp !== totalPp(base, move.ppUps ?? 0)) out.push({ path: `${path}.moves[${i}].maxpp`, message: "max PP does not match checked base PP and PP Ups" });
  });
  (m.firstMoves ?? []).forEach((move, i) => { if (!moves.some(data => data.id === move)) out.push({ path: `${path}.firstMoves[${i}]`, message: "unmapped first move" }); });
  return out;
}
