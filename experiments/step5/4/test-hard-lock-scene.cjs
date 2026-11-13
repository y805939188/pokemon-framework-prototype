'use strict';
// Compiled production Scene + real content/App/Session/Gen8; controlled Node host ports, NW=0.
const test=require('node:test'),assert=require('node:assert/strict'),H=require('./e1-choice-lock-scene-host.cjs');
test.before(H.prepare);test.after(H.cleanup);
for(const move of ['hyperbeam','dig','fly','outrage'])test(move+' automatically continues at main entry without opening a hard-locked menu',async()=>{
 let h;try{
  h=await H.open({id:'hard-lock-scene-'+move,lang:'en',player:{species:'snorlax',level:100,moves:[move,'splash']},foe:{species:'regirock',level:100,moves:['splash']}});
  const main=h.s.showMain,seen=[];h.s.showMain=function(){seen.push({locked:h.session.gw.query('p1','automatic-locked'),before:H.live(h.session)});return main.call(this);};
  await H.move(h,1);assert(h.calls.length>=2,'the locked request must resolve without another player choice');assert(h.calls.every(c=>c.slot===1&&c.result.ok));assert(seen.some(x=>x.locked.allowed&&x.locked.moveSlot===1),'actual main-entry lock observed');
  const req=h.session.currentRequest();assert.equal(h.session.gw.query('p1','automatic-locked').allowed,false);assert.equal(req.active[0].moves.length,2);assert.equal(h.s._mode,'main');H.unchanged(h);
  const n=h.calls.length;await h.frames(5);assert.equal(h.calls.length,n,'completed lock cannot register a duplicate continuation');assert.equal(h.installs,0);
 }finally{h?.cleanup();}
});
for(const retire of [false,true])test('actual lock '+(retire?'retired before callback cannot submit late':'repeated main entry submits once'),async()=>{
 let h;try{
  h=await H.open({id:'hard-lock-scene-owner-'+retire,lang:'en',player:{species:'snorlax',level:100,moves:['dig','splash']},foe:{species:'regirock',level:100,moves:['splash']}});
  // Normal Session setup isolates the next Scene entry at an actual engine-published locked request.
  assert((await h.session.chooseMove(1)).ok);assert.equal(h.calls.length,1);assert.equal(h.session.gw.query('p1','automatic-locked').allowed,true);
  const snap=h.session.gw.snapshot();h.s.showMain();h.s.showMain();
  if(retire){h.flow.abort(Error('owned automatic continuation retirement'));await h.frames(8);assert.equal(h.calls.length,1);assert.equal(h.session.gw.snapshot(),snap);}
  else{await H.mode(h,'main');assert.equal(h.calls.length,2);assert(h.calls[1].result.ok);await h.frames(5);assert.equal(h.calls.length,2);H.unchanged(h);}
 }finally{h?.cleanup();}
});
