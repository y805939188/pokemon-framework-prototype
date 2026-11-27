'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./fixture.cjs');
const id=process.env.PF_FINAL_CASE;assert(['DM01','DM02','DM03','DM04','DM05'].includes(id));
function delta(a,b){return Object.fromEntries(Object.keys(a.stats).map(k=>[k,b.stats[k]-a.stats[k]]));}
function started(r,expected){assert.deepEqual(delta(r.before,r.start),expected);assert.equal(r.start.moving,true);assert.equal(r.start.steps,r.before.steps);assert.equal(r.start.repel,r.before.repel);assert.equal(r.start.arrivals,r.before.arrivals);assert.deepEqual(r.start.draws,r.before.draws);}
function completed(r,ice=false){assert.equal(r.completed.steps,r.before.steps+1);assert.equal(r.completed.repel,r.before.repel-(ice?0:1));assert.equal(r.completed.arrivals,r.before.arrivals+1);assert.deepEqual(r.completed.stats,r.start.stats);assert.deepEqual(r.completed.draws,r.before.draws);}
test(id+' actual START mode and completed native step',{timeout:120000},async()=>{
 const options=id==='DM02'?{iceConfigured:true}:id==='DM03'?{cells:{_cycling:true}}:id==='DM04'?{iceConfigured:true,iceGround:true,cells:{_iceSliding:true}}:id==='DM05'?{cells:{_cycling:undefined}}:{};
 const h=await fixture(options);let pass=false;
 try{
  const r=await h.move();
  if(id==='DM05'){
   const zero={walked:0,cycled:0,surfed:0,slid:0};started(r,zero);completed(r);assert(r.start.warnings.some(v=>v.includes('mode-flag-invalid:_cycling')));
   h.player._cycling='yes';const invalid=await h.move(8);started(invalid,zero);completed(invalid);
   delete h.player._cycling;let providerCalls=0;Object.defineProperty(h.G.Game_Player.prototype,'isCycling',{value:function(){providerCalls++;return true;},configurable:true});
   const unknown=await h.move();started(unknown,zero);completed(unknown);assert.equal(providerCalls,0,'function-only mode is never evaluated as authority');delete h.G.Game_Player.prototype.isCycling;
   h.player._cycling=false;const legal=await h.move(8);started(legal,{walked:1,cycled:0,surfed:0,slid:0});completed(legal);
   const original=h.app.recordNativeMovementStart;h.app.recordNativeMovementStart=function(...args){h.player._cycling=undefined;return Reflect.apply(original,this,args);};
   const lateUnknown=await h.move();started(lateUnknown,zero);completed(lateUnknown);h.app.recordNativeMovementStart=original;
  }
  else{
   started(r,{walked:id==='DM03'?0:1,cycled:id==='DM03'?1:0,surfed:0,slid:id==='DM04'?1:0});completed(r,id==='DM04');
   if(id==='DM03'){
    const original=h.app.recordNativeMovementStart;h.app.recordNativeMovementStart=function(...args){h.player._cycling=false;return Reflect.apply(original,this,args);};
    const late=await h.move();started(late,{walked:0,cycled:0,surfed:0,slid:0});completed(late);h.app.recordNativeMovementStart=original;
    const legal=await h.move();started(legal,{walked:1,cycled:0,surfed:0,slid:0});completed(legal);
   }
   if(id==='DM04'){h.player._iceSliding=false;const stopped=await h.move();started(stopped,{walked:1,cycled:0,surfed:0,slid:0});completed(stopped,true);}
  }
  assert(h.calls.some(row=>row[0]==='increaseSteps'));assert(h.calls.some(row=>row[0]==='updateMove'));assert(h.calls.some(row=>row[0]==='updateNonmoving'));
  assert(h.movement.every(row=>row.receiver&&row.after[1]===row.before[1]+(row.args[0]===2?1:-1)));assert.deepEqual(h.nativeDraws,[]);assert.equal(h.saves.length,0);pass=true;
 }finally{h.record({status:pass?'PASS':'FAIL'});}
});
