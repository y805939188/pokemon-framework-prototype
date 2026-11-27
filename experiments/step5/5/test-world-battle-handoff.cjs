'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { fixture, flush } = require('./fishing-real-parent-fixtures.cjs');
const F = require('../../../tests/support/saves/legacy-migration/fixtures.cjs');
function world(options={}) { return fixture({party:[F.member('P1',{hp:20,friendship:70})],...options,editContent(content){content.moves.tackle=content.moves.Tackle;for(const [name,s]of Object.entries(content.species)){s.ruleSpecies='Fixture'+name;s.types=['Normal'];s.wildItemCommon=[];s.wildItemUncommon=[];s.wildItemRare=[];}}}); }
async function caught(h){const {promise}=await h.start();h.window();h.input(1,{confirm:true});h.finish();return promise;}
const draws=[6,100,6,100,100,1,65536,65536,32,32,32,32,32,32];
for(const disruption of ['throw','cancel','owner','generation','post-retire-throw'])test('reservation handoff '+disruption+' releases exactly the failed reservation',async()=>{
 const h=world(),retire=h.app.world.retireToBattle.bind(h.app.world);h.app.world.retireToBattle=(p,o)=>{
  if(disruption==='throw')throw Error('retire-failed');
  if(disruption==='cancel')h.cancel();else if(disruption==='owner')h.replaceOwner();else if(disruption==='generation')h.replaceGeneration();
  if(disruption==='post-retire-throw'){retire(p,o);throw Error('after-retire-failed');}
  return retire(p,o);
 };
 const r=await caught(h);assert.notEqual(r.status,'battle-admitted');assert.equal(r.admission,undefined);assert.equal(h.app.op,null);assert.equal(h.app.saveBlocked,false);assert.equal(h.sessions.length,0);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);assert.deepEqual(h.draws,draws);
 const before=[...h.draws];await h.app.runFieldItemHandoff(h.token);assert.deepEqual(h.draws,before);
});
test('failed old reservation handoff cannot clear the actual new generation battle',async()=>{
 const h=world();let next;
 h.app.world.retireToBattle=()=>{h.replaceGeneration();next=h.app.startBattle({battleId:'new-battle',kind:'wild',foes:[{species:'A',level:5}],seq:0});throw Error('old-retire-failed');};
 const r=await caught(h);assert.equal(r.status,'failed');assert.equal(r.admission,undefined);await next;assert.equal(h.app.op.battleId,'new-battle');assert.equal(h.sessions.length,1);assert(h.app.saveBlocked);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);h.app.abortBattle({battleId:'new-battle'},Error('done'));assert.equal(h.app.saveBlocked,false);
});
test('failed old reservation handoff cannot clear the actual newly issued field owner',async()=>{
 const h=world();let currentOwner,newToken;
 h.app.world.retireToBattle=()=>{h.app.abortBattle({battleId:h.app.op.battleId},Error('replace'));h.replaceOwner();h.prepare();currentOwner=h.app.world.owner;newToken=h.token;throw Error('old-retire-failed');};
 const r=await caught(h);assert.equal(r.status,'failed');assert.equal(h.app.op,null);assert.equal(h.app.world.owner,currentOwner);assert(h.app.saveBlocked);assert.equal(h.sessions.length,0);assert.equal(h.app.cancelFieldItemHandoff(newToken).status,'unchanged');assert.equal(h.app.saveBlocked,false);
});
test('actual session factory throw after admission clears its operation, preserves prefix and never regenerates',async()=>{
 let creates=0;const h=world({sessionFactory:{async create(){creates++;throw Error('factory-failed');}}}),r=await caught(h),before=[...h.draws];
 assert.equal(r.status,'battle-admitted');await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/factory-failed/);assert.equal(creates,1);assert.equal(h.app.op,null);assert.equal(h.app.saveBlocked,false);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/stale/);assert.deepEqual(h.draws,before);
});
