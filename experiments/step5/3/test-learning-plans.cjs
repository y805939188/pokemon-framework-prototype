'use strict';
// Formal-spec-derived expectations; execute the actual owner module without a shared bundle export change.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const F=require('./fixtures/learning/fixtures.cjs');
const source=resolve(__dirname,'../../../src/framework/rules/learning.ts');
const rules=import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync(source,'utf8'),{sourceUrl:source})).toString('base64'));
const basic={kind:'generic'};
const replace=slot=>({kind:'replace',slot});
const decline=giveUp=>({kind:'decline',...(giveUp===undefined?{}:{giveUp})});
const noStatistics={moves_taught_by_item:0,moves_taught_by_tutor:0,moves_taught_by_reminder:0};
const ready=plan=>{assert.equal(plan.status,'ready');return plan;};
const refused=(plan,reason)=>assert.deepEqual(plan,{status:'refused',reason});

test('P53-10 real member and incoming draft use the same empty-slot core without lookup',async()=>{
  const {planMoveLearning}=await rules;
  const real=F.member(), draft={moves:real.moves,firstMoves:real.firstMoves,isEgg:false};
  const a=ready(planMoveLearning(real,F.move(),basic,F.options()));
  assert.deepEqual(planMoveLearning(draft,F.move(),basic,F.options()),a);
  assert.deepEqual(a.patch.moves[1],{id:'chargebeam',pp:10,maxpp:10,ppUps:0});
  assert.deepEqual(a.patch.moves[0],real.moves[0]);
  assert.deepEqual(a.effects,{itemsToConsume:[],statistics:noStatistics,machineFriendshipChanges:0});
  assert.equal(a.patch.firstMoves,undefined);
  assert.deepEqual({...real,...a.patch, moves:real.moves},real);
});

test('P53-10 already-known rejects regardless of depleted PP, with no installable side effects',async()=>{
  const {planMoveLearning}=await rules;
  refused(planMoveLearning(F.member({moves:[F.slot('chargebeam',0,16,3)]}),F.move(),F.machine(),F.options()),'already-known');
});

test('P53-10 absent / egg / Shadow / unavailable compatibility each refuse before resource planning',async()=>{
  const {planMoveLearning}=await rules;
  for(const [m,options,reason] of [[null,F.options(),'absent-target'],[F.member({isEgg:true}),F.options(),'egg'],[F.member(),F.options({shadow:true}),'shadow'],[F.member(),F.options({compatibility:'incompatible'}),'incompatible'],[F.member(),F.options({compatibility:'unavailable'}),'compatibility-unavailable']]){
    refused(planMoveLearning(m,F.move(),F.machine(),options),reason);
  }
});

test('P53-10 battle source retains its distinct egg/Shadow precondition semantics',async()=>{
  const {planMoveLearning}=await rules;
  assert.equal(planMoveLearning(F.member({isEgg:true}),F.move(),{kind:'battle'},F.options({shadow:true})).status,'ready');
  refused(planMoveLearning(F.member({isEgg:true}),F.move(),{kind:'evolution'},F.options()),'egg');
});

test('P53-10 historical zero moves learn through an empty slot and keep unrelated metadata',async()=>{
  const {planMoveLearning}=await rules;
  const m=F.member({moves:[],firstMoves:[]});
  const a=ready(planMoveLearning(m,F.move(),{kind:'tutor'},F.options()));
  assert.equal(a.patch.moves.length,1); assert.equal(m.moves.length,0);
  const installed={...m,...a.patch};
  for(const key of Object.keys(m).filter(key=>key!=='moves'))assert.deepEqual(installed[key],m[key]);
});

test('P53-11 ordinary full replacement resets only the selected slot PP and PP Ups',async()=>{
  const {planMoveLearning}=await rules;
  const m=F.full();
  const a=ready(planMoveLearning(m,F.move(),basic,F.options({keepMachinePp:true}),[replace(2)]));
  assert.deepEqual(a.patch.moves[2],{id:'chargebeam',pp:10,maxpp:10,ppUps:0});
  for(const i of [0,1,3])assert.deepEqual(a.patch.moves[i],m.moves[i]);
  assert.equal(a.effects.machineFriendshipChanges,0);
});

