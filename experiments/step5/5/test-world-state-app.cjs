'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const E=require(process.env.PF55_B_ENGINE || '../../../js/engine/build/production.cjs');
const F=require('../3/fixtures-migration7/fixtures.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function make({bag={},metadata=true,handler,random=()=>0,game:given,onRead,onContent}={}) {
 const content=F.content(E);if(metadata)content.mapMetadata={source:'fixture',maps:{1:{darkMap:true},2:{darkMap:false,weather:{type:'Rain',chance:100},healingSpot:{mapId:7,x:3,y:4}},3:{darkMap:true}}};
 const game=given??E.state.newGame({party:[],content,bag,money:123});
 let held=F.freeze(clone(game));const state={failReplace:null,read(){return held;},current(){return held;},replace(next){if(this.failReplace)throw this.failReplace;held=F.freeze(clone(next));}};let mapId=1;
 const app=new E.app.GameApplication({state,sessions:{async create(){throw Error('no battle in B fixture');}},projection:{project(){}},content:()=>{const replacement=onContent?.();return {content:replacement??content};},random,
  worldHost:{read:()=>{onRead?.();return {mapId:{status:'value',value:mapId},hour:{status:'value',value:20},cycling:{status:'unavailable'},diving:{status:'unavailable'}};}},...(handler?{fieldItems:{execute:handler}}:{})});
 return {app,state,content,map:value=>{mapId=value;}};
}
function prepare(w,itemId,requestId='request') {
 const inventory=w.app.beginInventoryOperation();const snap=w.app.inventorySnapshot(inventory);
 const pocket=snap.pockets.findIndex(rows=>rows.some(r=>r.item.id===itemId));assert.ok(pocket>=0,itemId);
 const index=snap.pockets[pocket].find(r=>r.item.id===itemId).index;
 const ticket=w.app.inventoryTicket(inventory,pocket+1,index),result=w.app.prepareFieldItemHandoff(inventory,requestId,ticket);
 assert.equal(result.status,'handoff',JSON.stringify(result));return {inventory,ticket,result,token:result.handoff.token};
}
function old9(content=F.content(E)) {const game=E.state.newGame({party:[],content,bag:{potion:4},money:900});game.schema=9;delete game.hallOfFame;delete game.world;delete game.inventory.registeredItems;return game;}

