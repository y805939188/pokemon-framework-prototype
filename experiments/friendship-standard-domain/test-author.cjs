'use strict';
// User-frozen author-domain contract; synthetic TS inputs, no reference observations.
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {source,inputs,clone,frozen}=require('./helpers.cjs');
const modules=Promise.all([source('content/compile'),source('content/schema'),source('flow/content-runtime'),source('rules/member-factory')]);
const E=require('../../js/engine/build/engine.cjs');
const digest=s=>createHash('sha256').update(s).digest('hex');

test('standard generation entry versions are author2 / compiled3',async()=>{const [,s]=await modules;assert.equal(s.AUTHOR_SCHEMA_VERSION,2);assert.equal(s.SCHEMA_VERSION,2);assert.equal(s.LEGACY_AUTHOR_SCHEMA_VERSION,1);assert.equal(s.COMPILED_SCHEMA_VERSION,3);for(const dir of ['sample','examples/progression'])assert.equal(require('../../content/'+dir+'/manifest.json').schema,2);});

for(const happiness of [0,255,undefined])test('standard base/form/overlay accepts '+String(happiness)+' and creation uses existing default',async()=>{
 const [c,,runtime]=await modules,i=inputs();if(happiness!==undefined)i.species[0].happiness=happiness;
 const base=i.species[0];i.species.push({id:base.id,form:1,showdownId:'charmeleon',source:base.source});
 if(happiness!==undefined)i.overlays=[{target:'species/'+base.id+'/1',set:{happiness},reason:'synthetic form override'}];
 frozen(i);const before=c.canonicalJson(i),r=c.compileContent(i);assert.equal(r.ok,true,JSON.stringify(r.errors));
 assert.equal(c.canonicalJson(i),before);const actual=r.data.species.find(s=>s.id===base.id&&s.form===1);assert.equal(actual.happiness,happiness);
 const assembled=runtime.assembleContent(r.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);
 const normal=E.memberFactory.createMember({id:'NEW-1',species:runtime.resolveSpecies(assembled.content,base.id),level:5,form:0},assembled.content,()=>0);
 assert.equal(normal.friendship,happiness??70);assert.equal(r.warnings.some(w=>/legacy-author-schema/.test(w.message)),false);
});

for(const bad of [256,-1,1.5])for(const location of ['base','form','overlay-base','overlay-form'])test(`standard rejects ${bad} exactly at ${location}`,async()=>{
 const [c]=await modules,i=inputs(),base=i.species[0];let file='species.json',path='[0].happiness';
 i.species.push({id:base.id,form:1,showdownId:'charmeleon',source:base.source});
 if(location==='base')base.happiness=bad;
 else if(location==='form'){i.species.at(-1).happiness=bad;path=`[${i.species.length-1}].happiness`;}
 else {file='overlays.json';path='[0].set.happiness';i.overlays=[{target:'species/'+base.id+(location==='overlay-form'?'/1':''),set:{happiness:bad},reason:'synthetic'}];}
 const before=c.canonicalJson(i),r=c.compileContent(frozen(i));assert.equal(r.ok,false);assert.equal(r.data,undefined);assert.ok(r.errors.some(e=>e.file===file&&e.path===path&&/0 to 255.*schema 2/.test(e.message)),JSON.stringify(r.errors));assert.equal(c.canonicalJson(i),before);
});

test('overlays cannot conceal an invalid base or inherited form input',async()=>{const [c]=await modules,i=inputs(),base=i.species[0];base.happiness=256;i.species.push({id:base.id,form:1,showdownId:'charmeleon',source:base.source});i.overlays=[{target:'species/'+base.id,set:{happiness:255},reason:'does not repair source'}];const r=c.compileContent(i);assert.equal(r.ok,false);assert.ok(r.errors.some(e=>e.file==='species.json'&&e.path==='[0].happiness'));});

