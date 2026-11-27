'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('../../support/field/field-move-real-parent-fixtures.cjs');
async function stuck(kind,arrival='event-dispatched',noTable=true){
  let arrivals=0,attempts=0;const h=fixture({completedSteps:true,noTable,arrival:{status:arrival},onArrival(){arrivals++;},editContent(content){if(kind==='random')content.mapMetadata.maps[7].weather={type:'Rain',chance:100};}});
  const start=h.complete();let queued;
  if(kind==='random'){
    h.app.world.options.random=()=>{attempts++;throw Error('fixture-notice-random');};
    queued=h.app.observeWorldMapEntry({id:'failed-r08',cause:'transfer',previousMapId:6,mapId:7,rebuilt:true});
  }else{
    queued=h.app.setWorldWeather({type:'Rain',strength:5,durationFrames:0});
    if(kind==='content')h.actual({...h.content,settings:{MAX_MONEY:999998}});
    else{const install=h.app.world.options.install;h.app.world.options.install=(next,guard)=>{if(h.app.world.notices[0]?.status==='applying'){attempts++;throw Error('fixture-notice-install');}return install(next,guard);};}
  }
  assert.equal(queued.status,'queued');await start;assert.equal(h.app.saveBlocked,true);assert.equal(h.state.world.weather.type,'None');assert.equal(h.app.world.notices.length,1);assert(h.app.world.notices[0].invalid);
  return{h,get arrivals(){return arrivals;},get attempts(){return attempts;}};
}
for(const kind of ['content','install','random'])test('failed '+kind+' notice retains evidence but does not suppress subsequent completed prefixes or arrival',async()=>{const f=await stuck(kind),h=f.h,head=h.app.world.notices[0],before=h.state.steps,initialArrivals=f.arrivals,attempts=f.attempts;for(let i=1;i<=3;i++){const result=await h.complete();assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(h.state.steps,before+i);assert.equal(f.arrivals,initialArrivals+i);assert.equal(h.app.world.notices[0],head);assert.equal(h.app.world.notices.length,1);assert.equal(h.state.world.weather.type,'None');assert.equal(h.app.saveBlocked,true);assert.equal(f.attempts,attempts,'failed cached notice does not retry or redraw');}assert.equal(h.sessions.length,0);assert.deepEqual(h.draws,[]);});
test('failed notice blocks ordinary consumption after the actual arrival, with no encounter RNG',async()=>{const f=await stuck('content','ordinary-opportunity',false),h=f.h,r=await h.complete();assert.equal(r.status,'no-encounter',JSON.stringify(r));assert.equal(r.reason,'world-notice-pending');assert.equal(r.prefix.stepCommitted,true);assert.equal(f.arrivals,2);assert.deepEqual(h.draws,[]);assert.equal(h.sessions.length,0);assert.equal(h.app.saveBlocked,true);});
test('failed-notice step receipts do not replay their prefix or arrival',async()=>{const f=await stuck('content'),h=f.h;let step;const complete=h.app.completeWorldStep.bind(h.app);h.app.completeWorldStep=input=>{step=input;return complete(input);};const r=await h.complete(),before=h.state.steps,arrivals=f.arrivals;const duplicate=await complete(step);assert.equal(r.status,'completed');assert.equal(duplicate.status,'duplicate');assert.equal(h.state.steps,before);assert.equal(f.arrivals,arrivals);assert.deepEqual(h.draws,[]);});
test('a valid pending notification still drains before an ordinary consumer',async()=>{const h=fixture({completedSteps:true,noTable:true}),p=h.complete();assert.equal(h.app.setWorldWeather({type:'Rain',strength:5,durationFrames:0}).status,'queued');await p;assert.equal(h.state.world.weather.type,'Rain');assert.equal(h.app.saveBlocked,false);assert.equal((await h.complete()).status,'no-encounter');assert.equal(h.state.steps,2);assert.deepEqual(h.draws,[]);});
test('a failed notice blocks ordinary draws but keeps the legitimate walking friendship R09 draw',async()=>{const f=await stuck('content','ordinary-opportunity',false),h=f.h;h.external(g=>{g.world.happinessSteps=127;});const before=h.state.steps,r=await h.complete();assert.equal(r.status,'no-encounter');assert.equal(r.reason,'world-notice-pending');assert.equal(h.state.steps,before+1);assert.equal(h.state.world.happinessSteps,0);assert.deepEqual(h.draws,[2]);assert.equal(h.sessions.length,0);});
