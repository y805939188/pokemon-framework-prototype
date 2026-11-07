'use strict';
// Targeted real pinned Gen8/Session flows plus explicitly labelled adapter controls; no F100/native/reference runs.
const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../../../js/engine/build/production.cjs');
const F = require('../../../js/engine/fixtures/game.cjs');
const clone = x => JSON.parse(JSON.stringify(x));
const context = s => E.session.readSessionRequestContext(s);
const DELIVERED = new WeakMap();
async function gateway({level=50,foeSpecies='Pidgey',foeLevel=50}={}) {
  const gw = await E.gateway.BattleGateway.create({ formatid: 'gen8rpgcustomgame', wild: true, seed: [1,2,3,4],
    players: [{ name: 'Player', team: [1,2,3].map(n => ({ name:'P'+n, species:'Snorlax', level, moves:['memento','splash'] })) },
      { name:'Wild', team:[{name:'F1',species:foeSpecies,level:foeLevel,moves:['splash']}] }] });
  await gw.choose('p1','team 123'); await gw.choose('p2','team 1'); gw.drain(); return gw;
}
async function faint(gw) { await gw.choose('p1','move 1'); await gw.choose('p2','move 1'); return gw.drain().find(m => m.kind==='request' && m.side==='p1'); }
const refresh = gw => gw.refreshRequests().find(m => m.side==='p1');
async function session() {
  const game=F.makeGame();
  game.party.forEach((m,i)=>{m.id='P'+(i+1);m.moves=[{id:'memento',pp:10,maxpp:10},{id:'splash',pp:40,maxpp:40}];});
  const foe=F.foeMember('F1','Pidgey',50,{moves:['tackle']});foe.moves=[{id:'splash',pp:40,maxpp:40}];
  const s=await E.session.BattleSession.create({game,content:F.content,battleId:'source-targeted',seed:[1,2,3,4],expGain:false,
    foe:{kind:'wild',team:[foe]}});
  s.take(); const turn=await s.chooseMove(1);DELIVERED.set(s,turn.messages);assert.equal(context(s).status,'available'); return s;
}

