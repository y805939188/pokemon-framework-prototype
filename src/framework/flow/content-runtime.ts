/**
 * Runtime side of the content pipeline: check a compiled document and assemble the `Content` the session uses by
 * joining framework-owned fields with Showdown-owned battle data (base stats, display names). Every problem is
 * reported with the record and field it comes from; nothing is repaired silently.
 */
import type { CompiledContent, ContentError } from "../content/schema.ts";
import { SCHEMA_VERSION } from "../content/schema.ts";
import type { Content, DexLookup } from "../rules/types.ts";

/** Shape check of a compiled document read from disk (it was validated when it was compiled). */
export function loadCompiled(json: unknown): CompiledContent {
  const o = json as Partial<CompiledContent> | null;
  if (!o || typeof o !== "object" || o.schema !== SCHEMA_VERSION || !Array.isArray(o.species) || typeof o.inputsHash !== "string" || typeof o.contentId !== "string" || (o.grants !== undefined && !Array.isArray(o.grants))) {
    throw new Error(`compiled content is not a schema ${SCHEMA_VERSION} document (run the content build)`);
  }
  return o as CompiledContent;
}

export function assembleContent(compiled: CompiledContent, dex: DexLookup): { content: Content; errors: ContentError[] } {
  const errors: ContentError[] = [];
  const content: Content = { species: {}, meta: { kind: "sample", id: compiled.contentId, inputsHash: compiled.inputsHash }, moves: {}, speciesIds: {}, grants: {} };
  const short = dex.sha().slice(0, 8);
  const byName = new Map<string, string>();
  for (const sp of compiled.species) {
    const path = `species/${sp.id}`;
    const found = dex.species(sp.showdownId);
    if (!found) { errors.push({ file: "assembly", path: `${path}.showdownId`, message: `"${sp.showdownId}" is not a species in the pinned Showdown data (${short})` }); continue; }
    const clash = byName.get(found.name);
    if (clash) { errors.push({ file: "assembly", path: `${path}.showdownId`, message: `${found.name} is already provided by ${clash}` }); continue; }
    byName.set(found.name, path);
    const learnset: Record<number, string[]> = {};
    let ok = true;
    for (const [j, e] of sp.learnset.entries()) {
      const mv = dex.move(e.move);
      if (!mv) { errors.push({ file: "assembly", path: `${path}.learnset[${j}].move`, message: `"${e.move}" is not a move in the pinned Showdown data (${short})` }); ok = false; continue; }
      (learnset[e.level] ??= []).push(mv.name);
      // what creating an individual needs about the move (WP20 §5.1: a new move object starts with full PP)
      if (typeof mv.id === "string" && typeof mv.pp === "number") content.moves![mv.name] = { id: mv.id, name: mv.name, pp: mv.pp };
    }
    if (!ok) continue;
    content.species[found.name] = {
      base: found.baseStats, growth: sp.growth, baseExp: sp.baseExp, evYield: { ...sp.evYield }, catchRate: sp.catchRate, learnset, nameKey: sp.nameKey, contentId: sp.id,
      ...(found.abilities ? { abilities: [...found.abilities] } : {}), ...(found.gender !== undefined ? { gender: found.gender } : {}),
    };
    content.speciesIds![sp.id] = found.name;
  }
  for (const g of compiled.grants ?? []) {
    const members: { species: string; level: number }[] = [];
    let ok = true;
    for (const [j, m] of g.members.entries()) {
      const name = content.speciesIds![m.species];
      if (!name) { errors.push({ file: "assembly", path: `grants/${g.id}.members[${j}].species`, message: `"${m.species}" is not an assembled species` }); ok = false; continue; }
      members.push({ species: name, level: m.level });
    }
    if (ok) content.grants![g.id] = { id: g.id, members, items: { ...g.items }, money: g.money };
  }
  return { content, errors };
}

/** A species reference written by an author (content id "pidgey", or the persistent Showdown name "Pidgey") -> the persistent key, or null. */
export function resolveSpecies(content: Content, ref: string): string | null {
  if (content.species[ref]) return ref;
  const byId = content.speciesIds?.[ref];
  return byId && content.species[byId] ? byId : null;
}

export interface DanglingReference { path: string; message: string }

/**
 * References from a saved state into the current content: species that no longer exist, and (when a Showdown lookup is
 * given) moves the battle engine does not know. Located like every other content error, so a save written against older
 * content is explained instead of crashing a battle.
 */
export function findDanglingReferences(
  state: { party: { species: string; moves: { id: string }[] }[]; boxes: { species: string; moves: { id: string }[] }[] },
  content: Content,
  dex?: DexLookup,
): DanglingReference[] {
  const out: DanglingReference[] = [];
  for (const key of ["party", "boxes"] as const) {
    for (const [i, m] of state[key].entries()) {
      const path = `$.${key}[${i}]`;
      if (!content.species[m.species]) out.push({ path: `${path}.species`, message: `"${m.species}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}` });
      if (dex) for (const [j, mv] of m.moves.entries()) if (!dex.move(mv.id)) out.push({ path: `${path}.moves[${j}].id`, message: `"${mv.id}" is not a move in the pinned Showdown data` });
    }
  }
  return out;
}
