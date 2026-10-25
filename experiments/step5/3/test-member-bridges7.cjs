'use strict';
// Formal-spec-derived B4 bridge expectations. No reference runtime or evolution transaction is exercised.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../../js/engine/build/core.cjs');
const { memberFactory: F, memberIdentity: I, memberMetadata: M, heal: H, receiving: R, state: S, storage: T, storageOperations: O } = C;
const copy = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const stats = { hp:45, atk:49, def:49, spa:65, spd:65, spe:45 };
const sp = { base:stats, growth:'medium', baseExp:64, evYield:{}, catchRate:255, learnset:{1:['Tackle']}, abilities:['Overgrow',null,'Third'], hiddenAbilities:[null,'Chlorophyll'], gender:128, happiness:256 };
const content = { species:{Bulbasaur:sp}, moves:{Tackle:{id:'tackle',name:'Tackle',pp:35}} };
const firstMoves = ['tackle','growl','amnesia','curse','ingrain','charm','tackle'];
const context = { content, limits:C.limits.DEFAULT_LIMITS, profile:{mode:1,naming:1} };
const make = (id = 'M1', extra = {}) => ({ ...F.createMember({id,species:'Bulbasaur',level:5,owner:{id:0x12345678,name:'Trainer',gender:1,language:1},context:{map:9,receivedAt:123}}, content, () => 0), ...extra });
const unknown = (id = 'M1', extra = {}) => make(id, {readyToEvolve:true,evolutionReadiness:'unknown',cannotTrade:true,abilityIndex:null,effectiveAbilityIndex:null,firstMoves:[...firstMoves],...extra});
const collection = party => ({party,storage:T.newStorage()});
const ref = (member, index = 0) => ({id:member.id,position:{kind:'party',index}});
const persistentOnly = ['form','personalID','owner','origin','ownerCompatibilityDefault','abilityIndex','effectiveAbilityIndex','shiny','superShiny','firstMoves','markings','ribbons','cannotStore','cannotRelease','cannotTrade','isEgg','mail','readyToEvolve','evolutionReadiness','statNature'];

test('B11/B15: creation initializes false/known and cannotTrade false without extra random draws', () => {
  const draws = [];
  const member = F.createMember({id:'new',species:'Bulbasaur',level:5}, content, n => { draws.push(n); return 0; });
  assert.deepEqual([member.readyToEvolve,member.evolutionReadiness,member.cannotTrade], [false,'known',false]);
  assert.equal(member.friendship,256);
  assert.deepEqual(draws,[65536,65536,32,32,32,32,32,32]);
  assert.deepEqual(member.firstMoves,[]);
  for (const key of ['K','D','L0','battleId','pendingEvolution','evolutionQueue']) assert.equal(Object.hasOwn(member,key),false,key);
  R.requireTemplate(member,member.id);
});

test('B11/B14/B15: completion preserves true/unknown, null slots, long duplicate first records and PID', () => {
  const member = freeze(unknown('complete',{form:7,nature:'bold',gender:'M',ability:'Trusted Override',statNature:'calm',cannotRelease:false}));
  const before = copy(member);
  const completed = I.completeIndividual(member,sp,{different:'legacy input must not replace an existing PID'});
  assert.deepEqual(completed,before);
  assert.equal(completed.personalID,member.personalID);
  completed.moves[0].pp = 0; completed.ivs.hp = 2; completed.evs.atk = 3;
  completed.owner.name = 'changed'; completed.origin.map = 99; completed.firstMoves.push('new');
  assert.deepEqual(member,before);
});

test('B11: completion fills absent schema7 defaults independently of cannotRelease', () => {
  const legacy = make('legacy',{cannotRelease:true});
  delete legacy.readyToEvolve; delete legacy.evolutionReadiness; delete legacy.cannotTrade;
  const before = copy(legacy);
  const completed = I.completeIndividual(legacy,sp);
  assert.deepEqual([completed.readyToEvolve,completed.evolutionReadiness,completed.cannotTrade], [false,'known',false]);
  assert.equal(completed.cannotRelease,true);
  assert.deepEqual(legacy,before);
  const oldReady = I.completeIndividual({...legacy,readyToEvolve:true},sp);
  assert.deepEqual([oldReady.readyToEvolve,oldReady.evolutionReadiness],[true,'known']);
});

test('B18: pure clone keeps every persistent field with independent nested data', () => {
  const member = freeze(unknown('clone',{form:3,statNature:'calm',markings:[1,2],ribbons:['Champion'],mail:'letter'}));
  const result = M.clonePersistentMember(member);
  assert.deepEqual(result,member);
  for (const key of ['moves','ivs','evs','owner','origin','firstMoves','markings','ribbons']) assert.notStrictEqual(result[key],member[key],key);
  result.moves[0].pp = 0; result.owner.id = 7; result.origin.text = 'new'; result.ribbons.push('Other');
  assert.equal(member.moves[0].pp,35); assert.equal(member.owner.id,0x12345678); assert.equal(member.origin.text,''); assert.deepEqual(member.ribbons,['Champion']);
  assert.equal(result.personalID,member.personalID);
});

