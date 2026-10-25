/**
 * Content tooling entry (built to js/engine/build/content-cli.cjs): `build`, `check`, `check-item-pockets`, `inventory`, `import-pbs`.
 *   build      compile content/<src> into data/framework/content.json (a failed build REMOVES the old output, so a
 *              stale artifact can never hide broken or missing inputs)
 *   check      the compiled file exists and is the build of exactly the current inputs
 *   check-item-pockets --previous-items=<published-items.json> is an optional read-only warning; no save is loaded or changed.
 *   inventory  compare the sample with the pinned Showdown data and write a machine-readable report
 *   import-pbs read an author-provided PBS species file (content/pbs-import.ts subset) into species records plus a
 *              report of every field not carried over; refused unless the named source of the content has a recorded
 *              pre-use check that allows its use (DETAILED-PLAN §280, D5-2). Writes the report file only: the author
 *              merges the records into species.json.
 * Paths are resolved from the project root, not from the working directory.
 */
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, checkFresh, checkSources, compileContent, preUseProblem } from "../content/compile.ts";
import { importPbsItems } from "../content/pbs-items.ts";
import { checkItemInputs } from "../content/item-input.ts";
import { importPbsBundle, importPbsSpecies } from "../content/pbs-import.ts";
import { importPbsRegionalDex } from "../content/pbs-regional-dex.ts";
import type { PbsFile } from "../content/pbs-regional-dex.ts";
import type { CompiledContent, ContentError, ContentInputs } from "../content/schema.ts";
import { createDexLookup } from "../battle/dex.ts";
import { CONTENT_SHOWDOWN_SHA } from "../content/showdown-pin.ts";
import { loadCompiled, assembleContent } from "../flow/content-runtime.ts";

const ROOT = path.resolve(__dirname, "..", "..", ".."); // js/engine/build -> project root
const arg = (name: string, dflt: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return path.resolve(ROOT, hit ? hit.slice(name.length + 3) : dflt);
};

function readInputs(dir: string): { inputs: ContentInputs; errors: ContentError[] } {
  const errors: ContentError[] = [];
  const read = (file: ContentError["file"]): unknown => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); }
    catch (e) { errors.push({ file, path: "$", message: `cannot read as JSON: ${(e as Error).message}` }); return undefined; }
  };
  // grants.json (step 4) and settings.json (step 5.0) are optional; every other file is required
  const grants = fs.existsSync(path.join(dir, "grants.json")) ? read("grants.json") : undefined;
  const settings = fs.existsSync(path.join(dir, "settings.json")) ? read("settings.json") : undefined;
  const items = fs.existsSync(path.join(dir, "items.json")) ? read("items.json") : undefined;
  const shops = fs.existsSync(path.join(dir, "shops.json")) ? read("shops.json") : undefined;
  const regionalDex = fs.existsSync(path.join(dir, "regional-dex.json")) ? read("regional-dex.json") : undefined;
  const mapMetadata = fs.existsSync(path.join(dir, "map-metadata.json")) ? read("map-metadata.json") : undefined;
  const inputs = { ...(regionalDex !== undefined ? {regionalDex} : {}), ...(mapMetadata !== undefined ? {mapMetadata} : {}), ...(items !== undefined ? {items} : {}), ...(shops !== undefined ? {shops} : {}), manifest: read("manifest.json"), sources: read("sources.json"), species: read("species.json"), overlays: read("overlays.json"), ...(grants !== undefined ? { grants } : {}), ...(settings !== undefined ? { settings } : {}) };
  return { inputs, errors };
}

function buildPin(): string {
  const sha = /^SHOWDOWN_SHA="([a-f0-9]{40})"$/m.exec(fs.readFileSync(path.join(ROOT,"scripts/showdown.env"),"utf8"))?.[1];
  if (sha !== CONTENT_SHOWDOWN_SHA) throw new Error("compiler Showdown pin differs from scripts/showdown.env");
  return sha;
}
const show = (errors: ContentError[]): void => { for (const e of errors) console.error(`${e.file} ${e.path}: ${e.message}`); };

