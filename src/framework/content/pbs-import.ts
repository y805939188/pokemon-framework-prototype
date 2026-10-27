import { DEX_COLORS as COLORS, DEX_SHAPES as SHAPES } from "../rules/pokedex-query";
/** Author PBS species proposals (WP03/04/18/31/62, reference R). No source or output writes.
 * The legacy text API keeps accepted-record diagnostics. The gated bundle API is atomic and reads explicit
 * ordered base files, then forms, then regions. Catalog validation remains with normal compile/assembly.
 */
import type { CurveId, PartialStats, SpeciesKey, StatKey } from '../rules/types';
import { own } from '../rules/own';
import type { LearnEntry, SpeciesSource } from './schema';
import { parsePbsEvolutions, progressionCsv } from './pbs-progression';
import type { EvolutionProperty } from './pbs-progression';
import { importPbsRegionalDex } from './pbs-regional-dex';
import type { PbsFile, PbsSourceGate, RegionNameKey, RegionalDexProposal } from './pbs-regional-dex';
export type { PbsFile, PbsSourceGate, RegionNameKey } from './pbs-regional-dex';

export interface PbsProblem { file?: string; line: number; path: string; message: string }
export interface PbsRecordReport {
  id: string; line: number; file?: string; form?: number; showdownId: string;
  showdown: string[]; later: { field: string; batch: string }[]; ignored: string[]; overridden: string[]; defaults: string[];
}
export interface PbsTextProposal { key: string; text: string; file?: string; line: number; field: string; source: string }
export interface PbsImport { ok: boolean; species: SpeciesSource[]; records: PbsRecordReport[]; errors: PbsProblem[]; texts?: PbsTextProposal[] }
export interface PbsIdentity { symbol: string; species: string; form: number; showdownId: string }
export interface PbsBundleOptions {
  sourceId: string; sourceProblem: PbsSourceGate; baseFiles: readonly PbsFile[]; formFiles?: readonly PbsFile[];
  regionalFiles?: readonly PbsFile[]; regionNameKeys?: readonly RegionNameKey[];
  /** Author-provided adapter identity, checked after the source gate; never inferred from a PBS form number. */
  resolveFormShowdownId?: (rawBaseSymbol: string, form: number) => string | null;
}
export interface PbsBundleImport extends PbsImport { identities: PbsIdentity[]; texts: PbsTextProposal[]; regionalDex?: RegionalDexProposal }

const GROWTH: Record<string, CurveId> = { Medium: 'medium', Fast: 'fast', Slow: 'slow', Parabolic: 'parabolic', Erratic: 'erratic', Fluctuating: 'fluctuating' };
const STAT: Record<string, StatKey> = { HP: 'hp', ATTACK: 'atk', DEFENSE: 'def', SPECIAL_ATTACK: 'spa', SPECIAL_DEFENSE: 'spd', SPEED: 'spe' };
const IMPORTED = ['GrowthRate','BaseExp','EVs','CatchRate','Happiness','Moves','TutorMoves','EggMoves','Evolutions','Evolution','Types','Abilities','HiddenAbilities','Flags','PokedexForm','Category','Pokedex','Height','Weight','Color','Shape','FormName'];
const SHOWDOWN = ['Name','BaseStats','GenderRatio'];
const LATER: Record<string, string> = {
  Habitat: '5.3 dex', Generation: '5.3 dex',
  Incense: 'after the first version (breeding)', Offspring: 'after the first version (breeding)',
  EggGroups: 'after the first version (breeding)', HatchSteps: 'after the first version (breeding)',
  WildItemCommon: '5.5 wild held items', WildItemUncommon: '5.5 wild held items', WildItemRare: '5.5 wild held items',
};
const ID = /^[a-z][a-z0-9-]{0,30}$/;
const SYMBOL = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Original symbol spelling is validated before deriving a JSON id; no characters are guessed or deleted. */
export const deriveIds = (section: string): { id: string; showdownId: string } | null => SYMBOL.test(section)
  ? { id: section.toLowerCase().replace(/_/g, '-'), showdownId: section.toLowerCase().replace(/_/g, '') } : null;
