'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
const H = require('../../support/world/wild-generation-support.cjs');
let G, W, K, S, I;
test.before(async () => {
  G = await H.moduleUnderTest();
  require(path.join(H.ROOT, 'scripts/tests/ts-source-loader.cjs'));
  [W, K, S, I] = await Promise.all(['wild-member', 'species-key', 'state', 'item-catalog'].map(name => import(pathToFileURL(path.join(H.ROOT, 'src/framework/rules', name + '.ts')))));
});
function run(c, input = {}, suffix = [], facts = {}, pid = 128) {
  const random = H.tape(H.baseDraws(pid, suffix));
  const result = G.createWildSpecies(H.input(input), c, H.facts(facts), random, id => ({ id, holdable: true, mail: false }));
  random.exhausted(); assert.equal(result.status, 'created'); return result.member;
}
function registerItem(c,item){c.items=I.legacyCatalog();c.items[item]={id:item,name:item,namePlural:item,pocket:1,order:0,price:0,sellPrice:0,flags:[],fieldUse:'none',battleUse:'none',battleId:item,legacyIds:[],consumable:true,source:'fixture'};}
// Independent literal expected values from the complete WP21 A table, not a production helper oracle.
const A = [
  ['Giratina', 1, {}, 'griseousorb'], ['Shaymin', 0, { hour: 23 }, '', 1],
  ['Arceus', 10, {}, 'flameplate', 0, 'Multitype'], ['Deerling', 1, { month: 2 }], ['Sawsbuck', 3, { month: 4 }],
  ['Keldeo', 1, {}, '', 0, '', 'secretsword'], ['Genesect', 2, {}, 'burndrive'],
  ['Furfrou', 0, {}, '', 1], ['Hoopa', 0, {}, '', 1], ['Espurr', 1, {}, '', 0, '', '', 0],
  ['Meowstic', 0], ['Rockruff', 1, { hour: 23 }], ['Silvally', 10, {}, 'firememory', 0, 'RKS System'],
  ['Milcery', 62, {}, 'ribbonsweet', 0, '', '', 8], ['Indeedee', 1, {}, '', 0, '', '', 0],
  ['Pikachu', 1, { regionId: 1 }], ['Exeggcute', 1, { regionId: 1 }], ['Cubone', 1, { regionId: 1 }],
  ['Koffing', 1, { regionId: 2 }], ['Mime Jr', 1, { regionId: 2 }],
];
for (const [family, expected, context = {}, item = '', form = 0, ability = '', move = '', pid = 128] of A) test('A table initial ' + family, () => {
  const patch = { ...(item ? { wildItemCommon: [item], wildItemUncommon: [item], wildItemRare: [item] } : {}), ...(ability ? { abilities: [ability] } : {}) };
  const c = H.content(patch, family); if(item)registerItem(c,item);
  if (move) { c.moves[move] = { id: move, pp: 10 }; for (const sp of Object.values(c.species)) sp.learnset = { 1: [move] }; }
  const before = structuredClone(c), member = run(c, { form, context }, [], {}, pid);
  assert.equal(member.form, expected); assert.equal(member.item, item); assert.deepEqual(c, before);
});
const B = [
  ['Unown', 27, [{ n: 28, value: 27 }]], ['Burmy', 1, [], { environment: 'cave' }], ['Wormadam', 2, [], { environment: null }],
  ['Scatterbug', 1, [], { playerId: 65536 }], ['Spewpa', 1, [], { playerId: 65536 }], ['Vivillon', 1, [], { playerId: 65536 }],
  ['Pumpkaboo', 3, [{ n: 100, value: 4 }]], ['Gourgeist', 0, [{ n: 100, value: 65 }]], ['Lycanroc', 2, [], { timeOfDay: 'dusk' }],
  ['Minior', 13, [{ n: 7, value: 6 }]], ['Toxel', 0], ['Toxtricity', 0],
  ['Sinistea', 1, [{ n: 100, value: 9 }]], ['Polteageist', 0, [{ n: 100, value: 10 }]],
  ['Alcremie', 62, [{ n: 63, value: 62 }]], ['Urshifu', 1, [{ n: 2, value: 1 }]],
];
for (const [family, expected, suffix = [], context = {}] of B) test('B creation reused ' + family, () => {
  const c = H.content({}, family), member = run(c, { context }, suffix);
  assert.equal(member.form, expected);
});
test('B actual form chooses its held source and moves before A; no filtering or reroll', () => {
  const c = H.content({}, 'Unown');
  c.species.Fixture1.wildItemCommon = c.species.Fixture1.wildItemUncommon = c.species.Fixture1.wildItemRare = ['oranberry'];
  c.species.Fixture1.learnset = { 1: ['ember'] };
  const member = run(c, {}, [{ n: 28, value: 1 }]);
  assert.equal(member.item, 'oranberry'); assert.deepEqual(member.moves.map(move => move.id), ['ember']);
});
test('A changed form uses target stats/ability and preserves creation moves; only scale resets target moves', () => {
  const c = H.content({}, 'Deerling');
  c.species.Fixture1.base.hp = 100; c.species.Fixture1.abilities = ['Target']; c.species.Fixture1.learnset = { 1: ['ember'] };
  const member = run(c, { context: { month: 2 } });
  assert.equal(member.hp, 26); assert.equal(member.ability, 'Target'); assert.deepEqual(member.moves.map(move => move.id), ['growl', 'tackle']);
  const scaled = run(c, { context: { month: 2 } }, [{ n: 5, value: 4 }], { scaleWildLevels: true, party: [H.lead({ level: 5 })] });
  assert.equal(scaled.level, 7); assert.deepEqual(scaled.moves.map(move => move.id), ['ember']);
});
test('A getter only changes caches when a real dynamic commit occurs; simple freeze adds no second registration', () => {
  const c = H.content({}, 'Arceus'); c.species.Fixture.abilities = ['Multitype']; c.species.Fixture10.abilities = ['Final'];
  for (const [item, expectedAbility, registration] of [['', 'Multitype', false], ['flameplate', null, true]]) {
    const random = H.tape(H.baseDraws()), draft = W.createWildMemberDraft(H.input({ form: 0 }), c, random, H.present);
    random.exhausted(); draft.freezeInitialForm(item, {}, H.present);
    const trace = draft.trace(); assert.equal(trace.caches.ability, expectedAbility); assert.equal(trace.registrationRead, registration);
    assert.equal(trace.caches.shiny !== null, registration); assert.equal(trace.caches.superShiny, null);
  }
});
test('finite A fallback survives persistent identity and capture while unknown forms and B holes stay rejected', () => {
  const c = H.content({}, 'Milcery');
  for (const key of Object.keys(c.species)) if (key !== 'Fixture') delete c.species[key];
  c.forms.fixture = { 0: 'Fixture' }; c.speciesKeys = { Fixture: { species: 'fixture', form: 0 } };
  c.species.Fixture.wildItemCommon = c.species.Fixture.wildItemUncommon = c.species.Fixture.wildItemRare = ['ribbonsweet']; registerItem(c,'ribbonsweet');
  const member = run(c, { form: 0 }, [], {}, 8), persistent = K.toPersistentMember(member, c);
  assert.equal(member.species, 'Fixture'); assert.equal(persistent.form, 62);
  const captured = S.capturedTemplates({ captured: [{ id: member.id, species: 'Fixture', hp: member.hp, status: '', moves: member.moves }] }, { [member.id]: persistent }, K.speciesKeyResolver(c), c);
  assert.equal(captured[0].form, 62); assert.equal(captured[0].item, 'ribbonsweet');
  assert.equal(K.initialWildBattleNameOf(c, { species: 'fixture', form: 63 }), null);
  assert.equal(K.initialWildBattleNameOf(c, { species: 'unknown', form: 0 }), null);
  c.species.Fixture.ruleSpecies = 'Arceus'; assert.equal(K.initialWildBattleNameOf(c, { species: 'fixture', form: 9 }), null);
  c.species.Fixture.ruleSpecies = 'Unown'; assert.equal(K.creationBattleNameOf(c, { species: 'fixture', form: 1 }), null);
  const random = H.tape([]); assert.throws(() => G.createWildSpecies(H.input(), c, H.facts(), random, id => ({ id, holdable: true, mail: false })), /missing wild creation form/); random.exhausted();
});
test('only relevant facts are required; missing month is rejected and regional high stored form stays fixed', () => {
  assert.equal(run(H.content({}, 'Espurr'), { form: 0 }).form, 0);
  assert.equal(run(H.content({}, 'Rockruff'), { form: 2 }).form, 2);
  const random = H.tape(H.baseDraws()); assert.throws(() => G.createWildSpecies(H.input({ form: 0 }), H.content({}, 'Deerling'), H.facts(), random), /month-unavailable/); random.exhausted();
});
test('B result zero records its original appearance before shiny retries; A records final lead gender after its changed-form commit', () => {
  const c = H.content({}, 'Sinistea'), random = H.tape(H.baseDraws(128, [{ n:100,value:10 },{ n:65536,value:0 },{ n:65536,value:0 }]));
  const result=G.createWildSpecies(H.input(),c,H.facts({shinyCharm:true}),random);random.exhausted();
  assert.deepEqual(result.registrations,[{species:'fixture',form:0,gender:0,shiny:false}]);assert.equal(result.member.shiny,true);
  const a=H.content({},'Espurr'), rng=H.tape(H.baseDraws(128,[{n:3,value:0}]));
  const changed=G.createWildSpecies(H.input({form:0}),a,H.facts({party:[H.lead({ability:'Cute Charm',gender:'M'})]}),rng);rng.exhausted();
  assert.deepEqual(changed.registrations,[{species:'fixture',form:1,gender:1,shiny:false}]);
});
test('no global player/dex and A unchanged reads do not manufacture registration intents',()=>{
  for(const registration of [{playerPresent:false,dexPresent:true},{playerPresent:true,dexPresent:false}]){
    const random=H.tape(H.baseDraws(128,[{n:100,value:10}]));const r=G.createWildSpecies(H.input(),H.content({},'Sinistea'),H.facts({registration}),random);random.exhausted();assert.equal(r.registrations,undefined);
  }
  const random=H.tape(H.baseDraws());const r=G.createWildSpecies(H.input({form:0,context:{month:1}}),H.content({},'Deerling'),H.facts(),random);random.exhausted();assert.equal(r.registrations,undefined);
});

test('native holdability without a persistent catalog record is refused for every candidate before any RNG or descriptor callback',()=>{
  const c=H.content({wildItemCommon:['oranberry'],wildItemRare:['ribbonsweet']});let lookups=0;const random=H.tape([]);
  const r=G.createWildSpecies(H.input(),c,H.facts(),random,id=>{lookups++;return {id,holdable:true,mail:false};});random.exhausted();
  assert.deepEqual(r,{status:'unsupported',reason:'held-item-descriptor'});assert.equal(lookups,0,'all candidate mappings are checked before any native descriptor callback');
  const only=H.content({wildItemCommon:['ribbonsweet']});lookups=0;const result=G.createWildSpecies(H.input(),only,H.facts(),random,()=>{lookups++;throw Error('unmapped descriptor must stay cold');});assert.deepEqual(result,{status:'unsupported',reason:'held-item-descriptor'});assert.equal(lookups,0);random.exhausted();
});