test('B-T15 schema9 migrates on a copy, adds world/registration and records history absence, retains all prior values',()=>{
 const content=F.content(E),raw=old9(content),before=clone(raw),r=E.saveSchema.migrateGame(F.freeze(raw),{content,legacyWeather:{type:'rain',targetPower:9,durationFrames:20}});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.state.schema,E.state.GAME_SCHEMA);assert.deepEqual(r.state.world.weather,{type:'Rain',strength:60,durationFrames:20});
 assert.equal(r.state.hallOfFame,null);
 const prior=clone(r.state);delete prior.hallOfFame;delete prior.world;delete prior.inventory.registeredItems;prior.schema=9;assert.deepEqual(prior,before);assert.deepEqual(raw,before);assert.deepEqual(E.saveSchema.validateGameContent(r.state,content),[]);
});
test('B-T15 all declared old schemas reach the current schema without mutation or inventing historical visits',()=>{
 const content=F.content(E);
 for(let version=1;version<=9;version++) {
  let raw;if(version<=6){raw=F.version(E,version,content);}else{raw=old9(content);raw.schema=version;if(version<8)delete raw.defeatedTrainers;}
  const before=clone(raw),r=E.saveSchema.migrateGame(F.freeze(raw),{content,speciesKey:name=>({species:name,form:0})});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.state.schema,E.state.GAME_SCHEMA);assert.deepEqual(raw,before);assert.deepEqual(r.state.world.visitedMaps,[]);assert.equal(r.state.world.flashUsed,false);
 }
});
test('B-T15 signed encounter version and artificial happiness128 remain supported',()=>{
 const w=make(),game=clone(w.state.current());game.world.encounterVersion=-5;game.world.happinessSteps=128;
 assert.deepEqual(E.saveSchema.validateGameContent(game,w.content),[]);
});
for(const [field,value]of [['flashUsed',0],['surfing','false'],['repelSteps',-1],['happinessSteps',1.5],['encounterVersion',NaN],['visitedMaps',[1,1]],['pendingReturn',{id:'bad'}]])test(`B-T15 invalid ${field} refuses whole document`,()=>{
 const w=make(),game=clone(w.state.current());game.world[field]=value;const before=JSON.stringify(game),r=E.saveSchema.migrateGame(game,{content:w.content});assert.equal(r.ok,false);assert.equal(r.error.code,'invalid');assert.equal(JSON.stringify(game),before);
});
test('B-T15 unknown schema and unbound battle-return checkpoint are refused',()=>{
 const w=make(),game=clone(w.state.current());assert.equal(E.saveSchema.migrateGame({...game,schema:E.state.GAME_SCHEMA+1},{content:w.content}).error.code,'unknown-version');
 game.world.pendingReturn={id:'r',origin:{kind:'battle',battleId:'missing',rawHash:'a'.repeat(64)},selection:{branch:'home',target:{mapId:1,x:2,y:3,direction:2}},phase:'ready',branch:'home'};
 assert.ok(E.saveSchema.validateGameContent(game,w.content).some(p=>p.path.includes('pendingReturn.origin')));
});
test('B-T15 new fields reject accessors without invocation',()=>{
 const w=make(),g=clone(w.state.current());let calls=0;Object.defineProperty(g.world,'flashUsed',{enumerable:true,get(){calls++;return true;}});
 assert.equal(E.saveSchema.migrateGame(g,{content:w.content}).ok,false);assert.equal(calls,0);
 const legacy={targetPower:9,durationFrames:0};Object.defineProperty(legacy,'type',{enumerable:true,get(){calls++;return 'rain';}});
 const r=E.saveSchema.migrateGame(old9(w.content),{content:w.content,legacyWeather:legacy});assert.equal(r.ok,true);assert.equal(r.state.world.weather.type,'None');assert.equal(calls,0);
});
test('B migration weather reads target power; fade/zero, unknown and malformed values diagnose None',()=>{
 for(const input of [{type:'storm',targetPower:0,durationFrames:8},{type:'alien',targetPower:4,durationFrames:0},{type:'rain',targetPower:'9',durationFrames:0},undefined]){
  const result=E.worldState.migrateLegacyWeather(input);assert.equal(result.intent.type,'None');assert.ok(result.notes.length);
 }
 assert.deepEqual(E.worldState.migrateLegacyWeather({type:'snow',targetPower:1,durationFrames:0}).intent,{type:'Snow',strength:12,durationFrames:0});
 const w=make(),g=clone(w.state.current());g.world.weather={type:'Fog',strength:42,durationFrames:9};const r=E.saveSchema.migrateGame(g,{content:w.content,legacyWeather:{type:'rain',targetPower:9,durationFrames:0}});assert.equal(r.state.world.weather.type,'Fog');
});
test('B-T18/T26 load entry retains Flash on dark maps, clears only known non-dark, visits once',()=>{
 const w=make(),g=clone(w.state.current());g.world.flashUsed=true;w.state.replace(g);
 const enter={id:'load-1',cause:'load',previousMapId:1,mapId:1,rebuilt:true};assert.equal(w.app.enterWorldMap(enter).status,'committed');assert.equal(w.state.current().world.flashUsed,true);assert.deepEqual(w.state.current().world.visitedMaps,[1]);
 assert.equal(w.app.enterWorldMap(enter).status,'duplicate');w.map(2);assert.equal(w.app.enterWorldMap({...enter,id:'load-2',mapId:2,previousMapId:2}).status,'committed');assert.equal(w.state.current().world.flashUsed,false);assert.deepEqual(w.state.current().world.healingSpot,{mapId:7,x:3,y:4});
 const unavailable=make({metadata:false}),before=clone(unavailable.state.current());before.world.flashUsed=true;unavailable.state.replace(before);const out=unavailable.app.enterWorldMap(enter);assert.equal(out.status,'committed');assert.ok(out.diagnostics.length);assert.equal(unavailable.state.current().world.flashUsed,true);
});
test('B-R08 same-map/load no draw; p0/p100/>100 cross-map draw once; same final type still draws',()=>{
 for(const chance of [0,100,150]){const draws=[],w=make({random:n=>{draws.push(n);return 99;}});w.content.mapMetadata.maps[2].weather.chance=chance;
  assert.equal(w.app.enterWorldMap({id:'new',cause:'new-game',previousMapId:null,mapId:1,rebuilt:true}).status,'committed');assert.deepEqual(draws,[]);
  w.map(2);w.app.enterWorldMap({id:'load',cause:'load',previousMapId:2,mapId:2,rebuilt:true});assert.deepEqual(draws,[]);
  w.app.enterWorldMap({id:'cross',cause:'transfer',previousMapId:1,mapId:2,rebuilt:true});assert.deepEqual(draws,[100]);assert.equal(w.state.current().world.weather.type,chance===0?'None':'Rain');
  w.app.enterWorldMap({id:'cross2',cause:'transfer',previousMapId:3,mapId:2,rebuilt:true});assert.deepEqual(draws,[100,100]);
 }
});
test('B facts distinguish unavailable mounts/metadata and explicit weather None',()=>{
 const w=make({metadata:false}),facts=w.app.worldFacts();assert.equal(facts.weather.status,'value');assert.equal(facts.weather.value.type,'None');assert.equal(facts.mapMetadata.status,'unavailable');assert.equal(facts.diving.status,'unavailable');assert.equal(facts.cycling.status,'unavailable');assert.equal(facts.surfing.value,false);assert.equal(facts.hour.value,20);
});
test('B field classification covers every required no-target kind and refuses unknown effect families',()=>{
 const catalog=E.itemCatalog.legacyCatalog(),expected={repel:'repel',superrepel:'repel',maxrepel:'repel',blackflute:'flute',whiteflute:'flute',honey:'sweet-scent',escaperope:'escape-rope',oldrod:'fishing',goodrod:'fishing',superrod:'fishing',sacredash:'sacred-ash'};
 for(const[id,kind]of Object.entries(expected))assert.equal(E.fieldItems.classifyFieldItem(catalog[id]).kind,kind);
 assert.equal(E.fieldItems.classifyFieldItem({...catalog.honey,effect:{family:'unknown',parameters:{}}}),null);
});
test('B field repel atomically consumes once, updates count and refuses overlapping effects',async()=>{
 const w=make({bag:{repel:2}}),h=prepare(w,'repel');assert.equal(w.app.saveBlocked,true);assert.equal(w.app.inventoryRequest(h.inventory,'interfere',{kind:'remove-items',itemId:'repel',quantity:1}).reason,'field-item-pending');
 assert.equal(w.app.endInventoryOperation(h.inventory).status,'unchanged');const out=await w.app.runFieldItemHandoff(h.token);assert.equal(out.status,'completed');assert.equal(w.state.current().world.repelSteps,100);assert.equal(w.state.current().stats.repel_count,1);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'repel',w.content.items),1);assert.equal(w.app.saveBlocked,false);
 assert.equal((await w.app.runFieldItemHandoff(h.token)).status,'duplicate');const h2=prepare(w,'repel','second');w.app.endInventoryOperation(h2.inventory);assert.equal((await w.app.runFieldItemHandoff(h2.token)).reason,'repel-active');assert.equal(w.state.current().stats.repel_count,1);
});
test('B absent field and fishing handlers explicitly refuse without consumption',async()=>{
 for(const[id,reason]of [['honey','field-handler-unavailable'],['oldrod','fishing-host-unavailable']]){const w=make({bag:{[id]:1}}),h=prepare(w,id);w.app.endInventoryOperation(h.inventory);assert.equal((await w.app.runFieldItemHandoff(h.token)).reason,reason);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,id,w.content.items),1);assert.equal(w.app.saveBlocked,false);}
});
test('B flute without joint atomic source fails closed with zero RNG, state/local changes or duplicate commits',async()=>{
 for(const level of [false,true])for(const color of ['black','white']){
  let contentReads=0;const id=color+'flute',draws=[],w=make({bag:{[id]:1},onContent(){contentReads++;},random:n=>{draws.push(n);return 0;}});w.content.settings={...w.content.settings,FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS:level};
  const h=prepare(w,id);w.app.endInventoryOperation(h.inventory);const before=clone(w.state.current()),local=clone(w.app.worldLocalState());
  assert.equal((await w.app.runFieldItemHandoff(h.token+'-unissued')).status,'refused');assert.deepEqual(w.state.current(),before);assert.deepEqual(w.app.worldLocalState(),local);
  const result=await w.app.runFieldItemHandoff(h.token);assert.equal(result.status,'failed');assert.equal(result.reason,'fishing-atomic-state-unavailable');const readsAfterFirst=contentReads;assert.deepEqual(await w.app.runFieldItemHandoff(h.token),result);assert.equal(contentReads,readsAfterFirst,'failed receipt is replayed without executing a new content callback');
  assert.deepEqual(draws,[]);assert.deepEqual(w.state.current(),before);assert.deepEqual(w.app.worldLocalState(),local);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,id,w.content.items),1);assert.equal(w.app.saveBlocked,false);
 }
});
test('B completed Honey with no battle consumes; duplicate/concurrent run invoke handler once',async()=>{
 let calls=0,finish;const w=make({bag:{honey:2},handler:async req=>{calls++;req.assertCurrent();return await new Promise(r=>{finish=r;});}}),h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);
 const a=w.app.runFieldItemHandoff(h.token),b=w.app.runFieldItemHandoff(h.token);await Promise.resolve();assert.equal(calls,1);assert.equal(w.app.saveBlocked,true);finish({status:'completed'});assert.equal((await a).status,'completed');await b;assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);assert.equal((await w.app.runFieldItemHandoff(h.token)).status,'duplicate');assert.equal(calls,1);
});
for(const status of ['cancelled','refused','failed'])test(`B handler ${status} releases own lock and does not consume`,async()=>{
 const w=make({bag:{honey:1},handler:async()=>({status,reason:'fixture'})}),h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);assert.equal((await w.app.runFieldItemHandoff(h.token)).status,status);assert.equal(w.app.saveBlocked,false);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);
});
test('B old generation callback cannot mutate the replacement state',async()=>{
 let finish;const w=make({bag:{honey:1},handler:async()=>await new Promise(r=>{finish=r;})}),h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);const pending=w.app.runFieldItemHandoff(h.token);await Promise.resolve();
 w.app.stateReplacedByHost();const fresh=E.state.newGame({content:w.content,party:[],bag:{honey:5}});w.state.replace(fresh);finish({status:'completed'});assert.equal((await pending).reason,'stale-field-item');assert.deepEqual(w.state.current(),fresh);assert.equal(w.app.saveBlocked,false);
});
test('B stale map, tickets and failed state installation never silently consume',async()=>{
 const w=make({bag:{honey:1},handler:async()=>({status:'completed'})}),h=prepare(w,'honey');assert.equal(w.app.prepareFieldItemHandoff(h.inventory,'request',h.ticket).status,'handoff');assert.equal(w.app.prepareFieldItemHandoff(h.inventory,'request',{...h.ticket,index:77}).reason,'request-conflict');w.app.endInventoryOperation(h.inventory);w.map(2);assert.equal((await w.app.runFieldItemHandoff(h.token)).reason,'field-map-changed');assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);
 const v=make({bag:{repel:1}}),j=prepare(v,'repel');v.app.endInventoryOperation(j.inventory);v.state.failReplace=Error('disk-fixture');assert.equal((await v.app.runFieldItemHandoff(j.token)).status,'failed');assert.equal(v.state.current().world.repelSteps,0);assert.equal(v.state.current().stats.repel_count,0);
});
test('B inventory registration has one writer, allows absent stock/handler, keeps ordered uniqueness',()=>{
 const w=make(),token=w.app.beginInventoryOperation();for(const[id,req]of [['potion','r1'],['honey','r2'],['potion','r3']])assert.ok(['committed','unchanged'].includes(w.app.inventoryRequest(token,req,{kind:'register-item',itemId:id,registered:true}).status));
 assert.deepEqual(w.state.current().inventory.registeredItems,['potion','honey']);assert.deepEqual(E.saveSchema.validateGameContent(w.state.current(),w.content),[]);w.app.endInventoryOperation(token);
});
test('B cancellation before UI closes releases its inventory reservation',async()=>{
 const w=make({bag:{honey:1}}),h=prepare(w,'honey');assert.equal(w.app.cancelFieldItemHandoff(h.token).status,'unchanged');
 assert.equal(w.app.inventoryRequest(h.inventory,'register',{kind:'register-item',itemId:'honey',registered:true}).status,'committed');
 w.app.endInventoryOperation(h.inventory);assert.equal((await w.app.runFieldItemHandoff(h.token)).status,'cancelled');assert.equal(w.app.saveBlocked,false);
});
test('B handler exception or malformed result is terminal, releases lock and retains stock',async()=>{
 for(const handler of [async()=>{throw Error('fixture-presenter');},async()=>({status:'failed',reason:7}),async()=>({status:'invented'})]){
  const w=make({bag:{honey:1},handler}),h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);const first=await w.app.runFieldItemHandoff(h.token);
  assert.equal(first.status,'failed');assert.equal(w.app.saveBlocked,false);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);assert.deepEqual(await w.app.runFieldItemHandoff(h.token),first);
 }
});
test('B nonconsumable field handler completes without consuming, and executing before closing UI does no effect',async()=>{
 let calls=0;const w=make({bag:{honey:1},handler:async()=>{calls++;return {status:'completed'};}});w.content.items.honey.consumable=false;const h=prepare(w,'honey');
 assert.equal((await w.app.runFieldItemHandoff(h.token)).reason,'inventory-not-closed');assert.equal(calls,0);w.app.endInventoryOperation(h.inventory);
 const h2=prepare(w,'honey','next');w.app.endInventoryOperation(h2.inventory);assert.deepEqual(await w.app.runFieldItemHandoff(h2.token),{status:'completed',itemId:'honey',consumed:false});assert.equal(calls,1);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);
});
// Rod success now uses the real parent/atomic/MZ host in test-fishing-real-parent.cjs.
test('B generic field handler cannot impersonate a fishing operation', async () => {
 let calls=0;const w=make({bag:{oldrod:1},handler:async()=>{calls++;return {status:'completed'};}}),h=prepare(w,'oldrod');w.app.endInventoryOperation(h.inventory);
 assert.deepEqual(await w.app.runFieldItemHandoff(h.token),{status:'refused',reason:'fishing-host-unavailable'});assert.equal(calls,0);assert.equal(w.state.current().stats.fishing_count,0);
});
test('B provider-driven generation replacement retires preparation before it captures a new owner',()=>{
 let w,replace=false;w=make({bag:{honey:1},onRead:()=>{if(replace){replace=false;w.app.stateReplacedByHost();}}});
 const inventory=w.app.beginInventoryOperation(),ticket=w.app.inventoryTicket(inventory,1,0);replace=true;
 assert.equal(w.app.prepareFieldItemHandoff(inventory,'r',ticket).status,'refused');assert.equal(w.app.saveBlocked,false);
});
test('B connection same weather retains strength but writes independent duration20',()=>{
 const draws=[],w=make({random:n=>{draws.push(n);return 0;}});assert.equal(w.app.setWorldWeather({type:'Rain',strength:42,durationFrames:3}).status,'committed');w.map(2);
 assert.equal(w.app.enterWorldMap({id:'connection',cause:'connection',previousMapId:1,mapId:2,rebuilt:false}).status,'committed');assert.deepEqual(w.state.current().world.weather,{type:'Rain',strength:42,durationFrames:20});assert.deepEqual(draws,[100]);
});
test('B weather validation, active-operation guard and fact reads do not consume business RNG',()=>{
 const draws=[],w=make({bag:{honey:1},random:n=>{draws.push(n);return 0;}});assert.equal(w.app.setWorldWeather({type:'Rain',strength:61,durationFrames:0}).status,'refused');
 for(let i=0;i<100;i++)w.app.worldFacts();assert.deepEqual(draws,[]);
 const h=prepare(w,'honey');assert.equal(w.app.setWorldWeather({type:'None',strength:0,durationFrames:20}).status,'queued');assert.equal(w.state.current().world.weather.durationFrames,0);w.app.cancelFieldItemHandoff(h.token);w.app.endInventoryOperation(h.inventory);assert.equal(w.state.current().world.weather.durationFrames,20);assert.deepEqual(draws,[]);
});
test('B request IDs belong to each inventory session; receipt bounds never limit valid repeated uses',async()=>{
 const w=make({bag:{honey:1},handler:async()=>({status:'completed'})});w.content.items.honey.consumable=false;let oldToken;
 for(let i=0;i<260;i++){const h=prepare(w,'honey','same-local-id');oldToken??=h.token;w.app.endInventoryOperation(h.inventory);assert.equal((await w.app.runFieldItemHandoff(h.token)).status,'completed');}
 assert.equal((await w.app.runFieldItemHandoff(oldToken)).status,'refused');assert.equal(w.app.saveBlocked,false);
});
test('B running field common-event weather writes remain authoritative through final inventory commit',async()=>{
 let w;w=make({bag:{honey:1},handler:async req=>{req.assertCurrent();assert.equal(w.app.setWorldWeather({type:'Rain',strength:6,durationFrames:20}).status,'committed');return {status:'completed'};}});
 const h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);assert.equal((await w.app.runFieldItemHandoff(h.token)).status,'completed');assert.deepEqual(w.state.current().world.weather,{type:'Rain',strength:6,durationFrames:20});assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),0);
});
test('B consumed world configuration keeps Gen8 defaults and signed negative no-badge/common-event inputs',()=>{
 const c=E.config.resolveConfig();for(const key of ['REPEL_COUNTS_FAINTED_POKEMON','MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS','HIGHER_SHINY_CHANCES_WITH_NUMBER_BATTLED','LEGENDARIES_HAVE_SOME_PERFECT_IVS','FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS','OVERWORLD_WEATHER_SETS_BATTLE_TERRAIN'])assert.equal(c[key],true);
 assert.equal(c.POISON_IN_FIELD,false);assert.equal(c.POISON_FAINT_IN_FIELD,false);assert.equal(c.FISHING_AUTO_HOOK,false);
 assert.equal(E.config.resolveConfig({BADGE_FOR_FLASH:-5,FISHING_BEGIN_COMMON_EVENT:-7}).BADGE_FOR_FLASH,-5);
 assert.ok(E.config.checkOverrides({TIME_SHADING:'false'}).length);assert.ok(E.config.checkOverrides({BADGE_FOR_FLASH:1.5}).length);
});