test('B16: complete templates accept all three legal R pairs, null slots and empty current moves', () => {
  for (const [readyToEvolve,evolutionReadiness] of [[false,'known'],[true,'known'],[true,'unknown']]) {
    const member = unknown('valid',{readyToEvolve,evolutionReadiness,moves:[]});
    assert.doesNotThrow(() => R.requireTemplate(member,member.id));
    assert.deepEqual(member.firstMoves,firstMoves);
    assert.deepEqual([member.abilityIndex,member.effectiveAbilityIndex],[null,null]);
  }
});

test('B16: templates reject missing or malformed new metadata and false/unknown without repairing it', () => {
  const changes = [
    {readyToEvolve:undefined}, {readyToEvolve:null}, {readyToEvolve:'true'},
    {evolutionReadiness:undefined}, {evolutionReadiness:null}, {evolutionReadiness:'maybe'},
    {readyToEvolve:false,evolutionReadiness:'unknown'},
    {cannotTrade:undefined}, {cannotTrade:null}, {cannotTrade:1},
  ];
  for (const change of changes) {
    const member = unknown('bad',change), before = copy(member);
    assert.throws(() => R.requireTemplate(member,member.id),error => error instanceof R.ReceivingRefused && error.reason === 'no-template');
    assert.deepEqual(copy(member),before);
  }
  assert.throws(() => R.requireTemplate(unknown('actual'),'other'),/complete original individual template/);
  assert.throws(() => R.requireTemplate(S.protocolMember(unknown('raw')),'raw'),/complete original individual template/);
});

test('B11: ordinary complete heal clears both R fields and preserves unrelated metadata', () => {
  const member = freeze(unknown('heal',{hp:0,status:'slp',statusCount:3,moves:[{id:'tackle',pp:0,maxpp:56,ppUps:3}]}));
  const healed = H.healMember(member,content);
  assert.deepEqual(healed,{...copy(member),hp:C.growth.computeStats(sp.base,member.ivs,member.evs,member.level,member.nature).hp,status:'',statusCount:0,moves:[{id:'tackle',pp:56,maxpp:56,ppUps:3}],readyToEvolve:false,evolutionReadiness:'known'});
  assert.equal(healed.friendship,256);
  assert.equal(healed.cannotTrade,true);
  assert.deepEqual(H.healMember(healed,content),healed);
});

test('B11: preserveReadyToEvolve preserves the complete R pair while healing resources', () => {
  for (const [readyToEvolve,evolutionReadiness] of [[false,'known'],[true,'known'],[true,'unknown']]) {
    const member = freeze(unknown('preserve',{hp:1,status:'par',statusCount:2,readyToEvolve,evolutionReadiness}));
    const healed = H.healMember(member,content,{preserveReadyToEvolve:true});
    assert.deepEqual([healed.readyToEvolve,healed.evolutionReadiness],[readyToEvolve,evolutionReadiness]);
    assert.ok(healed.hp > 1); assert.equal(healed.status,''); assert.equal(healed.statusCount,0);
    healed.firstMoves.push('new'); assert.deepEqual(member.firstMoves,firstMoves);
  }
});

test('B11: egg heal remains a pure unchanged copy, including true/unknown', () => {
  const egg = freeze(unknown('egg',{isEgg:true,hp:1,status:'slp',statusCount:2,moves:[{id:'tackle',pp:0,maxpp:35,ppUps:0}]}));
  for (const options of [{},{preserveReadyToEvolve:true}]) {
    const healed = H.healMember(egg,{species:{}},options);
    assert.deepEqual(healed,egg); assert.notStrictEqual(healed,egg); assert.notStrictEqual(healed.moves,egg.moves);
  }
});

test('B11: party and all-member healing clear only their configured collection', () => {
  const state = collection([unknown('party',{hp:1})]); state.storage.boxes[39].slots[29] = unknown('last-slot',{hp:1});
  const before = copy(state), party = H.healParty(state,content);
  assert.deepEqual([party.party[0].readyToEvolve,party.party[0].evolutionReadiness],[false,'known']);
  assert.deepEqual(party.storage,state.storage);
  const all = H.recoverAll(state,content,false), depositHeals = H.recoverAll(state,content,true);
  assert.deepEqual([all.storage.boxes[39].slots[29].readyToEvolve,all.storage.boxes[39].slots[29].evolutionReadiness],[false,'known']);
  assert.deepEqual(depositHeals.storage,state.storage); assert.deepEqual(state,before);
});