const int = (value: string | undefined, lo: number, hi: number): number | null => value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= lo && Number(value) <= hi ? Number(value) : null;
interface Section {
  name: string; form: number; line: number; file?: string; invalid: boolean; showdownId?: string;
  props: Map<string, EvolutionProperty>; singles: EvolutionProperty[]; overridden: Set<string>;
}
function problem(errors: PbsProblem[], section: Pick<Section, 'file' | 'name'> & { form?: number }, line: number, field: string, message: string): void {
  errors.push({ ...(section.file !== undefined ? { file: section.file } : {}), line, path: `[${section.name}${section.form ? ',' + section.form : ''}]${field ? '.' + field : ''}`, message });
}
/** Keep the old ordinary line gate. Quotes are extended only in the newly owned fields. */
function sectionsFrom(text: string, file: string | undefined, forms: boolean, errors: PbsProblem[]): Section[] {
  const sections: Section[] = []; let current: Section | null = null;
  const localQuote = ['Evolutions','Evolution','Flags','Category','Pokedex','FormName'];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = i + 1;
    if (raw.startsWith('#') || raw.trim() === '') continue;
    const body = raw.split('#', 1)[0]!.trim(), header = /^\[\s*(.*?)\s*\]$/.exec(body);
    if (header) {
      const name = header[1]!, pair = name.split(',').map(value => value.trim());
      current = null;
      const symbol = pair[0]!, form = forms ? int(pair[1], 1, 999) : 0;
      if (!forms && pair.length > 1) { problem(errors, { file, name }, line, '', `"[${name}]" is a form section (species, form): use the explicit formFiles bundle group; not imported`); continue; }
      if (!SYMBOL.test(symbol)) { problem(errors, { file, name }, line, '', `section id "${name}" is not a symbol (letters, digits and underscore, not starting with a digit: WP03 §5.1); not imported`); continue; }
      if (forms && (pair.length !== 2 || form === null)) { problem(errors, { file, name }, line, '', 'form section must be [existing base symbol, form 1..999]'); continue; }
      current = { name: symbol, form: form!, line, file, invalid: false, props: new Map(), singles: [], overridden: new Set() }; sections.push(current); continue;
    }
    if (!current) {
      if (!sections.length && !errors.some(error => error.file === file)) errors.push({ ...(file !== undefined ? { file } : {}), line, path: '$', message: 'missing initial section (a property needs a [SECTION] first)' });
      continue;
    }
    const eq = body.indexOf('=');
    if (eq <= 0) { current.invalid = true; problem(errors, current, line, '', body === '' ? 'invalid property line: an indented comment is not a comment for this reader (WP04 §4.2)' : `invalid property syntax "${body.slice(0,40)}" (expected Key = Value)`); continue; }
    const key = body.slice(0,eq).trim(), value = body.slice(eq + 1).trim();
    if (value.includes('"') && !localQuote.includes(key)) { current.invalid = true; problem(errors,current,line,key,'quoted values are outside this import subset'); continue; }
    if (key === 'Evolution') { current.singles.push({value,line}); continue; }
    if (current.props.has(key)) current.overridden.add(key);
    current.props.set(key,{value,line});
  }
  return sections;
}

