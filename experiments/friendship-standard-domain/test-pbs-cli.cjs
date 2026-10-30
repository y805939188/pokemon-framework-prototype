'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {ROOT,source,inputs,workspace}=require('./helpers.cjs');
const pbs=source('content/pbs-import');
const required='GrowthRate=Medium\nBaseExp=51\nEVs=SPEED,1\nMoves=1,TACKLE';
const base=(token='',name='RATTATA')=>`[${name}]\n${required}\n${token===''?'':'Happiness='+token}\n`;
const file=(file,text)=>({file,read:()=>text});
const options=extra=>({sourceId:'author-placeholder',sourceProblem:()=>null,baseFiles:[file('pokemon.txt',base())],...extra});

test('PBS default and explicit2 accept 0/255/omitted; text and bundle forms share declared version',async()=>{
 const p=await pbs;
 for(const token of ['0','255',''])for(const version of [undefined,2]){
  const text=p.importPbsSpecies(base(token),'author-placeholder',version);assert.equal(text.ok,true,JSON.stringify(text.errors));assert.equal(text.species[0].happiness,token===''?70:Number(token));assert.deepEqual(text.warnings,[]);
  const bundle=p.importPbsBundle(options({...(version===undefined?{}:{authorSchema:version}),baseFiles:[file('pokemon.txt',base(token))],formFiles:[file('forms.txt','[RATTATA,1]')],resolveFormShowdownId:()=> 'rattataalola'}));assert.equal(bundle.ok,true,JSON.stringify(bundle.errors));assert.equal(bundle.species[1].happiness,token===''?70:Number(token));
 }
});
for(const token of ['256','-1','1.5'])test('PBS standard located rejection and no bundle prefix '+token,async()=>{
 const p=await pbs;for(const authorSchema of [undefined,2]){
  const text=p.importPbsSpecies(base(token),'author-placeholder',authorSchema);assert.equal(text.ok,false);assert.deepEqual(text.species,[]);assert.ok(text.errors.some(e=>e.line===6&&e.path==='[RATTATA].Happiness'&&/0 to 255/.test(e.message)));
  for(const isForm of [false,true]){const r=p.importPbsBundle(options({authorSchema,baseFiles:[file('base.txt',base(isForm?'':token)+base('0','PIDGEY'))],formFiles:isForm?[file('forms.txt',`[RATTATA,1]\nHappiness=${token}`)]:[],resolveFormShowdownId:()=> 'rattataalola'}));assert.equal(r.ok,false);assert.deepEqual(r.species,[]);assert.deepEqual(r.identities,[]);assert.deepEqual(r.texts,[]);assert.ok(r.errors.some(e=>e.file===(isForm?'forms.txt':'base.txt')&&e.path===(isForm?'[RATTATA,1].Happiness':'[RATTATA].Happiness')&&e.line===(isForm?2:6)));}
 }
});

test('PBS explicit1 retains256 and inheritance with visible diagnostic; negative/fraction never accepted',async()=>{
 const p=await pbs;const text=p.importPbsSpecies(base('256'),'author-placeholder',1);assert.equal(text.ok,true);assert.equal(text.species[0].happiness,256);assert.ok(text.warnings.some(w=>/legacy-author-schema/.test(w.message)));
 const r=p.importPbsBundle(options({authorSchema:1,baseFiles:[file('base',base('256'))],formFiles:[file('forms','[RATTATA,1]')],resolveFormShowdownId:()=> 'rattataalola'}));assert.equal(r.ok,true);assert.deepEqual(r.species.map(s=>s.happiness),[256,256]);assert.ok(r.warnings.some(w=>/legacy-author-schema/.test(w.message)));
 for(const token of ['-1','1.5'])assert.equal(p.importPbsSpecies(base(token),'author-placeholder',1).ok,false);
});

test('PBS source gate still precedes author schema validation, every read and adapter; invalid version cannot fallback',async()=>{
 const p=await pbs;let calls=[];
 const extra={authorSchema:3,sourceProblem:()=>{calls.push('gate');return 'denied';},baseFiles:[{file:'never',read(){calls.push('read');return base('256');}}],formFiles:[file('forms','[RATTATA,1]')],resolveFormShowdownId:()=>{calls.push('adapter');return 'rattataalola';}};
 const denied=p.importPbsBundle(options(extra));assert.equal(denied.ok,false);assert.deepEqual(calls,['gate']);assert.equal(denied.errors[0].file,'sources.json');calls=[];
 const invalid=p.importPbsBundle(options({...extra,sourceProblem:()=>{calls.push('gate');return null;}}));assert.equal(invalid.ok,false);assert.deepEqual(calls,['gate']);assert.equal(invalid.errors[0].file,'manifest.json');
 for(const authorSchema of [null,0,3,'1']){const r=p.importPbsSpecies(base('256'),'author-placeholder',authorSchema);assert.equal(r.ok,false);assert.deepEqual(r.species,[]);assert.equal(r.errors[0].file,'manifest.json');}
});