test('P53-11 HM rejection stays on the same move; a later valid selection can succeed',async()=>{
  const {planMoveLearning}=await rules;
  const a=planMoveLearning(F.full(),F.move(),basic,F.options(),[replace(0)]);
  assert.equal(a.status,'pending');assert.equal(a.selection.kind,'learn');assert.equal(a.selection.reason,'hm-protected');assert.equal(a.selection.answerIndex,1);
  assert.equal(a.selection.move.id,'chargebeam');
  const b=ready(planMoveLearning(F.full(),F.move(),basic,F.options(),[replace(0),replace(1)]));
  assert.equal(b.patch.moves[0].id,'surf');assert.equal(b.patch.moves[1].id,'chargebeam');
});

test('P53-11 HM identity comes from caller catalog, not move-name heuristics',async()=>{
  const {planMoveLearning}=await rules;
  const m=F.full({moves:[F.slot('arbitrary-protected'),F.slot('surf'),F.slot('a'),F.slot('b')]});
  assert.equal(planMoveLearning(m,F.move(),basic,F.options({hmMoves:['arbitrary-protected']}),[replace(0)]).status,'pending');
  const a=ready(planMoveLearning(m,F.move(),basic,F.options({hmMoves:['arbitrary-protected']}),[replace(1)]));
  assert.equal(a.patch.moves[1].id,'chargebeam');
});

test('P53-11 BACK/fifth row ask give-up; No returns to same move and Yes skips only it',async()=>{
  const {planMoveLearning}=await rules;
  for(const answer of [decline(),replace(4)]){
    const a=planMoveLearning(F.full(),F.move(),basic,F.options(),[answer]);
    assert.equal(a.status,'pending');assert.equal(a.selection.kind,'give-up');assert.equal(a.selection.answerIndex,0);
  }
  const no=planMoveLearning(F.full(),F.move(),basic,F.options(),[decline(false)]);
  assert.equal(no.status,'pending');assert.equal(no.selection.move.id,'chargebeam');assert.equal(no.selection.reason,'declined-give-up');
  const yes=ready(planMoveLearning(F.full(),F.move(),basic,F.options(),[decline(true)]));
  assert.deepEqual(yes.patch.moves,F.full().moves);assert.equal(yes.outcomes[0].outcome,'gave-up');assert.deepEqual(yes.effects.statistics,noStatistics);
});

test('P53-11 queue give-up continues to later intent instead of cancelling the parent operation',async()=>{
  const {planLearningQueue}=await rules;
  const a=ready(planLearningQueue(F.full(),[F.move('first'),F.move('second')],{kind:'level'},F.options(),[decline(true),replace(1)]));
  assert.deepEqual(a.outcomes.map(x=>[x.moveId,x.outcome]),[['first','gave-up'],['second','learned']]);
  assert.equal(a.patch.moves[1].id,'second');
});

test('P53-11 queue reads then-current moves; duplicate intents can relearn a subsequently forgotten move',async()=>{
  const {planLearningQueue}=await rules;
  const a=ready(planLearningQueue(F.full(),[F.move('first'),F.move('second'),F.move('first')],{kind:'evolution'},F.options(),[replace(1),replace(1),replace(1)]));
  assert.deepEqual(a.outcomes.map(x=>x.outcome),['learned','learned','learned']);assert.equal(a.patch.moves[1].id,'first');
  const b=ready(planLearningQueue(F.full(),[F.move('first'),F.move('first')],{kind:'level'},F.options(),[decline(true),replace(1)]));
  assert.deepEqual(b.outcomes.map(x=>x.outcome),['gave-up','learned']);
});

test('P53-11 queue known intent consumes no decision; pending cannot expose an installable partial patch',async()=>{
  const {planLearningQueue}=await rules;
  const a=planLearningQueue(F.member({moves:[F.slot('tackle'),F.slot('growl'),F.slot('surf')]}),[F.move('first'),F.move('first'),F.move('second')],{kind:'level'},F.options());
  assert.equal(a.status,'pending');assert.equal(a.selection.moveIndex,2);assert.equal(a.selection.answerIndex,0);
  assert.equal(a.patch,undefined);assert.equal(a.effects,undefined);assert.equal(a.selection.moves[3].id,'first');
});

test('P53-11 level intentions sort chronological levels and preserve table order without global deduplication',async()=>{
  const {levelLearningIntents}=await rules;
  const rows=[{level:3,id:'third-a'},{level:0,id:'evolution'},{level:2,id:'second-b'},{level:1,id:'known'},{level:3,id:'second-b'},{level:2,id:'second-a'},{level:4,id:'future'}];
  assert.deepEqual(levelLearningIntents(1,3,rows),{status:'ready',moves:[{level:2,id:'second-b'},{level:2,id:'second-a'},{level:3,id:'third-a'},{level:3,id:'second-b'}]});
  assert.deepEqual(levelLearningIntents(3,3,rows),{status:'ready',moves:[]});
  assert.deepEqual(levelLearningIntents(3,2,rows),{status:'refused',reason:'invalid-level'});
  assert.deepEqual(levelLearningIntents(1,Infinity,rows),{status:'refused',reason:'invalid-level'});
});