interface Conversion { species: SpeciesSource[]; records: PbsRecordReport[]; texts: PbsTextProposal[] }
function convert(sections: Section[], sourceId: string, errors: PbsProblem[], resolveSpecies: (symbol: string) => SpeciesKey | null, bases: Map<string, SpeciesSource>): Conversion {
  const species: SpeciesSource[] = [], records: PbsRecordReport[] = [], texts: PbsTextProposal[] = [];
  for (const section of sections) {
    const s = section, derived = deriveIds(s.name)!;
    const {id} = derived, showdownId = s.showdownId ?? derived.showdownId;
    let ok = !s.invalid;
    const fail = (key: string, message: string, line = s.props.get(key)?.line ?? s.line): void => { ok = false; problem(errors,s,line,key,message); };
    if (!ID.test(id)) { fail('$', `section id "${s.name}" does not give a usable content id ("${id}")`); continue; }
    const base = s.form ? bases.get(s.name) : undefined;
    if (s.form && !base) { fail('$','form needs an existing valid base species in the explicit base file group'); continue; }
    const report: PbsRecordReport = { id, line:s.line, ...(s.file !== undefined ? {file:s.file} : {}), ...(s.form ? {form:s.form} : {}), showdownId, showdown:[], later:[], ignored:[], overridden:[...s.overridden].sort(), defaults:[] };
    for (const key of [...s.props.keys(), ...(s.singles.length ? ['Evolution'] : [])]) {
      if (IMPORTED.includes(key)) continue;
      if (SHOWDOWN.includes(key)) report.showdown.push(key);
      else if (own(LATER,key) !== undefined) report.later.push({field:key,batch:own(LATER,key)!});
      else report.ignored.push(key);
    }
    const value = (key: string): string | undefined => s.props.get(key)?.value;
    const csv = (key: string): string[] => progressionCsv(value(key) ?? '');
    // Every inherited collection is independent of the base and of every sibling form.
    const out: Partial<SpeciesSource> = base ? JSON.parse(JSON.stringify(base)) as SpeciesSource : {};
    Object.assign(out, {id, ...(s.form ? {form:s.form} : {}), showdownId, nameKey: base?.nameKey ?? `species.${id.replace(/-/g,'_')}`, source:sourceId});
    if (s.form) out.pokedexForm = s.form;
    if (!base || value('GrowthRate') !== undefined) {
      const growth = value('GrowthRate') !== undefined ? own(GROWTH,value('GrowthRate')!) : undefined;
      if (!growth) fail('GrowthRate',value('GrowthRate') === undefined ? 'missing: the framework needs a growth rate and the spec records no default for it' : `"${value('GrowthRate')}" is not a growth rate (${Object.keys(GROWTH).join(', ')})`);
      else out.growth = growth;
    }
    if (!base || value('BaseExp') !== undefined) {
      const n = int(value('BaseExp'),1,1000); if (n === null) fail('BaseExp',value('BaseExp') === undefined ? 'missing: the framework needs a base experience and the spec records no default for it' : 'must be an integer from 1 to 1000'); else out.baseExp=n;
    }
    if (!base && value('CatchRate') === undefined) { out.catchRate=255; report.defaults.push('CatchRate = 255 (WP03 §4.3 class default)'); }
    else if (value('CatchRate') !== undefined) { const n=int(value('CatchRate'),0,255); if(n===null)fail('CatchRate','must be an integer from 0 to 255');else out.catchRate=n; }
    if (!base && value('Happiness') === undefined) out.happiness=70;
    else if (value('Happiness') !== undefined) { const n=int(value('Happiness'),0,Number.MAX_SAFE_INTEGER); if(n===null)fail('Happiness','must be a nonnegative safe integer (no creation clamp at 255)');else out.happiness=n; }
    if (!base || value('EVs') !== undefined) {
      const evYield: PartialStats={}, ev=csv('EVs');
      if(value('EVs')===undefined)fail('EVs','missing: the framework needs the EV yield and the spec records no default for it');
      else if(!ev.length||ev.length%2)fail('EVs','must be one or more pairs of STAT,amount (WP03 §5.3 named pairs)');
      else for(let i=0;i<ev.length;i+=2){const stat=own(STAT,ev[i]!),n=int(ev[i+1],1,255); if(!stat||n===null)fail('EVs',`pair ${i/2+1} "${ev[i]},${ev[i+1]}" must be a stat (${Object.keys(STAT).join(', ')}) and a positive amount`);else if(evYield[stat]!==undefined)fail('EVs',`${ev[i]} is named twice`);else evYield[stat]=n;}
      out.evYield=evYield;
    }
    if (!base || value('Moves') !== undefined) {
      const learnset:LearnEntry[]=[],mv=csv('Moves');
      if(!mv.length)fail('Moves','missing: a species needs level-up moves to be created (empty PBS text lacks the required first level/move pair)');
      else if(mv.length%2)fail('Moves','must be pairs of level,MOVE');
      else for(let i=0;i<mv.length;i+=2){const level=int(mv[i],0,100),token=mv[i+1]??'',move=SYMBOL.test(token)?token.toLowerCase().replace(/_/g,''):'';if(level===null||!move)fail('Moves',`pair ${i/2+1} "${mv[i]},${mv[i+1]}" must be a level 0..100 and a move id`);else if(learnset.some(e=>e.level===level&&e.move===move))report.overridden.push(`Moves ${level},${move} (repeated)`);else learnset.push({level,move});}
      if(learnset.length||!base)out.learnset=learnset;
    }
    for(const [pbs,key] of [['TutorMoves','tutorMoves'],['EggMoves','eggMoves'],['Types','types'],['Abilities','abilities'],['HiddenAbilities','hiddenAbilities']] as const){
      if(value(pbs)===undefined)continue;
      const tokens=progressionCsv(value(pbs)!);
      if(!tokens.length||tokens.some(token=>!SYMBOL.test(token))){fail(pbs,'must contain one or more valid symbol references (empty PBS text is not JSON [])');continue;}
      out[key]=tokens.map(token=>token.toLowerCase().replace(/_/g,''));
    }
    if(value('Flags')!==undefined){const flags=progressionCsv(value('Flags')!);if(!flags.length||flags.some(flag=>!flag.length))fail('Flags','empty PBS string positions cannot be represented as a flags string[]');else out.flags=flags;}
    if(value('Evolutions')!==undefined||s.singles.length){const evolution=parsePbsEvolutions({plural:s.props.get('Evolutions'),singles:s.singles,resolveSpecies,fail:(line,field,message)=>fail(field,message,line)});if(evolution.length||!base)out.evolutions=evolution;}
    for(const [pbs,key] of [['Height','heightDm'],['Weight','weightHg']] as const){
      if(value(pbs)===undefined)continue;
      const token=progressionCsv(value(pbs)!)[0];
      if(token===undefined||!/^\d*\.?\d*$/.test(token)||token===''){fail(pbs,'must be unsigned decimal floating text (f), without a sign or exponent');continue;}
      const n=Math.max(1,Math.round(10*(token==='.'?0:Number(token))));
      if(!Number.isSafeInteger(n))fail(pbs,'unsupported-integer-representation: size does not fit integer units');else out[key]=n;
    }
    if(value('PokedexForm')!==undefined){const n=int(progressionCsv(value('PokedexForm')!)[0],0,999);if(n===null)fail('PokedexForm','must be a form from 0 to 999');else out.pokedexForm=n;}
    for(const [pbs,key,allowed] of [['Color','color',COLORS],['Shape','shape',SHAPES]] as const){if(value(pbs)!==undefined){const token=progressionCsv(value(pbs)!)[0];if(!token||!(allowed as readonly string[]).includes(token))fail(pbs,`unknown ${pbs} identity "${token??''}"`);else out[key]=token;}}
    if(value('FormName')!==undefined)out.formName=progressionCsv(value('FormName')!)[0]??'';
    for(const [pbs,key,suffix] of [['Category','categoryKey','category'],['Pokedex','entryKey','entry']] as const){
      if(value(pbs)===undefined)continue;
      const text=pbs==='Pokedex'?value(pbs)!:(progressionCsv(value(pbs)!)[0]??'');
      const textKey=`species.${id.replace(/-/g,'_')}${s.form?`.form${s.form}`:''}.${suffix}`;
      out[key]=textKey;
      texts.push({key:textKey,text,...(s.file!==undefined?{file:s.file}:{}),line:s.props.get(pbs)!.line,field:pbs,source:sourceId});
    }
    records.push(report);
    if(ok){species.push(out as SpeciesSource);if(!s.form)bases.set(s.name,out as SpeciesSource);}
  }
  return {species,records,texts};
}