export function build(src: string, out: string): number {
  const fail = (errors: ContentError[]): number => {
    show(errors);
    try { fs.unlinkSync(out); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`content build FAILED (${errors.length} problem(s)); cannot remove the previous compiled output ${out}: ${(e as Error).message}`);
        return 1;
      }
    }
    console.error(`content build FAILED (${errors.length} problem(s)); no previous compiled output remains`);
    return 1;
  };
  // Input, compiler, serialization and output failures all invalidate the previous artifact.
  try {
    const { inputs, errors } = readInputs(src);
    const r = errors.length ? { ok: false as const, errors } : compileContent(inputs, {}, {showdownSha:buildPin()});
    if (!r.ok) return fail(r.errors);
    const assembled = assembleContent(r.data, createDexLookup());
    if (assembled.errors.length) return fail(assembled.errors);
    for (const warning of r.warnings) console.warn(`WARNING ${warning.file} ${warning.path}: ${warning.message}`);
    const text = canonicalJson(r.data, 2) + "\n";
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== text) fs.writeFileSync(out, text);
    console.log(`content built: ${r.data.species.length} species, ${r.data.grants?.length ?? 0} grants, inputs ${r.data.inputsHash.slice(0, 12)} -> ${path.relative(ROOT, out)}`);
    return 0;
  } catch (e) {
    return fail([{ file: "compiled", path: "$", message: `content build failed: ${(e as Error).message}` }]);
  }
}

export function check(src: string, out: string): number {
  const { inputs, errors } = readInputs(src);
  if (errors.length) { show(errors); return 1; }
  let compiled: unknown;
  try { compiled = JSON.parse(fs.readFileSync(out, "utf8")); } catch { compiled = undefined; }
  const stale = checkFresh(compiled, inputs);
  if (stale) { show([stale]); return 1; }
  try { const cache=loadCompiled(compiled); if(cache.showdownSha!==buildPin()) throw new Error("needs-rebuild: pinned Showdown changed"); } catch(error) {console.error((error as Error).message);return 1;}
  console.log("compiled content is current");
  return 0;
}

type Cmp = "consistent" | "differs" | "framework-only";
export function inventory(src: string, report: string): number {
  const { inputs, errors } = readInputs(src);
  const r = errors.length ? { ok: false as const, errors } : compileContent(inputs, {}, {showdownSha:buildPin()});
  if (!r.ok) { show(r.errors); return 1; }
  const dex = createDexLookup();
  const assembled = assembleContent(r.data as CompiledContent, dex);
  if (assembled.errors.length) { show(assembled.errors); return 1; }
  const tally: Record<Cmp, number> = { consistent: 0, differs: 0, "framework-only": 0 };
  const rows = r.data.species.map((sp) => {
    const sd = dex.levelUpMoves(sp.showdownId) ?? {};
    const learns = sp.learnset.map((e) => {
      const theirs = sd[e.move];
      const c: Cmp = !theirs ? "framework-only" : theirs.includes(e.level) ? "consistent" : "differs";
      tally[c]++;
      return { level: e.level, move: e.move, comparison: c, showdownGen8Levels: theirs ?? [] };
    });
    return {
      id: sp.id, showdownId: sp.showdownId, battleMapping: "found" as const,
      baseStats: "showdown-only (read at run time; not stored in framework content)",
      frameworkOnlyFields: ["growth", "baseExp", "evYield", "catchRate"],
      learnset: { authored: sp.learnset.length, showdownGen8LevelUpMoves: Object.keys(sd).length, entries: learns },
    };
  });
  const doc = {
    schema: 1, contentId: r.data.contentId, inputsHash: r.data.inputsHash, showdownSha: rows.length ? dex.sha() : null,
    note: "Field-level inventory only. Equal data is not equal behaviour. Framework-only fields have no Showdown counterpart to compare; the sample learnsets are synthetic placeholders, so 'differs' and 'framework-only' are expected there.",
    summary: { species: rows.length, learnComparisons: tally },
    species: rows,
  };
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, canonicalJson(doc, 2) + "\n");
  console.log(`inventory: ${rows.length} species, learn entries ${JSON.stringify(tally)} -> ${path.relative(ROOT, report)}`);
  return 0;
}

/** Optional read-only compatibility warning; never loads, rewrites or migrates player saves. */
export function checkItemPockets(src:string,previousFile:string):number {
  const {inputs,errors}=readInputs(src);
  const compiled=errors.length?{ok:false as const,errors}:compileContent(inputs, {}, {showdownSha:buildPin()});
  if(!compiled.ok){show(compiled.errors);return 1;}
  let previous:unknown;
  try{previous=JSON.parse(fs.readFileSync(previousFile,"utf8"));}catch(error){console.error(`previous items: cannot read JSON: ${(error as Error).message}`);return 1;}
  if(!Array.isArray(previous)){console.error("previous items: supply an explicit published items.json array; historical fallback pockets cannot be inferred");return 1;}
  // This is old metadata, not an import into current gameplay. Current inputs still pass the full source gate above.
  const old=checkItemInputs(previous,undefined,()=>null),current=checkItemInputs(compiled.data.items,undefined,()=>null);
  if(old.errors.length){for(const e of old.errors)console.error(`previous items ${e.path}: ${e.message}`);return 1;}
  const warnings:{code:string;itemId:string;previousPocket:number;currentPocket:number;path:string;message:string}[]=[];
  for(const item of old.items){
    const now=Object.hasOwn(current.catalog,item.id)?current.catalog[item.id]:undefined;
    if(now&&now.pocket!==item.pocket){const message="Existing save rows keep their old pocket; current consumption reads only the current default pocket. Keep published item pockets stable pending an explicitly approved compatibility policy. No save was changed.";warnings.push({code:'item-pocket-changed',itemId:item.id,previousPocket:item.pocket,currentPocket:now.pocket,path:`items.json id=${item.id}.pocket`,message});console.error(`WARNING item-pocket-changed ${item.id}: ${item.pocket} -> ${now.pocket}. ${message}`);}
  }
  console.log(JSON.stringify({kind:'item-pocket-compatibility',currentInputsHash:compiled.data.inputsHash,warnings,saveModified:false,note:"Read-only comparison of IDs present in both catalogs. No save inspection, rejection, relocation, sorting, truncation or migration. An explicit previous catalog is required; no warning does not prove save compatibility."},null,2));
  return 0;
}

