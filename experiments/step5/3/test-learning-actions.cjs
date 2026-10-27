'use strict';
// E3 author composition checks only: no app/controller, owner lock, UI, persistent installation or full-M1 claim.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const F=require('./fixtures/learning-actions/helpers.cjs');
require('../../../scripts/tests/ts-source-loader.cjs');
const modules=Promise.all(['rules/learning-actions','rules/learning','rules/friendship','rules/inventory','rules/item-catalog','rules/stats',
  'rules/member-factory','rules/state','rules/save-schema','content/compile','flow/content-runtime']
  .map(file=>import(pathToFileURL(path.resolve(__dirname,'../../../src/framework',file+'.ts')).href))).then(parts=>Object.assign({},...parts));
const replace=slot=>({kind:'replace',slot});
const decline=giveUp=>({kind:'decline',giveUp});
const ready=plan=>{assert.equal(plan.status,'ready');return plan;};
const refusal=(plan,reason)=>{assert.deepEqual(plan,{status:'refused',reason});};
function noAuthority(plan) {for(const key of ['patch','member','inventory','effects','state','friendshipChanges'])assert.equal(Object.hasOwn(plan,key),false,key);}
function machine(M,c,itemId='TM57',entry='bag',quantity=2) {return {kind:'machine',entry,itemId,inventory:F.inventory(M,c,itemId,quantity)};}
function teaching(M,c,m=F.member(),source={kind:'generic',moveId:'chargebeam'},answers=[],context=F.context()) {
  return M.planTeachingAction(m,c,source,context,answers);
}
function installedStats(M,result) {
  let stats=M.newStats();
  for(const [key,n]of Object.entries(result.effects.statistics))stats=M.bumpStat(stats,key,n);
  return stats;
}

test('actual compiler/assembly uses canonical move IDs; generic/tutor use current-form tutor or any-level compatibility',async()=>{
  const M=await modules,c=await F.content(M),member=F.member();
  assert.equal(c.moves['Charge Beam'].id,'chargebeam');assert.equal(c.species.learner.tutorMoves[0],'Charge Beam');
  const generic=ready(teaching(M,c,member)),tutor=ready(teaching(M,c,member,{kind:'tutor',moveId:'chargebeam'}));
  const core=ready(M.planLearningQueue(member,[c.moves['Charge Beam']],{kind:'generic'},
    {shadow:false,hmMoves:['cut'],keepMachinePp:false,compatibility:'compatible'}));
  assert.deepEqual(generic.member,{...member,...core.patch});assert.deepEqual(generic.effects,core.effects);
  assert.deepEqual(generic.member.moves.at(-1),{id:'chargebeam',pp:10,maxpp:10,ppUps:0});
  assert.equal(generic.effects.statistics.moves_taught_by_tutor,0);assert.equal(installedStats(M,tutor).moves_taught_by_tutor,1);
  assert.deepEqual(tutor.member.firstMoves,member.firstMoves);assert.equal(tutor.member.friendship,99);
  assert.equal(ready(teaching(M,c,member,{kind:'generic',moveId:'rest'})).member.moves.at(-1).id,'rest');
  refusal(teaching(M,c,member,{kind:'generic',moveId:'Charge Beam'}),'invalid-move');
  refusal(teaching(M,c,member,{kind:'generic',moveId:'unlisted'}),'compatibility-unavailable');
  refusal(teaching(M,c,{...member,form:1}),'compatibility-unavailable');
  refusal(teaching(M,c,{...member,form:99}),'missing-exact-form');
});

test('teaching absent/egg/Shadow/already-known and unresolved references refuse without installable values',async()=>{
  const M=await modules,c=await F.content(M);
  for(const [m,ctx,reason]of [[null,F.context(),'absent-target'],[F.member({isEgg:true}),F.context(),'egg'],
    [F.member(),F.context({shadow:true}),'shadow'],[F.member({moves:[F.slot('chargebeam')]}),F.context(),'already-known']]) {
    const plan=teaching(M,c,m,undefined,[],ctx);refusal(plan,reason);noAuthority(plan);
  }
  const bad=F.clone(c);delete bad.moves['Growl'];refusal(teaching(M,bad),'move-data-unavailable');
  const missing=F.clone(c);delete missing.moves.Cut;refusal(teaching(M,missing),'move-data-unavailable');
});