/** Compatibility text entry: caller owns its existing pre-use source gate; accepted records remain in diagnostics. */
export function importPbsSpecies(text: string, sourceId: string): PbsImport {
  const errors:PbsProblem[]=[], sections=sectionsFrom(text,undefined,false,errors), known=new Map<string,SpeciesKey>(), ids=new Set<string>();
  const unique:Section[]=[];
  for(const s of sections){const identity=deriveIds(s.name)!;if(known.has(s.name)){problem(errors,s,s.line,'',`section "${s.name}" is used twice`);continue;}if(ids.has(identity.id)){problem(errors,s,s.line,'$',`section "${s.name}" gives the content id "${identity.id}" of an earlier section`);continue;}known.set(s.name,{species:identity.id,form:0});ids.add(identity.id);unique.push(s);}
  // This text-only adapter may be importing into an existing JSON catalog: existence is checked by compile.
  const converted=convert(unique,sourceId,errors,symbol=>{const identity=deriveIds(symbol);return known.get(symbol)??(identity?{species:identity.id,form:0}:null);},new Map());
  return {ok:errors.length===0,species:converted.species,records:converted.records,errors,...(converted.texts.length?{texts:converted.texts}:{})};
}

/** Atomic, ordered, source-gated author proposal. A rejected proposal never exposes a usable record prefix. */
export function importPbsBundle(options: PbsBundleOptions): PbsBundleImport {
  const errors:PbsProblem[]=[],empty=():PbsBundleImport=>({ok:false,species:[],records:[],errors,identities:[],texts:[]});
  const gate=!options.sourceId?'sourceId is required':typeof options.sourceProblem!=='function'?'a checked source validator is required':options.sourceProblem(options.sourceId);
  if(gate){errors.push({file:'sources.json',line:0,path:options.sourceId||'$.sourceId',message:gate});return empty();}
  const read=(files:readonly PbsFile[],forms:boolean):Section[]=>{
    const sections:Section[]=[];
    for(const file of files){try{sections.push(...sectionsFrom(file.read(),file.file,forms,errors));}catch(error){errors.push({file:file.file,line:0,path:'$',message:`cannot read input: ${error instanceof Error?error.message:String(error)}`});}}
    return sections;
  };
  const baseSections=read(options.baseFiles,false),formSections=read(options.formFiles??[],true);
  const known=new Map<string,SpeciesKey>(),identities:PbsIdentity[]=[],keys=new Set<string>(),jsonIds=new Map<string,string>(),showdownIds=new Set<string>();
  const register=(s:Section):void=>{
    const derived=deriveIds(s.name)!,symbol=s.form?`${s.name}_${s.form}`:s.name,key=`${derived.id}:${s.form}`;
    if(!ID.test(derived.id)){problem(errors,s,s.line,'$','symbol does not give a usable content id');return;}
    if(s.form&&!known.has(s.name)){problem(errors,s,s.line,'$','form references an unknown original base symbol');return;}
    if(known.has(symbol)||keys.has(key)||!s.form&&jsonIds.has(derived.id)){problem(errors,s,s.line,'$',`duplicate or colliding PBS identity "${symbol}" / ${key}`);return;}
    if(!s.form)jsonIds.set(derived.id,s.name);
    let showdownId=derived.showdownId;
    if(s.form){const mapped=options.resolveFormShowdownId?.(s.name,s.form);if(!mapped||!(/^[a-z0-9]+$/.test(mapped))){problem(errors,s,s.line,'showdownId','an explicit valid Showdown form id mapping is required; it cannot be inferred from the PBS form number');return;}showdownId=mapped;s.showdownId=mapped;}
    if(showdownIds.has(showdownId)){problem(errors,s,s.line,'showdownId',`Showdown identity "${showdownId}" collides with an earlier record`);return;}
    showdownIds.add(showdownId);keys.add(key);known.set(symbol,{species:derived.id,form:s.form});identities.push({symbol,species:derived.id,form:s.form,showdownId});
  };
  for(const s of baseSections)register(s);
  for(const s of formSections)register(s);
  if(errors.length)return empty();
  const bases=new Map<string,SpeciesSource>(),resolve=(symbol:string):SpeciesKey|null=>known.get(symbol)??null;
  const base=convert(baseSections,options.sourceId,errors,resolve,bases),forms=convert(formSections,options.sourceId,errors,resolve,bases);
  if(errors.length)return empty();
  let regionalDex:RegionalDexProposal|undefined;
  if(options.regionalFiles!==undefined){const regional=importPbsRegionalDex({files:options.regionalFiles,sourceId:options.sourceId,sourceProblem:options.sourceProblem,resolveSpecies:symbol=>{const key=resolve(symbol);return key?.form===0?key.species:null;},regionNameKeys:options.regionNameKeys??[]});errors.push(...regional.errors);regionalDex=regional.regionalDex;}
  if(errors.length)return empty();
  return {ok:true,species:[...base.species,...forms.species],records:[...base.records,...forms.records],errors,identities,texts:[...base.texts,...forms.texts],...(regionalDex?{regionalDex}:{})};
}