for(const entry of ['bag','party'])test(`P53-12/13 ${entry} machine old PP applies only on full-slot replacement and caps to new base PP`,async()=>{
  const {planMoveLearning}=await rules;
  const source=F.machine(entry);
  const a=ready(planMoveLearning(F.full(),F.move(),source,F.options({keepMachinePp:true}),[replace(3)]));
  assert.deepEqual(a.patch.moves[3],{id:'chargebeam',pp:10,maxpp:10,ppUps:0});assert.equal(a.effects.machineFriendshipChanges,1);
  const b=ready(planMoveLearning(F.full(),F.move(),source,F.options({keepMachinePp:true}),[replace(2)]));
  assert.equal(b.patch.moves[2].pp,0);
  const c=ready(planMoveLearning(F.full(),F.move(),source,F.options(),[replace(2)]));assert.equal(c.patch.moves[2].pp,10);
  const d=ready(planMoveLearning(F.member(),F.move(),source,F.options({keepMachinePp:true})));assert.equal(d.patch.moves[1].pp,10);assert.equal(d.effects.machineFriendshipChanges,0);
});

test('P53-12 Bag TR named TM57 is consumed by catalog identity, counts machine and appends first record',async()=>{
  const {planMoveLearning}=await rules;
  const a=ready(planMoveLearning(F.member(),F.move(),F.machine(),F.options()));
  assert.deepEqual(a.effects.itemsToConsume,[{itemId:'TM57',quantity:1}]);assert.equal(a.effects.statistics.moves_taught_by_item,1);
  assert.deepEqual(a.patch.firstMoves,['tackle','chargebeam']);
});

test('P53-12 successful Bag TR preserves long historical duplicate records and only prevents a new duplicate',async()=>{
  const {planMoveLearning}=await rules;
  const firstMoves=['a','b','c','d','e','a'];
  const a=ready(planMoveLearning(F.member({firstMoves}),F.move(),F.machine(),F.options()));
  assert.deepEqual(a.patch.firstMoves,[...firstMoves,'chargebeam']);
  const b=ready(planMoveLearning(F.member({firstMoves:[...firstMoves,'chargebeam']}),F.move(),F.machine(),F.options()));
  assert.equal(b.patch.firstMoves,undefined);assert.equal(b.effects.statistics.moves_taught_by_item,1);
});

test('P53-12 TM/HM never consume, even if an adapter accidentally forwards a consumable flag',async()=>{
  const {planMoveLearning}=await rules;
  for(const machine of ['tm','hm']){
    const a=ready(planMoveLearning(F.member(),F.move(),F.machine('bag',machine),F.options()));
    assert.deepEqual(a.effects.itemsToConsume,[]);assert.equal(a.patch.firstMoves,undefined);assert.equal(a.effects.statistics.moves_taught_by_item,1);
  }
});

test('P53-13 Party TR consumes while omitting Bag statistics and firstMoves append',async()=>{
  const {planMoveLearning}=await rules;
  const a=ready(planMoveLearning(F.member(),F.move(),F.machine('party'),F.options()));
  assert.deepEqual(a.effects.itemsToConsume,[{itemId:'TM57',quantity:1}]);assert.deepEqual(a.effects.statistics,noStatistics);assert.equal(a.patch.firstMoves,undefined);
});

test('P53-12/13 machine gave-up has zero consumption, record, statistics and friendship intent',async()=>{
  const {planMoveLearning}=await rules;
  for(const entry of ['bag','party']){
    const a=ready(planMoveLearning(F.full(),F.move(),F.machine(entry),F.options(),[decline(true)]));
    assert.deepEqual(a.effects,{itemsToConsume:[],statistics:noStatistics,machineFriendshipChanges:0});assert.equal(a.patch.firstMoves,undefined);
  }
});