test('B11/B14/B15: storage movement with deposit healing preserves unknown R and all metadata', () => {
  const member = unknown('move',{hp:1}), state = collection([member,make('able')]), before = copy(state);
  const moved = O.moveMember(state,ref(member),{kind:'box',box:39,slot:29},null,{...context,depositHeal:true});
  const boxed = moved.storage.boxes[39].slots[29];
  assert.deepEqual(boxed,{...before.party[0],hp:H.healMember(member,content).hp,status:'',statusCount:0});
  assert.deepEqual(state,before); assert.equal(boxed.friendship,256); assert.equal(boxed.cannotTrade,true);
});

test('B11/B16: reception and replacement deposit preserve original member metadata and unknown R', () => {
  const old = unknown('old',{hp:1}), incoming = unknown('incoming',{hp:1}), state = collection([old]), before = copy(state), incomingBefore = copy(incoming);
  const result = R.receiveMembers(state,[incoming],{incoming:{placement:{kind:'replace',target:ref(old)}}},{...context,limits:{...context.limits,party:1},depositHeal:true});
  const boxed = result.state.storage.boxes[0].slots[0];
  assert.deepEqual(boxed,{...before.party[0],hp:H.healMember(old,content).hp,status:'',statusCount:0});
  const received = result.state.party[0];
  for (const key of ['personalID','owner','origin','abilityIndex','effectiveAbilityIndex','cannotTrade','readyToEvolve','evolutionReadiness','friendship']) assert.deepEqual(received[key],incoming[key],key);
  assert.deepEqual(state,before); assert.deepEqual(incoming,incomingBefore);
  // Existing reception finalization of incoming firstMoves is owned by E; this test does not change its timing.
});

test('B11/B16: automatic reception into a box preserves unknown R through deposit healing', () => {
  const incoming = unknown('boxed',{hp:1}), state = collection([make('old')]);
  const received = R.receiveMembers(state,[incoming],{}, {...context,limits:{...context.limits,party:1},depositHeal:true}).state.storage.boxes[0].slots[0];
  assert.deepEqual([received.readyToEvolve,received.evolutionReadiness,received.cannotTrade,received.abilityIndex,received.effectiveAbilityIndex,received.friendship],[true,'unknown',true,null,null,256]);
  assert.ok(received.hp > 1); assert.equal(incoming.hp,1);
});

test('B16: incomplete receiving template fails atomically before installing any member', () => {
  const state = collection([make('old')]), good = unknown('good'), bad = unknown('bad'); delete bad.evolutionReadiness;
  const before = copy(state);
  assert.throws(() => R.receiveMembers(state,[good,bad],{},context),error => error.reason === 'no-template');
  assert.deepEqual(state,before); assert.deepEqual(good.firstMoves,firstMoves);
});

test('B14/B16: captured bridge restores original persistent metadata and leaves the frozen raw record unchanged', () => {
  const template = freeze(unknown('caught',{form:4}));
  const raw = S.protocolMember({...template,hp:1,status:'slp',statusCount:3});
  const result = {protocol:1,battleId:'capture',outcome:{kind:'caught',winner:null},members:{},bag:{},captured:[raw],dex:{seen:[],owned:[]}};
  const before = copy(result), hash = S.resultHash(result);
  const [restored] = S.capturedTemplates(result,{caught:template},() => ({species:'Bulbasaur',form:4}),content);
  for (const key of persistentOnly) assert.deepEqual(restored[key],template[key],key);
  assert.equal(restored.hp,1); assert.equal(restored.status,'slp'); assert.equal(restored.statusCount,3);
  assert.equal(restored.friendship,256); assert.deepEqual(restored.firstMoves,firstMoves);
  restored.firstMoves.push('new'); restored.owner.name = 'changed'; assert.deepEqual(template.firstMoves,firstMoves); assert.equal(template.owner.name,'Trainer');
  assert.deepEqual(result,before); assert.equal(S.resultHash(result),hash);
  for (const key of persistentOnly) assert.equal(Object.hasOwn(raw,key),false,key);
});

test('B16: protocol projection retains its exact v1 keys and memberPatch rejects every persistent-only field', () => {
  const member = unknown('barrier'), projected = S.protocolMember(member);
  assert.deepEqual(Object.keys(projected).sort(),['id','species','nickname','level','exp','hp','status','statusCount','moves','item','ability','nature','gender','ivs','evs','friendship','ball','ot'].sort());
  assert.deepEqual(S.MEMBER_WRITE_SET,['level','exp','hp','status','statusCount','moves','evs','friendship']);
  assert.deepEqual(Object.keys(projected.moves[0]).sort(),['id','pp','maxpp'].sort());
  const game = S.newGame({party:[member]}), before = copy(game);
  for (const key of persistentOnly) {
    const result = {protocol:1,battleId:`bad-${key}`,outcome:{kind:'win',winner:'Player'},members:{barrier:{[key]:member[key]}},bag:{},captured:[],dex:{seen:[],owned:[]}};
    assert.throws(() => S.applyBattleResult(game,result),/outside the write set/);
    assert.deepEqual(game,before);
  }
});
