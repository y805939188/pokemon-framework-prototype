'use strict';
// Dedicated pure-module gate. Not registered in the shared headless runner yet.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ai=require(process.env.PF_TRAINER_AI_TEST_MODULE || '../../../src/framework/rules/trainer-ai.ts');
test('real pure policy and arithmetic seams are present',()=>{
  for(const key of ['createTrainerAiPolicy','effectiveTrainerAiFlags','selectTrainerMove','scoreTrainerMove','scoreTrainerSwitch','chooseTrainerSwitch','preferTrainerItem'])
    assert.equal(typeof ai[key],'function',key);
});
const fs=require('node:fs'),path=require('node:path');
const {run,catalog,snapshot,addItem}=require('./trainer-ai-pure/adapter.cjs');
function subset(a,e){if(e===null||typeof e!=='object'||Array.isArray(e)){assert.deepEqual(a,e);return;}for(const[k,v]of Object.entries(e))subset(a[k],v);}
for(const group of ['selection','scoring','switch','items'])for(const c of JSON.parse(fs.readFileSync(path.join(__dirname,'trainer-ai-pure/vectors/'+group+'.json'),'utf8')).cases){
 test(c.id+' frozen '+c.entry,()=>{
  let cursor=0;const random=n=>{const e=c.randomScript[cursor++];assert.ok(e,'extra draw');assert.equal(n,e.n);return e.value;};
  const input=structuredClone(c.input),before=structuredClone(input),result=run(c.entry,input,random);
  assert.equal(cursor,c.randomScript.length);assert.deepEqual(input,before);
  if(c.entry==='profile-flags'){for(const f of c.expected.required)assert.ok(result.flags.includes(f));for(const f of c.expected.absent)assert.ok(!result.flags.includes(f));}
  else subset(result,c.expected);
 });
}
const policy=ai.createTrainerAiPolicy(catalog());
function decide(s,values=[0]){const calls=[];let i=0;return {result:policy.decide(s,n=>{calls.push(n);assert.ok(i<values.length,'unexpected draw');return values[i++];}),calls};}
function reject(s){const {result,calls}=decide(s,[]);assert.equal(result.kind,'error');assert.equal(result.reason,'invalid-snapshot');assert.deepEqual(calls,[]);}
function deepFreeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
test('complete move decision: weighted real scores, legal retry IDs, detached binding and frozen inputs',()=>{
 const s=deepFreeze(snapshot()),before=structuredClone(s),a=decide(s),b=decide(s);
 assert.equal(a.result.kind,'choose');assert.equal(a.result.candidateId,'M2');assert.deepEqual(a.result.retryOrder,['M2','M1']);assert.deepEqual(a.calls,[14]);assert.deepEqual(a,b);assert.deepEqual(s,before);assert.notEqual(a.result.binding,s.binding);
 assert.equal('hp' in a.result,false);assert.equal('choice' in a.result,false);
});
for(const[where,mutate]of [
 ['hidden opponent HP',s=>s.opponent.active[0].hp=42],['hidden opponent bench',s=>s.opponent.party=[]],['player choice',s=>s.choice='move 1'],['pending',s=>s.field.pending={}],['nested extra type data',s=>s.request.legalMoves[0].metadata.secret=1],['extra binding capability',s=>s.binding.sourceId='forged'],
 ['Gen9',s=>s.gen=9],['wrong format',s=>s.format='gen9customgame'],['player side',s=>s.own.side='p1'],['duplicate member',s=>s.own.party[1].memberId='npc1'],['duplicate party order',s=>s.own.party[1].partyOrder=0],['duplicate move identity',s=>s.request.legalMoves[1].candidateId='M1'],['duplicate slot target',s=>s.request.legalMoves.push(structuredClone({...s.request.legalMoves[0],candidateId:'dup'}))],['false PP',s=>s.own.party[0].moves[0].pp=0],['wrong move metadata',s=>s.request.legalMoves[1].metadata.basePower=1],['false public multiplier',s=>s.request.legalMoves[1].metadata.publicTypeMultiplier={numerator:1,denominator:1}],['unknown move',s=>s.own.party[0].moves[0].moveId='unknown'],['target missing',s=>s.request.legalMoves[0].target.appearanceKey='elsewhere'],['noninteger public bar',s=>s.opponent.active[0].hpBar.parts=80.1],['raw HP ratio',s=>s.opponent.active[0].hpBar.scale=1000],['faint bar contradiction',s=>s.opponent.active[0].fainted=true],['duplicate flag array extra',s=>s.profile.flags.foo=1],['NaN',s=>s.profile.skillLevel=NaN],['negative skill',s=>s.profile.skillLevel=-1],['bad RNG binding count',s=>s.binding.ownResourceRevision=-1],['unknown item resource',s=>s.own.resources.push({resourceKey:'bad',itemId:'unregistered',count:1})],['unknown status',s=>s.own.party[0].status='bad'],['symbol',s=>s[Symbol('secret')]=42],['nonenumerable hidden property',s=>Object.defineProperty(s,'private',{value:1})],['class object',s=>Object.setPrototypeOf(s,{inherited:1})],['sparse array',s=>delete s.own.party[0]],['cycle',s=>s.extra=s],
])test('runtime whitelist rejects '+where+' before RNG',()=>{const s=snapshot();mutate(s);reject(s);});
test('own accessors/toJSON never invoked, even inherited hostile metadata',()=>{
 let calls=0;for(const key of ['schema','toJSON']){const s=snapshot();Object.defineProperty(s,key,{enumerable:true,get(){calls++;throw Error('accessor');}});reject(s);}
 const s=snapshot();Object.setPrototypeOf(s.own.party[0],{get hp(){calls++;return 80;}});reject(s);assert.equal(calls,0);
});
test('catalog descriptors do not call getters; detachment prevents later mutation',()=>{
 let calls=0;const c=catalog();Object.defineProperty(c.moves.tackle,'basePower',{enumerable:true,get(){calls++;return 40;}});assert.throws(()=>ai.createTrainerAiPolicy(c));assert.equal(calls,0);
 const original=catalog(),p=ai.createTrainerAiPolicy(original);original.moves.tackle.basePower=999;assert.equal(p.decide(snapshot(),()=>0).kind,'choose');
});
test('RNG mutation cannot alter validated binding, legal retry list, or metadata',()=>{
 const s=snapshot();const result=policy.decide(s,n=>{assert.equal(n,14);s.binding.generation=999;s.request.legalMoves[0].candidateId='malicious';s.own.party[0].hp=0;return 0;});
 assert.equal(result.kind,'choose');assert.equal(result.binding.generation,1);assert.deepEqual(result.retryOrder,['M2','M1']);
});
for(const value of [-1,14,1.1,NaN,Infinity,undefined,'0',null])test('random response rejected without clamp/retry: '+String(value),()=>{
 let calls=0;const r=policy.decide(snapshot(),()=>{calls++;return value;});assert.equal(r.kind,'error');assert.equal(r.reason,'invalid-random-result');assert.equal(calls,1);
});
test('throwing RNG is failure, never first-legal success',()=>{let n=0;const r=policy.decide(snapshot(),()=>{n++;throw Error('RNG');});assert.equal(r.reason,'invalid-random-result');assert.equal(n,1);});
test('flags duplicates/Anti stay deterministic; skill clamp affects math not author skill validation',()=>{
 const f=ai.effectiveTrainerAiFlags(32,['ScoreMoves','ScoreMoves','AntiScoreMoves']);assert.ok(!f.flags.includes('ScoreMoves'));assert.ok(f.flags.includes('AntiScoreMoves'));
 const s=snapshot();s.profile.flags=['AntiScoreMoves','AntiScoreMoves'];const r=decide(s,[0]);assert.deepEqual(r.calls,[10]);assert.equal(r.result.candidateId,'M1');
});
test('invalid helper metadata / overflow rejected with zero RNG',()=>{
 for(const candidates of [[{candidateId:'a',score:Number.MAX_SAFE_INTEGER,requestOrder:0},{candidateId:'b',score:Number.MAX_SAFE_INTEGER,requestOrder:1},{candidateId:'c',score:Number.MAX_SAFE_INTEGER,requestOrder:2}],[{candidateId:'a',score:1,requestOrder:0},{candidateId:'a',score:2,requestOrder:1}]]){
  let calls=0;const r=ai.selectTrainerMove(0,candidates,()=>{calls++;return 0;});assert.equal(r.kind,'error');assert.equal(calls,0);
 }
 assert.equal(ai.scoreTrainerMove({basePower:Number.MAX_SAFE_INTEGER,stab:true,publicTypeMultiplier:{numerator:16,denominator:1},accuracy:100,family:'basic-damage',scoreMoves:true,predictFailure:true,publicFailure:'none'}).kind,'error');
});
test('item decision precedes moves; trainer resource never modified',()=>{
 const s=snapshot();s.own.party[0].hp=25;addItem(s,'potion','P');addItem(s,'hyperpotion','H');const before=structuredClone(s),r=decide(s,[]);assert.equal(r.result.candidateId,'H');assert.deepEqual(r.calls,[]);assert.deepEqual(s,before);
});
test('HP gate decline consumes exactly gate+move draw; accept consumes only gate',()=>{
 const s=snapshot();s.own.party[0].hp=30;addItem(s,'potion');let r=decide(s,[30,0]);assert.deepEqual(r.calls,[100,14]);assert.equal(r.result.candidateId,'M2');r=decide(s,[29]);assert.deepEqual(r.calls,[100]);assert.equal(r.result.candidateId,'potion');
});
test('fullrestore confusion-only intent, unsupported resources diagnostic, zero-effect candidate rejects',()=>{
 const s=snapshot();s.own.party[0].hp=100;s.own.party[0].confusionTurns=1;addItem(s,'fullrestore');s.own.resources.push({resourceKey:'pp',itemId:'ether',count:1});
 const r=decide(s,[39]);assert.deepEqual(r.calls,[100]);assert.equal(r.result.candidateId,'fullrestore');assert.ok(r.result.diagnostics.includes('unsupported-trainer-item-family'));assert.equal('effectAmountIsNotEstimate' in r.result,false);
 s.own.party[0].confusionTurns=0;reject(s);
});
for(const[name,mutate]of [['empty resource',s=>s.own.resources[0].count=0],['wrong owner',s=>s.request.legalItems[0].targetMemberId='npc2'],['false estimate',s=>s.request.legalItems[0].estimateHp=999],['false status family',s=>s.request.legalItems[0].family='full-restore'],['wrong resource',s=>s.request.legalItems[0].resourceKey='other']])test('supported item mismatch is fatal: '+name,()=>{const s=snapshot();s.own.party[0].hp=25;addItem(s,'potion');mutate(s);reject(s);});
test('public-only force-switch computes from own/public metadata, never draws or switches voluntarily',()=>{
 const s=snapshot();s.request={kind:'force-switch',legalSwitches:[{candidateId:'SW',memberId:'npc2'}]};s.own.party[0].hp=0;
 const r=decide(s,[]);assert.equal(r.result.kind,'choose');assert.equal(r.result.candidateId,'SW');assert.deepEqual(r.calls,[]);
 for(const id of ['npc1','missing']){const x=structuredClone(s);x.request.legalSwitches[0].memberId=id;reject(x);}
});
test('no force replacement is no-legal-action; no move/struggle invented',()=>{const s=snapshot();s.request={kind:'force-switch',legalSwitches:[]};const r=decide(s,[]);assert.equal(r.result.reason,'no-legal-action');assert.deepEqual(r.calls,[]);});
test('public shown appearance changes features; opaque binding does not change scoring/RNG',()=>{
 const s=snapshot(),x=structuredClone(s);x.binding={...s.binding,requestKey:'different',generation:9,turn:90};assert.equal(decide(x).result.candidateId,decide(s).result.candidateId);assert.deepEqual(decide(x).calls,decide(s).calls);
 x.opponent.active[0].displayedSpecies='IllusionShown';assert.equal(decide(x).result.kind,'choose');
});
test('unmodeled legal move remains candidate with explicit diagnostic',()=>{const s=snapshot();s.own.party[0].moves=[{slot:1,moveId:'metronome',pp:10,maxpp:10}];s.request.legalMoves=[{candidateId:'U',slot:1,moveId:'metronome',mode:'normal',target:{kind:'self'},metadata:{...catalog().moves.metronome,publicTypeMultiplier:{numerator:1,denominator:1},publicFailure:'none',omittedModifiers:[]}}];const r=decide(s);assert.equal(r.result.candidateId,'U');assert.ok(r.result.diagnostics.includes('unmodeled-move-family'));assert.deepEqual(r.calls,[3]);});
test('status/unmodeled type is not a damaging immunity without an explicit public failure',()=>{
 const score=ai.scoreTrainerMove({basePower:0,stab:false,publicTypeMultiplier:{numerator:0,denominator:1},accuracy:100,family:'known-useless',scoreMoves:true,predictFailure:true,publicFailure:'none'});assert.equal(score.score,60);
 const failure=ai.scoreTrainerMove({basePower:0,stab:false,publicTypeMultiplier:{numerator:0,denominator:1},accuracy:100,family:'unmodeled',scoreMoves:true,predictFailure:true,publicFailure:'public-condition'});assert.equal(failure.score,20);
});
test('public immunity damaging move is penalized before ScoreMoves; AntiPrediction returns proxy neutral',()=>{
 const s=snapshot();s.opponent.active[0].shownTypes=['ground'];s.request.legalMoves[1].metadata.publicTypeMultiplier={numerator:0,denominator:1};
 let r=decide(s);assert.equal(r.result.candidateId,'M1');assert.deepEqual(r.calls,[8]);
 s.profile.flags=['AntiPredictMoveFailure'];r=decide(s);assert.equal(r.result.candidateId,'M1');assert.deepEqual(r.calls,[8]);
});
test('type chart / metadata errors at construction are not silently normalized',()=>{
 for(const mutate of [c=>c.gen=9,c=>c.moves.tackle.basePower=NaN,c=>c.moves.tackle.private=42,c=>c.types.normal.water={numerator:3,denominator:1},c=>delete c.types.normal.water,c=>c.items.fullrestore.estimateHp=99,c=>c.items.potion.curesConfusion=true]){const c=catalog();mutate(c);assert.throws(()=>ai.createTrainerAiPolicy(c));}
});
test('author item IDs outside Showdown remain supported, independent of the held-item namespace',()=>{
 const c=catalog();c.items['author-med-kit']=structuredClone(c.items.potion);const p=ai.createTrainerAiPolicy(c),s=snapshot();s.own.party[0].hp=25;
 s.own.resources=[{resourceKey:'author',itemId:'author-med-kit',count:1}];s.request.legalItems=[{candidateId:'author-use',resourceKey:'author',itemId:'author-med-kit',targetMemberId:'npc1',...c.items['author-med-kit']}];
 const r=p.decide(s,()=>{throw Error('must not draw');});assert.equal(r.kind,'choose');assert.equal(r.candidateId,'author-use');
});
test('duplicate author resource identity, dead actor and duplicate switches reject before RNG',()=>{
 let s=snapshot();s.own.party[0].hp=25;addItem(s,'potion');s.own.resources.push({...s.own.resources[0],resourceKey:'dup'});reject(s);
 s=snapshot();s.own.party[0].hp=0;reject(s);
 s=snapshot();s.request={kind:'force-switch',legalSwitches:[{candidateId:'a',memberId:'npc2'},{candidateId:'b',memberId:'npc2'}]};reject(s);
});
test('unknown flags stay in the profile result, with omitted-model diagnosis on a decision',()=>{
 assert.ok(ai.effectiveTrainerAiFlags(10,['FutureStrategy']).flags.includes('FutureStrategy'));
 const s=snapshot();s.profile.flags=['FutureStrategy'];assert.ok(decide(s).result.diagnostics.includes('omitted-public-modifier'));
});
test('snapshot double/zero type entries, inconsistent visible last move and invalid stages reject',()=>{
 for(const mutate of [s=>s.own.party[0].types=[],s=>s.own.party[0].types=['normal','normal'],s=>s.opponent.active[0].shownTypes=['unregistered'],s=>s.opponent.active[0].stages.atk=7,s=>s.opponent.active[0].lastPublicMove={moveId:'ember',moveType:'fire',basePower:40}]){const s=snapshot();mutate(s);reject(s);}
});
test('force reserve uses the full owner roster last member, not only the legal candidates',()=>{
 const s=snapshot();s.own.party.push({...structuredClone(s.own.party[1]),memberId:'npc3',partyOrder:5,hp:1});s.request={kind:'force-switch',legalSwitches:[{candidateId:'last',memberId:'npc3'},{candidateId:'other',memberId:'npc2'}]};
 let r=decide(s,[]);assert.equal(r.result.candidateId,'other');assert.deepEqual(r.result.retryOrder,['other','last']);
 s.request.legalSwitches=[s.request.legalSwitches[0]];r=decide(s,[]);assert.equal(r.result.candidateId,'last');
});
test('force entry estimates use public p2 hazard tags and own boots, not opponent private hazard preflight',()=>{
 const s=snapshot();s.profile.skillLevel=32;s.own.party.push({...structuredClone(s.own.party[1]),memberId:'npc3',partyOrder:2});s.own.party[1].hp=1;s.request={kind:'force-switch',legalSwitches:[{candidateId:'A',memberId:'npc2'},{candidateId:'B',memberId:'npc3'}]};s.field.publicConditions=['p2:spikes:1'];
 let r=decide(s,[]);assert.equal(r.result.candidateId,'B');
 s.own.party[1].knownHeldItem='Heavy-Duty Boots';r=decide(s,[]);assert.equal(r.result.candidateId,'A');
});
test('sleep cure no status RNG; poison gate and HP gate order remain explicit',()=>{
 const s=snapshot();s.own.party[0].hp=100;s.own.party[0].status='slp';addItem(s,'awakening');let r=decide(s,[]);assert.equal(r.result.candidateId,'awakening');assert.deepEqual(r.calls,[]);
 const x=snapshot();x.own.party[0].hp=30;x.own.party[0].status='psn';addItem(x,'potion');addItem(x,'antidote');r=decide(x,[30,39]);assert.deepEqual(r.calls,[100,100]);assert.equal(r.result.candidateId,'antidote');
});
test('partial cure includes toxic poison only if catalog declares it; non-curable supported candidate is invalid',()=>{
 const s=snapshot();s.own.party[0].hp=100;s.own.party[0].status='tox';addItem(s,'antidote');assert.equal(decide(s,[0]).result.candidateId,'antidote');
 s.own.party[0].status='brn';reject(s);
});
test('null-prototype detached plain data is accepted; existing input aliases are not mutated',()=>{
 const s=snapshot();Object.setPrototypeOf(s,null);Object.setPrototypeOf(s.binding,null);const before=structuredClone(s);assert.equal(decide(s).result.kind,'choose');assert.deepEqual(structuredClone(s),before);
});
test('selection seam snapshots input before RNG; callback cannot rewrite IDs or retry ordering',()=>{
 const candidates=[{candidateId:'A',requestOrder:0,score:100},{candidateId:'B',requestOrder:1,score:90}];
 const r=ai.selectTrainerMove(0,candidates,n=>{assert.equal(n,70);candidates[0].candidateId='injected';candidates[1].score=999;return 0;});
 assert.equal(r.kind,'choose');assert.equal(r.candidateId,'A');assert.deepEqual(r.retryOrder,['A','B']);
});
// C-PURE-ULTRA-01: incomplete normal enumeration is refused before all item probability/mandatory paths.
for(const[family,hp,status,values]of [
 ['hp-quarter',25,'none',[]],['hp-gate-accept',30,'none',[29]],['hp-gate-decline',30,'none',[30]],
 ['status-gate-accept',100,'psn',[39]],['status-gate-decline',100,'psn',[40]],['sleep-mandatory',100,'slp',[]],
])test('incomplete moves refuse with zero draws: '+family,()=>{
 const s=snapshot();s.own.party[0].hp=hp;s.own.party[0].status=status;addItem(s,status==='slp'?'awakening':status==='psn'?'antidote':'potion');s.request.legalMoves=[];
 const before=structuredClone(s),r=decide(s,values);assert.equal(r.result.kind,'error');assert.equal(r.result.reason,'invalid-snapshot');assert.deepEqual(r.calls,[]);assert.deepEqual(s,before);
});
function withAuto(s){s.request.legalMoves=[{candidateId:'AUTO',slot:1,moveId:'struggle',mode:'engine-auto-struggle',target:{kind:'opponent',appearanceKey:'shown1'},metadata:{...catalog().moves.struggle,publicTypeMultiplier:{numerator:1,denominator:1},publicFailure:'none',omittedModifiers:[]}}];}
for(const[name,hp,status,values,kind,chosen]of [
 ['hp-quarter',25,'none',[],'choose','potion'],['hp-accept',30,'none',[29],'choose','potion'],['hp-decline',30,'none',[30],'fallback','AUTO'],
 ['status-accept',100,'psn',[39],'choose','antidote'],['status-decline',100,'psn',[40],'fallback','AUTO'],['sleep',100,'slp',[],'choose','awakening'],
])test('explicit engine auto candidate preserves item behavior: '+name,()=>{
 const s=snapshot();s.own.party[0].hp=hp;s.own.party[0].status=status;addItem(s,status==='slp'?'awakening':status==='psn'?'antidote':'potion');withAuto(s);
 const before=structuredClone(s),r=decide(s,values);assert.equal(r.result.kind,kind);assert.deepEqual(r.calls,values.map(()=>100));assert.deepEqual(s,before);
 if(kind==='choose')assert.equal(r.result.candidateId,chosen);else{assert.deepEqual(r.result.candidateIds,[chosen]);assert.equal(r.result.reason,'no-normal-move');}
});
test('incomplete move enumeration with no item remains no-legal-action and zero draws',()=>{const s=snapshot();s.request.legalMoves=[];const before=structuredClone(s),r=decide(s,[]);assert.equal(r.result.reason,'no-legal-action');assert.deepEqual(r.calls,[]);assert.deepEqual(s,before);});