for(const entry of ['bag','party'])test(`${entry} machine consumes true TR exactly once; full replacement composes actual C/F/B contracts`,async()=>{
  const M=await modules,c=await F.content(M,raw=>raw.settings={TAUGHT_MACHINES_KEEP_OLD_PP:true}),m=F.full(),source=machine(M,c,'TM57',entry);
  const before=F.clone({m,c,source}),ctx=F.context();F.freeze(m);F.freeze(c);F.freeze(source);F.freeze(ctx);
  const result=ready(teaching(M,c,m,source,[replace(1)],ctx));
  assert.deepEqual(result.member.moves[1],{id:'chargebeam',pp:3,maxpp:10,ppUps:0});
  assert.deepEqual(result.member.moves[0],m.moves[0]);assert.equal(result.member.friendship,103);
  assert.deepEqual(result.friendshipChanges,[M.planFriendshipChange({...ctx.friendshipSource,friendship:99},'machine',ctx.friendship)]);
  assert.equal(M.itemQuantity(result.inventory,'TM57',M.catalogOf(c)),1);
  assert.deepEqual(result.effects.itemsToConsume,[{itemId:'TM57',quantity:1}]);
  assert.equal(installedStats(M,result).moves_taught_by_item,entry==='bag'?1:0);
  assert.deepEqual(result.member.firstMoves,entry==='bag'?['tackle','chargebeam']:['tackle']);
  assert.deepEqual({m,c,source},before);
  // Every field outside the documented write set survives, including author identities/ready metadata.
  const retained=F.clone(result.member);for(const key of ['moves','firstMoves','friendship'])delete retained[key];
  const expected=F.clone(m);for(const key of ['moves','firstMoves','friendship'])delete expected[key];assert.deepEqual(retained,expected);
  result.member.owner.name='output';result.member.origin.text='output';result.member.moves[0].pp=9;
  result.inventory.pockets[3][0].quantity=99;result.effects.itemsToConsume[0].quantity=99;
  assert.deepEqual({m,c,source},before);
});

test('same-map, Luxury Ball, Soothe Bell and affection softcap are explicit source-time inputs',async()=>{
  const M=await modules,c=await F.content(M),source=machine(M,c),m=F.full({friendship:178});
  const capped=ready(teaching(M,c,m,source,[replace(1)],F.context({friendship:{mapId:8,AFFECTION_EFFECTS:true}})));
  assert.equal(capped.member.friendship,179);assert.equal(capped.friendshipChanges[0].delta,1);
  const unknown=ready(teaching(M,c,F.full(),source,[replace(1)],F.context({friendship:{mapId:null,AFFECTION_EFFECTS:false},
    friendshipSource:{item:'',ball:undefined,origin:{map:null}}})));
  assert.equal(unknown.member.friendship,100);assert.equal(unknown.friendshipChanges[0].delta,1);
  // The input member stores unrelated author IDs: source identity facts, not display names, determine modifiers.
  assert.equal(ready(teaching(M,c,F.full(),source,[replace(1)])).member.friendship,103);
  const zero=ready(teaching(M,c,F.full({friendship:200}),source,[replace(1)]));assert.equal(zero.member.friendship,200);
});

test('machine empty slot keeps full new PP and historical friendship256; replacement256 rejects the whole operation',async()=>{
  const M=await modules,c=await F.content(M,raw=>raw.settings={TAUGHT_MACHINES_KEEP_OLD_PP:true}),source=machine(M,c);
  const empty=ready(teaching(M,c,F.member({friendship:256}),source));
  assert.equal(empty.member.friendship,256);assert.deepEqual(empty.friendshipChanges,[]);assert.equal(empty.effects.machineFriendshipChanges,0);
  assert.deepEqual(empty.member.moves.at(-1),{id:'chargebeam',pp:10,maxpp:10,ppUps:0});
  const before=F.clone(source),rejected=teaching(M,c,F.full({friendship:256}),source,[replace(1)]);
  refusal(rejected,'friendship-out-of-domain');noAuthority(rejected);assert.deepEqual(source,before);
});

