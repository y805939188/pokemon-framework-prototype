'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,record,flush}=require('./commands-fixture.cjs');
const id=process.env.PF_G_COMMAND_CASE;
assert(['GN-BUSY-WILD','GN-BUSY-TRAINER'].includes(id));
test(id+' valid legacy event refuses a busy capture without escaping command357',async()=>{
 let armed=false,release;
 const h=await fixture({edit(_game,content){
  content.trainerTypes={ace:{id:'ace',nameKey:'type.ace',gender:0,baseMoney:10,skillLevel:0,flags:[],items:[],source:'literal'}};
  content.trainerTypeOrder=['ace'];content.trainers={npc:[{id:'npc',type:'ace',name:'Tester',version:0,party:[{species:'A',level:5,moves:['tackle']}],source:'literal'}]};
 },afterPrepare({result}){if(armed&&result.status==='value'){armed=false;return new Promise(resolve=>{release=resolve;});}}});
 const prefix=h.draws.slice(),before=structuredClone(h.state());
 assert(h.app.trainerRecord('npc',0),'legal trainer positive control must reach the real capture gate');
 armed=true;const pending=h.command('RegisterEventCompanion',{eventId:'1'});
 for(let i=0;i<30&&!release;i++)await flush();assert(release);assert.equal(h.G.PSFlow.worldAuthorInputPending(),true);
 const name=id==='GN-BUSY-WILD'?'StartBattle':'StartTrainerBattle';
 const args={battleId:id,...(id==='GN-BUSY-WILD'?{foes:'A:5'}:{trainerId:'npc',version:'0'}),canLose:'false',canSwitch:'true',battleStyle:'set',expGain:'true',battleEffects:'inherit',noRun:'false',noBall:'false'};
 const command=h.command(name,args,new h.G.Game_Interpreter(),'PS_BattleFlow');
 assert.equal(command.returned,true);assert.equal(command.interpreter._waitMode,'message');assert.equal(h.G.PSFlow.running,false);
 assert.equal(h.G.PSFlow.lastOutcome.commit,'none');assert.equal(h.G.PSFlow.lastOutcome.aborted,true);assert.match(h.G.PSFlow.lastOutcome.error,/legacy-world-capture/);
 assert.equal(h.G.PSFlow.worldAuthorInputPending(),true,'refusal cannot release the unrelated companion owner');
 assert.deepEqual(h.state(),before);assert.deepEqual(h.draws,prefix);assert.equal(h.records().length,0);
 assert.throws(()=>h.command(name,{...args,battleEffects:'true'},new h.G.Game_Interpreter(),'PS_BattleFlow'),/battleEffects must be on, off or inherit/,'parameter validation still runs before the capture refusal');
 pending.interpreter.clear();release();await flush();h.G.$gameMessage.clear();
 const successor=h.command('RegisterEventCompanion',{eventId:'2'});assert.equal((await h.finish(successor)).status,'completed');assert.deepEqual(h.records().map(row=>row.originEventId),[2]);assert.equal(h.G.PSFlow.running,false);assert.deepEqual(h.draws,prefix);
 record(id,h,{prefix,refusedOutcome:h.G.PSFlow.lastOutcome,commandReturn:true,unrelatedOwnerPreserved:true});
});
