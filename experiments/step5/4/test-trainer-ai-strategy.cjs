'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {E,D,clone,inputs,content,fixture,inspect,diag}=require('./trainer-ai-integration/fixtures.cjs');
const ref=(id='slot-test',parameters={slot:2},version)=>({id,...(version?{version}:{}),parameters});
function choose(s,p){const r=s.request;if(r.kind==='wait'||r.kind==='finished')return {kind:'none',binding:s.binding,reason:r.kind};const all=r.kind==='move'?r.legalMoves:r.legalSwitches;const chosen=r.kind==='move'?all.find(c=>c.slot===p.slot)??all[0]:all[0];return {kind:'choose',binding:s.binding,candidateId:chosen.candidateId,retryOrder:[chosen.candidateId,...all.filter(c=>c!==chosen).map(c=>c.candidateId)],diagnostics:[]};}
function registry(decide=choose){const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'slot-test',version:'1',implementationIdentity:'test-only/slot/1',validateParameters(p){if(Object.keys(p).length!==1||![1,2].includes(p.slot))throw Error('invalid-slot-parameters');},create(){return {decide};}});return r;}
const actions=w=>w.gw._debugBattle().sides[1].choice.actions;
test('X1 JSON compile/runtime/projection preserve same strategy ref; record version remains independent',()=>{
 const raw=inputs({typeStrategy:ref('slot-test',{slot:1},'1'),recordStrategy:ref('slot-test',{slot:2},'1')});raw.trainers[0].version=37;
 const result=E.contentCompile.compileContent(raw);assert.equal(result.ok,true);assert.deepEqual(result.data.trainers[0].aiStrategy,raw.trainers[0].aiStrategy);
 const assembled=E.contentRuntime.assembleContent(JSON.parse(JSON.stringify(result.data)),E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);
 const c=assembled.content,p=E.trainerTeam.trainerBattleProjection(c.trainers['c-basic'][0],c.trainerTypes['c-trainer']);assert.equal(p.version,37);assert.deepEqual(p.ai.aiStrategy,raw.trainers[0].aiStrategy);
 assert.notEqual(p.ai.aiStrategy.parameters,c.trainers['c-basic'][0].aiStrategy.parameters);assert.throws(()=>{p.ai.aiStrategy.parameters.slot=1;},TypeError);assert.equal(c.trainers['c-basic'][0].aiStrategy.parameters.slot,2);
});
test('X1 record whole override never merges parameters across IDs; no reference defaults exact basic@1',()=>{
 const c=content({typeStrategy:ref('slot-test',{slot:2}),recordStrategy:ref('basic-gen8',{},'1')});const p=E.trainerTeam.trainerBattleProjection(c.trainers['c-basic'][0],c.trainerTypes['c-trainer']);assert.deepEqual(p.ai.aiStrategy,ref('basic-gen8',{},'1'));
 const old=content(),projected=E.trainerTeam.trainerBattleProjection(old.trainers['c-basic'][0],old.trainerTypes['c-trainer']);assert.deepEqual(projected.ai.aiStrategy,ref('basic-gen8',{},'1'));
});
test('X1 two formal trainers in one catalog choose different legal actual Showdown actions via App/composition/session',async()=>{
 const raw=inputs({typeStrategy:ref('slot-test',{slot:2})});raw.trainers.push({...clone(raw.trainers[0]),id:'c-override',aiStrategy:ref('slot-test',{slot:1})},{...clone(raw.trainers[0]),id:'c-default-rule',aiStrategy:ref('basic-gen8',{},'1')});
 const built=E.contentCompile.compileContent(raw),assembled=E.contentRuntime.assembleContent(built.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);
 const r=registry(),a=await fixture({content:assembled.content,registry:r}),b=await fixture({content:assembled.content,registry:r,trainerId:'c-override'}),c=await fixture({content:assembled.content,registry:r,trainerId:'c-default-rule'});
 assert.equal(diag(a).strategyBinding.id,'slot-test');assert.equal(diag(c).strategyBinding.id,'basic-gen8');
 for(const [w,expected]of [[a,'growl'],[b,'tackle'],[c,'tackle']]){await D.runTrainerAi(w.session,w.gw);assert.equal(actions(w).length,1);assert.equal(actions(w)[0].moveid,expected);assert.equal(diag(w).state.random.draws,w===c?1:0);assert.equal(w.gw._debugBattle().gen,8);}
});
for(const [name,reference,pattern]of [['id',ref('unregistered'),/unknown-strategy-id/],['version',ref('slot-test',{slot:1},'99'),/unknown-strategy-version/],['params',ref('slot-test',{slot:7}),/invalid-slot-parameters/],['basic params',ref('basic-gen8',{slot:1}),/invalid-basic-parameters/]])test('X1 unknown '+name+' refused at battle creation; no silent basic fallback',async()=>{let calls=0;await assert.rejects(fixture({recordStrategy:reference,registry:registry(()=>{calls++;throw Error('must not run');})}),pattern);assert.equal(calls,0);});
test('X1 strategy shape is descriptor-only bounded JSON in compiler and runtime, zero getters',()=>{
 let getters=0;const bad=[()=>Object.defineProperty({},'slot',{enumerable:true,get(){getters++;return 1;}}),()=>({slot:NaN}),()=>({slot:Infinity}),()=>({slot:()=>1}),()=>({slot:undefined}),()=>({slot:new Date()}),()=>({slot:[,1]}),()=>({slot:Object.assign([1],{extra:1})}),()=>({slot:'界'.repeat(3000)}),()=>{let x={};for(let i=0;i<9;i++)x={x};return x;},()=>{const x={};x.x=x;return x;},()=>Object.defineProperty({},'slot',{value:1,enumerable:false}),()=>({[Symbol('bad')]:1})];
 for(const make of bad){const raw=inputs();raw.trainers[0].aiStrategy=ref('slot-test',make());assert.equal(E.contentCompile.compileContent(raw).ok,false);}
 for(const mutate of [r=>r.path='./secret',r=>r.version=1,r=>r.parameters=[],r=>delete r.parameters,r=>Object.defineProperty(r,'id',{get(){getters++;return 'basic-gen8';},enumerable:true})]){const raw=inputs();raw.trainers[0].aiStrategy=ref();mutate(raw.trainers[0].aiStrategy);assert.equal(E.contentCompile.compileContent(raw).ok,false);}
 const raw=inputs();Object.defineProperty(raw.trainers[0],'aiStrategy',{enumerable:true,get(){getters++;return ref();}});assert.equal(E.contentCompile.compileContent(raw).ok,false);
 const good=E.contentCompile.compileContent(inputs());good.data.trainerTypes[0].aiStrategy=ref();Object.defineProperty(good.data.trainerTypes[0].aiStrategy.parameters,'slot',{enumerable:true,get(){getters++;return 2;}});assert.ok(E.contentRuntime.assembleContent(good.data,E.dex.createDexLookup()).errors.length);assert.equal(getters,0);
});
test('X1 exact 8KiB UTF8 and depth8 bounds accept normal nested pure parameters',()=>{
 const r=registry();const custom=E.composition.createTrainerAiStrategyRegistry();custom.register({id:'data',version:'1',implementationIdentity:'test/data',validateParameters(){},create(){return {decide:choose};}});
 const overhead=Buffer.byteLength(JSON.stringify(ref('data',{s:''})));assert.ok(custom.resolve(ref('data',{s:'a'.repeat(8192-overhead)})));assert.throws(()=>custom.resolve(ref('data',{s:'a'.repeat(8193-overhead)})),/invalid-data/);
 let x=1;for(let i=0;i<6;i++)x={x};assert.ok(custom.resolve(ref('data',{x})));assert.throws(()=>r.resolve(ref('slot-test',{slot:1,extra:1})),/invalid-slot/);
});
test('X1 synchronous strategy receives detached deep-frozen public snapshot, params and only AI random',async()=>{
 let received,random,drawValue;
 const w=await fixture({registry:registry(function(s,p,r){assert.equal(arguments.length,3);received=s;random=r;assert.ok(Object.isFrozen(s));assert.ok(Object.isFrozen(s.own.party[0].moves));assert.ok(Object.isFrozen(p));assert.throws(()=>{s.own.party[0].hp=0;},TypeError);assert.throws(()=>{p.slot=1;},TypeError);drawValue=r(100);return choose(s,p);}),recordStrategy:ref()});
 const before=w.gw.snapshot(),world=w.worldDraws();const result=inspect(w);assert.equal(result.plan.candidateId,received.request.legalMoves[1].candidateId);assert.equal(w.gw.snapshot(),before);assert.equal(w.worldDraws(),world);assert.equal(diag(w).state.random.draws,1);assert.ok(Number.isInteger(drawValue));assert.throws(()=>random(10),/random-closed/);
 assert.deepEqual(Object.keys(received).sort(),['schema','gen','format','binding','profile','own','opponent','field','request'].sort());assert.equal('choice'in received,false);assert.equal('pending'in received,false);assert.equal('driver'in received,false);
});
for(const [name,mutate]of [['extra field',p=>({...p,choice:'move 1'})],['unknown candidate',p=>({...p,candidateId:'forged',retryOrder:['forged']})],['duplicate retry',p=>({...p,retryOrder:[p.candidateId,p.candidateId]})],['fake binding',p=>({...p,binding:{...p.binding,generation:999}})],['accessor',p=>Object.defineProperty(p,'candidateId',{enumerable:true,get(){throw Error('getter invoked');}})]])test('X1 strict inspection rejects illegal strategy output '+name+' with zero actual action',async()=>{
 const w=await fixture({registry:registry((s,p)=>mutate(choose(s,p))),recordStrategy:ref()});assert.throws(()=>inspect(w),/invalid-strategy-intent|invalid-data/);assert.equal(actions(w).length,0);assert.equal(diag(w).state.random.draws,0);
});
test('X1 retained output aliases cannot change cached normalized decision; getter count stays zero',async()=>{
 let output,getters=0;const w=await fixture({registry:registry((s,p)=>output=choose(s,p)),recordStrategy:ref()});const first=inspect(w);output.retryOrder.reverse();output.binding={...output.binding,generation:987};assert.deepEqual(inspect(w).plan,first.plan);await D.runTrainerAi(w.session,w.gw);assert.equal(actions(w)[0].moveid,'growl');
 const bad=await fixture({registry:registry((s,p)=>Object.defineProperty(choose(s,p),'candidateId',{enumerable:true,get(){getters++;return 'forged';}})),recordStrategy:ref()});assert.throws(()=>inspect(bad),/invalid-data/);assert.equal(getters,0);assert.equal(actions(bad).length,0);
});
test('X1 legal DTO intent cannot bypass current private candidate qualification',async()=>{
 let w,calls=0;const r=registry((s,p)=>{calls++;w.gw._debugBattle().sides[1].activeRequest.active[0].moves[calls-1].disabled=true;return choose(s,p);});w=await fixture({registry:r,recordStrategy:ref()});await assert.rejects(D.runTrainerAi(w.session,w.gw),/request-revision-changed/);assert.equal(actions(w).length,0);assert.equal(calls,2);
});
test('X1 active version affects next battle; old battle pins actual method/params/catalog identity',async()=>{
 const r=registry(),old=await fixture({registry:r,recordStrategy:ref()});let newer=0;
 const entry={id:'slot-test',version:'2',implementationIdentity:'test-only/slot/2',validateParameters(p){assert.equal(p.slot,2);},create(){return {decide(s){newer++;return choose(s,{slot:1});}};}};r.register(entry);entry.create=()=>{throw Error('mutated descriptor');};
 const next=await fixture({registry:r,recordStrategy:ref()});await D.runTrainerAi(old.session,old.gw);await D.runTrainerAi(next.session,next.gw);assert.equal(actions(old)[0].moveid,'growl');assert.equal(actions(next)[0].moveid,'tackle');assert.equal(newer,1);
 assert.equal(diag(old).strategyBinding.version,'1');assert.equal(diag(next).strategyBinding.version,'2');assert.notEqual(diag(old).strategyBinding.implementationIdentity,diag(next).strategyBinding.implementationIdentity);assert.match(diag(old).strategyBinding.parametersHash,/^[a-f0-9]{64}$/);assert.equal(diag(old).strategyBinding.catalogIdentity,diag(old).catalogIdentity);
 r.setActive('slot-test','1');const exact=await fixture({registry:r,recordStrategy:ref('slot-test',{slot:2},'2')});assert.equal(diag(exact).strategyBinding.version,'2');
 assert.throws(()=>r.register({...entry,create(){return {decide:choose};}}),/already-registered/);assert.throws(()=>r.register({...entry,version:'3'}),/already-registered/);
});
test('batch2 accepts Promise strategies through the scheduling boundary',async()=>{const w=await fixture({registry:registry(async(s,p)=>choose(s,p)),recordStrategy:ref()});assert.equal(await D.runTrainerAi(w.session,w.gw),true);assert.equal(actions(w).length,1);assert.equal(actions(w)[0].moveid,'growl');});
test('four-failure controls: capture cannot auto-pass fainted actor or mutate engine',async()=>{
 const w=await fixture({items:[{item:'fullrestore',count:1}]});const p=w.gw._debugBattle().sides[1].active[0];p.hp=0;p.fainted=true;const before=w.gw.snapshot();assert.throws(()=>D.captureTrainerAiRequest(w.session,w.gw),/invalid-move-request/);assert.equal(w.gw.snapshot(),before);assert.equal(diag(w).state.resources[0].count,1);
});
test('C-L05 structural equality still detects altered engine fields after replay',async(t)=>{
 t.mock.method(Date,'now',()=>1793350000000);
 const w=await fixture(),cp=w.session._checkpoint();await w.session.chooseMove(1);const first=JSON.parse(w.session.gw.snapshot());await w.session._restoreCheckpoint(cp);await w.session.chooseMove(1);const replay=JSON.parse(w.session.gw.snapshot());assert.deepEqual(replay,first);replay.turn++;assert.notDeepEqual(replay,first);
});
test('C-L13 one actual revision rebuild succeeds (positive control)',async()=>{
 const w=await fixture({moves:['tackle','growl','splash'],skill:0});D.captureTrainerAiRequest(w.session,w.gw);let checks=0;w.setOnContent(()=>{if(++checks===2)w.gw._debugBattle().sides[1].activeRequest.active[0].moves[0].disabled=true;});await D.runTrainerAi(w.session,w.gw);assert.equal(actions(w).length,1);// C2 discards the stale attempt's RNG; only the accepted revision publishes once.
 assert.equal(diag(w).state.random.draws,1);w.setOnContent(null);
});
test('X1 default adapter preserves original basic decision and exact n/value trace on real collected DTO',async()=>{
 let policy,trace=[];const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'trace-basic',version:'1',implementationIdentity:'test/original-basic-trace',validateParameters(p){assert.deepEqual(p,{});},create(c){policy=E.trainerAi.createTrainerAiPolicy(c);return {decide:(s,_p,random)=>policy.decide(s,n=>{const v=random(n);trace.push({n,value:v});return v;})};}});
 for(const items of [[],[{item:'fullrestore',count:1}]]){
  const a=await fixture({items}),b=await fixture({items,registry:r,recordStrategy:ref('trace-basic',{},'1')});
  if(items.length){for(const w of [a,b]){const p=w.gw._debugBattle().sides[1].active[0];p.hp=40;p.maxhp=100;}}
  const x=inspect(a),y=inspect(b);assert.deepEqual(x.plan,y.plan);assert.deepEqual(diag(a).state.random,diag(b).state.random);
  const recorded=trace.splice(0),replayed=[];let i=0;const direct=policy.decide(x.snapshot,n=>{const step=recorded[i++];assert.equal(n,step.n);replayed.push(step);return step.value;});assert.equal(i,recorded.length);assert.deepEqual(direct,x.plan);assert.deepEqual(replayed,recorded);
 }
});
test('X1 submitted wait request invokes no strategy and makes no extra AI draw',async()=>{
 let calls=0;const w=await fixture({registry:registry((s,p)=>{calls++;return choose(s,p);}),recordStrategy:ref()});await D.runTrainerAi(w.session,w.gw);assert.equal(calls,1);
 // The private ticket remains spent: a repeat cannot ask the strategy to invent another action.
 await assert.rejects(D.runTrainerAi(w.session,w.gw),/already-submitted/);assert.equal(calls,1);assert.equal(diag(w).state.random.draws,0);
});

