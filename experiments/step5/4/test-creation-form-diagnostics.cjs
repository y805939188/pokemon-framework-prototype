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
for(const [name, count] of [['toxel',2],['scatterbug',18],['spewpa',18]]) test(`pinned Dex ${name}: latent creation identity survives persistence and capture`,()=>{
  const id='author-'+name, a=assemble(input(id,name)); assert.deepEqual(a.warnings,[]);
  const calls=[]; const rng=n=>{calls.push(n);return calls.length===2?1:0;};
  const create={id:'NEW',species:a.content.speciesIds[id],level:5,context:{playerId:65536}};
  const automatic=E.memberFactory.createMember(create,a.content,rng);
  assert.equal(automatic.form,1); assert.deepEqual(calls,[65536,65536,32,32,32,32,32,32]);
  for(let form=0;form<count;form++){
    const member=E.memberFactory.createMember({...create,form},a.content,()=>0);
    const saved=E.speciesKey.toPersistentMember(member,a.content);
    assert.equal(saved.species,id); assert.equal(saved.form,form);
    const battle=E.speciesKey.toBattleMember(saved,a.content);
    assert.equal(battle.species,member.species); assert.equal(battle.form,undefined);
    const captured=E.state.capturedTemplates({captured:[{...battle,hp:1}]},{NEW:saved},E.speciesKey.speciesKeyResolver(a.content),a.content);
    assert.equal(captured[0].form,form); assert.equal(captured[0].hp,1);
    assert.equal(E.speciesKey.toBattleMember(captured[0],a.content).species,member.species);
  }
  assert.throws(()=>E.memberFactory.createMember({...create,form:count},a.content,()=>0),/missing creation form/);
  const wrong=E.speciesKey.toPersistentMember(automatic,a.content);wrong.form=count;
  assert.throws(()=>E.state.capturedTemplates({captured:[{...automatic}]},{NEW:wrong},E.speciesKey.speciesKeyResolver(a.content),a.content),/no matching persistent key/);
});
for(const [name,form] of [['toxel',1],['scatterbug',17],['spewpa',17]]) test(`author grants and explicit trainer forms: ${name}`,()=>{
  const id='author-'+name,i=input(id,name);
  i.grants=[{id:'gift',members:[{species:id,level:5,form}],items:{},money:0,source:'author-placeholder'}];
  i.trainerTypes=read('trainer-types'); i.trainers=[{...read('trainers')[0],party:[{species:id,level:5,form},{species:id,level:5,form:0}]}];
  const a=assemble(i); E.contentRuntime.loadCompiled(a.compiled);
  const state=E.state.newGame({party:[],content:a.content}), grant=E.grants.applyGrant(state,'gift',a.content,()=>0);
  assert.equal(grant.state.party[0].form,form);assert.ok(grant.state.dex.owned.includes(id));
  assert.deepEqual(E.saveSchema.validateGameContent(JSON.parse(JSON.stringify(grant.state)),a.content),[]);
  for(const source of ['receive','party-gift','party-silent'])assert.equal(E.acquisitionDex.planAcquisitionDex(state.dex,grant.state.party,a.content,{source,seeForm:true,showMessages:false}).status,'ready');
  const record=Object.values(Object.values(a.content.trainers)[0])[0],type=Object.values(a.content.trainerTypes)[0],calls=[];
  const team=E.trainerTeam.buildTrainerTeam({content:a.content,record,type,registrationOrder:a.content.registrationOrder,trainerTypeOrder:a.content.trainerTypeOrder,
    owner:{id:65536,name:'NPC',gender:0,language:2},receivedAt:0,allocateId:n=>'T'+n,random:n=>{calls.push(n);return calls.length%8===2?1:0;}});
  assert.deepEqual(team.map(m=>m.form),[form,0]);assert.deepEqual(calls,Array(2).fill([65536,65536,32,32,32,32,32,32]).flat());
  assert.deepEqual(team.map(m=>E.speciesKey.toPersistentMember(m,a.content).form),[form,0]);
  const memory=E.fakes.createMemoryState(state), app=new E.app.GameApplication({state:memory,content:()=>({content:a.content,dex:E.dex.createDexLookup()}),sessions:E.fakes.createFakeSessions({}),projection:E.fakes.createRecordingProjection(),random:()=>0,clock:()=>1000},{receivingProfile:{mode:1,naming:1}});
  for(const kind of ['normal','silent','party','party-silent','foreign']){
    const result=app.receiveGift({kind,seeForm:true,member:{species:id,level:5,form},...(kind==='foreign'?{owner:{id:8,name:'Other',gender:0,language:2}}:{})});
    assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(memory.current().party.at(-1).form,form);
  }
  assert.equal(memory.replaced.length,5);
  i.trainers[0].party[0].form=99;assert.equal(E.contentCompile.compileContent(i).ok,false);
});
test('mechanically distinct missing forms still warn and refuse',()=>{
  const a=assemble(input('author-wormadam','wormadam'));
  assert.equal(a.warnings.length,1);
  assert.throws(()=>E.memberFactory.createMember({id:'W',species:'Wormadam',level:5,context:{environment:'cave'}},a.content,()=>0),/missing creation form/);
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
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-creation-diagnostic-')); const i=input('author-wormadam','wormadam');
  try {
    for(const [key,value] of Object.entries(i)) fs.writeFileSync(path.join(tmp,key+'.json'),JSON.stringify(value));
    const out=path.join(tmp,'compiled.json'), report=path.join(tmp,'inventory.json');
    const run=cmd=>spawnSync(process.execPath,[path.join(root,'js/engine/build/content-cli.cjs'),cmd,'--src='+tmp,'--out='+out,'--report='+report],{cwd:root,encoding:'utf8'});
    const b=run('build');assert.equal(b.status,0,b.stderr);assert.match(b.stderr,/WARNING assembly species\/author-wormadam.creationForms: missing-creation-forms/);
    assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),E.contentCompile.compileContent(i).data);
    const inv=run('inventory');assert.equal(inv.status,0,inv.stderr);assert.match(inv.stderr,/missing-creation-forms/);
    assert.equal(JSON.parse(fs.readFileSync(report,'utf8')).creationWarnings.length,1);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
test('trainer explicit base form succeeds even when discarded random mechanical form is absent',()=>{
  const i=input('author-pumpkin','pumpkaboo');i.trainerTypes=read('trainer-types');i.trainers=[{...read('trainers')[0],party:[{species:'author-pumpkin',level:5,form:0}]}];
  const a=assemble(i),record=Object.values(Object.values(a.content.trainers)[0])[0],type=Object.values(a.content.trainerTypes)[0],calls=[];
  const args={content:a.content,record,type,registrationOrder:a.content.registrationOrder,trainerTypeOrder:a.content.trainerTypeOrder,owner:{id:65536,name:'NPC',gender:0,language:2},receivedAt:0,allocateId:()=>'T1',random:n=>{calls.push(n);return 0;}};
  const team=E.trainerTeam.buildTrainerTeam(args);assert.equal(team[0].form,0);assert.equal(team[0].species,'Pumpkaboo');
  assert.deepEqual(calls,[65536,65536,32,32,32,32,32,32,100]);
  delete record.party[0].form;assert.throws(()=>E.trainerTeam.buildTrainerTeam(args),/missing creation form/);
});
test('two same battle species keep distinct saved forms, capture dex normalizes only valid latent identity',async()=>{
  require('../../../scripts/tests/ts-source-loader.cjs');
  const {pathToFileURL}=require('node:url');
  const W=await import(pathToFileURL(path.join(root,'src/framework/rules/battle-effects-writeback.ts')));
  const {content}=assemble(input('larva','scatterbug'));
  const make=(id,form)=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id,species:'Scatterbug',level:5,form,shiny:false},content,()=>0),content);
  const before=E.state.newGame({party:[make('P',2)],content}),caught=make('C',17),primary=structuredClone(before);primary.party.push(caught);
  const raw={members:{},captured:[E.speciesKey.toBattleMember(caught,content)]};
  const composed=W.composeBattleEffects({before,primary,raw,content,effects:{friendshipReplacements:{},faint:{},damage:{},appearances:[],defeats:[]},internalBattle:true});
  assert.deepEqual(composed.state.party.map(m=>m.form),[2,17]);
  assert.ok(composed.state.dex.owned.includes('larva'));
  assert.equal(composed.state.dex.capturedCounts.larva,1);
  assert.equal(composed.dispositions.find(d=>d.group==='capture-appearance').status,'applied');
  assert.deepEqual(E.saveSchema.validateGame(JSON.parse(JSON.stringify(composed.state))),[]);
  const aliases=structuredClone(content);
  aliases.forms.larva[1]='Larva One';aliases.forms.larva[2]='Larva Two';
  aliases.species['Larva One']={...aliases.species.Scatterbug,form:1,formName:'One',pokedexForm:0};
  aliases.species['Larva Two']={...aliases.species.Scatterbug,form:2,formName:'Two',pokedexForm:1};
  const aliasPrimary=structuredClone(primary);aliasPrimary.party[1].form=2;
  const aliasResult=W.composeBattleEffects({before,primary:aliasPrimary,raw,content:aliases,effects:{friendshipReplacements:{},faint:{},damage:{},appearances:[],defeats:[]},internalBattle:true});
  assert.ok(aliasResult.state.dex.seenForms.larva.some(f=>f.form===1));
  assert.equal(E.acquisitionDex.normalizeMemberDexAppearance(aliases,aliasPrimary.party[1]).form,1);
  const invalid=structuredClone(primary);invalid.party[1].form=99;
  const rejected=W.composeBattleEffects({before,primary:invalid,raw,content,effects:{friendshipReplacements:{},faint:{},damage:{},appearances:[],defeats:[]},internalBattle:true});
  assert.equal(rejected.dispositions.find(d=>d.group==='capture-appearance').reason,'capture-form-unavailable');
});
test('latent identity survives real evolution selection and commit into another latent species',()=>{
  const i=input('larva','scatterbug');i.species[0].evolutions=[{method:'Level',parameter:9,target:'pupa'}];
  i.species.push({...i.species[0],id:'pupa',showdownId:'spewpa',nameKey:'species.pupa',evolutions:[]});
  const {content}=assemble(i),member=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'E1',species:'Scatterbug',level:9,form:17},content,()=>0),content);
  const state=E.state.newGame({party:[member],content});
  const selection=E.evolution.scanEvolution({member,content,trigger:{family:'level'},facts:{},party:state.party});
  assert.equal(selection.kind,'target',JSON.stringify(selection));assert.equal(selection.target.form,17);
  const result=E.evolutionCommit.planEvolutionCommit({state,memberId:member.id,selection,content});
  assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.state.party[0].species,'pupa');assert.equal(result.state.party[0].form,17);
  assert.ok(result.state.dex.owned.includes('pupa'));assert.deepEqual(E.saveSchema.validateGameContent(result.state,content),[]);
});
test('registered ordinary trainer form retains its original metadata before explicit override',()=>{
  const i=input('pumpkin','pumpkaboo');i.manifest.schema=1;i.species[0].happiness=70;
  i.species.push({...i.species[0],form:1,showdownId:'pumpkaboosmall',happiness:100});
  i.trainerTypes=read('trainer-types');i.trainers=[{...read('trainers')[0],party:[{species:'pumpkin',level:5,form:1}]}];
  const a=assemble(i), record=Object.values(Object.values(a.content.trainers)[0])[0],type=Object.values(a.content.trainerTypes)[0];
  const team=E.trainerTeam.buildTrainerTeam({content:a.content,record,type,registrationOrder:a.content.registrationOrder,trainerTypeOrder:a.content.trainerTypeOrder,owner:{id:0,name:'NPC',gender:0,language:2},receivedAt:0,allocateId:()=>'T1',random:n=>n===100?99:0});
  assert.equal(team[0].form,1);assert.equal(team[0].friendship,70);
});
test('latent members can use the real relearning planner and trade application',()=>{
  const {content}=assemble(input('larva','scatterbug'));content.species.Scatterbug.formName='Named base';
  const member=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P1',species:'Scatterbug',level:5,form:17},content,()=>0),content);
  const empty=structuredClone(member);empty.moves=[];
  const learning=E.learningActions.planRelearningAction(empty,content,{shadow:false});
  assert.equal(learning.status,'pending',JSON.stringify(learning));
  const state=E.fakes.createMemoryState(E.state.newGame({party:[member],content}));
  const app=new E.app.GameApplication({state,content:()=>({content,dex:E.dex.createDexLookup()}),sessions:E.fakes.createFakeSessions({}),projection:E.fakes.createRecordingProjection(),random:()=>0,clock:()=>1000,evolutionWorld:()=>({})});
  let out=app.beginTrade('latent-trade',{outgoingId:'P1',incoming:{species:'larva',form:17},nickname:'Traded',foreignOwner:{name:'NPC'}});
  assert.equal(out.status,'pending',JSON.stringify(out));
  const answer=decision=>{const p=app.pendingTrade;return app.resolveTrade(p.token,p.revision,decision);};
  out=answer({kind:'confirm',accept:true});assert.equal(out.status,'pending',JSON.stringify(out));
  assert.equal(app.pendingTrade.incoming.member.form,17);assert.equal(app.pendingTrade.dex.seenForms.larva.at(-1).form,0);
  out=answer({kind:'presented'});assert.equal(out.view.phase,'ready',JSON.stringify(out));
  out=answer({kind:'commit'});assert.equal(out.status,'committed',JSON.stringify(out));
  assert.equal(state.current().party[0].form,17);assert.deepEqual(E.saveSchema.validateGameContent(state.current(),content),[]);
});
