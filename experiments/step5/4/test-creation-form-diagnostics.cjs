'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process');
const E = require('../../../js/engine/build/engine.cjs');
const root = path.resolve(__dirname, '../../..');
const read = n => JSON.parse(fs.readFileSync(path.join(root,'content/sample',n+'.json'),'utf8'));
function input(id='author-toxel', showdownId='toxel') {
  return {manifest:read('manifest'),sources:read('sources'),species:[{...read('species')[0],id,showdownId,nameKey:'species.author',evolutions:[],learnset:[{level:1,move:'tackle'}]}],overlays:[],grants:[]};
}
function assemble(i, dex=E.dex.createDexLookup()) {
  const c=E.contentCompile.compileContent(i); assert.equal(c.ok,true,JSON.stringify(c.errors));
  const before=structuredClone(c.data), a=E.contentRuntime.assembleContent(c.data,dex);
  assert.deepEqual(a.errors,[]); assert.deepEqual(c.data,before); return {...a,compiled:c.data};
}
for (const name of ['Unown','Burmy','Wormadam','Scatterbug','Spewpa','Vivillon','Pumpkaboo','Gourgeist','Lycanroc','Minior','Toxel','Toxtricity','Sinistea','Polteageist','Alcremie','Urshifu','Charmander']) test(`candidate domain equals actual creation outcomes: ${name}`,()=>{
  const actual=new Set();
  for(const nature of E.memberFactory.NATURE_ORDER) for(const env of [undefined,'rock','sand','cave','grass']) for(const timeOfDay of ['day','dusk','night']) for(let owner=0;owner<18;owner++) for(let roll=0;roll<100;roll++)
    actual.add(E.creationForms.creationForm(name,nature,owner*65536,n=>roll%n,{environment:env,timeOfDay}));
  assert.deepEqual(E.creationForms.creationFormCandidates(name),[...actual].sort((a,b)=>a-b));
});
for(const [name, missing] of [['toxel',[1]],['scatterbug',Array.from({length:17},(_,i)=>i+1)],['spewpa',Array.from({length:17},(_,i)=>i+1)]]) test(`pinned Dex ${name}: useful nonfatal diagnostic and unchanged creation`,()=>{
  const i=input('author-'+name,name), a=assemble(i); assert.equal(a.warnings.length,1); const w=a.warnings[0];
  assert.equal(w.path,`species/author-${name}.creationForms`); assert.match(w.message,/missing-creation-forms/); assert.ok(w.message.includes(missing.join(', '))); assert.match(w.message,/trainer forms are applied after ordinary creation/);
  const calls=[]; const rng=n=>{calls.push(n);return calls.length===2?1:0;};
  const create={id:'NEW',species:a.content.speciesIds['author-'+name],level:5,context:{playerId:65536}};
  assert.throws(()=>E.memberFactory.createMember(create,a.content,rng),/missing creation form/);
  assert.deepEqual(calls,[65536,65536,32,32,32,32,32,32]);
  const explicit=E.memberFactory.createMember({...create,form:0},a.content,()=>0); assert.equal(explicit.form,0);
});
test('author ID is never used as rule family; unknown ordinary species has no warning',()=>{
  assert.deepEqual(assemble(input('toxel','charmander')).warnings,[]);
});
test('complete authored family suppresses warning using exact assembled mappings',()=>{
  const i=input('author-family','fakebase'); i.species.push({...i.species[0],form:1,showdownId:'fakeone'});
  const base=E.dex.createDexLookup(), normal=base.species('toxel');
  const dex={...base,species:id=>({...normal,name:id==='fakebase'?'Author Base':'Author One',baseSpecies:'Toxel'})};
  assert.deepEqual(assemble(i,dex).warnings,[]);
});
test('invalid source stops before Dex and produces no diagnostic from partial data',()=>{
  const c=E.contentCompile.compileContent(input()); assert.equal(c.ok,true); c.data.sources=[];
  const a=E.contentRuntime.assembleContent(c.data,new Proxy({},{get(){throw Error('Dex must stay cold');}}));
  assert.ok(a.errors.length); assert.deepEqual(a.warnings,[]);
});
test('CLI build and inventory expose warnings without rejecting or changing compiled document',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-creation-diagnostic-')); const i=input();
  try {
    for(const [key,value] of Object.entries(i)) fs.writeFileSync(path.join(tmp,key+'.json'),JSON.stringify(value));
    const out=path.join(tmp,'compiled.json'), report=path.join(tmp,'inventory.json');
    const run=cmd=>spawnSync(process.execPath,[path.join(root,'js/engine/build/content-cli.cjs'),cmd,'--src='+tmp,'--out='+out,'--report='+report],{cwd:root,encoding:'utf8'});
    const b=run('build');assert.equal(b.status,0,b.stderr);assert.match(b.stderr,/WARNING assembly species\/author-toxel.creationForms: missing-creation-forms/);
    assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),E.contentCompile.compileContent(i).data);
    const inv=run('inventory');assert.equal(inv.status,0,inv.stderr);assert.match(inv.stderr,/missing-creation-forms/);
    assert.equal(JSON.parse(fs.readFileSync(report,'utf8')).creationWarnings.length,1);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