test('X1 bound actual strategy method survives later mutation of its implementation object',async()=>{
 let implementation;const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'actual-method',version:'1',implementationIdentity:'test/actual-method',validateParameters(){},create(catalog){assert.ok(Object.isFrozen(catalog));assert.deepEqual(Object.keys(catalog).sort(),['gen','moves','types','items'].sort());implementation={decide:s=>choose(s,{slot:2})};return implementation;}});
 const w=await fixture({registry:r,recordStrategy:ref('actual-method',{})});implementation.decide=()=>{throw Error('replacement must not run');};await D.runTrainerAi(w.session,w.gw);assert.equal(actions(w)[0].moveid,'growl');
});

test('X1 malformed collector data refuses before strategy or random; live fnt cannot masquerade as healthy',async()=>{
 let calls=0;const w=await fixture({registry:registry((s,p,r)=>{calls++;r(100);return choose(s,p);}),recordStrategy:ref()});w.gw._debugBattle().sides[1].active[0].status='fnt';await assert.rejects(D.runTrainerAi(w.session,w.gw),/invalid-public-snapshot/);assert.equal(calls,0);assert.equal(diag(w).state.random.draws,0);assert.equal(actions(w).length,0);
});

test('collector public Illusion replace has no HP field and preserves public history without reading real HP',async()=>{
 const w=await fixture(),before=D.captureTrainerAiRequest(w.session,w.gw).snapshot.opponent.active[0];const b=w.gw._debugBattle();b.add('replace',b.sides[0].active[0],'Zoroark, L50');w.gw._pump();const after=D.captureTrainerAiRequest(w.session,w.gw).snapshot.opponent.active[0];assert.equal(after.displayedSpecies,'zoroark');assert.deepEqual(after.hpBar,before.hpBar);assert.deepEqual(after.revealedMoves,before.revealedMoves);assert.deepEqual(after.stages,before.stages);assert.equal(after.status,before.status);
});