export function importPbs(src: string, file: string, sourceId: string, report: string, itemMode = false): number {
  const { inputs, errors } = readInputs(src);
  if (errors.length) { show(errors); return 1; }
  // the same registry validation and pre-use gate as the compiler, BEFORE the data is read (DETAILED-PLAN §280, D5-2)
  const problems: ContentError[] = [];
  const sources = checkSources(inputs.sources, (file, p, message) => { problems.push({ file, path: p, message }); });
  if (problems.length) { show(problems); console.error("sources.json has problems: nothing was imported"); return 1; }
  const gate = preUseProblem(sources, sourceId);
  if (gate) { console.error(`sources.json ${sourceId}: ${gate}; nothing was imported`); return 1; }
  let text: string;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { console.error(`cannot read ${file}: ${(e as Error).message}`); return 1; }
  if (itemMode) {
    const r = importPbsItems(text, sourceId), checked = checkItemInputs(r.items, undefined, id => preUseProblem(sources,id));
    const ok = r.ok && checked.errors.length === 0;
    fs.mkdirSync(path.dirname(report), {recursive:true});
    fs.writeFileSync(report, canonicalJson({schema:1,source:sourceId,...r,ok,items:checked.items,contentErrors:checked.errors},2)+'\n');
    return ok ? 0 : 1;
  }
  const r = importPbsSpecies(text, sourceId);
  for (const e of r.errors) console.error(`${path.basename(file)}:${e.line} ${e.path}: ${e.message}`);
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, canonicalJson({ schema: 1, file: path.basename(file), source: sourceId, ok: r.ok, species: r.species, records: r.records, errors: r.errors }, 2) + "\n");
  console.log(`import-pbs: ${r.species.length} species record(s), ${r.errors.length} problem(s) -> ${path.relative(ROOT, report)}`);
  return r.ok ? 0 : 1;
}