test('TM/HM/TR kind and consumption come from catalog fields, regardless of names and apparent prefixes',async()=>{
  const M=await modules,c=await F.content(M);
  for(const id of ['TR.unlimited','record-free']) {
    const source=machine(M,c,id),result=ready(teaching(M,c,F.member(),source));
    assert.equal(M.itemQuantity(result.inventory,id,M.catalogOf(c)),2);assert.deepEqual(result.effects.itemsToConsume,[]);
    assert.deepEqual(result.member.firstMoves,id==='record-free'?['tackle','chargebeam']:['tackle']);
  }
  // Cut is not in this species' explicit compatibility tables; absence of egg data remains unavailable.
  refusal(teaching(M,c,F.member(),machine(M,c,'fake-tr')),'compatibility-unavailable');
});

test('real HM directory protects learning but independent forgetting permits HM and protects the last move',async()=>{
  const M=await modules,c=await F.content(M,raw=>raw.species[0].tutorMoves.push('cut')),source=machine(M,c,'fake-tr');
  const hm=ready(teaching(M,c,F.member(),source));assert.equal(hm.member.moves.at(-1).id,'cut');assert.deepEqual(hm.effects.itemsToConsume,[]);
  assert.equal(M.itemQuantity(hm.inventory,'fake-tr',M.catalogOf(c)),2);
  const protectedPlan=teaching(M,c,F.full(),machine(M,c),[replace(0)]);assert.equal(protectedPlan.status,'pending');
  assert.equal(protectedPlan.selection.reason,'hm-protected');noAuthority(protectedPlan);
  assert.equal(ready(teaching(M,c,F.full(),machine(M,c),[replace(0),replace(1)])).member.moves[1].id,'chargebeam');
  const forgotten=ready(M.planForgettingAction(F.full(),0));assert.equal(forgotten.forgotten,'cut');assert.equal(forgotten.member.moves.length,3);
  assert.deepEqual(forgotten.member.firstMoves,['tackle']);
  refusal(M.planForgettingAction(F.member({moves:[F.slot('cut')]}),0),'last-move');
  assert.deepEqual(M.planForgettingAction(F.full(),null),{status:'cancelled'});noAuthority(M.planForgettingAction(F.full()));
});

test('resources, ordinary items, malformed inventory and invalid entry refuse before any pending or ready authority',async()=>{
  const M=await modules,c=await F.content(M);
  for(const [source,reason]of [[machine(M,c,'TM57','bag',0),'not-enough-items'],[machine(M,c,'ordinary'),'not-a-machine'],
    [{...machine(M,c),entry:'wrong'},'invalid-source'],[{...machine(M,c),itemId:'missing'},'unknown-item'],
    [{...machine(M,c),inventory:{pockets:[],indices:[],lastPocket:0}},'invalid-inventory']]) {
    const before=F.clone(source),plan=teaching(M,c,F.full(),source);refusal(plan,reason);noAuthority(plan);assert.deepEqual(source,before);
  }
  const unmapped=machine(M,c);unmapped.inventory.pockets[0].push({itemId:'missing',quantity:1});
  refusal(teaching(M,c,F.full(),unmapped),'unmapped-item');
});

test('give-up and pending have zero costs/stats; duplicate firstMoves history survives successful Bag TR append',async()=>{
  const M=await modules,c=await F.content(M),source=machine(M,c),m=F.full({firstMoves:['tackle','tackle','chargebeam']});
  const pending=teaching(M,c,m,source);assert.equal(pending.status,'pending');noAuthority(pending);
  const gaveUp=ready(teaching(M,c,m,source,[decline(true)]));assert.deepEqual(gaveUp.member,m);assert.deepEqual(gaveUp.inventory,source.inventory);
  assert.equal(Object.values(gaveUp.effects.statistics).reduce((a,b)=>a+b),0);assert.deepEqual(gaveUp.effects.itemsToConsume,[]);assert.deepEqual(gaveUp.friendshipChanges,[]);
  assert.deepEqual(ready(teaching(M,c,m,source,[replace(1)])).member.firstMoves,m.firstMoves);
  const long=F.member({firstMoves:Array(12).fill('tackle')});assert.equal(ready(teaching(M,c,long,source)).member.firstMoves.length,13);
  refusal(teaching(M,c,F.member(),source,[replace(0)]),'unexpected-answer');
});

