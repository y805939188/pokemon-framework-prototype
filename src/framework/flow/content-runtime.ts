/**
 * Runtime side of the content pipeline: check a compiled document and assemble the `Content` the session uses by
 * joining framework-owned fields with Showdown-owned battle data (base stats, display names). Every problem is
 * reported with the record and field it comes from; nothing is repaired silently.
 */
import { checkItemInputs } from "../content/item-input.ts";
import type { CompiledContent, ContentError } from "../content/schema.ts";
import { checkOverrides, developmentCapabilities } from "../rules/config.ts";
import { COMPILED_SCHEMA_VERSION } from "../content/schema.ts";
import { canonicalJson, speciesFieldProblem, checkSources, preUseProblem, showdownDependencyProblem } from "../content/compile.ts";
import type { Content, DexLookup, Member } from "../rules/types.ts";
import { PROGRESSION_FIELDS, progressionFieldProblem, deriveSpeciesFields, checkProgressionReferences, checkRegionalDex, checkMapMetadata } from "../content/progression-input.ts";
import { evolutionMethod } from "../rules/evolution-data.ts";
import { sha256Hex } from "../rules/sha256.ts";
import { allMembers, locateMember } from "../rules/storage.ts";
import type { MemberCollection } from "../rules/storage.ts";
import { own, setOwn } from "../rules/own.ts";
import { battleNameOf, memberKey } from "../rules/species-key.ts";

/** Strong compiled identity only; id/inputsHash/anonymous fallbacks are diagnostics, never effects authority. */
export function validatedContentIdentity(content: Content): string | null {
  const meta = content.meta;
  if (!meta || meta.compiledSemantics !== COMPILED_SCHEMA_VERSION || typeof meta.inputsHash !== "string" || !/^[a-f0-9]{64}$/.test(meta.inputsHash)
    || typeof meta.showdownSha !== "string" || !/^[a-f0-9]{40}$/.test(meta.showdownSha) || typeof meta.contentIdentity !== "string") return null;
  const identity = sha256Hex(canonicalJson({ compiledSemantics: COMPILED_SCHEMA_VERSION, inputsHash: meta.inputsHash, showdownSha: meta.showdownSha }));
  return meta.contentIdentity === identity ? identity : null;
}

