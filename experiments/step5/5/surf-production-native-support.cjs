'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture:fullFixture,flush}=require('./world-scene-full-production-support.cjs');
const {stripTypeScriptTypes}=require('node:module');
const ROOT=path.resolve(__dirname,'../../..');
async function sourceWorld(G){
 const modules=new Map();
 const load=file=>{if(modules.has(file))return modules.get(file);const mod=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{sourceUrl:file}),{context:G,identifier:file});modules.set(file,mod);return mod;};
 const entry=load(path.join(ROOT,'src/plugins/PS_World.ts'));
 await entry.link((specifier,parent)=>{assert(specifier.startsWith('.'),'source-only relative imports');const file=path.resolve(path.dirname(parent.identifier),specifier+'.ts');assert(file.startsWith(path.join(ROOT,'src')+path.sep));return load(file);});await entry.evaluate();
}
const runtime=path.dirname(process.env.PF_MZ_RUNTIME),objects=fs.readFileSync(path.join(runtime,'reactor_objects.js'),'utf8');
const install=(G,file,name)=>{const source=fs.readFileSync(path.join(runtime,file),'utf8'),start=source.indexOf(name+' = function'),end=source.indexOf('\n};',start);assert(start>=0&&end>start,name);vm.runInContext(source.slice(start,end+4),G,{filename:'pinned-surf-native:'+name});};
async function fixture(options={}){
 const trace=[],bitmap={_loadingState:options.loadingState??'loaded',_url:'img/characters/SurfFixture.png',_degradedToBlank:options.degraded===true};
 const parameters={TerrainTags:JSON.stringify({'0':{landAllowed:true,fishable:false,canSurf:false,environment:'grass'},'1':{landAllowed:false,fishable:true,canSurf:true,environment:'movingwater'}}),SurfPassage:options.passage??'boat',SurfCharacter:options.profile!==undefined?options.profile:options.noCharacter?'':JSON.stringify({name:'SurfFixture',index:0})};
 let h;
 h=await fullFixture({defaultProduction:options.defaultProduction,ordinaryC:options.ordinaryC,productionSessions:options.productionSessions,applicationPorts:options.applicationPorts,ordinaryAuthorInput:options.ordinaryAuthorInput,worldSource:options.source?sourceWorld:undefined,edit(game,content){
  content.moves.surf={id:'surf',name:'Surf',pp:15};game.party[0].moves=[{id:'surf',pp:0,maxpp:15,ppUps:0}];game.party[0].hp=Math.max(game.party[0].hp,20);game.badges=Array(8).fill(true);
  content.world.encounters.tables[0].types.Land.stepChance=1;content.world.encounters.tables[0].types.Water={stepChance:1,slots:[{species:'A',weight:1,minLevel:5,maxLevel:5}]};options.edit?.(game,content);
 },async nativeSetup(n){
  const G=n.G;G.Utils={isOptionValid:()=>false};G.$dataSystem={optTransparent:false,optFollowers:false,boat:{startMapId:0,startX:0,startY:0,characterName:'',characterIndex:0},ship:{startMapId:0,startX:0,startY:0,characterName:'',characterIndex:0},airship:{startMapId:0,startX:0,startY:0,characterName:'',characterIndex:0}};
  vm.runInContext('Number.prototype.mod=function(n){return((this%n)+n)%n;};Array.prototype.clone=function(){return this.slice();};Array.prototype.remove=function(v){const i=this.indexOf(v);if(i>=0)this.splice(i,1);return this;};',G);
  vm.runInContext(objects,G,{filename:path.join(runtime,'reactor_objects.js')});
  install(G,'reactor_core.js','Utils.extractFileName');
  const managers=fs.readFileSync(path.join(runtime,'reactor_managers.js'),'utf8'),helperStart=managers.indexOf('const _setBitmapNearest = function'),helperEnd=managers.indexOf('\n};',helperStart);assert(helperStart>=0&&helperEnd>helperStart);vm.runInContext(managers.slice(helperStart,helperEnd+4),G,{filename:'pinned-surf-native:_setBitmapNearest'});bitmap.addLoadListener=listener=>listener(bitmap);
  G.ImageManager={loadBitmap(_folder,name){assert.equal(name,'SurfFixture');return bitmap;},isZeroParallax:()=>false};
  for(const name of ['loadCharacter','isObjectCharacter','isBigCharacter'])install(G,'reactor_managers.js','ImageManager.'+name);
  G.Bitmap=function(){};for(const name of ['isReady','isError'])install(G,'reactor_core.js','Bitmap.prototype.'+name);Object.setPrototypeOf(bitmap,G.Bitmap.prototype);
  G.$gameParty={_actors:[],_items:{},_weapons:{},_armors:{},maxBattleMembers:()=>1,leader:()=>({characterName:()=> 'WalkFixture',characterIndex:()=>0}),members:()=>[],inBattle:()=>false,increaseSteps(){trace.push(['native-step']);},onPlayerWalk(){trace.push(['native-walk']);},hasEncounterNone:()=>false,hasEncounterHalf:()=>false};
  const actualMap=new G.Game_Map(),actualPlayer=new G.Game_Player();
  for(const object of [n.map,n.player])for(const key of Object.getOwnPropertyNames(object))delete object[key];
  Object.setPrototypeOf(n.map,G.Game_Map.prototype);Object.assign(n.map,actualMap);Object.setPrototypeOf(n.player,G.Game_Player.prototype);Object.assign(n.player,actualPlayer);
  Object.assign(n.map,{_mapId:5,_tilesetId:1,_tileEvents:[],_events:[],_commonEvents:[]});
  Object.assign(n.player,{_x:2,_realX:2,_y:2,_realY:2,_direction:6,_characterName:'WalkFixture',_characterIndex:0});
  G.$gameMap=n.map;G.$gamePlayer=n.player;G.$gameTemp=new G.Game_Temp();G.$gameScreen=new G.Game_Screen();G.$gameSwitches=new G.Game_Switches();G.$gameVariables=new G.Game_Variables();G.$gameSelfSwitches=new G.Game_SelfSwitches();G.$gameActors=new G.Game_Actors();G.$dataCommonEvents=[];
  const tiles=Array(10*8*6).fill(0);for(let y=0;y<8;y++)for(let x=3;x<=5;x++)tiles[(3*8+y)*10+x]=1;
  G.$dataMap={width:10,height:8,tilesetId:1,scrollType:0,data:tiles,events:[],meta:{},encounterList:[],disableDashing:false,autoplayBgm:false,autoplayBgs:false};
  // Native boat permits tile1, while native foot rejects it. The shore uses native foot flags.
  G.$dataTilesets=[null,{flags:[0,0x1000|0x0f]}];G.Input.dir4=0;G.ConfigManager={alwaysDash:false};
  const originalParameters=G.PluginManager.parameters;G.PluginManager.parameters=name=>name==='PS_World'?parameters:originalParameters(name);
  G.AudioManager={playBgm(){},playBgs(){},playSe(){},mapBgmObject:data=>data.bgm};
  G.$gameMessage=new G.Game_Message();const add=G.$gameMessage.add;G.$gameMessage.add=function(text){trace.push(['message',text]);return add.call(this,text);};
  await options.nativeSetup?.(n,{bitmap,trace});
 }});
 if(!options.defaultProduction&&!options.ordinaryC)h.flow.rng=n=>{h.draws.push(n);return n===100?99:0;};
 const {G,app}=h,steps=[],ordinary=[],cleanup=[];const complete=app.completeWorldStep.bind(app);
 app.completeWorldStep=input=>{steps.push({input,surfing:h.state().world.surfing,ending:app.worldFieldRuntime().endingSurf,save:app.saveBlocked});const result=complete(input);return result.then(outcome=>{steps.at(-1).outcome=outcome;return outcome;});};
 const clean=G.PSWorld.fieldMoves.cleanupSurf;G.PSWorld.fieldMoves.cleanupSurf=(operation,player)=>{cleanup.push({player,steps:h.state().steps,repel:h.state().world.repelSteps,happiness:h.state().world.happinessSteps,save:app.saveBlocked,blocked:app.encounterBlocked,surfing:h.state().world.surfing,ending:app.worldFieldRuntime().endingSurf});return clean(operation,player);};
 const read=G.PSWorld.runtimeInputs.ordinary.read;G.PSWorld.runtimeInputs.ordinary.read=input=>{ordinary.push({input,surfing:h.state().world.surfing,ending:app.worldFieldRuntime().endingSurf});return read(input);};
 const tick=()=>{h.tick();options.afterTick?.(h);};
 const pump=async(predicate,max=160)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();tick();await flush();}throw Error('surf native pump exceeded '+max+': '+JSON.stringify({player:[h.player.x,h.player.y],moving:h.player.isMoving(),jumping:h.player.isJumping(),pending:G.PSWorld.pending(),diagnostics:G.PSWorld.diagnostics}));};
 const run=async(action,id='native-surf-start')=>{let outcome;const pending=app.runFieldMove(id,action).then(r=>{outcome=r;return r;});await pump(()=>outcome!==undefined);return pending;};
 const move=async(direction)=>{G.Input.dir4=direction;tick();G.Input.dir4=0;await pump(()=>!h.player.isMoving()&&!h.player.isJumping()&&!G.PSWorld.pending()&&!app.saveBlocked);};
 return {...h,trace,bitmap,steps,ordinary,cleanup,tick,pump,run,move};
}
module.exports={fixture,flush};
