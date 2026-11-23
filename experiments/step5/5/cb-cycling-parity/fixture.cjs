'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture:base,flush}=require('../world-production-final-wire/fixture.cjs');
async function fixture(options={}){
 const warnings=[],movement=[],snapshots=[],business=[];
 const h=await base({edit(game,content){
  game.world.repelSteps=0;
  content.world.encounters.tables.find(row=>row.mapId===5&&row.version===0).types.Land.stepChance=50;
 },nativeSetup(n){
  const G=n.G,nativeConsole=G.console;
  G.console={...nativeConsole,warn(...args){warnings.push(args.map(String).join(' '));return Reflect.apply(nativeConsole.warn,nativeConsole,args);}};
  if(options.cells)Object.assign(n.player,options.cells);
  const original=G.Game_Player.prototype.moveStraight;
  G.Game_Player.prototype.moveStraight=function(...args){const row={args,before:[this._x,this._y],receiver:this===G.$gamePlayer};const result=Reflect.apply(original,this,args);row.after=[this._x,this._y];row.result=result;movement.push(row);return result;};
 }});
 const {G,app}=h,bootstrap=G.PSFlow.initializeBlackoutCompanions();
 if(bootstrap)assert.equal((await bootstrap).status,'completed');
 for(let i=0;i<2;i++){h.tick();await flush();}
 await h.pump(()=>!app.saveBlocked&&!G.PSWorld.pending());
 // Keep bootstrap observations and every later prefix; no observation or PRNG reset.
 const prefix={draws:[...h.draws],nativeDraws:[...h.nativeDraws],saves:h.saves.length};
 let tape=[];
 h.flow.rng=n=>{assert(tape.length>0,'unexpected business random draw');const value=tape.shift();assert(Number.isInteger(value)&&value>=0&&value<n);h.draws.push(n);business.push({upper:n,value});return value;};
 const setTape=values=>{assert.equal(tape.length,0,'preceding tape must be consumed');tape=[...values];};
 const capture=label=>{const s=h.state();const row={label,steps:s.steps,stats:{walked:s.stats.distance_walked,cycled:s.stats.distance_cycled,surfed:s.stats.distance_surfed,slid:s.stats.distance_slid_on_ice},point:[h.player.x,h.player.y],arrivals:h.arrivals(),moving:h.player.isMoving(),draws:[...h.draws],nativeDraws:[...h.nativeDraws],business:[...business],facts:structuredClone(app.worldFacts()),outcomes:structuredClone(h.outcomes),warnings:[...warnings]};snapshots.push(row);return row;};
 async function move(values=[]){setTape(values);const before=capture('before'),result=h.player.moveStraight(2),start=capture('start');await h.pump(()=>!h.player.isMoving()&&!app.saveBlocked&&!G.PSWorld.pending());return{before,start,completed:capture('completed'),result,unusedTape:[...tape]};}
 function record(extra){fs.writeFileSync(path.join(process.env.PF_FINAL_CASE_ROOT,'observation.json'),JSON.stringify({case:process.env.PF_FINAL_CASE,prefix,snapshots,movement,business,draws:h.draws,nativeDraws:h.nativeDraws,saves:h.saves.length,extra},null,2)+'\n',{flag:'wx'});}
 return{...h,warnings,movement,snapshots,business,prefix,capture,move,record};
}
module.exports={fixture};