/** Validate a cache independently of its producer. Version 1 is a rebuild request, never a save migration. */
export function loadCompiled(json: unknown): CompiledContent {
  const obj = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const dense = (value: unknown): value is unknown[] => Array.isArray(value) && Object.keys(value).length === value.length;
  if (!obj(json) || json.schema !== COMPILED_SCHEMA_VERSION) throw new Error(`needs-rebuild: compiled content requires schema ${COMPILED_SCHEMA_VERSION}`);
  const problems: ContentError[] = [];
  const report = (file: ContentError["file"], path: string, message: string): void => { problems.push({file,path,message}); };
  if (typeof json.contentId !== "string" || !/^[a-z][a-z0-9-]{0,30}$/.test(json.contentId)) report("compiled","$.contentId","invalid content id");
  if (typeof json.inputsHash !== "string" || !/^[a-f0-9]{64}$/.test(json.inputsHash)) report("compiled","$.inputsHash","must be SHA256");
  if (typeof json.showdownSha !== "string" || !/^[a-f0-9]{40}$/.test(json.showdownSha)) report("compiled","$.showdownSha","must be a pinned Showdown SHA");
  if (json.contentIdentity !== sha256Hex(canonicalJson({compiledSemantics: COMPILED_SCHEMA_VERSION, inputsHash:json.inputsHash, showdownSha:json.showdownSha}))) report("compiled","$.contentIdentity","content-identity-mismatch");
  for(const p of checkOverrides(json.settings??{}))report("settings.json",p.path,p.message);
  const sources = checkSources(json.sources,report);
  const usable = (source: unknown): string | null => preUseProblem(sources,source);
  if (!dense(json.species)) report("compiled","$.species","must be a dense array");
  else {
    const recordKeys = new Set<string>();
    for (const [i, value] of json.species.entries()) {
      const p=`$.species[${i}]`;
      if (!obj(value)) { report("compiled",p,"must be a species record"); continue; }
      for (const field of Object.keys(value)) if (!["id","form","showdownId","source","defaultForm","displayForm","nameKey","growth","baseExp","evYield","catchRate","happiness","learnset",...PROGRESSION_FIELDS].includes(field)) report("compiled",`${p}.${field}`,"unknown species field");
      if(typeof value.id!=="string"||!/^[a-z][a-z0-9-]{0,30}$/.test(value.id))report("compiled",`${p}.id`,"invalid species id");
      if(value.form!==undefined&&(!Number.isSafeInteger(value.form)||(value.form as number)<0||(value.form as number)>999))report("compiled",`${p}.form`,"invalid form");
      if(typeof value.showdownId!=="string"||!/^[a-z0-9]{1,40}$/.test(value.showdownId))report("compiled",`${p}.showdownId`,"invalid Showdown identity");
      const recordKey=`${String(value.id)}/${String(value.form??0)}`;
      if(recordKeys.has(recordKey))report("compiled",p,"duplicate species key"); recordKeys.add(recordKey);
      for(const field of ["nameKey","growth","baseExp","evYield","catchRate","learnset"]) { const issue=speciesFieldProblem(field,value[field]);if(issue)report("compiled",`${p}.${field}`,issue); }
      for(const field of ["happiness",...PROGRESSION_FIELDS]) if(Object.hasOwn(value,field)) { const issue=speciesFieldProblem(field,value[field]);if(issue)report("compiled",`${p}.${field}`,issue); }
      const gate=usable(value.source);if(gate)report("compiled",`${p}.source`,`source-unusable: ${gate}`);
    }
    for(const recordKey of recordKeys)if(!recordKeys.has(recordKey.split("/")[0]+"/0"))report("compiled","$.species","missing base form");
    const order=json.registrationOrder;
    const orderKeys=dense(order)?order.map(k=>obj(k)&&Object.keys(k).length===2&&typeof k.species==="string"&&Number.isSafeInteger(k.form)?`${k.species}/${String(k.form)}`:""):[];
    if(!dense(order)||orderKeys.length!==recordKeys.size||new Set(orderKeys).size!==orderKeys.length||orderKeys.some(k=>!recordKeys.has(k)))report("compiled","$.registrationOrder","must contain every species key exactly once");
    if(!problems.length) {
      const records=json.species as unknown as CompiledContent["species"];
      const derived=JSON.parse(JSON.stringify(records)) as CompiledContent["species"];
      deriveSpeciesFields(derived,report);checkProgressionReferences(records,report);
      for(const [i,value] of records.entries()) if(value.defaultForm!==derived[i]!.defaultForm||value.displayForm!==derived[i]!.displayForm||value.color!==derived[i]!.color||value.shape!==derived[i]!.shape||canonicalJson(value.dexSortKeys)!==canonicalJson(derived[i]!.dexSortKeys))report("compiled",`$.species[${i}]`,"derived-form-mismatch");
      const regional=json.regionalDex;
      const raw=obj(regional)&&regional.source!==undefined?{source:regional.source,national:regional.national,regions:regional.regions,...(Object.hasOwn(regional,"transitions")?{transitions:regional.transitions}:{})}:undefined;
      const checked=checkRegionalDex(raw,json.registrationOrder as unknown as import("../rules/types.ts").SpeciesKey[],usable,report);
      if(canonicalJson(regional)!==canonicalJson(checked))report("compiled","$.regionalDex","invalid regional layout, source or layout identity");
      checkMapMetadata(json.mapMetadata,checked,usable,report);
      for(const [i,region] of ((json.settings as {DEXES_WITH_OFFSETS?:number[]} | undefined)?.DEXES_WITH_OFFSETS??[]).entries())if(region>=checked.regions.length)report("compiled",`$.settings.DEXES_WITH_OFFSETS[${i}]`,"unknown region reference");
    }
  }
  if(json.grants!==undefined&&(!dense(json.grants)||json.grants.some(g=>!obj(g)||!dense(g.members)||g.members.some(m=>!obj(m))||!obj(g.items))))report("compiled","$.grants","invalid grant records");
  if(problems.length)throw new Error(problems.map(p=>`${p.file} ${p.path}: ${p.message}`).join("; "));
  return json as unknown as CompiledContent;
}

