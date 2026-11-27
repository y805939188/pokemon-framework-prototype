'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{types}=require('node:util');
const out=process.env.PF_E2_PARENT_OUT;assert(out,'PF_E2_PARENT_OUT required');
const E=require(process.env.PF_E2_PARENT_ENGINE),F=require('../saves/legacy-migration/fixtures.cjs'),Leaf=require('./field-move-app-fixtures.cjs');
const {createMZAtomicStatePort}=require(path.join(out,'src/plugins/world/atomic-state-mz.js'));
const value=value=>({status:'value',value}),copy=x=>structuredClone(x),flush=()=>new Promise(setImmediate);
function fixture(options={}){
 let h,app,armed=false,commits=0,stepSequence=0;const stepHostOwner={};
 const native=Leaf.fixture({moveId:options.moveId??'cut',onAnimate(){options.onAnimate?.(h);},onText(kind){options.onText?.(kind,h);},onFrame(){options.onFrame?.(h);},onExpand(){options.onExpand?.(h);}}),root=native.root;
 const content=options.content??F.content(E);if(!options.content){content.moves.tackle=content.moves.Tackle;for(const id of ['cut','rocksmash','sweetscent','strength','surf','flash'])content.moves[id]={id,name:id,pp:30};for(const [name,s]of Object.entries(content.species)){s.ruleSpecies='Fixture'+name;s.types=['Normal'];s.wildItemCommon=[];s.wildItemUncommon=[];s.wildItemRare=[];}content.mapMetadata={source:'fixture',maps:{7:{environment:'grass',darkMap:true},8:{weather:{type:'Rain',chance:100},healingSpot:{mapId:8,x:1,y:1}}}};content.world={encounters:{source:'fixture',tables:[{mapId:7,version:0,types:options.noTable?{}:{Land:{stepChance:100,slots:[{species:'A',weight:100,minLevel:5,maxLevel:5}]},RockSmash:{stepChance:100,slots:[{species:'A',weight:100,minLevel:5,maxLevel:5}]}}}]}};}
 options.editContent?.(content);const loadedContent={current:content};
 const party=options.party??[F.member('P1',{hp:20,friendship:70,moves:[{id:options.moveId??'cut',pp:0,maxpp:30,ppUps:0}]})];
 root.$gameSystem={_psGame:E.state.newGame({content,party,bag:{honey:2,...options.bag}})};root.$gameSystem._psGame.badges=Array(8).fill(true);options.editState?.(root.$gameSystem._psGame);
 const state=()=>root.$gameSystem._psGame,writes=[],sessions=[],draws=[];
 const ctx=()=>({app,root,state:state(),content,armed,commits});
 const legacy={read(){options.onRead?.(ctx());return state();},replace(next){writes.push(next);root.$gameSystem._psGame=next;}};
 root.PSFlow={_app:null,_content:content};
 const nativeStart=require('./field-parent-native-start.cjs').prepare(root,out,()=>({application:app,game:state(),content:loadedContent.current}));
 const atomic=createMZAtomicStatePort(root,legacy,types.isProxy,{owner:loadedContent,key:'current'},nativeStart.travel.host.nativeLeaseSource);
 native.ports.nativeJump=(player,x,y)=>nativeStart.movement.ownedFieldJump(native.lastHostOperation,player,x,y);
 const host={...native.host};const run=host.run;host.run=(plan,operation)=>{options.onRun?.(plan,operation,h);return run(plan,operation);};
 app=new E.app.GameApplication({wildGeneration:{switchOn:options.wildSwitch??(()=>({status:'value',value:false}))},state:atomic,worldTravel:nativeStart.travel.host,...(options.worldBattleScene?{worldBattleScene:options.worldBattleScene}:{}),content(){options.onContent?.(ctx());return {content:loadedContent.current,dex:options.dex};},sessions:options.sessions??{async create(request,game,setup){const handle={};sessions.push({request,game,setup,handle});return handle;}},projection:{project(){}},clock:options.clock??(()=>1000),random(n){draws.push(n);options.onRandom?.(ctx());return options.random?options.random(n,draws.length):0;},
  worldHost:{read(){options.onWorld?.(ctx());return {mapId:value(root.$gameMap.mapId()),hour:value(options.hour??21),cycling:value(false),diving:value(false)};}},fieldMoves:host,
  fieldEncounters:{read(){options.onEncounterFacts?.(ctx());return {landAllowed:value(true),encountersDisabled:value(options.disabled===true),debugControl:value(false),groundEnvironment:value('grass')};}},
  ...(options.completedSteps?{completedSteps:{current(){return {hostOwner:stepHostOwner,generation:app.stateGeneration,player:root.$gamePlayer,map:root.$gameMap,mapId:root.$gameMap.mapId(),x:root.$gamePlayer.x,y:root.$gamePlayer.y};},async openRepelSelection(){return {status:'cancelled'};},async present({effect}){return {id:effect.id,status:'completed'};},dispatchArrival(request){options.onArrival?.(request,ctx());return options.arrival??{status:'ordinary-opportunity'};}},ordinaryEncounters:{read(){return {landAllowed:value(true),encountersDisabled:value(false),debugControl:value(false),groundEnvironment:value('grass')};}}}:{}),
 });
 root.PSFlow._app=app;
 const original=app.world.runFieldMoveChild.bind(app.world);app.world.runFieldMoveChild=(owner,action)=>{const result=original(owner,action),child=owner.move;if(child){const commit=child.options.commit;child.options.commit=(update,current)=>{armed=true;commits++;try{options.onCommit?.(update,h);return commit(update,current);}finally{armed=false;}};}return result;};
 h={E,app,root,native,nativeStart,content,writes,sessions,draws,host,get state(){return state();},get commits(){return commits;},get records(){return copy(app.world.records);},get local(){return app.world.localState;},get surf(){return app.worldFieldRuntime();},
  complete(alreadyMoved=false){if(!alreadyMoved)root.$gamePlayer._x++;const current={hostOwner:stepHostOwner,generation:app.stateGeneration,player:root.$gamePlayer,map:root.$gameMap,mapId:root.$gameMap.mapId(),x:root.$gamePlayer.x,y:root.$gamePlayer.y};return app.completeWorldStep({...current,id:'actual-step-'+(++stepSequence),sceneActive:true,ice:false,regionId:0,terrainTag:0});},
  run(action={kind:'use',moveId:options.moveId??'cut',entry:options.entry??'party',memberId:'P1'},id='move'){return app.runFieldMove(id,action);},cancel(id='move'){return app.cancelFieldMove(id);},
  external(change){const next=copy(state());change(next);root.$gameSystem._psGame=next;},actual(next){loadedContent.current=next;root.PSFlow._content=next;},replaceGeneration(){app.stateReplacedByHost();},
  prepareHoney(){const inventory=app.beginInventoryOperation(),snapshot=app.inventorySnapshot(inventory),pocket=snapshot.pockets.findIndex(rows=>rows.some(row=>row.item.id==='honey')),row=snapshot.pockets[pocket].find(r=>r.item.id==='honey');const ticket=app.inventoryTicket(inventory,pocket+1,row.index),result=app.prepareFieldItemHandoff(inventory,'honey',ticket);assert.equal(result.status,'handoff');app.endInventoryOperation(inventory);return result.handoff.token;},flush,
 };return h;
}
module.exports={fixture,copy,value};
