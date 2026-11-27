'use strict';
require('../../support/field/regular-field-action-test-runtime.cjs').prepare('parent');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('../../support/field/field-move-real-parent-fixtures.cjs');
const {createFieldFactsObservation}=require(path.join(process.env.PF_FIELD_MOVE_APP_OUT,'plugins/world/field-facts-observation-mz.js'));
const {isProxy}=require('node:util').types;
const value=value=>({status:'value',value});
test('stable true native producer preserves actual Cut/Surf/Flash queries with zero state writes and RNG',()=>{
 for(const moveId of ['cut','surf','flash']){const h=fixture({moveId}),facts=h.host.facts();assert.equal(facts.facingEvent.status,'value');assert.equal(facts.flashMask.value,true);assert.equal(facts.facingTerrain.value.canSurf,true);const query=h.app.fieldShortcutQueries().snapshot();assert(query.moves.some(row=>row.moveId===moveId),JSON.stringify(query));assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);}
});
test('original query cross-provider event erasure closes as stale rather than an available Cut',()=>{
 const h=fixture({moveId:'cut'});let calls=0;h.native.ports.surfPassage=()=>{if(++calls===2)h.native.event._erased=true;return value(true);};
 const result=h.app.fieldShortcutQueries().snapshot();assert.equal(result.moves.some(m=>m.moveId==='cut'),false);assert.equal(calls,2);assert.equal(h.native.event._erased,true);assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);
});
for(const changed of ['event-erased','event-name','event-position','event-priority','event-jumping','player-position','player-direction','map-id','tile','flag','mask','terrain','passage','metadata','native-method'])test('last provider changing '+changed+' refuses the entire mixed facts aggregate',()=>{
 const h=fixture({moveId:'cut'}),n=h.native;let calls=0;n.ports.surfPassage=()=>{calls++;if(calls!==1)return value(true);
  if(changed==='event-erased')n.event._erased=true;if(changed==='event-name')n.root.$dataMap.events[1].name='NewName';if(changed==='event-position')n.event._x++;if(changed==='event-priority')n.event._priorityType=0;if(changed==='event-jumping')n.event._jumpCount=2;
  if(changed==='player-position')n.player._x++;if(changed==='player-direction')n.player._direction=2;if(changed==='map-id')n.map._mapId=8;if(changed==='tile')n.root.$dataMap.data[(3*8+3)*8+4]=2;if(changed==='flag')n.root.$dataTilesets[1].flags[0]=15;
  if(changed==='mask')n.maskState.valid=false;if(changed==='terrain')n.factState.terrain.canSurf=false;if(changed==='passage')n.factState.passage=false;if(changed==='metadata')n.factState.metadata.darkMap=false;if(changed==='native-method')n.map.eventsXy=()=>[];
  return value(true);
 };
 const facts=h.host.facts();for(const field of ['mapMetadata','facingEvent','facingTerrain','facingPassable','facingPoint','direction','flashMask']){assert.equal(facts[field].status,'unavailable');assert.match(facts[field].reason,/changed-during-observation/);}
 assert.equal(calls,1,'the closing guard does not alternate or re-call providers');assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);
});
for(const kind of ['missing-cap','copied-cap','other-root-cap','event-getter','events-proxy','state-getter','prototype-proxy'])test('native observation '+kind+' never invokes a getter/Proxy trap or provider',()=>{
 const h=fixture({moveId:'cut'}),n=h.native;let calls=0,providers=0;n.ports.surfPassage=()=>{providers++;return value(true);};
 if(kind==='missing-cap')delete n.ports.factsObservation;if(kind==='copied-cap')n.ports.factsObservation={...n.ports.factsObservation};if(kind==='other-root-cap')n.ports.factsObservation=createFieldFactsObservation(fixture().root,isProxy);
 if(kind==='event-getter')Object.defineProperty(n.event,'_erased',{get(){calls++;return false;}});
 if(kind==='events-proxy')n.map._events=new Proxy(n.map._events,{getOwnPropertyDescriptor(){calls++;},ownKeys(){calls++;return[];},get(){calls++;}});
 if(kind==='state-getter')Object.defineProperty(n.maskState,'valid',{get(){calls++;return true;}});
 if(kind==='prototype-proxy')Object.setPrototypeOf(n.player,new Proxy(Object.getPrototypeOf(n.player),{getOwnPropertyDescriptor(){calls++;},ownKeys(){calls++;return[];},getPrototypeOf(){calls++;return null;}}));
 const facts=h.host.facts();assert.equal(facts.facingEvent.status,'unavailable');assert.equal(calls,0);assert.equal(providers,0);assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);
});
test('ordinary E2 execution still commits real event prefix once under the declared observation capability',async()=>{const h=fixture({moveId:'cut'}),r=await h.run();assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(h.state.stats.cut_count,1);assert.equal(h.native.event._erased,true);assert.equal(h.records.length,1);assert.deepEqual(h.draws,[]);});
for(const changed of ['page-condition','switch','actor','page-tile-flag'])test('native active-page dependency '+changed+' remains inside the closed read set',()=>{
 const h=fixture({moveId:'cut'}),n=h.native;n.root.$dataMap.events[1].pages=[{conditions:{switch1Valid:true,switch1Id:1},image:{tileId:2},priorityType:1,through:false}];n.root.$dataTilesets[1].flags[2]=0;n.root.$gameSwitches={_data:[false,false]};n.root.$gameActors={_data:[null,{_actorId:1,_name:'actor'}]};
 n.ports.surfPassage=()=>{if(changed==='page-condition')n.root.$dataMap.events[1].pages[0].conditions.switch1Id=2;if(changed==='switch')n.root.$gameSwitches._data[1]=true;if(changed==='actor')n.root.$gameActors._data[1]._name='changed';if(changed==='page-tile-flag')n.root.$dataTilesets[1].flags[2]=15;return value(true);};
 const facts=h.host.facts();assert.equal(facts.facingEvent.status,'unavailable');assert.match(facts.facingEvent.reason,/changed-during-observation/);assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);
});
test('synchronous same-producer query reentry is refused before another provider call, outer observation remains coherent',()=>{
 const h=fixture({moveId:'cut'}),n=h.native;let calls=0,nested;n.ports.surfPassage=()=>{calls++;nested=h.host.facts();return value(true);};const outer=h.host.facts();assert.equal(calls,1);assert.equal(nested.facingEvent.status,'unavailable');assert.match(nested.facingEvent.reason,/reentrant/);assert.equal(outer.facingEvent.status,'value');assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);
});