export function assembleContent(compiled: CompiledContent, dex: DexLookup, developerCapabilities: unknown = {}): { content: Content; errors: ContentError[] } {
  const errors: ContentError[] = [];
  const capabilities = developmentCapabilities(developerCapabilities);
  try { loadCompiled(compiled); } catch(error) { return {content:{species:{}},errors:[{file:"compiled",path:"$",message:(error as Error).message}]}; }
  const content: Content = { species: {}, meta: { kind: "sample", id: compiled.contentId, inputsHash: compiled.inputsHash, compiledSemantics: COMPILED_SCHEMA_VERSION, showdownSha: compiled.showdownSha, contentIdentity: compiled.contentIdentity }, registrationOrder: compiled.registrationOrder?.map(k=>({...k})), regionalDex: JSON.parse(JSON.stringify(compiled.regionalDex)) as import("../rules/types.ts").RegionalDex, ...(compiled.mapMetadata ? {mapMetadata:JSON.parse(JSON.stringify(compiled.mapMetadata)) as import("../rules/types.ts").MapMetadata} : {}), moves: {}, speciesIds: {}, forms: {}, speciesKeys: {}, grants: {}, ...(compiled.settings ? { settings: { ...compiled.settings } } : {}) };
  // A compiled document may be older than the gate, or edited by hand. Validate the whole registry and every source
  // whose data will be consumed before even querying the Dex; a placeholder's exemption covers only its own fields.
  for (const p of checkOverrides(compiled.settings ?? {})) errors.push({ file: "settings.json", path: p.path, message: p.message });
  const sources = checkSources(compiled.sources, (file, path, message) => { errors.push({ file, path, message }); });
  if (errors.length) return { content, errors };
  const itemInputs = checkItemInputs(compiled.items, compiled.shops, id => preUseProblem(sources, id));
  errors.push(...itemInputs.errors);
  if (compiled.species.length || itemInputs.items.some(item => !!item.move) || (compiled.grants ?? []).some((g) => g.members.some((m) => !!m.item))) {
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
  for (const item of itemInputs.items) if (item.move && !dex.move(item.move)) errors.push({file:'assembly',path:`items/${item.id}.move`,message:'move is not in the pinned data'});
  if (errors.length) return {content,errors};
  content.items = itemInputs.catalog;
  content.shops = Object.fromEntries(itemInputs.shops.map(shop => [shop.id, shop]));
  if (compiled.species.length && dex.sha() !== compiled.showdownSha) { errors.push({file:"assembly",path:"$.showdownSha",message:"pinned-showdown-mismatch"}); return {content,errors}; }
  if (compiled.species.length) content.abilities = Object.fromEntries((dex.allAbilities?.() ?? []).map(ability => [ability.id,{...ability}]));
  if (compiled.species.length || itemInputs.items.some(item=>!!item.move)) for (const move of dex.allMoves?.() ?? []) setOwn(content.moves!,move.name,{...move});
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
    const moveRef = (ref: string, field: string): string | null => { const move=dex.move(ref); if(!move){errors.push({file:"assembly",path:`${path}.${field}`,message:`unknown move ${ref}`});ok=false;return null;} if(move.id!==undefined&&move.pp!==undefined)setOwn(content.moves!,move.name,{id:move.id,name:move.name,pp:move.pp});return move.name; };
    for(const [j,ref] of (sp.types??[]).entries())if(!dex.type?.(ref)){errors.push({file:"assembly",path:`${path}.types[${j}]`,message:`unknown type ${ref}`});ok=false;}
    for(const field of ["abilities","hiddenAbilities"] as const)for(const [j,ref] of (sp[field]??[]).entries())if(ref!==null&&!dex.abilityInfo?.(ref)){errors.push({file:"assembly",path:`${path}.${field}[${j}]`,message:`unknown ability ${ref}`});ok=false;}
    const tutorMoves=(sp.tutorMoves??[]).map((ref,j)=>moveRef(ref,`tutorMoves[${j}]`)).filter((ref):ref is string=>ref!==null);
    for(const [j,entry] of (sp.evolutions??[]).entries()) {
      const kind=evolutionMethod(entry.method)!.parameterKind,ref=String(entry.parameter),field=`evolutions[${j}].parameter`;
      if(kind==="move")moveRef(ref,field);
      if(kind==="type"&&!dex.type?.(ref)){errors.push({file:"assembly",path:`${path}.${field}`,message:`unknown type ${ref}`});ok=false;}
      if(kind==="item"&&!Object.hasOwn(itemInputs.catalog,ref)&&!dex.heldItem?.(ref)){errors.push({file:"assembly",path:`${path}.${field}`,message:`unknown item ${ref}`});ok=false;}
    }
    for (const [j, e] of sp.learnset.entries()) {
      const mv = dex.move(e.move);
      if (!mv) { errors.push({ file: "assembly", path: `${path}.learnset[${j}].move`, message: `"${e.move}" is not a move in the pinned Showdown data (${short})` }); ok = false; continue; }
      (learnset[e.level] ??= []).push(mv.name);
      // what creating an individual needs about the move (WP20 §5.1: a new move object starts with full PP)
      if (typeof mv.id === "string" && typeof mv.pp === "number") setOwn(content.moves!, mv.name, { id: mv.id, name: mv.name, pp: mv.pp });
    }
    if (!ok) continue;
    const happiness = sp.happiness ?? baseHappiness.get(sp.id);
    setOwn(content.species, found.name, {
      base: found.baseStats, growth: sp.growth, baseExp: sp.baseExp, evYield: { ...sp.evYield }, catchRate: sp.catchRate, learnset, nameKey: sp.nameKey, contentId: sp.id, form, ruleSpecies: found.baseSpecies ?? found.name,
      ...(sp.abilities !== undefined ? {abilities:sp.abilities.map(ref=>ref===null?null:dex.abilityInfo!(ref)!.name)} : found.abilities ? { abilities: [...found.abilities] } : {}), ...(sp.hiddenAbilities !== undefined ? {hiddenAbilities:sp.hiddenAbilities.map(ref=>ref===null?null:dex.abilityInfo!(ref)!.name)} : found.hiddenAbilities ? { hiddenAbilities: [...found.hiddenAbilities] } : {}), types:sp.types!==undefined?sp.types.map(ref=>dex.type!(ref)!.name):[...(found.types??[])], tutorMoves,
      ...Object.fromEntries(["evolutions","flags","defaultForm","displayForm","pokedexForm","categoryKey","entryKey","heightDm","weightHg","color","shape","formName","formNameKey","dexSortKeys"].filter(field=>Object.hasOwn(sp,field)).map(field=>[field,JSON.parse(JSON.stringify((sp as unknown as Record<string,unknown>)[field])) as unknown])), ...(happiness !== undefined ? { happiness } : {}), ...(found.gender !== undefined ? { gender: found.gender } : {}),
    });
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
    if (ok) setOwn(content.grants!, g.id, { id: g.id, members, items: { ...g.items }, money: g.money });
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
  state: MemberCollection & {inventory?:import("../rules/inventory.ts").Inventory},
  content: Content,
  dex?: DexLookup,
): DanglingReference[] {
  const out: DanglingReference[] = [];
  if (state.inventory) for (const [i,pocket] of state.inventory.pockets.entries()) for (const [j,slot] of pocket.entries()) {
    if (!Object.hasOwn(content.items ?? {},slot.itemId) && content.items !== undefined) out.push({path:`$.inventory.pockets[${i}][${j}].itemId`,message:'item is absent from current content'});
  }
  if(out.length)return out;
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
