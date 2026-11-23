'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,nativeMoveRoutes}=require('../fishing-host-fixtures.cjs');
for(const cancel of [false,true])test('POSE03 owned native common-event image route restores whole original image '+cancel,()=>{
 const h=runtime({beginCommonEventId:1});nativeMoveRoutes(h);const normal=[h.player.characterName(),h.player.characterIndex()];
 const route={list:[{code:41,parameters:['EventFishingRoute',5]},{code:0,parameters:[]}],repeat:false,skippable:false,wait:true};
 h.root.$dataCommonEvents[1]={list:[{code:205,indent:0,parameters:[-1,route]},{code:0,indent:0,parameters:[]}]};
 const session=h.begin(true);session.run({kind:'begin-presentation',surfing:false,id:1});h.tick();h.player.updateRoutineMove();h.tick();assert.deepEqual([h.player.characterName(),h.player.characterIndex()],['EventFishingRoute',5]);
 if(!cancel){h.player.updateRoutineMove();h.tick();assert.equal(h.advances.at(-1).effect.status,'completed');}
 session.dispose();assert.deepEqual([h.player.characterName(),h.player.characterIndex()],normal);assert.equal(h.player._moveRouteForcing,false);
});
