'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compileNavigation,nextDecision,observeForcedSelection}=require('./navigation.cjs');
const donor=require('../d1/f100-v1.json'); // authored input manifest, never a frozen result replay
const program=compileNavigation();
const view=(phase,extra={})=>({sceneKind:'battle',fast:false,effects:true,current:true,ready:true,phase,...extra});
const ctx=(c,index=0,extra={})=>({caseId:c.id,intentIndex:index,...extra});
function forced(c,index=0) {
 const context=ctx(c,index,{ownerToken:'root-A/generation-1'});
 const common={ownerToken:context.ownerToken,forcedRequestToken:'forced-occurrence-1',partySub:'forced'};
 return {context,before:view('party-forced',{...common,items:[{key:'P1',enabled:true},{key:'P2',enabled:true}]}),
   after:view('party-command',{...common,selectedMemberId:'P1',items:[{key:'switch-in',enabled:true}]})};
}
test('all100 requests/seeds/business expectations retained; actual actions/deadlines unresolved',()=>{
 assert.equal(program.cases.length,100);assert.equal(program.actualBattles,0);assert(program.cases.every(c=>c.resolvedNormalActions===null&&c.qualifiedDeadlineMs===null));
 assert.deepEqual(program.cases.at(-1).seed,[1,2,3,103]);assert.equal(program.donorHash,'93507d4bca39de181c462158240b87691fea1b09588d10494ad9c6692425ec4e');
 assert.deepEqual(program.cases.map(c=>[c.request,c.expected,c.setup,c.seed]),donor.cases.map(c=>[c.request,c.expected,c.setup,c.seed]));
 assert.equal(program.inheritedBattleActionGuard,16);
});
test('normal fight route keeps original PayDay menu slot and checks actual move identity',()=>{
 const c=program.cases[0];assert.deepEqual(nextDecision(c,ctx(c),view('main')),{kind:'choose',phase:'main',key:'fight'});
 assert.equal(nextDecision(c,ctx(c),view('moves',{moveIds:{1:'splash'}})).kind,'NEEDS_BINDING');
 assert.deepEqual(nextDecision(c,ctx(c),view('moves',{moveIds:{1:'payday'}})),{kind:'choose',phase:'moves',key:1});
});
test('D3 Memento retains slot3 and expected defeat instead of rewriting load',()=>{
 const c=program.cases[3];assert.equal(c.policy[0].move,'memento');assert.equal(nextDecision(c,ctx(c),view('moves',{moveIds:{3:'memento'}})).key,3);
 assert.equal(c.kind,'trainer-loss-D3');assert.deepEqual(c.expected,donor.cases[3].expected);
});
test('Potion route uses actual Bag -> command Use -> stable P1; pocket must bind',()=>{
 const c=program.cases[2];assert.equal(nextDecision(c,ctx(c),view('main')).key,'bag');
 assert.equal(nextDecision(c,ctx(c),view('bag')).kind,'NEEDS_BINDING');
 assert.equal(nextDecision(c,ctx(c,0,{catalogPockets:{potion:2}}),view('bag',{bag:{pocket:1}})).kind,'NEEDS_ADAPTER');
 assert.equal(nextDecision(c,ctx(c,0,{catalogPockets:{potion:2}}),view('bag',{bag:{pocket:2}})).key,'potion');
 assert.equal(nextDecision(c,ctx(c),view('bag-command')).key,'use');assert.equal(nextDecision(c,ctx(c),view('bag-members')).key,'P1');
});
test('switch via stable member then actual switch-in command, no direct Session action',()=>{
 const c=program.cases[2];assert.equal(nextDecision(c,ctx(c,1),view('party')).key,'P2');
 assert.equal(nextDecision(c,ctx(c,1),view('party-command',{partySub:'switch',selectedMemberId:'P2'})).key,'switch-in');
});
test('trainer ball block and wild capture retain separate expected business entries',()=>{
 const trainer=program.cases[2],wild=program.cases[1];assert.equal(trainer.policy[2].expected,'blocked');
 assert.equal(nextDecision(wild,ctx(wild),view('bag-foes')).kind,'NEEDS_BINDING');
 assert.equal(nextDecision(wild,ctx(wild,0,{activeFoeStableId:'PUBLIC_F1'}),view('bag-foes')).key,'PUBLIC_F1');
});
test('normal stats/pause react explicitly; ordinary and brief typing just wait',()=>{
 const c=program.cases[2];assert.deepEqual(nextDecision(c,ctx(c),view('messages',{stats:{level:51,phase:'delta'}})),{kind:'ackStats',level:51,phase:'delta'});
 assert.equal(nextDecision(c,ctx(c),view('messages',{message:{implementation:'paused-message-v1',phase:'full'},logPaused:true})).kind,'ackPaused');
 for(const implementation of ['ordinary-message-v1','brief-message-v1'])assert.equal(nextDecision(c,ctx(c),view('messages',{ready:false,message:{implementation,phase:'typing'}})).kind,'wait');
});
test('learning keeps initial acceptance and zero-based slot3; later unplanned learning blocks',()=>{
 const c=program.cases[2];assert.equal(nextDecision(c,ctx(c),view('learn-initial')).key,'forget-move');assert.equal(nextDecision(c,ctx(c),view('learn')).key,3);
 const later=program.cases[6];assert.equal(nextDecision(later,ctx(later),view('learn')).kind,'NEEDS_BINDING');
 assert.throws(()=>nextDecision(c,ctx(c),view('learn-giveup')),/unexpected/);
});
test('replacement No and forced P1 preserve declared response, unknown targets never guessed',()=>{
 const c=program.cases[2];assert.equal(nextDecision(c,ctx(c),view('replacement-question')).key,'replace-no');
 assert.equal(nextDecision(c,ctx(c),view('wild-faint')).key,'next');const f=forced(c);assert.equal(nextDecision(c,f.context,f.before).key,'P1');
});
for(const [label,index] of [['moveUntilEnd',0],['item',2]])test(`P4-NATIVE-ULTRA-01: full forced selection and confirmation during ${label}`,()=>{
 const c=program.cases[index],f=forced(c),before=JSON.stringify(f.context),business=JSON.stringify(c);
 assert.equal(c.policy[0].kind,label);
 assert.deepEqual(nextDecision(c,f.context,f.before),{kind:'choose',phase:'party-forced',key:'P1'});
 const continued=observeForcedSelection(c,f.context,f.before,f.after);
 assert.deepEqual(nextDecision(c,continued,f.after),{kind:'choose',phase:'party-command',key:'switch-in'});
 assert.equal(continued.intentIndex,f.context.intentIndex,'selection does not advance business intention');
 assert.equal(JSON.stringify(f.context),before,'input context unchanged');assert.equal(JSON.stringify(c),business,'business plan unchanged');
});
test('forced continuation rejects missing, stale owner/request/case/intent/member or disabled confirmation',()=>{
 const c=program.cases[2],f=forced(c),continued=observeForcedSelection(c,f.context,f.before,f.after);
 assert.throws(()=>nextDecision(c,f.context,f.after),/missing\/mismatched/);
 for(const delta of [{ownerToken:'other-owner'},{forcedRequestToken:'forced-occurrence-2'},
   {selectedMemberId:'P2'},{items:[{key:'switch-in',enabled:false}]},{current:false}])
   assert.throws(()=>nextDecision(c,continued,{...f.after,...delta}));
 for(const prior of [{...continued.forcedReplacement,caseId:'other-case'},
   {...continued.forcedReplacement,intentIndex:1},{...continued.forcedReplacement,memberId:'P2'}])
   assert.throws(()=>nextDecision(c,{...continued,forcedReplacement:prior},f.after),/missing\/mismatched/);
 assert.throws(()=>nextDecision(c,{...continued,intentIndex:1},f.after),/missing\/mismatched/);
});
test('forced first layer refuses unknown/unavailable members and absent owner/request binding',()=>{
 const c=program.cases[0],f=forced(c);
 for(const items of [[],[{key:'P2',enabled:true}],[{key:'P1',enabled:false}],
   [{key:'P1',enabled:true},{key:'P1',enabled:true}]])assert.throws(()=>nextDecision(c,f.context,{...f.before,items}),/unknown\/unavailable/);
 assert.throws(()=>nextDecision(c,ctx(c),f.before),/binding missing/);
 assert.throws(()=>nextDecision(c,f.context,{...f.before,forcedRequestToken:null}),/binding missing/);
});
test('observer records only actual matching forced member-to-command transition',()=>{
 const c=program.cases[0],f=forced(c);
 for(const [before,after] of [[{...f.before,phase:'party'},f.after],[f.before,{...f.after,partySub:'switch'}],
   [f.before,{...f.after,selectedMemberId:'P2'}],[f.before,{...f.after,forcedRequestToken:'new-occurrence'}],
   [f.before,{...f.after,ownerToken:'other-owner'}],[f.before,{...f.after,ready:false}]])
   assert.throws(()=>observeForcedSelection(c,f.context,before,after));
});
test('ordinary switch retains matching stable target and rejects unknown command cause',()=>{
 const c=program.cases[2],context=ctx(c,1);
 assert.equal(nextDecision(c,context,view('party-command',{partySub:'switch',selectedMemberId:'P2'})).key,'switch-in');
 for(const delta of [{},{partySub:'switch',selectedMemberId:'P1'},{partySub:'unknown',selectedMemberId:'P2'}])
   assert.throws(()=>nextDecision(c,context,view('party-command',delta)),/cause mismatch/);
});
test('terminal confirmation requires actual expected outcome observation',()=>{
 const c=program.cases[0];assert.equal(nextDecision(c,ctx(c),view('end')).kind,'NEEDS_BINDING');
 assert.throws(()=>nextDecision(c,ctx(c,0,{observedOutcomeCode:999}),view('end')),/unexpected/);
 assert.equal(nextDecision(c,ctx(c,0,{observedOutcomeCode:c.expected.code}),view('end')).key,'end');
});
test('receiving/Map/Title never reuse BattleScene or invent automatic handoff inputs',()=>{
 const c=program.cases[1];for(const sceneKind of ['receiving','map','title'])assert.equal(nextDecision(c,ctx(c),view('',{sceneKind})).kind,'NEEDS_ADAPTER');
});
test('owner, case and normal-mode changes reject; extra commands after complete intents fail',()=>{
 const c=program.cases[0];assert.throws(()=>nextDecision(c,{caseId:'wrong'},view('main')),/wrong case/);
 assert.throws(()=>nextDecision(c,ctx(c),view('main',{current:false})),/stale/);
 assert.throws(()=>nextDecision(c,ctx(c),view('main',{fast:true})),/normal policy/);
 assert.throws(()=>nextDecision(c,ctx(c,99),view('main')),/extra command/);
});
