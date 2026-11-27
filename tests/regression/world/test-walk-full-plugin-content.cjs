'use strict';
// Full product IIFEs + actual native moveStraight/atomic START. Rendering/device/save I/O remain controlled.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'../../..'),runtime=process.env.PF_WALK_PLUGIN_RUNTIME||ROOT;
const objects=process.env.PF_MZ_RUNTIME||process.env.PF_MZ_RUNTIME_OBJECTS||path.join(ROOT,'js/reactor_objects.js');
let bundles=process.env.PF_WALK_PLUGIN_BUNDLES;
if(!bundles){
 bundles=fs.mkdtempSync(path.join(os.tmpdir(),'pf-walk-full-plugin-'));
 for(const name of ['PS_BattleFlow','PS_Inventory','PS_World'])fs.symlinkSync(path.join(ROOT,'js/plugins',name+'.js'),path.join(bundles,name+'.js'));
 fs.symlinkSync(path.join(ROOT,'js/engine/build/production.cjs'),path.join(bundles,'production.cjs'));
}
process.env.PF_E3_JOINT_OUT=bundles;process.env.PF_E3_NATIVE_ROOT=path.dirname(path.dirname(objects));process.env.PF_MZ_RUNTIME=objects;
const E=require(path.join(bundles,'production.cjs')),{fixture:base,flush}=require('../../../experiments/step5/5/ui-wire-e3-fixtures.cjs');
const records=[];
test.after(()=>{if(process.env.PF_WALK_EVIDENCE)fs.writeFileSync(process.env.PF_WALK_EVIDENCE,JSON.stringify({node:process.version,bundles,runtime,objects,records,limits:['Offline complete IIFEs/native methods, controlled DOM/PIXI/device/save I/O; not NW frames','Short samples collected alongside another lane; wall-clock tails are observations, not isolated performance certification']},null,2)+'\n');});
function native(G,name,unit='scenes'){
 const text=fs.readFileSync(path.join(path.dirname(objects),'reactor_'+unit+'.js'),'utf8');
 const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a);
 vm.runInContext(text.slice(a,b+4),G,{filename:'pinned-walk:'+name});
}
async function fixture({compiledContentFile}={}){
 const source=fs.readFileSync(path.join(bundles,'PS_BattleFlow.js'),'utf8'),run=vm.runInContext;
 let executions=0,contentReads=0,h;
 // Resolve the runtime-relative resource path and substitute only the grant test's compiled input file.
 vm.runInContext=function(code,G,options){
  if(code===source){
   executions++;
   if(compiledContentFile){
    const req=G.require,normalContent=path.join(runtime,'data/framework/content.json');
    G.require=name=>name==='fs'?{...fs,readFileSync(file,...args){
     if(file===normalContent){contentReads++;file=compiledContentFile;}
     return fs.readFileSync(file,...args);
    }}:req(name);
   }
   G.require.resolve=name=>name==='./js/engine/build/production.cjs'?path.join(runtime,'js/engine/build/production.cjs'):require.resolve(name);
  }
  return Reflect.apply(run,this,[code,G,options]);
 };
 try{
  h=await base({defaultProduction:true,edit(game){game.party=[];},nativeSetup(n){
   const G=n.G;
   if(compiledContentFile){
    G.PluginManager._commands={};
    for(const name of ['registerCommand','callCommand'])native(G,'PluginManager.'+name,'managers');
   }
   native(G,'Scene_Map.prototype.isReady');
   G.Scene_Message.prototype.isReady=()=>true;G.DataManager.isMapLoaded=()=>!!G.$dataMap;
   const display=G.Scene_Map.prototype.createDisplayObjects;
   G.Scene_Map.prototype.createDisplayObjects=function(...args){
    const r=Reflect.apply(display,this,args);this.children=[];this._windowLayer={};this._messageWindow={};return r;
   };
  }});
 }finally{vm.runInContext=run;}
 assert.equal(executions,1,'complete product PS_BattleFlow IIFE must execute');
 const {G,flow,app}=h,notices=[];const warn=G.console.warn;G.console={...G.console,warn(...args){notices.push(args.map(String).join(' '));return Reflect.apply(warn,console,args);}};
 // Loader ownership has its own gate. Keep this probe focused on scans in the actual walk.
 flow._content=null;const content=flow.content();
 if(compiledContentFile)assert.equal(contentReads,1,'actual compiled loader reads the private JSON');
 G.$gameSystem._psGame=E.state.newGame({party:[],bag:{},content});app.stateReplacedByHost();
 const data=JSON.parse(fs.readFileSync(path.join(runtime,'data/Map005.json'),'utf8'));data.meta={PSEncounter:'regions=1;pidgey,60,2-4;caterpie,40,2-4'};
 for(const event of data.events)if(event)event.meta={};
 G.$dataTilesets=JSON.parse(fs.readFileSync(path.join(runtime,'data/Tilesets.json'),'utf8'));G.$dataMap=data;
 G.DataManager.loadMapData=id=>{assert.equal(id,5,'ordinary route must not transfer');G.$dataMap=data;};
 G.$gameMap.setup(5);G.$gamePlayer.locate(8,9);G.$gamePlayer.setDirection(6);G.$gamePlayer._encounterCount=10000;
 const old=G.SceneManager._scene;G.SceneManager.goto(G.Scene_Map);
 await h.pump(()=>G.SceneManager._scene!==old&&G.SceneManager._scene.isStarted()&&!app.saveBlocked&&!G.PSWorld.pending());
 assert.equal(G.$gameMap.mapId(),5);assert.deepEqual([h.player.x,h.player.y],[8,9]);
 const move=async(direction,onFrame)=>{
  const before=[h.player.x,h.player.y],startSteps=h.state().steps;G.Input.dir4=direction;
  let started=false;
  for(let frame=0;frame<80;frame++){
   const prior=[h.player.x,h.player.y],wasMoving=h.player.isMoving(),a=performance.now();h.tick();const sync=performance.now();await flush();const end=performance.now();
   const changed=h.player.x!==before[0]||h.player.y!==before[1];if(changed){started=true;G.Input.dir4=0;}
   onFrame?.({syncMs:sync-a,totalMs:end-a,started:prior[0]!==h.player.x||prior[1]!==h.player.y,movingBefore:wasMoving,completed:wasMoving&&!h.player.isMoving(),x:h.player.x,y:h.player.y,steps:h.state().steps});
   if(started&&!h.player.isMoving()&&!app.saveBlocked&&!G.PSWorld.pending())break;
  }
  G.Input.dir4=0;assert(started,'ordinary native moveStraight must displace');assert.equal(h.player.isMoving(),false);assert.equal(h.state().steps,startSteps+1,'one completed step per cell');
 };
 return {...h,content,move,notices};
}
async function countScans(h,run){
 const counts={canonicalRootScans:0,derivedContentCanonicalScans:0,pureDataRootScans:0,staticDirectoryEnumerations:0,stacks:[]},undo=[];
 const contentShape=value=>value!==null&&typeof value==='object'&&['species','moves','abilities','items','world'].every(key=>Object.hasOwn(value,key));
 const directories=[h.flow._content.moves,h.flow._content.abilities,h.flow._content.species];
 for(const owner of [Object,vm.runInContext('Object',h.G)]){
  const original=owner.getOwnPropertyDescriptors;owner.getOwnPropertyDescriptors=function(value){if(value===h.flow._content||contentShape(value)){if(value===h.flow._content)counts.canonicalRootScans++;else counts.derivedContentCanonicalScans++;if(counts.stacks.length<4)counts.stacks.push(new Error().stack);}return Reflect.apply(original,this,[value]);};undo.push(()=>{owner.getOwnPropertyDescriptors=original;});
  const values=owner.values;owner.values=function(value){if(directories.includes(value))counts.staticDirectoryEnumerations++;return Reflect.apply(values,this,[value]);};undo.push(()=>{owner.values=values;});
 }
 const realmReflect=vm.runInContext('Reflect',h.G),keys=realmReflect.ownKeys;
 realmReflect.ownKeys=function(value){if(value===h.flow._content)counts.pureDataRootScans++;return Reflect.apply(keys,this,[value]);};undo.push(()=>{realmReflect.ownKeys=keys;});
 try{await run();}finally{for(const restore of undo.reverse())restore();}
 return counts;
}
function stats(rows){const values=rows.map(x=>x.totalMs).sort((a,b)=>a-b);return{n:values.length,p50:values[Math.ceil(values.length*.5)-1]??null,p95:values[Math.ceil(values.length*.95)-1]??null,max:values.at(-1)??null,over16_7ms:values.filter(x=>x>1000/60).length};}
test('complete product plugin ordinary native route performs zero repeated static Content scans',async()=>{
 const h=await fixture();await h.move(6);await h.move(4);const rows=[];
 for(let i=0;i<8;i++){h.tick();await flush();}
 for(const direction of [6,6,4,4,6,4,6,4])await h.move(direction,row=>rows.push(row));
 const before=h.state().stats.distance_walked,counts=await countScans(h,async()=>{await h.move(6);await h.move(4);});
 assert.equal(h.state().stats.distance_walked,before+2);assert.deepEqual([h.player.x,h.player.y],[8,9]);assert.equal(h.state().steps,12);assert.equal(h.state().stats.distance_walked,12);assert.equal(h.sessions.length,0);assert.equal(h.saves.length,0);assert.equal(h.app.saveBlocked,false);
 const result={kind:'ordinary-route',counts,frames:{start:stats(rows.filter(x=>x.started)),completion:stats(rows.filter(x=>x.completed)),moving:stats(rows.filter(x=>x.movingBefore&&!x.completed)),idle:stats(rows.filter(x=>!x.movingBefore&&!x.started)),all:stats(rows)},rows,final:structuredClone(h.state()),outcomes:h.outcomes.map(x=>x.status),point:[h.player.x,h.player.y],diagnostics:[...h.G.PSWorld.diagnostics]};records.push(result);console.log(JSON.stringify({kind:result.kind,counts,frames:result.frames}));
 assert.equal(counts.canonicalRootScans,0,'native START and companion wrappers must use the owning runtime');assert.equal(counts.derivedContentCanonicalScans,0,'expected-value copies must not reintroduce complete Content hashing');assert.equal(counts.pureDataRootScans,0,'owned immutable content must not be recursively revalidated by the companion wrapper');
 assert.equal(counts.staticDirectoryEnumerations,0,'unchanged immutable move/ability directories must not be rebuilt at each state gate');
});
test('external frozen content cannot borrow the runtime ownership cache',async()=>{
 const h=await fixture(),mutable=structuredClone(h.content);h.flow._content=Object.freeze(mutable);
 assert.equal(E.semantic.ownedImmutableFingerprint?.(mutable),undefined);const counts=await countScans(h,async()=>{await h.move(6);});assert(counts.canonicalRootScans>0);assert(counts.pureDataRootScans>0);assert.equal(h.state().stats.distance_walked,1);records.push({kind:'external-frozen',counts});
});
for(const kind of ['mutable-in-place','owned-replacement','generation'])test('actual native START still refuses '+kind+' during native passage callback',async()=>{
 const h=await fixture();if(kind==='mutable-in-place')h.flow._content=structuredClone(h.content);
 let changed=false;const native=h.player.canPass;h.player.canPass=function(...args){const allowed=Reflect.apply(native,this,args);if(!changed){changed=true;if(kind==='mutable-in-place')h.flow._content.moves.Growl.pp++;else if(kind==='owned-replacement')h.flow._content=E.semantic.ownedImmutableSnapshot(structuredClone(h.content));else h.app.stateReplacedByHost();}return allowed;};
 await h.move(6);assert(changed);assert.equal(h.state().stats.distance_walked,0,'stale atomic START may not count distance');assert(h.notices.some(x=>x.includes('movement-production-source-changed')));records.push({kind,steps:h.state().steps,distance:h.state().stats.distance_walked,diagnostics:[...h.notices]});
});