test('each single provider closes before a later callback could restore changed native eligibility',()=>{
 const h=fixture({moveId:'cut'}),n=h.native;let metadata=0,terrain=0,passage=0;
 n.ports.metadata=()=>{metadata++;n.event._erased=true;return value({...n.factState.metadata});};
 n.ports.terrain=()=>{terrain++;n.event._erased=false;return value({...n.factState.terrain});};
 n.ports.surfPassage=()=>{passage++;return value(true);};
 const facts=h.host.facts();assert.equal(facts.facingEvent.status,'unavailable');assert.match(facts.facingEvent.reason,/changed-during-observation/);assert.equal(metadata,1);assert.equal(terrain,0);assert.equal(passage,0);assert.equal(n.event._erased,true);assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);
});

for(const changed of ['event-prototype','tile-event-list'])test('native closing captures '+changed+' dependencies after the provider',()=>{
 const h=fixture({moveId:'cut'}),n=h.native;n.ports.surfPassage=()=>{if(changed==='event-prototype')Object.getPrototypeOf(n.event).isNormalPriority=()=>false;else n.map._tileEvents.push(n.event);return value(true);};
 const facts=h.host.facts();assert.equal(facts.facingEvent.status,'unavailable');assert.match(facts.facingEvent.reason,/changed-during-observation/);assert.equal(h.writes.length,0);assert.deepEqual(h.draws,[]);
});