function pendingReturn(){return {id:'return-1',origin:{kind:'field',sourceId:'poison-step-1'},selection:{branch:'home',target:{mapId:1,x:2,y:3,direction:2}},phase:'ready',branch:'home'};}
test('B-R2 return checkpoint scalars are strict JSON types; invalid source remains unchanged',()=>{
 const w=make(),valid=clone(w.state.current());valid.world.pendingReturn=pendingReturn();assert.deepEqual(E.saveSchema.validateGameContent(valid,w.content),[]);
 const cases=[['branch',['home']],['phase',['ready']],['id',['return-1']],['origin.kind',['field']],['origin.sourceId',['poison-step-1']],['selection.target.mapId','1'],['selection.target.x','2'],['selection.target.y','3'],['selection.target.direction','2']];
 for(const [key,value] of cases){const raw=clone(valid),parts=key.split('.');let field=raw.world.pendingReturn;for(const part of parts.slice(0,-1))field=field[part];field[parts.at(-1)]=value;
  const before=clone(raw);assert.ok(E.saveSchema.validateGameContent(raw,w.content).length,key);assert.equal(E.saveSchema.migrateGame(F.freeze(raw),{content:w.content}).ok,false,key);assert.deepEqual(raw,before,key);
 }
 const battle=clone(valid);battle.world.pendingReturn.origin={kind:'battle',battleId:['battle'],rawHash:['a'.repeat(64)]};assert.ok(E.worldState.worldStateProblems(battle.world).length);
});
test('B-R1 running cancel releases only its owner and late completion cannot consume or retire the next owner',async()=>{
 const requests=[],finishes=[];const w=make({bag:{honey:3},handler:req=>{requests.push(req);return new Promise(resolve=>finishes.push(resolve));}}),first=prepare(w,'honey');w.app.endInventoryOperation(first.inventory);
 const old=w.app.runFieldItemHandoff(first.token);await Promise.resolve();assert.equal(requests.length,1);assert.equal(w.app.cancelFieldItemHandoff(first.token).status,'unchanged');assert.equal(w.app.saveBlocked,false);assert.throws(()=>requests[0].assertCurrent(),/field-item-cancelled/);
 assert.equal(w.app.cancelFieldItemHandoff(first.token).status,'duplicate');assert.equal((await w.app.runFieldItemHandoff(first.token)).status,'cancelled');
 const next=prepare(w,'honey','next');w.app.endInventoryOperation(next.inventory);const fresh=w.app.runFieldItemHandoff(next.token);await Promise.resolve();assert.equal(requests.length,2);assert.equal(w.app.saveBlocked,true);
 assert.equal(w.app.cancelFieldItemHandoff(first.token).status,'duplicate');requests[1].assertCurrent();finishes[0]({status:'completed'});assert.equal((await old).status,'cancelled');assert.equal(w.app.saveBlocked,true);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),3);
 finishes[1]({status:'completed'});assert.equal((await fresh).status,'completed');assert.equal(w.app.saveBlocked,false);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),2);
});
test('B-R1 cancellation before scheduled execution never invokes the handler',async()=>{
 let calls=0;const w=make({bag:{honey:1},handler:async()=>{calls++;return {status:'completed'};}}),h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);
 const pending=w.app.runFieldItemHandoff(h.token);assert.equal(w.app.cancelFieldItemHandoff(h.token).status,'unchanged');assert.equal((await pending).status,'cancelled');assert.equal(calls,0);assert.equal(w.app.saveBlocked,false);
});
test('B-R3 queued and running world owners reject competing app writers; cancellation permits a new Pokedex update',async()=>{
 let finish;const w=make({bag:{honey:1},handler:()=>new Promise(resolve=>{finish=resolve;})}),h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);
 const writes=()=>[w.app.updatePokedex({kind:'entitlement',value:true}),w.app.beginLearning({kind:'forget',memberId:'absent'}),w.app.beginEventEvolution({}),w.app.beginTrade('competing',{outgoingId:'absent',incoming:{species:'A'}})];
 const before=clone(w.state.current());for(const r of writes())assert.deepEqual(r,{status:'refused',reason:'operation-active'});assert.deepEqual(w.state.current(),before);
 const pending=w.app.runFieldItemHandoff(h.token);await Promise.resolve();for(const r of writes())assert.deepEqual(r,{status:'refused',reason:'operation-active'});assert.deepEqual(w.state.current(),before);
 w.app.cancelFieldItemHandoff(h.token);assert.equal(w.app.updatePokedex({kind:'entitlement',value:true}).status,'applied');assert.equal(w.state.current().dex.hasDex,true);finish({status:'completed'});assert.equal((await pending).status,'cancelled');assert.equal(w.state.current().dex.hasDex,true);
});
test('B-R3 map entry and handoff preparation reserve before host read; reentrant Pokedex writes are refused',()=>{
 for(const operation of ['entry','prepare']){let w,armed=false,result;w=make({bag:{honey:1},onRead:()=>{if(armed){armed=false;result=w.app.updatePokedex({kind:'entitlement',value:true});}}});armed=true;
  if(operation==='entry')assert.equal(w.app.enterWorldMap({id:'entry',cause:'new-game',previousMapId:null,mapId:1,rebuilt:true}).status,'committed');else{const h=prepare(w,'honey');w.app.cancelFieldItemHandoff(h.token);w.app.endInventoryOperation(h.inventory);}
  assert.deepEqual(result,{status:'refused',reason:'operation-active'});assert.equal(w.state.current().dex.hasDex,false);assert.equal(w.app.updatePokedex({kind:'entitlement',value:true}).status,'applied');assert.equal(w.state.current().dex.hasDex,true);
 }
});