function cliWorkspace(schema){const dir=workspace(),src=path.join(dir,'src'),i=inputs(schema);fs.mkdirSync(src);for(const [key,file] of [['manifest','manifest.json'],['sources','sources.json'],['species','species.json'],['overlays','overlays.json'],['grants','grants.json']])fs.writeFileSync(path.join(src,file),JSON.stringify(i[key]));return {dir,src,i};}
function cli(x,cmd,extra=[]){return spawnSync(process.execPath,[path.join(ROOT,'js/engine/build/content-cli.cjs'),cmd,`--src=${x.src}`,...extra],{cwd:ROOT,encoding:'utf8',timeout:20000});}

test('CLI build/check/inventory emit schema1 diagnostic and preserve 256; schema2 rejects at source',()=>{
 for(const schema of [1,2]){const x=cliWorkspace(schema);x.i.species[0].happiness=256;fs.writeFileSync(path.join(x.src,'species.json'),JSON.stringify(x.i.species));const out=path.join(x.dir,'content.json');const r=cli(x,'build',[`--out=${out}`]);assert.equal(r.status,schema===1?0:1,r.stderr);if(schema===1){assert.match(r.stderr,/WARNING manifest.json \$\.schema: legacy-author-schema/);assert.equal(JSON.parse(fs.readFileSync(out)).species.find(s=>s.id==='charizard').happiness,256);const checked=cli(x,'check',[`--out=${out}`]);assert.equal(checked.status,0,checked.stderr);assert.match(checked.stderr,/legacy-author-schema/);const inv=cli(x,'inventory',[`--report=${path.join(x.dir,'inventory.json')}`]);assert.equal(inv.status,0,inv.stderr);assert.match(inv.stderr,/legacy-author-schema/);}else{assert.match(r.stderr,/species.json \[0\].happiness: must be an integer from 0 to 255/);assert.equal(fs.existsSync(out),false);}}
});

test('CLI import uses owning manifest1/2, base/form field locations and atomic proposal',()=>{
 for(const schema of [1,2])for(const isForm of [false,true]){const x=cliWorkspace(schema),pbsFile=path.join(x.dir,'pokemon.txt'),forms=path.join(x.dir,'forms.txt'),report=path.join(x.dir,'report.json');fs.writeFileSync(pbsFile,base(isForm?'':'256'));fs.writeFileSync(forms,'[RATTATA,1]\nHappiness=256');
 const r=cli(x,'import-pbs',[`--base-file=${pbsFile}`,...(isForm?[`--form-file=${forms}`,'--form-id=RATTATA,1:rattataalola']:[]),'--source=author-placeholder',`--report=${report}`]);assert.equal(r.status,schema===1?0:1,r.stderr);const doc=JSON.parse(fs.readFileSync(report));assert.equal(doc.authorSchema,schema);assert.equal(doc.ok,schema===1);if(schema===1){assert.match(r.stderr,/legacy-author-schema/);assert.ok(doc.warnings.some(w=>/legacy-author-schema/.test(w.message)));assert.equal(doc.species[isForm?1:0].happiness,256);}else{assert.deepEqual(doc.species,[]);assert.deepEqual(doc.identities,[]);assert.deepEqual(doc.texts,[]);assert.match(r.stderr,isForm?/forms.txt:2 \[RATTATA,1\].Happiness/:/pokemon.txt:6 \[RATTATA\].Happiness/);}}
});

test('CLI denied source and missing/invalid manifest read no PBS and do not overwrite report',()=>{
 for(const [schema,sourceId,match] of [[2,'absent',/sources.json/],[undefined,'author-placeholder',/manifest.json \$\.schema/],[3,'author-placeholder',/manifest.json \$\.schema/]]){const x=cliWorkspace(2);if(schema===undefined)delete x.i.manifest.schema;else x.i.manifest.schema=schema;fs.writeFileSync(path.join(x.src,'manifest.json'),JSON.stringify(x.i.manifest));const report=path.join(x.dir,'report.json');fs.writeFileSync(report,'ORIGINAL');const r=cli(x,'import-pbs',[`--base-file=${path.join(x.dir,'NONEXISTENT')}`,`--source=${sourceId}`,`--report=${report}`]);assert.equal(r.status,1);assert.match(r.stderr,match);assert.doesNotMatch(r.stderr,/ENOENT|cannot read input/);assert.equal(fs.readFileSync(report,'utf8'),'ORIGINAL');}
});
