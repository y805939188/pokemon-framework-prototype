/**
 * Runtime side of the content pipeline: check a compiled document and assemble the `Content` the session uses by
 * joining framework-owned fields with Showdown-owned battle data (base stats, display names). Every problem is
 * reported with the record and field it comes from; nothing is repaired silently.
 */
import type { CompiledContent, ContentError } from "../content/schema.ts";
import { checkOverrides, developmentCapabilities } from "../rules/config.ts";
import { SCHEMA_VERSION } from "../content/schema.ts";
import { checkSources, preUseProblem, showdownDependencyProblem } from "../content/compile.ts";
import type { Content, DexLookup, Member } from "../rules/types.ts";
import { allMembers, locateMember } from "../rules/storage.ts";
import type { MemberCollection } from "../rules/storage.ts";
import { own, setOwn } from "../rules/own.ts";
import { battleNameOf, memberKey } from "../rules/species-key.ts";

/** Shape check of a compiled document read from disk (it was validated when it was compiled). */
export function loadCompiled(json: unknown): CompiledContent {
  const o = json as Partial<CompiledContent> | null;
  if (!o || typeof o !== "object" || o.schema !== SCHEMA_VERSION || !Array.isArray(o.species) || typeof o.inputsHash !== "string" || typeof o.contentId !== "string" || (o.grants !== undefined && !Array.isArray(o.grants)) || (o.settings !== undefined && (typeof o.settings !== "object" || o.settings === null))) {
    throw new Error(`compiled content is not a schema ${SCHEMA_VERSION} document (run the content build)`);
  }
  const problems = checkOverrides(o.settings ?? {});
  if (problems.length) throw new Error(`compiled settings: ${problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
  return o as CompiledContent;
}

export function assembleContent(compiled: CompiledContent, dex: DexLookup, developerCapabilities: unknown = {}): { content: Content; errors: ContentError[] } {
  const errors: ContentError[] = [];
  const capabilities = developmentCapabilities(developerCapabilities);
  const content: Content = { species: {}, meta: { kind: "sample", id: compiled.contentId, inputsHash: compiled.inputsHash }, moves: {}, speciesIds: {}, forms: {}, speciesKeys: {}, grants: {}, ...(compiled.settings ? { settings: { ...compiled.settings } } : {}) };
  // A compiled document may be older than the gate, or edited by hand. Validate the whole registry and every source
  // whose data will be consumed before even querying the Dex; a placeholder's exemption covers only its own fields.
  for (const p of checkOverrides(compiled.settings ?? {})) errors.push({ file: "settings.json", path: p.path, message: p.message });
  const sources = checkSources(compiled.sources, (file, path, message) => { errors.push({ file, path, message }); });
  if (errors.length) return { content, errors };
  if (compiled.species.length || (compiled.grants ?? []).some((g) => g.members.some((m) => !!m.item))) {
    const dep = showdownDependencyProblem(sources);
    if (dep) errors.push({ file: "assembly", path: "sources", message: dep });
  }
  for (const sp of compiled.species) {
    const problem = preUseProblem(sources, sp.source);
    if (problem) errors.push({ file: "assembly", path: `species/${sp.id}${sp.form ? `/${sp.form}` : ""}.source`, message: problem });
  }
  for (const sp of compiled.species) if (sp.happiness !== undefined && (!Number.isSafeInteger(sp.happiness) || sp.happiness < 0)) errors.push({ file: "assembly", path: `species/${sp.id}.happiness`, message: "must be a nonnegative safe integer" });
  for (const grant of compiled.grants ?? []) {
    for (const [i, member] of grant.members.entries()) if (member.item && !capabilities.allowHeldItemSources) errors.push({ file: "assembly", path: `grants/${grant.id}.members[${i}].item`, message: "held-item-source-disabled" });
    const problem = preUseProblem(sources, grant.source);
    if (problem) errors.push({ file: "assembly", path: `grants/${grant.id}.source`, message: problem });
  }
  if (errors.length) return { content, errors };
  // Empty author content needs no external battle data, including the lazy Dex's identity lookup.
  const short = compiled.species.length ? dex.sha().slice(0, 8) : null;
  // Provenance fact of this assembled runtime content, never a capability or save setting.
  if (content.meta && showdownDependencyProblem(sources) === null) content.meta.showdownSourceChecked = true;
  const baseHappiness = new Map(compiled.species.filter((sp) => (sp.form ?? 0) === 0).map((sp) => [sp.id, sp.happiness]));
  const byName = new Map<string, string>();
  for (const sp of compiled.species) {
    const form = sp.form ?? 0;
    const path = form ? `species/${sp.id}/${form}` : `species/${sp.id}`;
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
    const happiness = sp.happiness ?? baseHappiness.get(sp.id);
    content.species[found.name] = {
      base: found.baseStats, growth: sp.growth, baseExp: sp.baseExp, evYield: { ...sp.evYield }, catchRate: sp.catchRate, learnset, nameKey: sp.nameKey, contentId: sp.id, form,
      ...(found.abilities ? { abilities: [...found.abilities] } : {}), ...(found.hiddenAbilities ? { hiddenAbilities: [...found.hiddenAbilities] } : {}), ...(happiness !== undefined ? { happiness } : {}), ...(found.gender !== undefined ? { gender: found.gender } : {}),
    };
    // the persistent key (decision D5-3): content id + form <-> Showdown name, both ways
    if (form === 0) setOwn(content.speciesIds!, sp.id, found.name);
    if (!own(content.forms!, sp.id)) setOwn(content.forms!, sp.id, {});
    setOwn(content.forms![sp.id]!, String(form), found.name);
    setOwn(content.speciesKeys!, found.name, { species: sp.id, form });
  }
  // a form needs its base form: the reference falls back to it (WP03 §3.2), so it must exist
  for (const [id, forms] of Object.entries(content.forms!)) {
    if (!own(forms, "0")) errors.push({ file: "assembly", path: `species/${id}`, message: `"${id}" has form(s) ${Object.keys(forms).join(", ")} but no assembled base form 0` });
  }
  for (const g of compiled.grants ?? []) {
    const members: { species: string; level: number; form?: number; item?: string }[] = [];
    let ok = true;
    for (const [j, m] of g.members.entries()) {
      if (m.item) { const item = dex.heldItem?.(m.item); if (!item?.holdable || item.mail) { errors.push({ file: "assembly", path: `grants/${g.id}.members[${j}].item`, message: `unsupported held item ${m.item}` }); ok = false; continue; } }
      if (m.form !== undefined && !compiled.species.some((sp) => sp.id === m.species && (sp.form ?? 0) === m.form)) { errors.push({ file: "assembly", path: `grants/${g.id}.members[${j}].form`, message: "missing exact form" }); ok = false; continue; }
      const name = own(content.speciesIds, m.species);
      if (!name) { errors.push({ file: "assembly", path: `grants/${g.id}.members[${j}].species`, message: `"${m.species}" is not an assembled species` }); ok = false; continue; }
      members.push({ species: name, level: m.level, ...(m.form !== undefined ? { form: m.form } : {}), ...(m.item !== undefined ? { item: m.item } : {}) });
    }
    if (ok) content.grants![g.id] = { id: g.id, members, items: { ...g.items }, money: g.money };
  }
  return { content, errors };
}

/** A species reference written by an author (content id "pidgey" = its base form, or a Showdown name "Pidgey") -> the battle name, or null. */
export function resolveSpecies(content: Content, ref: string): string | null {
  if (own(content.species, ref)) return ref;
  const byId = own(content.speciesIds, ref);
  return byId !== undefined && own(content.species, byId) ? byId : null;
}

export interface DanglingReference { path: string; message: string }

/**
 * References from a saved (persistent, schema 4) state into the current content: content ids that no longer exist, and
 * (when a Showdown lookup is given) moves the battle engine does not know. Located like every other content error, so a
 * save written against older content is explained instead of crashing a battle. A missing form is not dangling: it
 * falls back to the base form (WP03 §3.2).
 */
export function findDanglingReferences(
  state: MemberCollection,
  content: Content,
  dex?: DexLookup,
): DanglingReference[] {
  const out: DanglingReference[] = [];
  for (const m of allMembers(state)) {
      const position = locateMember(state, m.id)!.position;
      const path = position.kind === "party" ? `$.party[${position.index}]` : `$.storage.boxes[${position.box}].slots[${position.slot}]`;
      if (battleNameOf(content, memberKey(m)) === null) {
        out.push({ path: `${path}.species`, message: `"${m.species}" is not in the content${content.meta ? ` "${content.meta.id}"` : ""}` });
        // This member is already unusable. An empty catalog has not authorized any external move data.
        continue;
      }
      if (dex) for (const [j, mv] of m.moves.entries()) if (!dex.move(mv.id)) out.push({ path: `${path}.moves[${j}].id`, message: `"${mv.id}" is not a move in the pinned Showdown data` });
    }
  return out;
}