// Each path reaches install's content check and then the final validating state wrapper.
// Counts start after handoff preparation (or after the asynchronous handler completes).
for(const [operation,checks] of [['weather',[1,2]],['entry',[2,3]],['honey',[2,3]],['repel',[3,4]],['sacredash',[3,4]]])for(const [index,at] of checks.entries())test(`B-R1 final ${index?'replace':'install'} content callback cannot replace the generation during ${operation}`,async()=>{
 let w,armed=false,reads=0,fresh;const content=F.content(E),bag=operation==='sacredash'?{sacredash:2}:{honey:2,repel:2};const game=E.state.newGame({content,party:operation==='sacredash'?[F.member('M1',{friendship:127})]:[],bag,money:123});
 w=make({game,handler:async()=>{armed=true;reads=0;return {status:'completed'};},onContent:()=>{if(armed&&++reads===at){armed=false;w.app.stateReplacedByHost();w.state.replace(E.state.newGame({content:w.content,party:[],bag:{honey:5,repel:5},money:777}));w.map(3);assert.equal(w.app.enterWorldMap({id:'successor',cause:'load',previousMapId:3,mapId:3,rebuilt:true}).status,'committed');assert.equal(w.app.setWorldWeather({type:'Fog',strength:18,durationFrames:7}).status,'committed');fresh=clone(w.state.current());}}});
 let outcome;if(operation==='weather'){armed=true;outcome=w.app.setWorldWeather({type:'Rain',strength:6,durationFrames:20});}else if(operation==='entry'){w.map(2);armed=true;outcome=w.app.enterWorldMap({id:'retired-entry',cause:'transfer',previousMapId:1,mapId:2,rebuilt:true});}else{const h=prepare(w,operation);w.app.endInventoryOperation(h.inventory);if(operation!=='honey')armed=true;outcome=await w.app.runFieldItemHandoff(h.token);}
 assert.ok(fresh,'final callback executed');assert.ok(['refused','failed'].includes(outcome.status),JSON.stringify(outcome));assert.deepEqual(w.state.current(),fresh);assert.equal(w.app.saveBlocked,false);
 if(operation==='entry'){w.map(2);assert.equal(w.app.enterWorldMap({id:'retired-entry',cause:'transfer',previousMapId:1,mapId:2,rebuilt:true}).status,'committed','retired entry must not poison new-generation receipts');}
});
for(const [item,checks] of [['honey',[2,3]],['repel',[3,4]],['sacredash',[3,4]]])for(const [index,at] of checks.entries())test(`B-R1 ${item} cancellation during final ${index?'replace':'install'} validation preserves its successor`,async()=>{
 let w,armed=false,reads=0,next,old;const content=F.content(E),game=E.state.newGame({content,party:item==='sacredash'?[F.member('M1',{friendship:127})]:[],bag:{[item]:2,honey:2},money:123});
 w=make({game,handler:async()=>{armed=true;reads=0;return {status:'completed'};},onContent:()=>{if(armed&&++reads===at){armed=false;assert.equal(w.app.cancelFieldItemHandoff(old.token).status,'unchanged');next=prepare(w,'honey','successor');w.app.endInventoryOperation(next.inventory);}}});
 old=prepare(w,item);w.app.endInventoryOperation(old.inventory);const before=clone(w.state.current());if(item!=='honey')armed=true;assert.equal((await w.app.runFieldItemHandoff(old.token)).status,'cancelled');assert.ok(next);assert.deepEqual(w.state.current(),before);assert.equal(w.app.saveBlocked,true);assert.equal(w.app.cancelFieldItemHandoff(old.token).status,'duplicate');assert.equal(w.app.cancelFieldItemHandoff(next.token).status,'unchanged');assert.equal(w.app.saveBlocked,false);
});
test('B-R1 running handler weather write refuses a cancelled field owner at final validation',async()=>{
 let w,h,armed=false,reads=0,result;w=make({bag:{honey:2},onContent:()=>{if(armed&&++reads===2){armed=false;assert.equal(w.app.cancelFieldItemHandoff(h.token).status,'unchanged');}},handler:async()=>{armed=true;result=w.app.setWorldWeather({type:'Rain',strength:6,durationFrames:20});return {status:'completed'};}});
 h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);const before=clone(w.state.current());assert.equal((await w.app.runFieldItemHandoff(h.token)).status,'cancelled');assert.equal(result.status,'refused');assert.deepEqual(w.state.current(),before);assert.equal(w.app.saveBlocked,false);
});

