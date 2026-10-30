'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs'),{legacyGame}=require('./legacy-test-support.cjs');
const fs=require('node:fs'),path=require('node:path'),read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../../../content/sample',n+'.json'),'utf8'));
const clone=E.state.clone,content=E.contentRuntime.assembleContent(E.contentCompile.compileContent(Object.fromEntries(['manifest','sources','species','overlays','grants'].map(n=>[n,read(n)]))).data,E.dex.createDexLookup()).content,auto={mode:1,naming:1};
const fresh=()=>E.fixtures.savedFor(E.fixtures.makeGame(),content);
const result=id=>({protocol:1,battleId:id,outcome:{kind:'run',winner:null},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}});
function setup(state=E.fakes.createMemoryState(fresh()),ports={},options={}){const p={state,sessions:E.fakes.createFakeSessions({}),content:()=>({content}),random:()=>0,clock:()=>1000,projection:E.fakes.createRecordingProjection(),...ports};p.sessions=E.composition.createLegacyNoHeldSessionFactory(p.sessions);return new E.app.GameApplication(p,options)}
test('J03: pending creation and live battle reject same/different ID manual commits; original session alone installs once',async()=>{
 const state=E.fakes.createMemoryState(fresh());let resume;const app=setup(state,{sessions:{create:()=>new Promise(r=>resume=r)}}),request={battleId:'J03',kind:'wild',foes:[{species:'Pidgey',level:5}],seq:1},before=clone(state.current());
 const opening=app.startBattle(request),template={...clone(before.party[0]),id:'FOREIGN'},raw={...result('J03'),outcome:{kind:'caught',winner:null},captured:[E.state.protocolMember(E.speciesKey.toBattleMember(template,content))]};
 for(const r of [raw,result('other')])assert.throws(()=>app.commitResult(r,{templates:{FOREIGN:template},profile:auto}),/battle-active/);
 assert.deepEqual(state.current(),before);assert.equal(state.replaced.length,0);
 const session={result:()=>result('J03')};resume(session);await opening;
 for(const r of [raw,result('J03'),result('other')])assert.throws(()=>app.commitResult(r,{templates:{FOREIGN:template},profile:auto}),/battle-active/);
 assert.equal(state.replaced.length,0);assert.equal(app.finishBattle(session,request).commit,'applied');assert.equal(state.replaced.length,1);
 assert.equal(app.commitResult(result('J03')),'already-applied');assert.equal(state.replaced.length,1);
 assert.throws(()=>app.commitResult(result('manual')),/source-unknown-or-retired/);assert.equal(state.replaced.length,1,'B requires a preselected direct producer; the manually supplied JSON grants none');
});
for(const invalidate of ['abort','load'])test(`J03: ${invalidate} invalidates pending create; late session cannot commit into new generation`,async()=>{
 const state=E.fakes.createMemoryState(fresh());let resume;const app=setup(state,{sessions:{create:()=>new Promise(r=>resume=r)}}),request={battleId:'late',kind:'wild',foes:[{species:'Pidgey',level:5}],seq:1};
 const opening=app.startBattle(request);if(invalidate==='load')app.stateReplacedByHost();else app.abortBattle(request,Error('abort'));
 const session={result:()=>result('late')};resume(session);await assert.rejects(opening,/aborted/);assert.equal(state.replaced.length,0);assert.equal(app.saveBlocked,false);
});
test('J04: mutable port never exposes nested query aliases, even while battle or held movement owns the operation',async()=>{
 let g=fresh(),writes=0;const m={...clone(g.party[0]),id:'BOX'};E.storage.placeInBox(g.storage,m);const state={read:()=>g,replace:n=>{writes++;g=n}},app=setup(state);const check=()=>{
  const before=clone(g),count=writes;const hits=app.searchStorage({text:'match'},v=>{v.id='BAD';v.nickname='MUTATED';v.hp=0;v.moves[0].pp=0;v.owner.name='BAD';v.markings.push(2);return 'match'});assert.ok(hits.length);hits[0].member.owner.name='RESULT';hits[0].position.slot=20;
  assert.throws(()=>app.searchStorage({text:'x'},v=>{v.moves.length=0;throw Error('callback-failure')}),/callback-failure/);assert.deepEqual(g,before);assert.equal(writes,count);
 };check();const token=app.beginManagement();app.manage(token,'pick',{kind:'pick-up',source:{id:'BOX',position:{kind:'box',box:0,slot:0}}});check();app.manage(token,'cancel',{kind:'cancel-held'});app.endManagement(token);
 const req={battleId:'query',kind:'wild',foes:[{species:'Pidgey',level:5}],seq:1};await app.startBattle(req);check();app.abortBattle(req,Error('done'));
});
for(const schema of [1,2,3,4,5])test(`J05: schema ${schema} preserves registered nature spellings/genders and only old missing fields get defaults`,()=>{
 for(const nature of Object.keys(E.growth.NATURES??{hardy:{},adamant:{}}).flatMap(n=>[n,n[0].toUpperCase()+n.slice(1)]))for(const gender of ['M','F','N']){
  const game=fresh();game.party[0].nature=nature;game.party[0].gender=gender;const raw=schema===5?game:legacyGame(schema<4?E.speciesKey.battleView(game,content):game,schema),before=clone(raw);const out=E.saveSchema.migrateGame(raw,{content,speciesKey:E.speciesKey.speciesKeyResolver(content)});assert.equal(out.ok,true,JSON.stringify(out.error));assert.equal(out.state.party[0].nature,nature);assert.equal(out.state.party[0].gender,gender);assert.deepEqual(raw,before);
 }
 const game=fresh(),raw=schema===5?game:legacyGame(schema<4?E.speciesKey.battleView(game,content):game,schema);delete raw.party[0].nature;delete raw.party[0].gender;const out=E.saveSchema.migrateGame(raw,{content,speciesKey:E.speciesKey.speciesKeyResolver(content)});assert.equal(out.ok,schema<5);if(out.ok){assert.ok(out.state.party[0].nature);assert.ok(['M','F','N'].includes(out.state.party[0].gender));}
});
for(const schema of [4,5])test(`J05: schema ${schema} refuses unknown/prototype values without repairing original; defensive query is safe`,()=>{
 for(const [field,value]of [['nature','constructor'],['nature','__proto__'],['nature','toString'],['nature','not-a-nature'],['nature',''],['gender','alien'],['gender','m'],['gender','']]){
  const game=fresh();game.party[0][field]=value;const raw=schema===5?game:legacyGame(game,4),before=JSON.stringify(raw),out=E.saveSchema.migrateGame(raw,{content,speciesKey:E.speciesKey.speciesKeyResolver(content)});assert.equal(out.ok,false);assert.equal(out.error.code,'invalid');assert.equal(JSON.stringify(raw),before);
  const app=setup({read:()=>game,replace(){throw Error('read-only')}});const v=app.describeIndividual(game.party[0].id);assert.ok(Object.hasOwn(v,'modifiers'));assert.equal(typeof v.modifiers,'object');
 }
});
test('J11: application encounter gate rejects held items before content/RNG; explicit experimental control proceeds',()=>{
 for(const allowed of [false,true]){const g=fresh();g.party[0].item='leftovers';let loads=0,draws=0;const app=setup({read:()=>g,replace(){}},{content:()=>{loads++;return {content}},random:()=>{draws++;return 0}},{capabilities:{allowExperimentalHeldItemBattle:allowed}});const out=app.prepareEncounter({regions:[],slots:[{species:'Pidgey',weight:1,minLevel:5,maxLevel:5}]},0);assert.equal(out.ok,allowed);if(allowed){assert.ok(loads>0);assert.ok(draws>0)}else{assert.equal(out.reason,'held-item-battle-disabled');assert.equal(loads,0);assert.equal(draws,0)}}
});
