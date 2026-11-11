'use strict';
// Contract tests for detached required facts, not proof that a JSON value has a trusted battle source.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
require('../../../scripts/tests/ts-source-loader.cjs');
const loaded = import(pathToFileURL(resolve(__dirname, '../../../src/framework/rules/held-facts.ts')));
const clone = value => JSON.parse(JSON.stringify(value));
const binding = { battleId: 'held-B1', generation: 2, rawHash: 'a'.repeat(64), contentIdentity: 'b'.repeat(64) };
const roster = [{ id: 'P1', side: 'p1', initial: 'oranberry' }, { id: 'P2', side: 'p1', initial: 'leftovers' }, { id: 'F1', side: 'p2', initial: 'sitrusberry' }];
const cell = (id, side, initial, extra = {}) => ({ id, side, initial, current: initial, recovery: initial, recycle: '', ...extra });
function facts() {
  return { version: 1, binding: clone(binding), coverage: 'complete', members: roster.map(m => cell(m.id, m.side, m.initial)), events: [],
    money: { amuletCoin: false, happyHour: false, payDay: 0 } };
}
function consume(value) {
  const m = value.members[0];
  value.events.push({ ordinal: 1, id: m.id, side: m.side, sourceId: null, reason: 'consume', before: { current: m.current, recovery: m.recovery, recycle: m.recycle }, after: { current: '', recovery: '', recycle: m.current } });
  Object.assign(m, value.events[0].after);
  return value;
}
function collection() {
  const member = (id, item) => ({ id, item });
  return { party: [member('P1', 'oranberry'), member('P2', 'leftovers')], storage: { boxes: [{ slots: [null, null] }] } };
}

test('B required facts: complete unchanged and permanent consumption preserve detached input and paired identity', async () => {
  const H = await loaded;
  const source = consume(facts()), before = clone(source), expected = { binding, roster };
  const resolved = H.resolveRequiredFacts(source, expected);
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.deepEqual(resolved.facts.members[0], cell('P1', 'p1', 'oranberry', { current: '', recovery: '', recycle: 'oranberry' }));
  assert.deepEqual(source, before);
  source.members[0].recovery = 'leftovers';
  assert.equal(resolved.facts.members[0].recovery, '', 'resolved values never alias producer data');
  assert.match(resolved.pairHash, /^[a-f0-9]{64}$/);
  assert.equal(H.resolveRequiredFacts(before, expected).pairHash, resolved.pairHash);
});

test('B required facts: missing, partial, wrong binding, incomplete roster, duplicate ID and unknown reason never resolve', async () => {
  const H = await loaded, cases = [null, {}, { ...facts(), coverage: 'unavailable' }];
  for (const key of Object.keys(binding)) { const v = facts(); v.binding[key] = key === 'generation' ? 3 : 'x'; cases.push(v); }
  const missing = facts(); missing.members.pop(); cases.push(missing);
  const duplicate = facts(); duplicate.members[1].id = 'P1'; cases.push(duplicate);
  const unknown = consume(facts()); unknown.events[0].reason = 'unknown'; cases.push(unknown);
  const badInitial = facts(); badInitial.members[0].initial = 'leftovers'; cases.push(badInitial);
  const gap = consume(facts()); gap.events[0].before.current = 'leftovers'; cases.push(gap);
  const finalMismatch = consume(facts()); finalMismatch.members[0].current = 'leftovers'; cases.push(finalMismatch);
  for (const value of cases) assert.equal(H.resolveRequiredFacts(value, { binding, roster }).ok, false, JSON.stringify(value));
});

test('B required facts: accessor and inherited required slots do not run getters or toJSON', async () => {
  const H = await loaded; let calls = 0;
  const a = facts(); Object.defineProperty(a, 'money', { enumerable: true, get() { calls++; throw Error('read getter'); } });
  const b = facts(); Object.defineProperty(b.members[0], 'current', { enumerable: true, get() { calls++; throw Error('read getter'); } });
  const c = Object.assign(Object.create({ binding }), facts()); delete c.binding;
  for (const value of [a, b, c]) assert.equal(H.resolveRequiredFacts(value, { binding, roster }).ok, false);
  const d = facts(); d.toJSON = () => { calls++; throw Error('serialize untrusted'); };
  assert.equal(H.resolveRequiredFacts(d, { binding, roster }).ok, false);
  assert.equal(calls, 0);
});

test('B required facts: C/I/R mixed chain keeps own recovery after temporary transfer and foreign consumption', async () => {
  const H = await loaded, value = facts(), m = value.members[0];
  value.events = [
    { ordinal: 1, id: 'P1', side: 'p1', sourceId: null, reason: 'temporary-remove', before: { current: 'oranberry', recovery: 'oranberry', recycle: '' }, after: { current: '', recovery: 'oranberry', recycle: '' } },
    { ordinal: 2, id: 'P1', side: 'p1', sourceId: null, reason: 'temporary-receive', before: { current: '', recovery: 'oranberry', recycle: '' }, after: { current: 'sitrusberry', recovery: 'oranberry', recycle: '' } },
    { ordinal: 3, id: 'P1', side: 'p1', sourceId: null, reason: 'consume', before: { current: 'sitrusberry', recovery: 'oranberry', recycle: '' }, after: { current: '', recovery: 'oranberry', recycle: 'sitrusberry' } },
  ];
  Object.assign(m, value.events[2].after);
  assert.equal(H.resolveRequiredFacts(value, { binding, roster }).ok, true);
  m.recovery = '';
  assert.equal(H.resolveRequiredFacts(value, { binding, roster }).ok, false, 'foreign consumption may not erase own I');
});