/** Ordered author groups and finite identity/name adapters. Every PBS reader remains behind the source gate. */
export function importPbsFiles(src: string, sourceId: string, report: string, regionalOnly = false, argv: readonly string[] = process.argv): number {
  const {inputs,errors}=readInputs(src);
  if(errors.length){show(errors);return 1;}
  const problems: ContentError[]=[];
  const sources=checkSources(inputs.sources,(file,path,message)=>problems.push({file,path,message}));
  const gate=preUseProblem(sources,sourceId);
  if(gate)problems.push({file:"sources.json",path:sourceId,message:gate});
  if(problems.length){show(problems);return 1;}
  const values=(name:string):string[]=>argv.filter(value=>value.startsWith(`--${name}=`)).map(value=>value.slice(name.length+3));
  const files=(names:readonly string[]):PbsFile[]=>names.map(name=>({file:name,read:()=>fs.readFileSync(path.resolve(ROOT,name),"utf8")}));
  const regionNameKeys=values("region-name").map(value=>{const at=value.indexOf(":");return {id:/^[0-9]+$/.test(value.slice(0,at))?Number(value.slice(0,at)):NaN,nameKey:at<0?"":value.slice(at+1)};});
  const formIds=new Map<string,string>();
  for(const raw of values("form-id")) {
    const hit=/^([A-Za-z_][A-Za-z0-9_]*),([0-9]+):([a-z0-9]{1,40})$/.exec(raw);
    const form=hit?Number(hit[2]):NaN,identity=hit?`${hit[1]},${form}`:raw;
    if(!hit||!Number.isSafeInteger(form)||form<1||form>999||formIds.has(identity)){problems.push({file:"species.json",path:`--form-id=${raw}`,message:"invalid or duplicate form identity; expected SYMBOL,1..999:showdownid"});continue;}
    formIds.set(identity,hit[3]!);
  }
  const write=(value:unknown):void=>{fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,canonicalJson(value,2)+"\n");};
  if(problems.length){show(problems);write({schema:1,source:sourceId,ok:false,species:[],errors:problems});return 1;}
  const explicitBases=values("base-file"),plainFiles=values("file");
  const baseFiles=files(explicitBases.length?explicitBases:regionalOnly?[]:plainFiles.length?plainFiles:["pokemon.txt"]);
  const formFiles=files(values("form-file"));
  const regionalFiles=files(regionalOnly?(plainFiles.length?plainFiles:["regional_dexes.txt"]):values("regional-file"));
  const sourceProblem=(id:string):string|null=>preUseProblem(sources,id);
  const bundle=importPbsBundle({sourceId,sourceProblem,baseFiles,formFiles,...(!regionalOnly?{regionalFiles,regionNameKeys}:{}),resolveFormShowdownId:(symbol,form)=>formIds.get(`${symbol},${form}`)??null});
  if(!regionalOnly){
    const checked=bundle.ok?compileContent({manifest:inputs.manifest,sources:inputs.sources,species:bundle.species,overlays:[],...(inputs.items!==undefined?{items:inputs.items}:{}),...(bundle.regionalDex!==undefined?{regionalDex:bundle.regionalDex}:{})}, {}, {showdownSha:buildPin()}):null;
    const ok=bundle.ok&&checked?.ok===true;
    if(!bundle.ok)for(const error of bundle.errors)console.error(`${error.file??"PBS"}:${error.line} ${error.path}: ${error.message}`);
    if(checked&&!checked.ok)show(checked.errors);
    write({schema:1,source:sourceId,...bundle,ok,...(!ok?{species:[],regionalDex:undefined}:{}),contentErrors:checked&&!checked.ok?checked.errors:[]});
    return ok?0:1;
  }
  if(!bundle.ok){write({schema:1,source:sourceId,ok:false,errors:bundle.errors});return 1;}
  // Bind original PBS symbols to identities already present in the normal authored catalog.
  const current=compileContent(inputs,{}, {showdownSha:buildPin()});
  if(!current.ok){show(current.errors);write({schema:1,source:sourceId,ok:false,errors:current.errors});return 1;}
  const baseIds=new Set(current.data.registrationOrder!.filter(key=>!key.form).map(key=>key.species));
  const identities=new Map(bundle.identities.filter(key=>!key.form&&baseIds.has(key.species)).map(key=>[key.symbol,key.species]));
  const regional=importPbsRegionalDex({files:regionalFiles,sourceId,sourceProblem,regionNameKeys,resolveSpecies:symbol=>identities.get(symbol)??null});
  if(!regional.ok)for(const error of regional.errors)console.error(`${error.file??"PBS"}:${error.line} ${error.path}: ${error.message}`);
  write({schema:1,source:sourceId,...regional});
  return regional.ok?0:1;
}

const cmd = process.argv[2];
const SRC = arg("src", "content/sample");
if (cmd === "build") process.exit(build(SRC, arg("out", "data/framework/content.json")));
else if (cmd === "check") process.exit(check(SRC, arg("out", "data/framework/content.json")));
else if (cmd === "check-item-pockets") {
  const previous=process.argv.find(a=>a.startsWith("--previous-items="))?.slice(17);
  if(!previous){console.error("usage: check-item-pockets --previous-items=<published-items.json> [--src=content/sample]");process.exit(2);}
  process.exit(checkItemPockets(SRC,path.resolve(ROOT,previous)));
}
else if (cmd === "inventory") process.exit(inventory(SRC, arg("report", "docs/step3/content-inventory.json")));
else if (cmd === "import-pbs" || cmd === "import-pbs-regional") {
  const source=process.argv.find(value=>value.startsWith("--source="))?.slice(9)??"";
  process.exit(importPbsFiles(SRC,source,arg("report","build/pbs-import.json"),cmd==="import-pbs-regional"));
}
else if (cmd === "import-pbs-items") {
  const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9) ?? "";
  process.exit(importPbs(SRC, arg("file", "pokemon.txt"), source, arg("report", "build/pbs-import.json"), cmd === "import-pbs-items"));
}
else { console.error("usage: content-cli.cjs build|check|check-item-pockets|inventory|import-pbs|import-pbs-regional [--src=content/sample] [--out=...] [--report=...] [--file=... --source=<id>] [--base-file=pokemon.txt (repeat; required for nonempty regional symbols)] [--form-file=pokemon_forms.txt --form-id=SYMBOL,N:showdownid] [--regional-file=regional_dexes.txt --region-name=0:region.kanto (repeat)]"); process.exit(2); }