for(const schema of [undefined,null,0,3,'1',1.5,-1])test('missing/invalid manifest version has no legacy fallback: '+String(schema),async()=>{const [c]=await modules,i=inputs();if(schema===undefined)delete i.manifest.schema;else i.manifest.schema=schema;assert.ok(c.compileContent(i).errors.some(e=>e.file==='manifest.json'&&e.path==='$.schema'));});

const legacy=[
 {h:undefined,input:'da33efeaeb53e23eec334e34921a434cb0e6949d63c638f6440856f0507c1d38',identity:'e98ae1cfffe7748ab97e6d6ca0e30b04a73d8089b586e989eb53095a366c117b',compiled:'bd5a4b8f505e365eba9c3fce1b0ebca18e0a8db233983ca018248be57573bcc0'},
 {h:256,input:'47845ea77d2bc13727cfd872241b4d78e056a3adbf8d7be3711dd7ff3544757d',identity:'341b39ad484d09a6ad30520081871fbff2a39e33772449b1586251f28e7cd987',compiled:'90832fe2397bdf41d4e43d3ef48402f7084d16c73df248477e04d6205c58877b'},
 {h:257,input:'c756353cbc7d3ca198dcdf29e5555c57b56f46e22e5c2e2c805c4579c9e84147',identity:'304d1d9ccbe413b52712874288354be5afd460ba9efeba168450d5624d528f9e',compiled:'6f7a5a943ddb5b6ae6afbed17f4743aebcc2e8c0e8c361b61ba451591560ef03'},
];
for(const row of legacy)test('explicit legacy1 keeps pre-edit hash/identity/cache bytes '+String(row.h),async()=>{
 const [c,,runtime]=await modules,i=inputs(1);if(row.h!==undefined)i.species[0].happiness=row.h;const before=clone(i),r=c.compileContent(frozen(i));assert.equal(r.ok,true,JSON.stringify(r.errors));assert.deepEqual(i,before);assert.equal(r.data.inputsHash,row.input);assert.equal(r.data.contentIdentity,row.identity);assert.equal(digest(c.canonicalJson(r.data)),row.compiled);assert.ok(r.warnings.some(w=>w.file==='manifest.json'&&w.path==='$.schema'&&/legacy-author-schema/.test(w.message)));
 const cache=JSON.parse(JSON.stringify(r.data));assert.equal(runtime.loadCompiled(cache),cache);const assembled=runtime.assembleContent(cache,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);assert.equal(assembled.content.species.Charizard.happiness,row.h);const m=E.memberFactory.createMember({id:'OLD-1',species:'Charizard',level:5,form:0},assembled.content,()=>0);assert.equal(m.friendship,row.h??70);
});

test('legacy1 base/form inheritance and overlays preserve 256; negatives/fractions are still refused',async()=>{
 const [c]=await modules,i=inputs(1);i.species[0].happiness=256;i.species.push({id:i.species[0].id,form:1,showdownId:'charmeleon',source:i.species[0].source});i.overlays=[{target:'species/'+i.species[1].id,set:{happiness:256},reason:'legacy fixture'}];const r=c.compileContent(i);assert.equal(r.ok,true,JSON.stringify(r.errors));assert.equal(r.data.species.find(s=>s.form===1).happiness,256);assert.equal(r.data.species.find(s=>s.id===i.species[1].id).happiness,256);
 for(const bad of [-1,1.5]){const j=clone(i);j.species[0].happiness=bad;assert.equal(c.compileContent(j).ok,false);}
});

test('current save256 read/validation preserves value and complete original state',()=>{const game=E.fixtures.makeGame();game.party[0].friendship=256;const before=clone(game);assert.deepEqual(E.saveSchema.validateGame(frozen(game)),[]);const loaded=E.saveSchema.migrateGame(game,{content:E.fixtures.content});assert.equal(loaded.ok,true,JSON.stringify(loaded.error));assert.equal(loaded.state.party[0].friendship,256);assert.deepEqual(game,before);assert.deepEqual(loaded.state,before);});