test('B writeback: restore current party by I, but a replaced member already in a box keeps C', async () => {
  const H = await loaded, value = facts();
  value.events.push({ ordinal: 1, id: 'P2', side: 'p1', sourceId: null, reason: 'temporary-remove', before: { current: 'leftovers', recovery: 'leftovers', recycle: '' }, after: { current: '', recovery: 'leftovers', recycle: '' } });
  Object.assign(value.members[1], value.events[0].after);
  const resolved = H.resolveRequiredFacts(value, { binding, roster }); assert.equal(resolved.ok, true);
  const before = collection(), primary = clone(before), boxed = primary.party.pop(); primary.storage.boxes[0].slots[0] = boxed;
  const frozenBefore = clone(before), frozenPrimary = clone(primary);
  const plan = H.planHeldWriteback({ before, primary, facts: resolved.facts, capturedOrigins: {} });
  assert.equal(plan.state.party[0].item, 'oranberry');
  assert.equal(plan.state.storage.boxes[0].slots[0].item, '');
  assert.deepEqual(before, frozenBefore); assert.deepEqual(primary, frozenPrimary);
});

test('B writeback: captured creature retains current item in party or box regardless of old opponent recovery', async () => {
  const H = await loaded, value = facts();
  const resolved = H.resolveRequiredFacts(value, { binding, roster }); assert.equal(resolved.ok, true);
  for (const destination of ['party', 'box']) {
    const before = collection(), primary = clone(before), captured = { id: 'C1', item: '' };
    if (destination === 'party') primary.party.push(captured); else primary.storage.boxes[0].slots[0] = captured;
    const plan = H.planHeldWriteback({ before, primary, facts: resolved.facts, capturedOrigins: { C1: 'F1' } });
    const actual = destination === 'party' ? plan.state.party.at(-1) : plan.state.storage.boxes[0].slots[0];
    assert.equal(actual.item, 'sitrusberry');
  }
});

test('B writeback: unmatched initial values, missing destinations and wrong capture origin throw without mutation', async () => {
  const H = await loaded, resolved = H.resolveRequiredFacts(facts(), { binding, roster }); assert.equal(resolved.ok, true);
  const cases = [];
  const changed = collection(); changed.party[0].item = 'leftovers'; cases.push({ before: changed, primary: clone(changed), capturedOrigins: {} });
  const before = collection(), missing = clone(before); missing.party.pop(); cases.push({ before, primary: missing, capturedOrigins: {} });
  const captured = clone(before); captured.party.push({ id: 'C1', item: '' }); cases.push({ before, primary: captured, capturedOrigins: { C1: 'not-a-foe' } });
  cases.push({ before, primary: captured, capturedOrigins: {} });
  for (const input of cases) { const saved = clone(input); assert.throws(() => H.planHeldWriteback({ ...input, facts: resolved.facts })); assert.deepEqual(input, saved); }
});

test('B required facts: permanent gain/loss and recycle distinguish the wild recovery record from trainer temporary state', async () => {
  const H = await loaded;
  for (const wild of [false, true]) {
    const value = consume(facts());
    value.events.push({ ordinal: 2, id: 'P1', side: 'p1', sourceId: null, reason: 'recycle', before: { current: '', recovery: '', recycle: 'oranberry' }, after: { current: 'oranberry', recovery: wild ? 'oranberry' : '', recycle: '' } });
    Object.assign(value.members[0], value.events[1].after);
    assert.equal(H.resolveRequiredFacts(value, { binding, roster, wild }).ok, true);
    value.members[0].recovery = wild ? '' : 'oranberry';
    assert.equal(H.resolveRequiredFacts(value, { binding, roster, wild }).ok, false);
  }
  const value = facts();
  value.events.push({ ordinal: 1, id: 'P1', side: 'p1', sourceId: null, reason: 'permanent-loss', before: { current: 'oranberry', recovery: 'oranberry', recycle: '' }, after: { current: '', recovery: '', recycle: '' } });
  value.events.push({ ordinal: 2, id: 'P1', side: 'p1', sourceId: 'F1', reason: 'permanent-gain', before: { current: '', recovery: '', recycle: '' }, after: { current: 'sitrusberry', recovery: 'sitrusberry', recycle: '' } });
  Object.assign(value.members[0], value.events[1].after);
  assert.equal(H.resolveRequiredFacts(value, { binding, roster, wild: true }).ok, true);
});