// The actual Content returned by each validator is the authority, including a replacement
// object whose author-supplied meta ID still claims the same value.
for(const [item,checks] of [['honey',[2,3]],['repel',[3,4]],['sacredash',[3,4]]])for(const [index,at] of checks.entries())for(const mode of ['in-place','replacement'])test(`B-R4 ${item} ${mode} content change at ${index?'replace':'install'} validation retires its ticket`,async()=>{
 let w,armed=false,reads=0,changed;const content=F.content(E),game=E.state.newGame({content,party:item==='sacredash'?[F.member('M1',{friendship:127})]:[],bag:{[item]:2},money:123});
 w=make({game,handler:async()=>{armed=true;reads=0;return {status:'completed'};},onContent:()=>{if(armed&&++reads===at){armed=false;changed=mode==='replacement'?clone(w.content):w.content;changed.items[item].consumable=false;return changed;}}});
 w.content.meta={kind:'fixture',id:'final-content',inputsHash:'a'.repeat(64),showdownSha:'b'.repeat(40),compiledSemantics:5,contentIdentity:'c'.repeat(64)};
 const h=prepare(w,item);w.app.endInventoryOperation(h.inventory);const before=clone(w.state.current());if(item!=='honey')armed=true;
 const result=await w.app.runFieldItemHandoff(h.token);assert.ok(changed);assert.equal(result.status,'failed');assert.equal(result.reason,'field-item-stale');assert.equal(changed.meta.contentIdentity,w.content.meta.contentIdentity,'unchanged declared ID does not reauthorize changed contents');assert.deepEqual(w.state.current(),before);assert.equal(w.app.saveBlocked,false);assert.deepEqual(await w.app.runFieldItemHandoff(h.token),result);
});
for(const at of [2,3])for(const mode of ['in-place','replacement'])test(`B-R4 entry ${mode} returned content change at callback ${at} cannot install old metadata or receipt`,()=>{
 let w,armed=false,reads=0,changed;w=make({onContent:()=>{if(armed&&++reads===at){armed=false;changed=mode==='replacement'?clone(w.content):w.content;changed.mapMetadata.maps[2].weather.type='Snow';return changed;}}});w.map(2);const before=clone(w.state.current()),entry={id:'content-entry',cause:'transfer',previousMapId:1,mapId:2,rebuilt:true};armed=true;
 const result=w.app.enterWorldMap(entry);assert.ok(changed);assert.deepEqual(result,{status:'refused',reason:'world-content-changed'});assert.deepEqual(w.state.current(),before);assert.equal(w.app.saveBlocked,false);assert.equal(w.app.enterWorldMap(entry).status,'committed','rejected old entry must not leave a success receipt');assert.equal(w.state.current().world.weather.type,mode==='in-place'?'Snow':'Rain');
});
for(const mode of ['in-place','replacement'])test(`B-R4 weather ${mode} final returned content must match its first validated content`,()=>{
 let w,armed=false,reads=0,changed;w=make({onContent:()=>{if(armed&&++reads===2){armed=false;changed=mode==='replacement'?clone(w.content):w.content;changed.items.honey.consumable=false;return changed;}}});const before=clone(w.state.current());armed=true;
 assert.deepEqual(w.app.setWorldWeather({type:'Rain',strength:6,durationFrames:20}),{status:'refused',reason:'world-content-changed'});assert.ok(changed);assert.deepEqual(w.state.current(),before);assert.equal(w.app.saveBlocked,false);
});
test('B-R4 semantically identical returned content remains valid without another content callback',async()=>{
 let w,armed=false,reads=0;w=make({bag:{honey:2},handler:async()=>{armed=true;reads=0;return {status:'completed'};},onContent:()=>{if(armed&&++reads===3)return clone(w.content);}});
 const h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);const result=await w.app.runFieldItemHandoff(h.token);assert.equal(result.status,'completed');assert.equal(result.consumed,true);assert.equal(reads,3,'guard must use actual checked Content, not reopen ContentPort');assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);assert.equal((await w.app.runFieldItemHandoff(h.token)).status,'duplicate');assert.equal(reads,3);assert.equal(w.app.saveBlocked,false);
});
for(const mode of ['cancel','generation'])test(`B-R4 content changes plus ${mode} still preserve zero old writes`,async()=>{
 let w,h,armed=false,reads=0,fresh;w=make({bag:{honey:2},handler:async()=>{armed=true;return {status:'completed'};},onContent:()=>{if(armed&&++reads===3){armed=false;w.content.items.honey.consumable=false;if(mode==='cancel')assert.equal(w.app.cancelFieldItemHandoff(h.token).status,'unchanged');else{w.app.stateReplacedByHost();w.state.replace(E.state.newGame({content:w.content,party:[],bag:{honey:5},money:777}));}fresh=clone(w.state.current());}}});
 h=prepare(w,'honey');w.app.endInventoryOperation(h.inventory);const result=await w.app.runFieldItemHandoff(h.token);assert.ok(fresh);assert.equal(result.status,mode==='cancel'?'cancelled':'failed');assert.deepEqual(w.state.current(),fresh);assert.equal(w.app.saveBlocked,false);
});