test('actual makeRequest emits private source only on p1 forced request; protocol projection and snapshot stay JSON', async()=>{
  const gw=await gateway(),m=await faint(gw);
  assert.equal(m.source.version,'player-forced-choice-source-v1');assert.equal(m.source.side,'p1');
  assert.deepEqual(Object.keys(m).sort(),['kind','request','seq','side']);assert(!JSON.stringify(m).includes('occurrenceId'));
  assert(Object.isFrozen(m.source));assert(!gw.snapshot().includes('p1-forced/'));
  assert.equal(Object.getOwnPropertyDescriptor(gw._debugBattle(),'makeRequest').enumerable,false);
  assert.deepEqual(refresh(gw).source,m.source);
});
test('real engine identical-payload occurrence in a discarded/restored branch gets a fresh domain, even at same turn/seq', async()=>{
  const gw=await gateway(),cp=gw.checkpoint(),first=await faint(gw),turn=gw._debugBattle().turn;
  const restored=await E.gateway.BattleGateway.fromCheckpoint(cp),second=await faint(restored);
  assert.deepEqual(second.request,first.request);assert.equal(restored._debugBattle().turn,turn);assert.equal(second.seq,first.seq);
  assert.notEqual(second.source.occurrenceId,first.source.occurrenceId);
});
test('technical refresh, repeated delivery and invalid forced choice preserve one actual occurrence', async()=>{
  const gw=await gateway(),first=await faint(gw),b=gw._debugBattle(),before=gw.snapshot();
  for(let n=0;n<3;n++){b.sides[0].emitRequest();const m=gw.drain().find(m=>m.side==='p1');assert.deepEqual(m.source,first.source);}
  assert.equal(gw.snapshot(),before);
  assert.equal(await gw.choose('p1','switch 99'),false);gw.drain();
  for(let n=0;n<3;n++)assert.deepEqual(refresh(gw).source,first.source);
});
test('actual native makeRequest on the same real Battle creates different identities at same turn and payload', async()=>{
  const gw=await gateway();await faint(gw);const b=gw._debugBattle(),turn=b.turn;
  // Direct real-method lifecycle control, explicitly not a second ordinary played turn or trace.
  b.makeRequest('switch');b.sides[0].emitRequest();const a=gw.drain().find(m=>m.side==='p1');
  b.makeRequest('switch');b.sides[0].emitRequest();const c=gw.drain().find(m=>m.side==='p1');
  assert.equal(b.turn,turn);assert.deepEqual(a.request,c.request);assert.notEqual(a.source.occurrenceId,c.source.occurrenceId);
});
test('trusted checkpoint restores the logical occurrence and queued header; raw snapshot grants no provenance', async()=>{
  const gw=await gateway(),m=await faint(gw);refresh(gw);const cp=gw.checkpoint();
  const trusted=await E.gateway.BattleGateway.fromCheckpoint(cp),queued=trusted.drain().find(m=>m.side==='p1');
  assert.deepEqual(queued.source,m.source);assert.deepEqual(refresh(trusted).source,m.source);
  const raw=await E.gateway.BattleGateway.restore(gw.snapshot());assert.equal(refresh(raw).source,undefined);
  await raw.choose('p1','switch 2');await raw.choose('p1','move 1');await raw.choose('p2','move 1');
  const next=raw.drain().filter(m=>m.kind==='request'&&m.side==='p1').at(-1);assert(next.source);
});
test('ordinary engine hazard chain creates two genuine forced requests in one turn', async()=>{
  const gw=await gateway(),first=await faint(gw),b=gw._debugBattle(),turn=b.turn;
  gw.seedState('p1',[{id:'P2',hp:1}]);b.sides[0].addSideCondition('stealthrock',b.sides[1].active[0]);refresh(gw);gw.drain();
  await gw.choose('p1','switch 2');const second=gw.drain().filter(m=>m.kind==='request'&&m.side==='p1').at(-1);
  assert.equal(b.turn,turn);assert.equal(b.sides[0].active[0].fainted,true);assert(second.request.forceSwitch[0]);
  assert.notEqual(second.source.occurrenceId,first.source.occurrenceId);
});
test('actual failed wild faint escape refresh preserves pending occurrence without a new engine choice', async()=>{
  const gw=await gateway({level:1,foeSpecies:'Deoxys-Speed',foeLevel:100}),first=await faint(gw),before=gw.snapshot();
  assert.equal(await gw.runAfterFaint('p1'),true);assert.equal(gw.ended,false,'fixed synthetic seed produces a real failed escape');
  assert.notEqual(gw.snapshot(),before);assert(gw.drain().some(m=>m.kind==='events'&&m.events.some(e=>e.type==='rpg'&&e.args[0]==='run'&&e.args[2]==='fail')));
  assert.deepEqual(refresh(gw).source,first.source);
});
test('completed forced selection/ordinary request/clear/terminal have no current forced header', async()=>{
  const gw=await gateway();await faint(gw);await gw.choose('p1','switch 2');
  assert.equal(refresh(gw).source,undefined);
  const b=gw._debugBattle();b.clearRequest();b.sides[0].emitRequest();assert.equal(gw.drain().filter(m=>m.side==='p1').at(-1).source,undefined);
  b.win('Player');gw._pump();assert.equal(gw.ended,true);assert.equal(gw.drain().filter(m=>m.source).length,0);
});
test('Session held/out/current are paired with one source; growth refresh keeps occurrence and queries are detached', async()=>{
  const s=await session(),a=context(s),snapshot=s.gw.snapshot(),epoch=a.requestViewEpoch;
  assert.deepEqual(a.request,s.currentRequest());const delivered=DELIVERED.get(s).filter(m=>m.kind==='request'&&m.side==='p1').at(-1);
  assert.deepEqual(delivered.source,a.source);assert.equal(Object.keys(delivered).includes('source'),false);
  for(let n=0;n<3;n++)assert.deepEqual(context(s),a);
  assert.equal(s.gw.snapshot(),snapshot);a.request.forceSwitch[0]=false;a.source.occurrenceId='forged';assert.equal(context(s).status,'available');
  s.grew=true;s._finishTurn();const b=context(s);assert.equal(b.requestViewEpoch,epoch);assert.equal(b.source.occurrenceId,delivered.source.occurrenceId);
});
test('repeated explicit restores preserve logical source, change only independent view epoch and rebind cloned out messages', async()=>{
  const s=await session();s.grew=true;s._finishTurn();const a=context(s),cp=s._checkpoint();
  await s._restoreCheckpoint(cp);const b=context(s);assert.equal(b.status,'available');assert.deepEqual(b.source,a.source);assert(b.requestViewEpoch>a.requestViewEpoch);
  assert.deepEqual(s.take().find(m=>m.kind==='request'&&m.side==='p1').source,a.source);
  await s._restoreCheckpoint(cp);const c=context(s);assert.equal(c.status,'available');assert(c.requestViewEpoch>b.requestViewEpoch);assert.deepEqual(c.source,a.source);
});
test('actual internal action rollback retires observation even though owned operation epoch does not change during restore', async()=>{
  const s=await session(),a=context(s),original=s.gw.choose;
  s.gw.choose=async function(...args){await original.apply(this,args);throw Error('controlled post-choice failure');};
  await assert.rejects(s.chooseForcedSwitch('P2'),/controlled post-choice failure/);
  const b=context(s);assert.equal(s.broken,null);assert.equal(b.status,'available');assert.deepEqual(b.source,a.source);assert(b.requestViewEpoch>a.requestViewEpoch);
  assert.equal((await s.chooseForcedSwitch('P2')).ok,true);assert.equal(context(s).status,'none');
});
test('restore failure stays UNAVAILABLE after finally; missing observation itself does not reject normal player choice', async()=>{
  const s=await session(),a=context(s),cp=s._checkpoint(),driver=s._driver;
  s._driver={...driver,async fromCheckpoint(){throw Error('controlled restore failure');}};
  await assert.rejects(s._restoreCheckpoint(cp),/controlled restore failure/);assert.equal(s._restoring,false);
  const b=context(s);assert.equal(b.status,'unavailable');assert.equal(b.reason,'restore-failed');assert(b.requestViewEpoch>a.requestViewEpoch);
  s._driver=driver;assert.equal((await s.chooseForcedSwitch('P2')).ok,true);
});
test('source stays unavailable throughout asynchronous restore and only publishes after all steps succeed', async()=>{
  const s=await session(),a=context(s),cp=s._checkpoint(),driver=s._driver;let release;
  const wait=new Promise(r=>release=r);s._driver={...driver,async fromCheckpoint(token){await wait;return driver.fromCheckpoint(token);}};
  const pending=s._restoreCheckpoint(cp);assert.equal(context(s).status,'unavailable');assert.equal(context(s).source,undefined);
  release();await pending;assert.equal(context(s).status,'available');assert(context(s).requestViewEpoch>a.requestViewEpoch);assert.deepEqual(context(s).source,a.source);
});
test('a copied source JSON from a lookalike driver cannot grant strict observation; original player flow remains optional', async()=>{
  const real=await session(),s=new E.session.BattleSession(),a=context(real);
  s.gw={};s.requests={p1:clone(a.request)};s.held=[{kind:'request',side:'p1',seq:1,request:clone(a.request),source:clone(a.source)}];
  s.grew=false;s._finishTurn();assert.equal(context(s).status,'unavailable');assert.equal(context(s).source,undefined);
  const before=Object.getOwnPropertyNames(E.session.BattleSession.prototype).filter(n=>!n.startsWith('_'));
  assert(!before.includes('readSessionRequestContext'));assert.deepEqual(s.currentRequest(),a.request);
});
test('pure adapter range control: wrapper once, exact return/throw/this and finally recovery without real engine', async()=>{
  const {pathToFileURL}=require('node:url'),path=require('node:path');
  const S=await import(pathToFileURL(path.resolve(__dirname,'../../../src/framework/battle/request-source.ts')).href);
  const request=()=>({forceSwitch:[true]}),driver={},b={gen:8,gameType:'singles',requestState:'switch',sides:[{activeRequest:null,choice:{actions:[]}}]};
  let calls=0,throws=false;const error=Error('controlled original throw');b.makeRequest=function(value){assert.equal(this,b);calls++;if(throws)throw error;this.sides[0].activeRequest=request();return value;};
  S.attachRequestSource(driver,b);const hook=b.makeRequest;S.attachRequestSource(driver,b);assert.equal(b.makeRequest,hook);
  assert.equal(b.makeRequest(42),42);const first=S.currentGatewayRequestSource(driver);assert.equal(calls,1);
  throws=true;assert.throws(()=>S.technicalRequestRefresh(driver,()=>b.makeRequest()),x=>x===error);throws=false;
  b.makeRequest(43);assert.notEqual(S.currentGatewayRequestSource(driver).occurrenceId,first.occurrenceId);assert.equal(calls,3);
  const stable=S.currentGatewayRequestSource(driver);S.technicalRequestRefresh(driver,()=>b.makeRequest());assert.deepEqual(S.currentGatewayRequestSource(driver),stable);
  assert.equal(Object.keys(b).includes('makeRequest'),false);
});
