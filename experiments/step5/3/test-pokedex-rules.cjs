'use strict';
// Formal-spec-derived expectations: WP62 PD01–08/17–24/26–27, r3 §8, 06ac §3. No reference-runtime claims.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fixtures/pokedex/support.cjs');
const rules = F.load('pokedex');
const record = async (state,input) => { const r=await rules; const plan=r.planDexRecord(state,input); assert.equal(plan.status,'ok'); return {plan,next:r.applyDexPatch(state,plan.patch)}; };

test('P53-31 PD24 owned-only and explicit-seen grant wrappers remain different', async () => {
  const state=F.dex();
  const silent=await record(state,{source:'party-silent',appearance:F.appearance(),seeForm:false});
  assert.deepEqual(silent.next.owned,['a']); assert.deepEqual(silent.next.seen,[]); assert.deepEqual(silent.next.seenForms,{});
  for (const source of ['grant','receive','party-gift']) {
    const {next}=await record(state,{source,appearance:F.appearance(),seeForm:false});
    assert.deepEqual(next.seen,['a']); assert.deepEqual(next.owned,['a']); assert.deepEqual(next.seenForms,{});
  }
});
test('P53-31 set-owned does not fabricate seen, form history or historical capture counts', async () => {
  const {next}=await record(F.dex(),{source:'set-owned',species:'a'});
  assert.deepEqual(next.seen,[]); assert.deepEqual(next.owned,['a']); assert.deepEqual(next.lastSeenForm,{}); assert.deepEqual(next.capturedCounts,{});
});
test('P53-31 evolution/split/trade and form-commit have their own owned writes', async () => {
  for (const source of ['evolution','split','trade','form-commit']) {
    const {next}=await record(F.dex(),{source,appearance:F.appearance('c',{gender:1,form:2,shiny:true})});
    assert.deepEqual(next.seen,['c']); assert.deepEqual(next.owned,source==='form-commit'?[]:['c']);
    assert.deepEqual(next.seenForms.c,[{gender:1,form:2,shiny:true}]); assert.deepEqual(next.capturedCounts,{});
  }
});
test('P53-31 appearance respects the internal gate and registers only the supplied actual display', async () => {
  const state=F.dex(undefined,{owned:['a','b']});
  assert.deepEqual((await record(state,{source:'appearance',appearance:F.appearance(),internalBattle:false})).next,state);
  const {next}=await record(state,{source:'appearance',appearance:F.appearance(),internalBattle:true});
  assert.deepEqual(next.seen,['a']); assert.equal(next.seen.includes('b'),false); assert.deepEqual(next.owned,['a','b']);
});
test('P53-31 ordinary repeated registration preserves nonempty lastSeen and does not count an event', async () => {
  const state=F.dex(undefined,{lastSeenForm:{a:{gender:0,form:0,shiny:true}}});
  const {next}=await record(state,{source:'appearance',appearance:F.appearance('a',{form:1}),internalBattle:true});
  const again=await record(next,{source:'appearance',appearance:F.appearance('a',{form:1}),internalBattle:true});
  assert.equal(again.plan.changed,false); assert.deepEqual(next.lastSeenForm.a,state.lastSeenForm.a);
  assert.deepEqual(next.capturedCounts,{}); assert.deepEqual(next.defeatedCounts,{});
});
test('P53-31/32 capture independently owns, while internal wrappers add seen/form and one count per call', async () => {
  const state=F.dex();
  const external=await record(state,{source:'capture',appearance:F.appearance(),internalBattle:false});
  assert.deepEqual(external.next.owned,['a']); assert.deepEqual(external.next.seen,[]); assert.deepEqual(external.next.capturedCounts,{});
  assert.equal((await record(external.next,{source:'capture',appearance:F.appearance(),internalBattle:false})).plan.refreshAccessible,false);
  const first=await record(state,{source:'capture',appearance:F.appearance(),internalBattle:true});
  assert.equal(first.plan.previouslyOwned,false); assert.equal(first.next.capturedCounts.a,1); assert.deepEqual(first.next.seen,['a']);
  const second=await record(first.next,{source:'capture',appearance:F.appearance(),internalBattle:true});
  assert.equal(second.plan.previouslyOwned,true); assert.equal(second.next.capturedCounts.a,2);
  assert.equal(second.next.seenForms.a.length,1); // E, not this pure function, excludes replayed operations.
});
test('P53-31/32 defeat uses supplied display species; capture of real identity does not rewrite the earlier display', async () => {
  let state=F.dex();
  state=(await record(state,{source:'appearance',appearance:F.appearance('snorlax'),internalBattle:true})).next;
  state=(await record(state,{source:'defeat',appearance:F.appearance('snorlax'),internalBattle:true})).next;
  state=(await record(state,{source:'capture',appearance:F.appearance('zoroark'),internalBattle:true})).next;
  assert.deepEqual(state.seen,['snorlax','zoroark']); assert.deepEqual(state.owned,['zoroark']);
  assert.deepEqual(state.defeatedCounts,{snorlax:1}); assert.deepEqual(state.capturedCounts,{zoroark:1});
});
test('P53-32 absent precise form keeps independently known base seen/count without inventing form0', async () => {
  let state=(await record(F.dex(),{source:'appearance',species:'a',appearance:null,internalBattle:true})).next;
  assert.deepEqual(state.seen,['a']); assert.deepEqual(state.seenForms,{}); assert.deepEqual(state.lastSeenForm,{});
  state=(await record(state,{source:'defeat',species:'a',appearance:null,internalBattle:true})).next;
  assert.equal(state.defeatedCounts.a,1);
});
test('P53-31 PD26 original-name and display-name normalization are distinct; recent keeps gender2', async () => {
  const {normalizeDexAppearance}=await rules;
  const content={forms:{cake:{0:'Base',7:'Ruby',8:'Plain'}},species:{Base:{},Ruby:{formName:'Ruby Cream'},Plain:{pokedexForm:7}}};
  const m=F.appearance('cake',{form:8,gender:2,shiny:true});
  assert.deepEqual(normalizeDexAppearance(content,m,'register'),{species:'cake',gender:0,form:7,shiny:true});
  assert.deepEqual(normalizeDexAppearance(content,m,'recent'),{species:'cake',gender:2,form:0,shiny:true});
});
test('P53-31 PD27 reverse named-origin/unnamed-display fixture does not share the previous normalization', async () => {
  const {normalizeDexAppearance}=await rules;
  const content={forms:{x:{0:'Base',2:'Target',3:'Original'}},species:{Base:{},Target:{},Original:{formName:'Origin',pokedexForm:2}}};
  assert.equal(normalizeDexAppearance(content,F.appearance('x',{form:3}),'register').form,0);
  assert.equal(normalizeDexAppearance(content,F.appearance('x',{form:3}),'recent').form,2);
  assert.equal(normalizeDexAppearance(content,F.appearance('unknown')),null);
});
test('P53-31 PD03/05/20 form2 exact history survives, count only includes distinct forms0/1', async () => {
  const r=await rules; let state=F.dex();
  for (const a of [F.appearance('a',{form:2,gender:2,shiny:true}),F.appearance('a',{form:0}),F.appearance('a',{form:1,gender:1}),F.appearance('a',{form:1,shiny:true})]) {
    state=(await record(state,{source:'form-commit',appearance:a})).next;
    if (a.form===2) assert.equal(r.dexSeenFormCount(state,'a'),0);
  }
  assert.equal(r.dexSeenForm(state,'a',0,2),true); assert.equal(r.dexSeenForm(state,'a',0,2,false),false);
  assert.equal(r.dexSeenForm(state,'a',0,2,true),true); assert.equal(r.dexSeenFormCount(state,'a'),2);
});
test('P53-31 PD21 recent/raw-key changes are minimal, idempotent and do not touch seen or count history', async () => {
  const r=await rules, state=F.dex(undefined,{lastSeenForm:{a:{gender:0,form:0,shiny:true}}});
  const plan=r.planDexLastSeen(state,'a',{gender:2,form:7,shiny:true});
  assert.deepEqual(Object.keys(plan.patch),['lastSeenForm']); assert.equal(plan.refreshAccessible,false);
  const next=r.applyDexPatch(state,plan.patch); assert.equal(r.planDexLastSeen(next,'a',next.lastSeenForm.a).changed,false);
  const alternate=r.applyDexPatch(next,r.planDexLastSeen(next,'a.form7',{gender:1,form:7,shiny:false}).patch);
  assert.equal(alternate.lastSeenForm.a.gender,2); assert.equal(alternate.lastSeenForm['a.form7'].gender,1);
});
test('P53-31 PD01 unknown guard writes are no-ops, unknown registration returns invalid with no patch', async () => {
  const r=await rules, state=F.dex();
  for (const source of ['set-seen','set-owned']) assert.deepEqual(r.planDexRecord(state,{source,species:null}).patch,{});
  const bad=r.planDexRecord(state,{source:'form-commit',appearance:null});
  assert.equal(bad.status,'invalid'); assert.deepEqual(bad.patch,{});
  assert.equal(r.planDexRecord(state,{source:'appearance',species:'a',appearance:F.appearance('b'),internalBattle:true}).status,'invalid');
  assert.equal(r.planDexRecord(state,{source:'form-commit',appearance:F.appearance('not a content id')}).status,'invalid');
});
test('P53-31 PD23 refresh is explicit and clearing retains eligibility, unlocks and view', async () => {
  const r=await rules, state=F.dex(undefined,{seen:['a'],owned:['b'],hasDex:false});
  assert.equal(r.planDexRecord(state,{source:'set-seen',species:'b',shouldRefresh:false}).refreshAccessible,false);
  assert.equal(r.planDexRecord(state,{source:'set-seen',species:'b'}).refreshAccessible,true);
  assert.equal(r.planDexRecord(state,{source:'defeat',appearance:F.appearance(),internalBattle:true}).refreshAccessible,false);
  const cleared=r.applyDexPatch(state,r.planDexClear());
  for (const key of ['hasDex','unlocked','view','layoutIdentity']) assert.deepEqual(cleared[key],state[key]);
  assert.deepEqual(cleared.seen,[]); assert.deepEqual(cleared.owned,[]);
});
test('P53-31/36 prompt gate uses the pre-operation ownership and keeps capture/settings differences', async () => {
  const {dexShouldOfferEntry}=await rules;
  const base={previouslyOwned:false,hasDex:true,inUnlockedDex:true,moreOften:false,seeForm:false};
  assert.equal(dexShouldOfferEntry({...base,source:'capture'}),true);
  assert.equal(dexShouldOfferEntry({...base,source:'grant'}),false);
  assert.equal(dexShouldOfferEntry({...base,moreOften:true,source:'evolution'}),true);
  assert.equal(dexShouldOfferEntry({...base,moreOften:true,source:'trade'}),true);
  assert.equal(dexShouldOfferEntry({...base,source:'capture',previouslyOwned:true}),false);
  assert.equal(dexShouldOfferEntry({...base,source:'capture',hasDex:false}),false);
});
test('P53-31 count overflow rejects the whole pure patch rather than producing an unsaveable value', async () => {
  const r=await rules,state=F.dex(undefined,{capturedCounts:{a:Number.MAX_SAFE_INTEGER}}),before=JSON.stringify(state);
  const result=r.planDexRecord(state,{source:'capture',appearance:F.appearance(),internalBattle:true});
  assert.equal(result.status,'invalid'); assert.deepEqual(result.patch,{}); assert.equal(JSON.stringify(state),before);
});
test('P53-31/45 plans and reads preserve frozen inputs and return detached changed record dictionaries', async () => {
  const r=await rules,state=F.freeze(F.dex(undefined,{seenForms:{b:[{gender:0,form:0,shiny:true}]},lastSeenForm:{b:{gender:0,form:0,shiny:true}}})),before=JSON.stringify(state);
  const plan=r.planDexRecord(state,F.freeze({source:'form-commit',appearance:F.appearance()}));
  plan.patch.seenForms.b[0].shiny=false; plan.patch.lastSeenForm.b.shiny=false;
  const last=r.dexLastSeen(state,'b'); last.shiny=false;
  assert.equal(r.dexSeenFormCount(state,'missing'),0); assert.equal(r.dexSeenForm(state,'missing',0,0),false);
  assert.equal(JSON.stringify(state),before);
});
test('P53-45 schema7 JSON compatibility uses B shape/layout validators without adding an event table', async () => {
  const r=await rules,{dexState:b}=require('../../../js/engine/build/core.cjs');
  const table=F.layout(); let state=F.dex(table);
  state=(await record(state,{source:'capture',appearance:F.appearance('a',{form:2,gender:2,shiny:true}),internalBattle:true})).next;
  state=r.applyDexPatch(state,r.planDexLastSeen(state,'a',{gender:2,form:2,shiny:true}).patch);
  const roundtrip=JSON.parse(JSON.stringify(state));
  assert.deepEqual(b.dexStateProblems(roundtrip),[]); assert.deepEqual(b.dexLayoutStateProblems(roundtrip,table),[]);
  assert.deepEqual(roundtrip,state); assert.equal(roundtrip.layoutIdentity,b.dexLayoutIdentity(table));
  assert.equal(Object.hasOwn(roundtrip,'events'),false); assert.equal(Object.hasOwn(roundtrip,'pending'),false);
});