// Formal runtime gates for the schema-11 checkpoint, independent of the load-host transport stub.
test('B exact supported versions, schema10 whole-state migration and current no-op retain all preexisting fields',()=>{
 const w=make(),current=clone(w.state.current());assert.equal(E.state.GAME_SCHEMA,12);
 assert.deepEqual(E.saveSchema.SUPPORTED_SCHEMAS,[1,2,3,4,5,6,7,8,9,10,11,12]);
 const legacy=clone(current);legacy.schema=10;delete legacy.hallOfFame;const before=clone(legacy),migrated=E.saveSchema.migrateGame(F.freeze(legacy),{content:w.content});
 assert.equal(migrated.ok,true,JSON.stringify(migrated));assert.deepEqual([migrated.from,migrated.to,migrated.migrated],[10,12,true]);
 assert.deepEqual(migrated.state,{...current,hallOfFame:null});assert.deepEqual(legacy,before);
 const noOp=E.saveSchema.migrateGame(F.freeze(current),{content:w.content});assert.equal(noOp.ok,true,JSON.stringify(noOp));
 assert.deepEqual([noOp.from,noOp.to,noOp.migrated],[12,12,false]);assert.deepEqual(noOp.state,current);
 for(const schema of [13,14,99]){const raw={...clone(current),schema},saved=clone(raw),result=E.saveSchema.migrateGame(F.freeze(raw),{content:w.content});assert.equal(result.ok,false);assert.equal(result.error.code,'unknown-version');assert.deepEqual(raw,saved);}
});
test('B current schema rejects schema10 checkpoint fields and malformed phase at validate, snapshot and migrate gates',()=>{
 const w=make();for(const checkpoint of [
  {id:'old-shape',origin:{kind:'field',sourceId:'field'},branch:'home',target:{mapId:1,x:2,y:3,direction:2},stage:'ready'},
  {...pendingReturn(),phase:'invented'},
 ]){const raw=clone(w.state.current());raw.world.pendingReturn=checkpoint;const before=clone(raw);
  assert.ok(E.saveSchema.validateGameContent(raw,w.content).some(problem=>problem.path.includes('pendingReturn')));
  assert.equal(E.saveSchema.snapshotForSave(raw,w.content).ok,false);
  const rejected=E.saveSchema.migrateGame(F.freeze(raw),{content:w.content});assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'invalid');assert.deepEqual(raw,before);
 }
});

