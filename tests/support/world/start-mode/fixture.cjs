'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture:base,flush}=require('../native-callers/fixture.cjs');
async function fixture(options={}){
 const calls=[],movement=[],snapshots=[],warnings=[];
 const h=await base({edit(game){game.world.repelSteps=8;},nativeSetup(n,{maps}){
  const G=n.G,console=G.console;G.console={...console,warn(...args){warnings.push(args.map(String).join(' '));return Reflect.apply(console.warn,console,args);}};
  if(options.iceConfigured){const parameters=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const result=Reflect.apply(parameters,this,[name]);return name==='PS_World'?{...result,TerrainTags:JSON.stringify({'0':{landAllowed:true,fishable:false,environment:'grass'},'1':{landAllowed:true,fishable:false,environment:'grass',ice:true}})}:result;};}
  if(options.cells)Object.assign(n.player,options.cells);
  if(options.methodOnly)Object.defineProperty(G.Game_Player.prototype,'isCycling',{value:function(){calls.push(['method-only-called']);return true;},configurable:true});
  if(options.iceGround){G.$dataTilesets[1].flags[2]=0x1000;for(let y=0;y<8;y++)for(let x=0;x<10;x++)maps[5].data[(3*8+y)*10+x]=2;}
  const native=G.Game_Player.prototype.moveStraight;
  G.Game_Player.prototype.moveStraight=function(...args){const row={args,before:[this._x,this._y],receiver:this===G.$gamePlayer};const result=Reflect.apply(native,this,args);row.after=[this._x,this._y];row.result=result;movement.push(row);options.afterNative?.(this,G);return result;};
  for(const key of ['increaseSteps','updateMove','updateNonmoving']){const original=G.Game_Player.prototype[key];assert.equal(typeof original,'function');G.Game_Player.prototype[key]=function(...args){calls.push([key,this===G.$gamePlayer,args]);return Reflect.apply(original,this,args);};}
  G.$gameSystem.disableEncounter();
 }});
 const {G,app}=h;
 const bootstrap=G.PSFlow.initializeBlackoutCompanions();if(bootstrap)assert.equal((await bootstrap).status,'completed');
 for(let i=0;i<2;i++){h.tick();await flush();}await h.pump(()=>!app.saveBlocked&&!G.PSWorld.pending());
 h.draws.length=0;h.nativeDraws.length=0;h.saves.length=0;calls.length=0;
 const capture=label=>{const s=h.state();const row={label,steps:s.steps,repel:s.world.repelSteps,stats:{walked:s.stats.distance_walked,cycled:s.stats.distance_cycled,surfed:s.stats.distance_surfed,slid:s.stats.distance_slid_on_ice},point:[h.player.x,h.player.y],moving:h.player.isMoving(),arrivals:h.arrivals(),draws:[...h.draws],nativeDraws:[...h.nativeDraws],warnings:[...warnings],diagnostics:structuredClone(G.PSWorld.diagnostics)};snapshots.push(row);return row;};
 async function move(direction=2){const before=capture('before');const result=h.player.moveStraight(direction);const start=capture('start');await h.pump(()=>!h.player.isMoving()&&!app.saveBlocked&&!G.PSWorld.pending());const completed=capture('completed');return{before,start,completed,result};}
 const input=s=>({id:s.id,mapId:s.mapId,x:s.x,y:s.y,ice:s.ice,terrainTag:s.terrainTag});
 function record(extra){fs.writeFileSync(path.join(process.env.PF_FINAL_CASE_ROOT,'observation.json'),JSON.stringify({case:process.env.PF_FINAL_CASE,snapshots,calls,movement,steps:h.steps.map(r=>({input:input(r.input),status:r.outcome?.status})),stepCalls:h.stepCalls.map(input),draws:h.draws,nativeDraws:h.nativeDraws,saves:h.saves.length,extra},null,2)+'\n',{flag:'wx'});}
 return{...h,calls,movement,snapshots,capture,move,record};
}
module.exports={fixture,flush};
