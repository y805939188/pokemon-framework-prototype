'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('parent');
const {test}=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./field-move-real-parent-fixtures.cjs');
for(const moveId of ['cut','rocksmash','strength','surf','flash','sweetscent'])test('actual World parent '+moveId+' production host leaf',async()=>{
 const h=fixture({moveId}),result=await h.run();assert.equal(result.status,'completed',JSON.stringify(result));
 if(moveId==='cut'){assert.equal(h.state.stats.cut_count,1);assert.equal(h.records.length,1);assert(h.native.event._erased);}
 if(moveId==='rocksmash'){assert.equal(h.state.stats.rock_smash_count,1);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.records.length,1);assert.deepEqual(h.draws,[100,100,1,65536,65536,32,32,32,32,32,32]);}
 if(moveId==='strength')assert.equal(h.local.strengthUsed,true);
 if(moveId==='surf'){assert.equal(h.state.world.surfing,true);assert.equal(h.state.stats.surf_count,1);assert.equal(h.surf.surfBase.mapId,7);assert.equal(h.root.$gamePlayer.x,4);}
 if(moveId==='flash'){assert.equal(h.state.world.flashUsed,true);assert.equal(h.state.stats.flash_count,1);assert(h.native.maskState.expanded);}
 if(!['rocksmash','sweetscent'].includes(moveId))assert.deepEqual(h.draws,[]);
 if(result.admission){assert(h.app.saveBlocked);await h.app.startAdmittedWorldBattle(result.admission);assert.equal(h.sessions.length,1);h.app.abortAdmittedWorldBattle(result.admission,'done');}
 assert.equal(h.app.saveBlocked,false);assert.equal(h.state.steps,0);
});
for(const scenario of ['weather','no-table','battle'])test('actual Honey same owner '+scenario+' consumes exactly once',async()=>{
 const h=fixture({moveId:'sweetscent',noTable:scenario==='no-table',editState(g){if(scenario==='weather')g.world.weather={type:'Storm',strength:30,durationFrames:0};}}),token=h.prepareHoney(),r=await h.app.runFieldItemHandoff(token);assert(['completed','battle-admitted'].includes(r.status),JSON.stringify(r));assert.equal(h.E.inventory.itemQuantity(h.state.inventory,'honey',h.content.items),1);assert.equal(r.consumed,true);const again=await h.app.runFieldItemHandoff(token);assert.equal(h.E.inventory.itemQuantity(h.state.inventory,'honey',h.content.items),1);if(r.admission){assert.equal(again.admission,r.admission);h.app.abortAdmittedWorldBattle(r.admission,'done');}else assert.deepEqual(h.draws,[]);
});
const path=require('node:path');
const {runWeatherCommand}=require(path.join(process.env.PF_E2_PARENT_OUT,'src/plugins/world/world-weather-mz.js'));
function nativeWeather(h,type='snow'){
 h.root.$gameParty.inBattle=()=>false;const interpreter=new h.root.Game_Interpreter(),params=[type,5,60,true];
 const result=runWeatherCommand({inBattle:()=>false,changeBusiness:intent=>h.app.setWorldWeather(intent),diagnose(reason){assert.fail(reason);}},params,()=>interpreter.command236(params));
 assert.equal(result,true);assert.equal(interpreter._waitCount,60);
}
test('R11 real parent drains historical maps and native236 before Snow Cloak probability, never old weather',async()=>{
 let h,once=false;h=fixture({moveId:'rocksmash',editContent(c){c.abilities.snowcloak={id:'snowcloak',name:'Snow Cloak'};},editState(g){g.party[0].ability='Snow Cloak';},random(n,count){return count===2?75:0;},onAnimate(){if(once)return;once=true;
  h.root.$gameMap._mapId=8;assert.equal(h.app.observeWorldMapEntry({id:'8',cause:'transfer',previousMapId:7,mapId:8,rebuilt:true}).status,'queued');
  h.root.$gameMap._mapId=7;assert.equal(h.app.observeWorldMapEntry({id:'7',cause:'transfer',previousMapId:8,mapId:7,rebuilt:true}).status,'queued');nativeWeather(h);
 }});const r=await h.run();assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(r.admission,undefined);assert.deepEqual(h.draws,[100,100]);assert.equal(h.state.world.weather.type,'Snow');assert.deepEqual(h.state.world.visitedMaps,[8,7]);assert.deepEqual(h.state.world.healingSpot,{mapId:8,x:1,y:1});assert.equal(h.state.stats.rock_smash_count,1);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.records.length,1);assert.equal(h.app.saveBlocked,false);
});
test('Sweet Scent rechecks native236 queued during its red effect and has no C generation',async()=>{
 let h,once=false;h=fixture({moveId:'sweetscent',onFrame(){if(!once){once=true;nativeWeather(h,'storm');}}});const r=await h.run();assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(r.encounter,undefined);assert.equal(r.admission,undefined);assert.equal(h.state.world.weather.type,'Storm');assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
test('B synchronization rejects foreign money while retaining notices for the safe drain',async()=>{
 let h,once=false;h=fixture({moveId:'rocksmash',onAnimate(){if(!once){once=true;nativeWeather(h,'storm');h.external(g=>{g.money=4321;});}}});const r=await h.run();assert.equal(r.status,'failed');assert.equal(r.admission,undefined);assert.equal(h.state.money,4321);assert.equal(h.state.world.weather.type,'Storm');assert.deepEqual(h.draws,[]);assert.equal(h.app.flushWorldNotices().pending,0);assert.equal(h.app.saveBlocked,false);
});
for(const stage of ['onWorld','onContent'])for(const change of ['cancel','generation','map','scene','player','content','state'])test('real E2 native final '+stage+' '+change+' rejects first stat',async()=>{
 let h,changed=false;h=fixture({moveId:'cut',[stage](ctx){if(!ctx.armed||changed)return;changed=true;if(change==='cancel')h.cancel();else if(change==='generation')h.replaceGeneration();else if(change==='map')h.root.$gameMap._mapId=8;else if(change==='scene')h.root.SceneManager._scene={};else if(change==='player')h.root.$gamePlayer={...h.root.$gamePlayer};else if(change==='content')h.actual({...h.content,settings:{FISHING_AUTO_HOOK:true}});else h.external(g=>{g.money=1234;});}});
 const r=await h.run();assert(changed);assert.notEqual(r.status,'completed');assert.equal(h.state.stats.cut_count,0);assert.equal(h.records.length,0);assert.equal(h.app.saveBlocked,false);if(change==='state')assert.equal(h.state.money,1234);
});
for(const disruption of ['cancel','throw','generation','inventory'])test('Honey '+disruption+' during actual red-screen effect does not consume',async()=>{
 let h,token,once=false;h=fixture({moveId:'sweetscent',onFrame(){if(once)return;once=true;if(disruption==='cancel'){assert.equal(h.app.cancelFieldItemHandoff(token).status,'unchanged');assert(h.app.saveBlocked);}else if(disruption==='throw')throw Error('host-red-failed');else if(disruption==='generation')h.replaceGeneration();else h.external(g=>{g.inventory.pockets[0][0].quantity=1;});}});token=h.prepareHoney();const r=await h.app.runFieldItemHandoff(token);assert(!['completed','battle-admitted'].includes(r.status),JSON.stringify(r));assert.equal(h.E.inventory.itemQuantity(h.state.inventory,'honey',h.content.items),disruption==='inventory'?1:2);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
test('real parent stage reentry rejects before another provider and cut commits/registers once',async()=>{
 let operation,stage,h,once=false;h=fixture({moveId:'cut',onRun(plan,actual){operation=actual;stage=plan.steps.find(s=>s.kind==='commit');},onContent(ctx){if(ctx.armed&&!once){once=true;assert.throws(()=>operation.applyStage(stage),/outside-execution/);}}});const r=await h.run();assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(h.state.stats.cut_count,1);assert.equal(h.records.length,1);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
test('Rock battle stat only commits after actual session, once, and copied admission cannot count',async()=>{
 const h=fixture({moveId:'rocksmash'}),p=h.run(),same=h.run();assert.equal(p,same);const r=await p;assert.equal(h.state.stats.rock_smash_battles,0);await assert.rejects(h.app.startAdmittedWorldBattle({...r.admission}),/stale/);assert.equal(h.state.stats.rock_smash_battles,0);const start=h.app.startAdmittedWorldBattle(r.admission);assert.equal(start,h.app.startAdmittedWorldBattle(r.admission));await start;assert.equal(h.state.stats.rock_smash_battles,1);h.app.abortAdmittedWorldBattle(r.admission,'done');assert.equal((await h.run()).admission,r.admission);assert.equal(h.state.stats.rock_smash_battles,1);
});
for(const failure of ['factory','abort'])test('Rock '+failure+' before accepted session does not commit battle stat',async()=>{
 let resolve;const pending=new Promise(done=>{resolve=done;});const h=fixture({moveId:'rocksmash',sessions:{async create(){if(failure==='factory')throw Error('factory-failed');return pending;}}}),r=await h.run(),opening=h.app.startAdmittedWorldBattle(r.admission);if(failure==='abort'){await h.flush();h.app.abortAdmittedWorldBattle(r.admission,'abort');resolve({});}await assert.rejects(opening,/factory-failed|aborted|late/);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.state.stats.rock_smash_count,1);assert.equal(h.app.saveBlocked,false);
});
test('actual Surf start/landing/player cleanup reset both counters and do not fake normal steps',async()=>{
 const h=fixture({moveId:'surf'});assert.equal((await h.run()).status,'completed');h.native.ports.terrain=()=>({status:'value',value:{canSurf:false,waterfall:false,waterfallCrest:false}});
 const land=await h.run({kind:'surf-land'},'land');assert.equal(land.status,'completed',JSON.stringify(land));assert.equal(h.surf.endingSurf,true);assert.equal(h.surf.surfBase.x,4);assert.equal(h.state.world.surfing,true);
 const clean=await h.run({kind:'surf-cleanup'},'cleanup');assert.equal(clean.status,'completed',JSON.stringify(clean));assert.equal(h.state.world.surfing,false);assert.equal(h.surf.surfBase,null);assert.equal(h.surf.endingSurf,false);assert.equal(h.state.stats.surf_count,1);assert.equal(h.state.steps,0);assert.deepEqual(h.draws,[]);assert.equal(h.app.worldEncounterRuntime().accumulator,0);assert.equal(h.app.worldEncounterRuntime().graceSteps,0);
});
async function accumulatorFixture(options={}){
 const h=fixture({moveId:'cut',completedSteps:true,random(n,count){return n===100&&count===2?99:0;},editContent(c){c.world.encounters.tables[0].types.Land.stepChance=21;c.world.encounters.tables.push({mapId:7,version:-2,types:{Land:{stepChance:0,slots:[{species:'A',weight:100,minLevel:5,maxLevel:5}]}}});},...options});
 const r=await h.complete();assert.equal(r.status,'no-encounter',JSON.stringify(r));assert.equal(r.reason,'miss');assert.equal(h.app.worldEncounterRuntime().accumulator,21);return h;
}
test('actual signed encounter-version entry preserves accumulator and same-value runtime, reloading only changed table',async()=>{
 const h=await accumulatorFixture(),before=h.app.worldEncounterRuntime(),trace=[...h.draws];assert.equal(before.graceSteps,1);assert.equal(h.app.setEncounterVersion(0).status,'unchanged');assert.deepEqual(h.app.worldEncounterRuntime(),before);
 const snapshot=h.app.worldEncounterRuntime();snapshot.accumulator=999;assert.equal(h.app.worldEncounterRuntime().accumulator,21);
 for(const bad of [NaN,Infinity,1.2,Number.MAX_SAFE_INTEGER+1,'2'])assert.equal(h.app.setEncounterVersion(bad).status,'refused');assert.deepEqual(h.app.worldEncounterRuntime(),before);assert.deepEqual(h.draws,trace);
 assert.equal(h.app.setEncounterVersion(-2).status,'committed');assert.equal(h.state.world.encounterVersion,-2);assert.deepEqual(h.app.worldEncounterRuntime(),{...before,loadedVersion:-2,graceSteps:0});assert.deepEqual(h.draws,trace);assert.equal((await h.complete()).reason,'no-chance');assert.deepEqual(h.draws,trace);
});
for(const fail of [false,true])test('actual event battle '+(fail?'factory failure keeps':'accepted session resets')+' accumulated counter',async()=>{
 const h=await accumulatorFixture({sessions:{async create(){if(fail)throw Error('fixture-factory-failed');return {};}}});const request={battleId:'actual-event',kind:'wild',foes:[{species:'A',level:5}],seq:0};
 if(fail){await assert.rejects(h.app.startBattle(request),/fixture-factory-failed/);assert.equal(h.app.worldEncounterRuntime().accumulator,21);}else{await h.app.startBattle(request);assert.equal(h.app.worldEncounterRuntime().accumulator,0);assert.equal(h.app.worldEncounterRuntime().graceSteps,0);h.app.abortBattle(request,Error('done'));assert.equal(h.app.worldEncounterRuntime().accumulator,0);}assert.equal(h.app.saveBlocked,false);
});
function productionContent(){
 const fs=require('node:fs'),E=require(process.env.PF_E2_PARENT_ENGINE),source=path.resolve(__dirname,'../../../content/sample'),names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];const input=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(source,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(source,n+'.json'),'utf8'))]));
 Object.assign(input.species.find(s=>s.id==='pidgey'),{catchRate:30,learnset:[{level:1,move:'splash'}],wildItemCommon:[],wildItemUncommon:[],wildItemRare:[]});input.species.find(s=>s.id==='snorlax').learnset=[{level:1,move:'splash'},{level:1,move:'rocksmash'},{level:1,move:'sweetscent'}];input.mapMetadata={source:'author-placeholder',maps:{7:{environment:'grass'}}};const slots=[{species:'pidgey',weight:100,minLevel:10,maxLevel:10}];input.encounters={source:'author-placeholder',tables:[{mapId:7,version:0,types:{Land:{stepChance:100,slots},RockSmash:{stepChance:100,slots}}}]};const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);return {E,dex,content:assembled.content};
}
for(const moveId of ['sweetscent','rocksmash'])for(const entry of ['throwBall','slots'])test('actual '+moveId+' producer -> production factory/Showdown '+entry+' keeps nonfishing source',async()=>{
 const {E,content,dex}=productionContent(),player=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},content,()=>0),content),factory=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),h=fixture({moveId,content,dex,party:[player],sessions:factory,bag:{lureball:4,duskball:4}}),r=await h.run();assert.equal(r.status,'completed',JSON.stringify(r));assert(r.admission);assert.equal(h.state.stats.rock_smash_battles,0);const before=[...h.draws],session=await h.app.startAdmittedWorldBattle(r.admission);session.take();assert.equal(h.state.stats.rock_smash_battles,moveId==='rocksmash'?1:0);
 try{const result=entry==='throwBall'?await session.throwBall('lureball'):await session.chooseDoubles([{kind:'ball',ball:'lureball',target:session.gw.activeId('p2'),ctx:{fishing:true,timeOfDay:2}}]);assert.equal(result.ok,true,JSON.stringify(result));const event=result.messages.flatMap(m=>m.events||[]).find(e=>e.type==='rpg'&&e.args[0]==='ball');assert(event);assert.equal(Number(event.args[7]),10);assert.deepEqual(h.draws,before);assert.equal(h.state.steps,0);}finally{h.app.abortAdmittedWorldBattle(r.admission,'done');}
});
for(const stage of ['onWorld','onContent'])for(const change of ['cancel','generation','map','scene','owner'])test('E2 final battle handoff '+stage+' '+change+' cannot admit a stale field owner',async()=>{
 let h,armed=false,changed=false;h=fixture({moveId:'rocksmash',[stage](ctx){if(!armed||changed)return;changed=true;if(change==='cancel')h.cancel();else if(change==='generation')h.replaceGeneration();else if(change==='map')h.root.$gameMap._mapId=8;else if(change==='scene')h.root.SceneManager._scene={};else h.app.world.owner=null;}});const admit=h.app.admitWorldBattle.bind(h.app);h.app.admitWorldBattle=(p,o)=>{armed=true;return admit(p,o);};const r=await h.run();assert(changed);assert.equal(r.status,change==='cancel'?'cancelled':'failed');assert.equal(r.admission,undefined);assert.equal(h.app.op,null);assert.equal(h.app.saveBlocked,false);assert.equal(h.state.stats.rock_smash_count,1);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.records.length,change==='generation'?0:1);assert(h.native.event._erased);assert.equal(h.sessions.length,0);
});
test('Rock actual factory accepted but final stat callback aborts once with no count or leaked session',async()=>{
 let h,r,retired=0,changed=false;h=fixture({moveId:'rocksmash',sessions:{async create(){return {};},retire(){retired++;}},onContent(ctx){if(!changed&&r&&ctx.app.op?.session){changed=true;ctx.app.abortAdmittedWorldBattle(r.admission,'late-stat-abort');}}});r=await h.run();await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/stale-world-battle-stat/);assert(changed);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.app.saveBlocked,false);assert.equal(retired,1);assert.equal(h.app.abortAdmittedWorldBattle(r.admission,'duplicate').status,'duplicate');
});
for(const disruption of ['cancel','generation','content','scene'])test('field parent '+disruption+' before first child microtask returns an owned terminal without a leaked gate',async()=>{
 const h=fixture({moveId:'cut'}),promise=h.run();if(disruption==='cancel')h.cancel();else if(disruption==='generation')h.replaceGeneration();else if(disruption==='content')h.actual({...h.content,settings:{FISHING_AUTO_HOOK:true}});else h.root.SceneManager._scene={};const result=await promise;assert(!result.admission);assert.notEqual(result.status,'completed');assert.equal(h.state.stats.cut_count,0);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);
});
test('actual issued field action is captured before asynchronous execution and request identity cannot be changed',async()=>{
 const h=fixture({moveId:'cut'}),action={kind:'use',moveId:'cut',entry:'party',memberId:'P1'},promise=h.run(action);action.moveId='rocksmash';const result=await promise;assert.equal(result.status,'completed');assert.equal(h.state.stats.cut_count,1);assert.equal(h.state.stats.rock_smash_count,0);assert.deepEqual(h.draws,[]);assert.equal((await h.run(action)).reason,'field-move-request-conflict');
});
