'use strict';
require('../../support/field/regular-field-action-test-runtime.cjs').prepare('parent');
const {test}=require('node:test'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path'),{types}=require('node:util');
const {fixture}=require('../../support/field/field-move-real-parent-fixtures.cjs');
const E=require(process.env.PF_E2_PARENT_ENGINE),F=require('../../support/saves/legacy-migration/fixtures.cjs');
const request=(id='generated',species='B',level=2)=>({battleId:id,seq:1,species,level});
const domains=[65536,65536,32,32,32,32,32,32];
function world(options={}){return fixture({hour:12,clock:()=>new Date(2026,10,17,12).getTime(),...options});}
function stop(h,id='generated'){h.app.abortBattle({battleId:id},Error('finite test complete'));}
const plain=(h)=>h.sessions[0].setup.foes[0];
test('generated direct App runs complete individual stage without ordinary selection/repel/flute draws',async()=>{
 let clock=0;const reads=[];const h=world({completedSteps:true,clock(){clock++;return new Date(2026,10,17,12).getTime();},wildSwitch(id){reads.push(id);return{status:'value',value:false};},editState(g){g.world.repelSteps=100;}}),before=structuredClone(h.state);
 const s=await h.app.startGeneratedWildBattle(request());assert(s);assert.equal(h.sessions.length,1);assert.deepEqual(h.draws,domains);assert.equal(clock,1);assert.deepEqual(reads,[31,32]);assert.equal(h.state.world.repelSteps,100);
 const expected=E.wildGeneration.createWildSpecies({id:plain(h).id,species:'B',level:2,owner:before.player,context:{fateful:false,map:7,receivedAt:Math.floor(new Date(2026,10,17,12).getTime()/1000),playerId:before.player.id,environment:'grass',timeOfDay:'day',hour:12,month:11,regionId:0,distortionWorld:false}},h.content,{source:'event',session:'ordinary',registration:{playerPresent:true,dexPresent:true},party:before.party.map(m=>({isEgg:m.isEgg,hp:m.hp,level:m.level,ability:m.ability,gender:m.gender,nature:m.nature})),shinyCharm:false,forceShiny:false,higherShinyByBattled:true,battledCount:0,moreAbilities:true,roamer:false,legendaryPerfectIVs:true,scaleWildLevels:false,allowHeldItemSources:true},()=>0);
 assert.equal(expected.status,'created');assert.deepEqual(plain(h),E.speciesKey.toBattleMember(E.speciesKey.toPersistentMember(expected.member,h.content),h.content));stop(h);
});
for(const [shiny,fateful]of [[false,false],[true,false],[false,true],[true,true]])test('generated 31/32 independent '+shiny+'/'+fateful+' preserves eight-draw prefix',async()=>{
 const h=world({wildSwitch:id=>({status:'value',value:id===31?shiny:fateful}),random(n,count){return count===2?65535:0;}});await h.app.startGeneratedWildBattle(request());assert.deepEqual(h.draws,domains);assert.equal(plain(h).shiny,shiny);assert.equal(plain(h).origin.method,fateful?4:0);stop(h);
});
for(const missing of [31,32])test('generated missing switch '+missing+' rejects before any generation RNG',async()=>{
 const h=world({wildSwitch:id=>id===missing?{status:'unavailable',reason:'fixture-no-source'}:{status:'value',value:false}});await assert.rejects(h.app.startGeneratedWildBattle(request()),/switch-unavailable/);assert.deepEqual(h.draws,[]);assert.equal(h.sessions.length,0);assert.equal(h.app.saveBlocked,false);
});
test('generated disabled31/32 needs no switch read and invalid fact getter stays uncalled',async()=>{
 let reads=0;const off=world({wildSwitch(){reads++;throw Error('disabled source must not run');},editContent(c){c.settings={...c.settings,SHINY_WILD_POKEMON_SWITCH:0,FATEFUL_ENCOUNTER_SWITCH:0};}});await off.app.startGeneratedWildBattle(request());assert.equal(reads,0);assert.deepEqual(off.draws,domains);stop(off);
 let hooks=0;const bad={status:'value'};Object.defineProperty(bad,'value',{enumerable:true,get(){hooks++;return true;}});const h=world({wildSwitch:()=>bad});await assert.rejects(h.app.startGeneratedWildBattle(request()),/switch-unavailable/);assert.equal(hooks,0);assert.deepEqual(h.draws,[]);assert.equal(h.sessions.length,0);
});
test('generated actual A registration keeps pre-hook appearance, then forced shiny/fateful apply once',async()=>{
 const h=world({wildSwitch:id=>({status:'value',value:true}),random(n,count){return count===2?65535:0;},editContent(c){c.species.B.ruleSpecies='Espurr';c.species.B.contentId='B';c.species.B.form=0;c.species.B.gender='F';c.species.B1={...structuredClone(c.species.B),form:1,formName:'Female'};c.forms=Object.fromEntries(['A','B','C'].map(id=>[id,{'0':id}]));c.forms.B['1']='B1';c.speciesKeys=Object.fromEntries(Object.keys(c.species).map(id=>[id,{species:id==='B1'?'B':id,form:id==='B1'?1:0}]));}});
 await h.app.startGeneratedWildBattle(request());assert.deepEqual(h.draws,domains);assert.equal(E.speciesKey.toPersistentMember(plain(h),h.content).form,1);assert.equal(plain(h).shiny,true);assert.equal(plain(h).origin.method,4);assert.deepEqual(h.state.dex.seenForms.B,[{gender:1,form:1,shiny:false}]);assert.equal(h.state.dex.owned.includes('B'),false);stop(h);assert.deepEqual(h.state.dex.seenForms.B,[{gender:1,form:1,shiny:false}]);
});
test('generated existing legend+map-scale hooks keep exact L->Q prefix and reset moves at final level',async()=>{
 const h=world({party:[F.member('P1',{level:5,hp:20,friendship:70}),F.member('P2',{level:5,hp:0,isEgg:true,friendship:70})],editContent(c){c.species.B.flags=['Legendary'];c.species.B.learnset={1:['tackle'],7:['growl']};c.moves.growl=c.moves.Growl;c.mapMetadata.maps[7].flags=['ScaleWildEncounterLevels'];},random(n,count){return count===12?4:0;}});
 await h.app.startGeneratedWildBattle(request());assert.deepEqual(h.draws,[...domains,6,5,4,5]);assert.equal(plain(h).level,7);assert.deepEqual(plain(h).ivs,{hp:31,atk:31,def:31,spa:0,spd:0,spe:0});assert.deepEqual(plain(h).moves.map(m=>m.id),['tackle','growl']);stop(h);
});
for(const kind of ['member','hook','accessor','level','field'])test('generated input '+kind+' explicitly refuses without user callbacks or RNG',async()=>{
 const h=world(),input=request();let hooks=0;if(kind==='member')input.member=h.state.party[0];if(kind==='hook')input.toJSON=()=>{hooks++;return{};};if(kind==='accessor')Object.defineProperty(input,'species',{enumerable:true,get(){hooks++;return'B';}});if(kind==='level')input.level=101;if(kind==='field')input.initialField={weather:'bad-weather'};
 await assert.rejects(h.app.startGeneratedWildBattle(input));assert.equal(hooks,0);assert.deepEqual(h.draws,[]);assert.equal(h.sessions.length,0);
});
for(const kind of ['generation','content','native-source','cancel'])test('generated late '+kind+' after first PID draw preserves prefix and rejects old writes',async()=>{
 let h,once=false;h=world({onRandom(){if(once)return;once=true;if(kind==='generation')h.replaceGeneration();if(kind==='cancel')h.app.abortBattle({battleId:'generated'},Error('cancelled during generation'));if(kind==='content')h.actual({...h.content,settings:{...h.content.settings,TIME_SHADING:false}});if(kind==='native-source')h.root.$gameMap._mapId=99;}});await assert.rejects(h.app.startGeneratedWildBattle(request()),/stale|changed|aborted/);assert.deepEqual(h.draws,[65536]);assert.equal(h.sessions.length,0);assert.equal(h.state.dex.seen.includes('B'),false);
});
test('generated all held candidates require persistent mapping before any RNG or descriptor lookup',async()=>{
 let lookups=0;const h=world({editContent(c){c.meta={...c.meta,showdownSourceChecked:true};c.species.B.wildItemCommon=['native-only'];c.species.B.wildItemUncommon=[];c.species.B.wildItemRare=[];},dex:{heldItem(){lookups++;return{id:'native-only',holdable:true,mail:false};}}});await assert.rejects(h.app.startGeneratedWildBattle(request()),/held-item-descriptor/);assert.deepEqual(h.draws,[]);assert.equal(lookups,0);assert.equal(h.sessions.length,0);
});
test('given stays zero-generation and preserves provided shiny/origin while old legacy stays eight draws',async()=>{
 let reads=0;const h=world({wildSwitch(){reads++;return{status:'value',value:true};}}),given={...structuredClone(h.state.party[0]),id:'Given1',shiny:false,superShiny:false,origin:{...h.state.party[0].origin,method:2}};
 await h.app.startGivenWildBattle({battleId:'given',seq:1,member:given});assert.deepEqual(h.draws,[]);assert.equal(reads,0);assert.equal(plain(h).shiny,false);assert.equal(plain(h).origin.method,2);stop(h,'given');
 await h.app.startBattle({battleId:'legacy',seq:2,kind:'wild',foes:[{species:'B',level:2}]});assert.deepEqual(h.draws,domains);assert.equal(reads,0);assert.equal(h.sessions[1].setup.initialField,undefined);stop(h,'legacy');
});
test('native switch facts distinguish sparse unset from missing/accessor/Proxy/corrupt source',async()=>{
 const {readWildShinySwitchMZ:R}=await import(pathToFileURL(path.resolve(__dirname,'../../../src/plugins/world/wild-generation-facts-mz.ts')).href);const slots=[];assert.deepEqual(R({$gameSwitches:{_data:slots}},31,types.isProxy),{status:'value',value:false});slots[31]=null;assert.deepEqual(R({$gameSwitches:{_data:slots}},31,types.isProxy),{status:'value',value:false});slots[31]=true;assert.deepEqual(R({$gameSwitches:{_data:slots}},31,types.isProxy),{status:'value',value:true});assert.equal(R({},31,types.isProxy).status,'unavailable');
 let hooks=0,traps=0;const root={};Object.defineProperty(root,'$gameSwitches',{get(){hooks++;return{_data:[]};}});assert.equal(R(root,31,types.isProxy).status,'invalid');assert.equal(hooks,0);const proxy=new Proxy([],{getOwnPropertyDescriptor(){traps++;return undefined;}});assert.equal(R({$gameSwitches:{_data:proxy}},31,types.isProxy).status,'invalid');assert.equal(traps,0);slots[31]='yes';assert.equal(R({$gameSwitches:{_data:slots}},31,types.isProxy).status,'invalid');
});
test('shared ordinary App consumer receives checked31/32 with its original trigger-selection prefix',async()=>{
 let pid=0;const h=world({completedSteps:true,wildSwitch:()=>({status:'value',value:true}),random(n){return n===65536?(++pid===2?65535:0):0;}}),out=await h.complete();assert.equal(out.status,'battle-admitted',JSON.stringify(out));await h.app.startAdmittedWorldBattle(out.admission);assert.deepEqual(h.draws,[100,100,1,...domains]);assert.equal(plain(h).shiny,true);assert.equal(plain(h).origin.method,4);h.app.abortAdmittedWorldBattle(out.admission,'finite shared consumer complete');
});
for(const source of ['fishing','sweet-scent'])test('shared '+source+' preparation consumer reads31/32 with separate selection/generation prefix',()=>{
 const C=require(path.join(process.env.PF_E2_PARENT_OUT,'src/framework/app/encounter-operation.js')),h=world(),before=structuredClone(h.state),reads=[],calls=[];let pid=0;
 const type=source==='fishing'?'OldRod':'Land',value=value=>({status:'value',value}),facts={mapId:value(7),hour:value(12),mapMetadata:value(h.content.mapMetadata.maps[7]),weather:value({type:'None',strength:0,durationFrames:0,category:'None'}),cycling:value(false),diving:value(false),surfing:value(false)};
 const result=C.prepareFieldEncounter({id:'shared-'+source,mapId:7,type,source,groundEnvironment:value('grass'),facingEnvironment:value('stillwater')},{read:()=>h.state,contentView:()=>({content:h.content}),assertCurrent(){assert.deepEqual(h.state,before);},facts:()=>facts,tables:()=>({[type]:{stepChance:0,slots:[{species:'B',weight:100,minLevel:2,maxLevel:2}]}}),local:()=>h.app.worldLocalState(),switchOn(id){reads.push(id);return true;},now:()=>new Date(2026,10,17,12).getTime(),random(n){calls.push(n);return n===65536?(++pid===2?65535:0):0;},allowHeldItemSources:true});
 assert.equal(result.status,'prepared',JSON.stringify(result));assert.deepEqual(reads,[31,32]);assert.deepEqual(calls,[100,1,...domains]);assert.equal(result.prepared.member.shiny,true);assert.equal(result.prepared.member.origin.method,4);assert.equal(result.prepared.capture.fishing,source==='fishing');assert.deepEqual(h.state,before);
});

test('creation switch config defaults31/32 and rejects invalid identifiers',()=>{assert.equal(E.config.GEN8_DEFAULTS.SHINY_WILD_POKEMON_SWITCH,31);assert.equal(E.config.GEN8_DEFAULTS.FATEFUL_ENCOUNTER_SWITCH,32);for(const key of ['SHINY_WILD_POKEMON_SWITCH','FATEFUL_ENCOUNTER_SWITCH']){assert.equal(E.config.checkOverrides({[key]:0}).length,0);for(const value of [-1,true,1.5])assert(E.config.checkOverrides({[key]:value}).length>0);}});

for(const milliseconds of [1000,1000.25])test('generated clock epoch milliseconds '+milliseconds+' retains one sample and floors origin seconds',async()=>{
 let calls=0;const h=world({clock(){calls++;return milliseconds;},hour:21});assert.equal(h.app.now(),milliseconds);assert.equal(calls,1);await h.app.startGeneratedWildBattle(request());assert.equal(calls,2);assert.deepEqual(h.draws,domains);assert.equal(plain(h).origin.receivedAt,1);assert.equal(h.sessions.length,1);assert.equal(h.sessions[0].setup.worldCapture.timeOfDay,2);stop(h);
});
for(const [label,milliseconds]of [['NaN',NaN],['Infinity',Infinity],['negative',-0.25],['outside-Date',8640000000000001]])test('generated clock rejects '+label+' before generation',async()=>{
 let calls=0;const h=world({clock(){calls++;return milliseconds;}});await assert.rejects(h.app.startGeneratedWildBattle(request()),/clock/);assert.equal(calls,1);assert.deepEqual(h.draws,[]);assert.equal(h.sessions.length,0);assert.equal(h.app.saveBlocked,false);
});

test('generated calendar month and origin seconds share the single injected sample while world hour stays authoritative',async()=>{
 const first=new Date(2026,1,17,12).getTime(),second=new Date(2026,2,17,12).getTime();let calls=0;
 const h=world({hour:21,clock(){calls++;return calls===1?first:second;},editContent(c){
  c.species.B.ruleSpecies='Deerling';c.species.B.contentId='B';c.species.B.form=0;
  c.forms=Object.fromEntries(['A','B','C'].map(id=>[id,{'0':id}]));
  for(let form=1;form<=3;form++){const name='B'+form;c.species[name]={...structuredClone(c.species.B),form,formName:'Season'+form};c.forms.B[form]=name;}
  c.speciesKeys=Object.fromEntries(Object.keys(c.species).map(id=>[id,{species:/^B[123]$/.test(id)?'B':id,form:/^B[123]$/.test(id)?Number(id.slice(1)):0}]));
 }});await h.app.startGeneratedWildBattle(request());assert.equal(calls,1);assert.deepEqual(h.draws,domains);assert.equal(E.speciesKey.toPersistentMember(plain(h),h.content).form,1,'WP59 month2 gives (2-1)%4; a second sample would month3/form2');assert.equal(plain(h).origin.receivedAt,Math.floor(first/1000));assert.equal(h.sessions[0].setup.worldCapture.timeOfDay,2);stop(h);
});