test('P53-10/12 compatibility uses known identities, tutor/any-level/egg and only empty-egg predecessor fallback',async()=>{
  const {learningCompatibility}=await rules;
  const data={moveIds:['tutor','level','egg','ancestor','neither'],tutorMoves:['tutor'],levelMoves:[{level:99,id:'level'}],eggMoves:['egg'],predecessorEggMoves:['ancestor']};
  for(const id of ['tutor','level','egg'])assert.equal(learningCompatibility(id,data),'compatible');
  assert.equal(learningCompatibility('ancestor',data),'incompatible');assert.equal(learningCompatibility('not-in-directory',{...data,tutorMoves:['not-in-directory']}),'incompatible');
  assert.equal(learningCompatibility('ancestor',{...data,eggMoves:[]}),'compatible');assert.equal(learningCompatibility('neither',{...data,eggMoves:[],predecessorEggMoves:[]}),'incompatible');
  assert.equal(learningCompatibility('neither',{...data,eggMoves:null}),'unavailable');assert.equal(learningCompatibility('ancestor',{...data,eggMoves:[],predecessorEggMoves:null}),'unavailable');
  assert.equal(learningCompatibility('tutor',{...data,eggMoves:null}),'compatible');
});

test('P53-15 safe empty relearning result never asks a first selected move',async()=>{
  const {planRelearning}=await rules;
  const a=planRelearning(F.member(),[{level:1,id:'tackle'}],[F.move('tackle')],{...F.options(),moreMoves:true});
  assert.deepEqual(a,{status:'empty'});
  assert.deepEqual(planRelearning(F.member({isEgg:true}),[{level:1,id:'chargebeam'}],[F.move()],{...F.options(),moreMoves:true}),{status:'empty'});
});

test('P53-15 rejected teaching and declined list exit return to candidates; confirmed exit has no patch',async()=>{
  const {planRelearning}=await rules;
  const call=answers=>planRelearning(F.member(),[{level:1,id:'chargebeam'}],[F.move()],{...F.options(),moreMoves:true},answers);
  assert.equal(call([]).selection.kind,'candidate');assert.equal(call([{kind:'select',moveId:'chargebeam'}]).selection.kind,'teach');
  assert.equal(call([{kind:'select',moveId:'chargebeam',teach:false}]).selection.kind,'candidate');
  assert.equal(call([{kind:'exit'}]).selection.kind,'exit');assert.equal(call([{kind:'exit',confirmed:false}]).selection.kind,'candidate');
  assert.deepEqual(call([{kind:'exit',confirmed:true}]),{status:'exited'});
});

test('P53-15 inner give-up returns to candidates, later real success alone counts reminder',async()=>{
  const {planRelearning}=await rules;
  const rows=[{level:1,id:'chargebeam'},{level:1,id:'other'}],catalog=[F.move(),F.move('other')],options={...F.options(),moreMoves:true};
  const first={kind:'select',moveId:'chargebeam',teach:true,learning:[decline(true)]};
  const a=planRelearning(F.full(),rows,catalog,options,[first]);assert.equal(a.selection.kind,'candidate');
  const pending=planRelearning(F.full(),rows,catalog,options,[{...first,learning:[replace(0)]}]);assert.equal(pending.selection.kind,'learning');assert.equal(pending.selection.learning.reason,'hm-protected');
  const b=ready(planRelearning(F.full(),rows,catalog,options,[first,{kind:'exit',confirmed:false},{kind:'select',moveId:'other',teach:true,learning:[replace(1)]}]));
  assert.equal(b.effects.statistics.moves_taught_by_reminder,1);assert.equal(b.effects.statistics.moves_taught_by_tutor,0);assert.equal(b.patch.moves[1].id,'other');assert.equal(b.patch.firstMoves,undefined);
});

test('P53-15 reminder only accepts actual candidates, not the complete egg table or an unknown catalog record',async()=>{
  const {planRelearning}=await rules;
  const options={...F.options(),moreMoves:true};
  refused(planRelearning(F.member(),[{level:1,id:'chargebeam'}],[F.move()],options,[{kind:'select',moveId:'amnesia',teach:true}]),'not-a-candidate');
  refused(planRelearning(F.member(),[{level:1,id:'chargebeam'}],[],options,[{kind:'select',moveId:'chargebeam',teach:true}]),'invalid-move');
});

test('P53-16 tutor only counts real success, without first record or machine friendship',async()=>{
  const {planMoveLearning}=await rules;
  const a=ready(planMoveLearning(F.full(),F.move(),{kind:'tutor'},F.options(),[replace(1)]));
  assert.equal(a.effects.statistics.moves_taught_by_tutor,1);assert.equal(a.patch.firstMoves,undefined);assert.equal(a.effects.machineFriendshipChanges,0);
  const b=ready(planMoveLearning(F.full(),F.move(),{kind:'tutor'},F.options(),[decline(true)]));assert.deepEqual(b.effects.statistics,noStatistics);
});