// E3 now owns Escape Rope. A generic B item callback cannot impersonate travel.
test('B Escape Rope with a real native atomic slot refuses missing E3 instead of invoking the generic handler',async()=>{
 require('./regular-field-action-test-runtime.cjs').prepare('atomic');const {types}=require('node:util');const {createMZAtomicStatePort}=require(path.join(process.env.PF_E1_PARENT_OUT,'src/plugins/world/atomic-state-mz.js'));
 const content=F.content(E),game=E.state.newGame({content,party:[],bag:{escaperope:1}}),root={$gameSystem:{_psGame:game},$gameMap:{_mapId:1},$gamePlayer:{_x:0,_y:0},SceneManager:{_scene:{}}};let generic=0;
 const raw={read:()=>root.$gameSystem._psGame,replace:next=>{root.$gameSystem._psGame=next;}},state=createMZAtomicStatePort(root,raw,types.isProxy);
 const app=new E.app.GameApplication({state,content:()=>({content}),projection:{project(){}},sessions:{async create(){assert.fail('no battle');}},worldHost:{read:()=>({mapId:{status:'value',value:1},hour:{status:'value',value:20}})},fieldItems:{execute:async()=>{generic++;return{status:'completed'};}}});
 const w={app,content,state:{current:raw.read}},h=prepare(w,'escaperope');app.endInventoryOperation(h.inventory);const before=clone(raw.read()),out=await app.runFieldItemHandoff(h.token);assert.equal(out.status,'failed');assert.equal(out.reason,'world-travel-host-or-atomic-unavailable');assert.equal(generic,0);assert.deepEqual(raw.read(),before);assert.equal(app.saveBlocked,false);
});