test('generic and tutor replacement rebuild full PP without machine costs or friendship; inner give-up is zero success',async()=>{
  const M=await modules,c=await F.content(M,raw=>raw.settings={TAUGHT_MACHINES_KEEP_OLD_PP:true});
  for(const kind of ['generic','tutor']) {
    const source={kind,moveId:'chargebeam'},m=F.full();
    const result=ready(teaching(M,c,m,source,[replace(1)]));
    assert.deepEqual(result.member.moves[1],{id:'chargebeam',pp:10,maxpp:10,ppUps:0});assert.equal(result.member.friendship,m.friendship);
    assert.deepEqual(result.member.firstMoves,m.firstMoves);assert.deepEqual(result.effects.itemsToConsume,[]);assert.deepEqual(result.friendshipChanges,[]);
    const gaveUp=ready(teaching(M,c,m,source,[decline(true)]));assert.deepEqual(gaveUp.member,m);
    assert.equal(Object.values(gaveUp.effects.statistics).reduce((a,b)=>a+b),0);
  }
});

test('Bag TR record survives forgetting and becomes a reminder candidate; Party TR does not add that record',async()=>{
  const M=await modules,c=await F.content(M);
  const taught=ready(teaching(M,c,F.member(),machine(M,c))),party=ready(teaching(M,c,F.member(),machine(M,c,'TM57','party')));
  const bagForgot=ready(M.planForgettingAction(taught.member,1)).member,partyForgot=ready(M.planForgettingAction(party.member,1)).member;
  const bagList=M.planRelearningAction(bagForgot,c,{shadow:false}),partyList=M.planRelearningAction(partyForgot,c,{shadow:false});
  assert.deepEqual(bagList.selection.candidates,['chargebeam','growl']);assert.deepEqual(partyList.selection.candidates,['growl']);
  const learned=ready(M.planRelearningAction(bagForgot,c,{shadow:false},[{kind:'select',moveId:'chargebeam',teach:true}]));
  assert.equal(installedStats(M,learned).moves_taught_by_reminder,1);assert.deepEqual(learned.member.firstMoves,taught.member.firstMoves);
  assert.deepEqual(learned.effects.itemsToConsume,[]);assert.equal(learned.member.friendship,bagForgot.friendship);
});

test('reminder reuses all three C cancellation layers, empty lists and explicit configuration',async()=>{
  const M=await modules,c=await F.content(M),m=F.full({firstMoves:['chargebeam']});
  const call=answers=>M.planRelearningAction(m,c,{shadow:false},answers);
  const inner=call([{kind:'select',moveId:'chargebeam',teach:true,learning:[decline(true)]}]);assert.equal(inner.selection.kind,'candidate');noAuthority(inner);
  assert.equal(call([{kind:'select',moveId:'chargebeam',teach:false}]).selection.kind,'candidate');
  assert.equal(call([{kind:'exit',confirmed:false}]).selection.kind,'candidate');
  assert.equal(call([{kind:'exit'}]).selection.kind,'exit');assert.deepEqual(call([{kind:'exit',confirmed:true}]),{status:'exited'});
  const protectedPlan=call([{kind:'select',moveId:'chargebeam',teach:true,learning:[replace(0)]}]);
  assert.equal(protectedPlan.selection.kind,'learning');assert.equal(protectedPlan.selection.learning.reason,'hm-protected');noAuthority(protectedPlan);
  const learned=ready(call([{kind:'select',moveId:'chargebeam',teach:false},{kind:'exit',confirmed:false},
    {kind:'select',moveId:'chargebeam',teach:true,learning:[replace(1)]}]));assert.equal(learned.effects.statistics.moves_taught_by_reminder,1);
  for(const absent of [null,undefined,F.member({isEgg:true})])assert.deepEqual(M.planRelearningAction(absent,c,{shadow:false}),{status:'empty'});
  assert.deepEqual(M.planRelearningAction(F.member(),c,{shadow:true}),{status:'empty'});
  assert.deepEqual(M.planRelearningAction(F.member({form:1}),c,{shadow:false}),{status:'empty'});
  const limited=await F.content(M,raw=>raw.settings={MOVE_RELEARNER_CAN_TEACH_MORE_MOVES:false});
  assert.deepEqual(M.planRelearningAction(m,limited,{shadow:false}),{status:'empty'});
  refusal(M.planRelearningAction(m,limited,{shadow:false},[{kind:'select',moveId:'chargebeam',teach:true}]),'unexpected-answer');
});