test('P53-16 independent forgetting can select HM and preserves all remaining PP',async()=>{
  const {planMoveForgetting}=await rules;
  const m=F.full(),a=ready(planMoveForgetting(m,0));
  assert.equal(a.forgotten,'surf');assert.deepEqual(a.patch.moves,m.moves.slice(1));assert.equal(a.patch.firstMoves,undefined);
});

test('P53-16 independent forgetting protects the last move, safely views zero moves and cancels without patch',async()=>{
  const {planMoveForgetting}=await rules;
  assert.deepEqual(planMoveForgetting(F.member(),0),{status:'refused',reason:'last-move'});
  assert.deepEqual(planMoveForgetting(F.member({moves:[]})),{status:'pending',moves:[]});
  assert.deepEqual(planMoveForgetting(F.member({moves:[]}),0),{status:'refused',reason:'invalid-slot'});
  assert.deepEqual(planMoveForgetting(F.member(),null),{status:'cancelled'});
});

test('P53-10/11 malformed move, decision, source and surplus decisions do not produce installable patches',async()=>{
  const {planMoveLearning,planLearningQueue}=await rules;
  for(const move of [F.move(''),F.move('new',NaN),F.move('new',-1),F.move('new',1.5)])refused(planMoveLearning(F.member(),move,basic,F.options()),'invalid-move');
  for(const slot of [-1,5,1.5])refused(planMoveLearning(F.full(),F.move(),basic,F.options(),[replace(slot)]),'invalid-answer');
  refused(planMoveLearning(F.full(),F.move(),basic,F.options(),[{kind:'cancelled'}]),'invalid-answer');
  for(const answers of [[null],Array(1),[{kind:'decline',giveUp:true,cancelled:true}],{cancelled:true}])refused(planMoveLearning(F.full(),F.move(),basic,F.options(),answers),'invalid-answer');
  refused(planMoveLearning(F.member(),F.move(),basic,F.options(),[replace(0)]),'unexpected-answer');
  refused(planLearningQueue(F.full(),[],{kind:'level'},F.options(),[decline(true)]),'unexpected-answer');
  refused(planMoveLearning(F.member(),F.move(),F.machine('guess'),F.options()),'invalid-source');
});

test('P53-15 malformed or stale relearning decisions cannot act as exit or successful teaching',async()=>{
  const {planRelearning}=await rules;
  const call=answers=>planRelearning(F.member(),[{level:1,id:'chargebeam'}],[F.move()],{...F.options(),moreMoves:true},answers);
  for(const answers of [[null],Array(1),[{kind:'exit',confirmed:'false'}],[{kind:'select',moveId:'chargebeam',teach:'yes'}]])refused(call(answers),'invalid-answer');
  refused(call([{kind:'select',moveId:'chargebeam',teach:false,learning:[replace(1)]}]),'unexpected-answer');
  refused(call([{kind:'exit',confirmed:true},{kind:'select',moveId:'chargebeam',teach:true}]),'unexpected-answer');
});

test('P53-10–16 frozen inputs remain equal and output writes cannot alias member/catalog/answers',async()=>{
  const {planMoveLearning,planRelearning,planMoveForgetting}=await rules;
  const member=F.freeze(F.full()),move=F.freeze(F.move()),source=F.freeze(F.machine()),options=F.freeze(F.options()),answers=F.freeze([replace(1)]);
  const before=JSON.stringify({member,move,source,options,answers});
  const a=ready(planMoveLearning(member,move,source,options,answers));a.patch.moves[0].pp=0;a.patch.firstMoves.push('extra');a.effects.itemsToConsume[0].quantity=999;
  const pending=planMoveLearning(member,move,source,options);pending.selection.moves[0].pp=0;pending.selection.move.pp=999;
  const f=planMoveForgetting(member);f.moves[0].pp=0;
  const r=planRelearning(member,[{level:1,id:'chargebeam'}],[move],{...options,moreMoves:true});r.selection.candidates.push('extra');
  assert.equal(JSON.stringify({member,move,source,options,answers}),before);
  const b=ready(planMoveLearning(member,move,source,options,answers));assert.equal(b.patch.moves[0].pp,2);assert.equal(b.patch.moves[1].maxpp,10);assert.equal(b.effects.itemsToConsume[0].quantity,1);
});