test('authored starter order reaches the actual ClaimGrant bag slots and messages',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pf-walk-grant-order-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const file=path.join(folder,'content.json');
 const compiled=JSON.parse(fs.readFileSync(path.join(runtime,'data/framework/content.json'),'utf8'));
 const starter=compiled.grants.find(grant=>grant.id==='starter');
 const items=['potion','antidote','pokeball'];
 // This order probe uses an item-only grant, so receiving a member does not open a naming decision.
 starter.members=[];
 starter.items=Object.fromEntries(items.map(item=>[item,starter.items[item]]));
 fs.writeFileSync(file,JSON.stringify(compiled));
 const {G,flow,content,state}=await fixture({compiledContentFile:file});
 const messages=[],add=G.$gameMessage.add;
 G.$gameMessage.add=function(text){messages.push(text);return Reflect.apply(add,this,[text]);};
 G.PluginManager.callCommand(new G.Game_Interpreter(),'PS_BattleFlow','ClaimGrant',{grant:'starter',message:'true'});
 assert.equal(flow.lastClaim.status,'applied',JSON.stringify(flow.lastClaim));
 const tr=flow.translator();
 const itemLines=items.map(item=>tr.t('grant.item',{item:tr.tOr('item.name.'+item,item),count:starter.items[item]}));
 const medicine=state().inventory.pockets.find(pocket=>pocket.some(slot=>slot.itemId==='potion'));
 assert.ok(medicine);
 const observed={
  loaded:Object.keys(content.grants.starter.items),
  received:Object.keys(flow.lastClaim.items),
  medicine:Array.from(medicine,slot=>[slot.itemId,slot.quantity]),
  messages:messages.filter(line=>itemLines.includes(line)),
 };
 console.log(JSON.stringify({kind:'starter-order',authored:items,observed}));
 assert.deepEqual(observed,{
  loaded:items,received:items,
  medicine:items.slice(0,2).map(item=>[item,starter.items[item]]),
  messages:itemLines,
 });
});
