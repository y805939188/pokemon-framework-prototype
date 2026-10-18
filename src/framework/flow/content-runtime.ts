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
  if (!o || typeof o !== "object" || o.schema !== SCHEMA_VERSION || !Array.isArray(o.species) || typeof o.inputsHash !== "string" || typeof o.contentId !== "string") {
    throw new Error(`compiled content is not a schema ${SCHEMA_VERSION} document (run the content build)`);
  }
  return o as CompiledContent;
}

export function assembleContent(compiled: CompiledContent, dex: DexLookup): { content: Content; errors: ContentError[] } {
  const errors: ContentError[] = [];
  const content: Content = { species: {}, meta: { kind: "sample", id: compiled.contentId, inputsHash: compiled.inputsHash } };
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
    }
    if (!ok) continue;
    content.species[found.name] = { base: found.baseStats, growth: sp.growth, baseExp: sp.baseExp, evYield: { ...sp.evYield }, catchRate: sp.catchRate, learnset };
  }
  return { content, errors };
}
