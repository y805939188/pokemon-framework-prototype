'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./fixture.cjs');
const id=process.env.PF_FINAL_CASE;assert(['CB01','CB02','CB03','CB04'].includes(id));
const delta=(a,b)=>Object.fromEntries(Object.keys(a.stats).map(k=>[k,b.stats[k]-a.stats[k]]));
function step(r,cycling,draws,remaining=[]){
 assert.deepEqual(delta(r.before,r.start),{walked:cycling===false?1:0,cycled:cycling===true?1:0,surfed:0,slid:0});
 assert.equal(r.start.steps,r.before.steps);assert.equal(r.start.arrivals,r.before.arrivals);assert.deepEqual(r.start.draws,r.before.draws);
 assert.equal(r.completed.steps,r.before.steps+1);assert.equal(r.completed.arrivals,r.before.arrivals+1);assert.deepEqual(r.completed.stats,r.start.stats);
 assert.deepEqual(r.completed.nativeDraws,r.before.nativeDraws);assert.deepEqual(r.completed.business.slice(r.before.business.length),draws);
 assert.deepEqual(r.completed.draws.slice(0,r.before.draws.length),r.before.draws);assert.deepEqual(r.unusedTape,remaining);
 // The same packets must be observed only when the native step completes;
 // refused cycling facts must not even attempt a private business fill.
 assert.deepEqual(r.start.ordinaryEntropy,r.before.ordinaryEntropy);
 assert.equal(r.completed.ordinaryEntropy.attempts-r.before.ordinaryEntropy.attempts,draws.length);
 assert.equal(r.completed.ordinaryEntropy.fills-r.before.ordinaryEntropy.fills,draws.length);
 const rows=r.completed.ordinaryEntropy.rows.slice(r.before.ordinaryEntropy.rows.length);
 assert.deepEqual(rows.map(({upper,value})=>({upper,value})),draws);
 assert.deepEqual([r.arrival.status,r.arrival.point,r.arrival.steps,r.arrival.arrivals],
  ['ordinary-opportunity',r.completed.point,r.before.steps+1,r.before.arrivals+1]);
 for(const row of rows)assert.deepEqual(row.phase,r.arrival,'each actual fill names the same completed native arrival');
}
function refused(r){step(r,null,[]);const outcome=r.completed.outcomes.at(-1);assert.equal(outcome.status,'failed');assert.equal(outcome.reason,'encounter-cycling-unavailable');assert.notEqual(r.completed.facts.cycling.status,'value');}
test(id+' true native cycling source through production App and completed-step encounter',{timeout:120000},async()=>{
 const h=await fixture(id==='CB01'?{cells:{_cycling:true}}:id==='CB02'?{cells:{_cycling:false}}:{});let pass=false,extra={};
 try{
  if(id==='CB01'){
   const r=await h.move([4,99]);extra={r};
   assert.deepEqual(r.before.facts.cycling,{status:'value',value:true});
   // Base50: the unchanged cycling factor makes the first grace boundary 4 instead of 5.
   // Roll4 therefore stops before the chance roll; a fabricated false consumes roll99 too.
   step(r,true,[{upper:100,value:4}],[99]);assert.equal(r.completed.outcomes.at(-1).reason,'grace');
  }else if(id==='CB02'){
   const explicit=await h.move([4,99]);assert.deepEqual(explicit.before.facts.cycling,{status:'value',value:false});step(explicit,false,[{upper:100,value:4},{upper:100,value:99}]);assert.equal(explicit.completed.outcomes.at(-1).reason,'miss');
   delete h.player._cycling;const absent=await h.move([99]);assert.deepEqual(absent.before.facts.cycling,{status:'value',value:false});step(absent,false,[{upper:100,value:99}]);assert.equal(absent.completed.outcomes.at(-1).reason,'grace');extra={explicit,absent};
  }else if(id==='CB03'){
   h.player._cycling=undefined;const invalid=await h.move();refused(invalid);
   h.player._cycling=true;h.player._bicycle=false;const conflict=await h.move();refused(conflict);delete h.player._bicycle;delete h.player._cycling;
   let hookCalls=0;Object.defineProperty(h.player,'isCycling',{value:function(){hookCalls++;return true;},configurable:true});const unknown=await h.move();refused(unknown);assert.equal(hookCalls,0);delete h.player.isCycling;
   let getterCalls=0;Object.defineProperty(h.player,'isOnBicycle',{get(){getterCalls++;return true;},configurable:true});const accessor=await h.move();refused(accessor);assert.equal(getterCalls,0);delete h.player.isOnBicycle;
   const player=h.G.$gamePlayer;Object.defineProperty(h.G,'$gamePlayer',{get(){getterCalls++;return player;},configurable:true});const missing=h.app.worldFacts().cycling;assert.notEqual(missing.status,'value');assert.equal(getterCalls,0);Object.defineProperty(h.G,'$gamePlayer',{value:player,writable:true,configurable:true});extra={invalid,conflict,unknown,accessor,missing,hookCalls,getterCalls};
  }else{
   let queryCalls=0,getterCalls=0;const receivers=[];
   Object.defineProperty(h.player,'isOnBicycle',{value:function(){queryCalls++;receivers.push(this===h.player);return true;},writable:true,configurable:true});
   const method=await h.move([4]);assert.deepEqual(method.before.facts.cycling,{status:'value',value:true});step(method,null,[{upper:100,value:4}]);assert.equal(method.completed.outcomes.at(-1).reason,'grace');
   // The canonical old query remains supported with its ordinary internal boolean cell.
   h.player._cycling=true;h.player.isOnBicycle=function(){queryCalls++;receivers.push(this===h.player);return this._cycling;};
   Object.defineProperty(h.player,'isCycling',{get(){getterCalls++;return false;},configurable:true});
   const combined=h.app.worldFacts().cycling;assert.deepEqual(combined,{status:'value',value:true});assert.equal(getterCalls,0);delete h.player.isCycling;
   const original=h.player.isOnBicycle;h.player.isOnBicycle=function(){queryCalls++;h.player.isOnBicycle=original;return true;};const changed=h.app.worldFacts().cycling;assert.notEqual(changed.status,'value');
   const player=h.player;h.player.isOnBicycle=function(){queryCalls++;h.G.$gamePlayer=Object.create(player);return true;};const replaced=h.app.worldFacts().cycling;assert.notEqual(replaced.status,'value');h.G.$gamePlayer=player;h.player.isOnBicycle=original;
   assert(receivers.every(Boolean));assert(queryCalls>0);extra={method,combined,changed,replaced,queryCalls,getterCalls,receivers};
  }
  assert(h.movement.every(row=>row.receiver&&row.after[1]===row.before[1]+1));assert.deepEqual(h.nativeDraws,h.prefix.nativeDraws);assert.equal(h.saves.length,h.prefix.saves);assert.equal(h.sessions.length,0);h.assertOrdinaryEntropy({CB01:1,CB02:3,CB03:0,CB04:1}[id]);pass=true;
 }finally{h.record({status:pass?'PASS':'FAIL',...extra});}
});