test('zero-move legacy member and incoming draft values remain usable without party access or metadata allocation',async()=>{
  const M=await modules,c=await F.content(M),draft=F.member({id:'draft-only',moves:[],firstMoves:[],friendship:256}),before=F.clone(draft);
  F.freeze(draft);F.freeze(c);
  const learned=ready(teaching(M,c,draft));assert.equal(learned.member.id,'draft-only');assert.equal(learned.member.moves.length,1);
  assert.equal(learned.member.friendship,256);assert.deepEqual(draft,before);
  const selected=M.planForgettingAction(draft);assert.equal(selected.status,'pending');assert.deepEqual(selected.moves,[]);noAuthority(selected);
  refusal(M.planForgettingAction(draft,0),'invalid-slot');
  const reminder=ready(M.planRelearningAction(draft,c,{shadow:false},[{kind:'select',moveId:'growl',teach:true}]));assert.equal(reminder.member.moves[0].pp,40);
});

test('compiled-content negative machine move and absent tutor references are caught by the actual B boundary',async()=>{
  const M=await modules,raw=F.inputs();raw.items[0].move='unknownmove';
  const compiled=M.compileContent(raw,{}, {showdownSha:F.SHA});assert.equal(compiled.ok,true);
  assert.ok(M.assembleContent(compiled.data,F.dex()).errors.some(error=>/move is not in the pinned data/.test(error.message)));
  raw.items[0].move='chargebeam';raw.species[0].tutorMoves=['unknownmove'];
  const tutor=M.compileContent(raw,{}, {showdownSha:F.SHA});assert.equal(tutor.ok,true);
  assert.ok(M.assembleContent(tutor.data,F.dex()).errors.some(error=>/unknown move/.test(error.message)));
});

test('complete teaching/forgetting/reminder ready values compose into actual schema7-validated state copies',async()=>{
  const M=await modules,c=await F.content(M,raw=>raw.items.push({id:'pokeball',name:'Ball',flags:['PokeBall'],pocket:3,source:'author'}));
  const created=M.createMember({id:'created',species:'learner',level:5,form:0,context:{map:8,receivedAt:100}},c,()=>0);
  created.moves=['cut','tackle','growl','rest'].map(id=>{const move=F.moves.find(move=>move.id===id);return {id,pp:1,maxpp:Math.floor(move.pp*8/5),ppUps:3};});
  const state=M.newGame({party:[created],bag:{TM57:2},content:c}),before=F.clone(state);assert.deepEqual(M.validateGameContent(state,c),[]);F.freeze(state);
  const m=state.party[0],context={shadow:false,friendship:{mapId:8,AFFECTION_EFFECTS:false},friendshipSource:{ball:m.ball,item:m.item,origin:m.origin}};
  const taught=ready(teaching(M,c,m,{kind:'machine',entry:'bag',itemId:'TM57',inventory:state.inventory},[replace(1)],context));
  let next={...F.clone(state),party:[taught.member],inventory:taught.inventory,stats:installedStats(M,taught)};
  assert.deepEqual(M.validateGameContent(next,c),[]);assert.equal(next.stats.moves_taught_by_item,1);
  const forgotten=ready(M.planForgettingAction(next.party[0],1));next={...next,party:[forgotten.member]};assert.deepEqual(M.validateGameContent(next,c),[]);
  const relearned=ready(M.planRelearningAction(next.party[0],c,{shadow:false},[{kind:'select',moveId:'chargebeam',teach:true}]));
  next={...next,party:[relearned.member],stats:M.bumpStat(next.stats,'moves_taught_by_reminder',relearned.effects.statistics.moves_taught_by_reminder)};
  assert.deepEqual(M.validateGameContent(next,c),[]);assert.equal(next.stats.moves_taught_by_reminder,1);assert.deepEqual(state,before);
});