test('B required facts: pair hash binds both ordered held events and money facts, not object key order', async () => {
  const H = await loaded, a = consume(facts()), b = clone(a);
  const reverse = x => Array.isArray(x) ? x.map(reverse) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).reverse().map(([k,v]) => [k, reverse(v)])) : x;
  const pair = H.resolveRequiredFacts(a, { binding, roster }); assert.equal(pair.ok, true);
  assert.equal(H.resolveRequiredFacts(reverse(a), { binding, roster }).pairHash, pair.pairHash);
  b.money.payDay = 25;
  assert.notEqual(H.resolveRequiredFacts(b, { binding, roster }).pairHash, pair.pairHash);
});

// Synthetic complete journals isolate identity conservation from engine reachability.
function captureJournal(x='leftovers',y='lightclay') {
 const ms=[cell('P1','p1',x),cell('P2','p1',x),cell('F1','p2',y)];
 const value={version:1,binding,members:ms,events:[],coverage:'complete',money:{amuletCoin:false,happyHour:false,payDay:0}};
 const values=m=>({current:m.current,recovery:m.recovery,recycle:m.recycle});
 const event=(id,reason,after,sourceId=null)=>{const m=ms.find(m=>m.id===id),before=values(m);Object.assign(m,after);value.events.push({id,side:m.side,ordinal:value.events.length+1,sourceId,reason,before,after:values(m)});};
 const swap=()=>{const p=ms[0].current,f=ms[2].current;event('P1','temporary-remove',{current:''});if(f)event('F1','temporary-remove',{current:''});if(f)event('P1','temporary-receive',{current:f},'F1');event('F1','temporary-receive',{current:p},'P1');};
 return {value,event,swap};
}
async function capturePlan(j, destination='party') {
 const H=await loaded, before={party:j.value.members.filter(m=>m.side==='p1').map(m=>({id:m.id,item:m.initial})),storage:{boxes:[{slots:[null,null]}]}},primary=clone(before),caught={id:'C1',item:j.value.members[2].current};
 if(destination==='box')primary.storage.boxes[0].slots[0]=caught;
 else {if(destination==='replace')primary.storage.boxes[0].slots[0]=primary.party.shift();primary.party.push(caught);}
 const result=H.resolveRequiredFacts(j.value,{binding,roster:j.value.members.map(({id,side,initial})=>({id,side,initial})),wild:true});assert(result.ok,JSON.stringify(result));
 const frozen=clone({before,primary,value:j.value});const plan=H.planHeldWriteback({before,primary,facts:result.facts,capturedOrigins:{C1:'F1'}});
 assert.deepEqual({before,primary,value:j.value},frozen);
 const all=[...plan.state.party,...plan.state.storage.boxes[0].slots.filter(Boolean)];return Object.fromEntries(all.map(m=>[m.id,m.item]));
}
for(const y of ['','lightclay','leftovers'])for(const destination of ['party','box','replace'])
test(`capture claims conserve distinct source tokens swap ${y||'empty'} -> ${destination}`,async()=>{
 const j=captureJournal('leftovers',y);j.swap();const out=await capturePlan(j,destination);
 assert.deepEqual(out,{P1:destination==='replace'?y:'leftovers',P2:'leftovers',C1:destination==='replace'?'leftovers':y});
});
test('capture transfer out and back restores only one instance',async()=>{const j=captureJournal('leftovers','');j.swap();j.event('F1','temporary-remove',{current:''});j.event('P1','temporary-receive',{current:'leftovers'},'F1');assert.deepEqual(await capturePlan(j),{P1:'leftovers',P2:'leftovers',C1:''});});
for(const harvest of [false,true])test(`capture consumed transferred token, Harvest=${harvest}`,async()=>{
 const j=captureJournal('oranberry','lightclay');j.swap();
 j.event('F1','consume',{current:'',recycle:'oranberry'});
 if(harvest)j.event('F1','harvest',{current:'oranberry',recycle:''});
 assert.deepEqual(await capturePlan(j),{P1:harvest?'oranberry':'lightclay',P2:'oranberry',C1:harvest?'lightclay':''});
});
test('capture equal-name foreign consumption does not erase a different original token',async()=>{
 const j=captureJournal('oranberry','oranberry');j.swap();j.event('P1','consume',{current:'',recovery:'',recycle:'oranberry'});
 assert.deepEqual(await capturePlan(j),{P1:'oranberry',P2:'oranberry',C1:''});
});
test('capture Knock Off restores player original and returns displaced wild original without inventing knocked-off wild item',async()=>{
 const j=captureJournal();j.swap();j.event('F1','temporary-remove',{current:''});
 assert.deepEqual(await capturePlan(j),{P1:'leftovers',P2:'leftovers',C1:'lightclay'});
 const plain=captureJournal();plain.event('F1','temporary-remove',{current:''});
 assert.deepEqual(await capturePlan(plain),{P1:'leftovers',P2:'leftovers',C1:''});
});
test('capture cannot guess an unresolved handoff from a same-name item',async()=>{
 const j=captureJournal('leftovers','');j.swap();j.value.events.at(-1).sourceId='P2';
 await assert.rejects(()=>capturePlan(j),/held-capture-provenance-unavailable/);
});
