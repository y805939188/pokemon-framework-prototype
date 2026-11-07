'use strict';
// Real compiled Scene, App, composition and pinned Gen8 Session. Only host rendering/input/time
// and the isolated in-memory save are controlled. No NW, player saves or reference replay.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), {spawnSync} = require('node:child_process');
const {createVictoryDriverHost} = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs');
const PLAN = require('./victory-music-native-plan.json'), clone = x => JSON.parse(JSON.stringify(x));
let work, plugins, entryText;
test.before(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-opening-state-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(work, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--configLoader', 'runner', '--outDir', out],
      {cwd: ROOT, env: {...process.env, RR_PLUGIN: name}, encoding: 'utf8'});
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code; else plugins[name] = code;
    if (process.env.PF_OPENING_EVIDENCE) {
      fs.mkdirSync(path.join(process.env.PF_OPENING_EVIDENCE, 'compiled'), {recursive: true});
      fs.writeFileSync(path.join(process.env.PF_OPENING_EVIDENCE, 'compiled', name + '.js'), code);
    }
    console.log('OPENING_BUILD ' + JSON.stringify({name, sha256: crypto.createHash('sha256').update(code).digest('hex')}));
  }
});
test.after(() => { if (work) fs.rmSync(work, {recursive: true, force: true}); });
function content(author) {
  const dir = path.join(ROOT, 'content/sample');
  const input = Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants', 'regional-dex', 'settings', 'map-metadata']
    .filter(n => fs.existsSync(path.join(dir, n + '.json'))).map(n => [n.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'))]));
  author?.(input);
  const compiled = E.contentCompile.compileContent(input); assert(compiled.ok, JSON.stringify(compiled.errors));
  const result = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()); assert.deepEqual(result.errors, []); return result.content;
}
function addSpecies(input, id, moves) {
  let record = input.species.find(s => s.id === id);
  if (!record) { record = {id, showdownId: id, nameKey: 'species.' + id, growth: 'medium', baseExp: 100, evYield: {}, catchRate: 255, source: 'author-placeholder'}; input.species.push(record); }
  record.learnset = moves.map(move => ({level: 1, move})); delete record.evolutions;
}
async function world({author, members = [{species: 'Charmander', level: 5}], lang = 'en', bag} = {}) {
  const c = content(author), h = createVictoryDriverHost({ROOT, work, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: {productionTranslator: true}});
  const flow = h.w.flow, G = h.G, parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {};
  G.PluginManager.parameters = function(name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? {...p, language: lang} : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = c; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = true;
  const game = E.state.newGame({content: c, party: [], money: 1000});
  for (const [i, spec] of members.entries()) {
    const m = E.memberFactory.createMember({id: 'OPEN-P' + (i + 1), species: spec.species, level: spec.level, abilityIndex: spec.abilityIndex}, c, () => 0);
    // Optional cases are explicit carried save records, not claims that a battle inflicted these states.
    if (spec.saved) Object.assign(m, clone(spec.saved));
    game.party.push(E.speciesKey.toPersistentMember(m, c));
  }
  game.nextMemberOrdinal = String(game.party.length + 1); game.badges.fill(true);
  game.inventory = E.inventory.inventoryFromBag(bag ?? {potion: 5, pokeball: 10, antidote: 2}, E.itemCatalog.catalogOf(c));
  let saved = game, installs = 0, seq = 0;
  Object.defineProperty(G.$gameSystem, '_psGame', {configurable: true, get: () => saved, set: v => {installs++; saved = v;}});
  const batches = [], begin = flow.begin.bind(flow);
  flow.begin = async (...args) => { const s = await begin(...args), take = s.take.bind(s); s.take = () => { const messages = take(); batches.push({messages, wire: JSON.stringify(messages)}); return messages; }; return s; };
  await h.p.toMapId(5, 8, 9);
  return {...h, flow, c, batches, get installs() {return installs;}, async start(foe = {species: 'pidgey', level: 3}) {
    this.before = clone(flow.game()); this.request = {kind: 'wild', foes: [foe], battleId: 'opening-' + path.basename(h.w.root) + '-' + (++seq), seq, canLose: true, expGain: false};
    flow.openBattle(this.request); await h.p.inMode('main'); this.s = h.p.battle(); this.session = this.s._session; this.initial = live(this); return this;
  }, cleanup() {if (flow.running) flow.abort(Error('owned opening regression cleanup')); this.s?.terminate();}};
}
const events = messages => messages.flatMap(m => m.kind === 'events' ? m.events : []);
const live = h => ({p1: clone(h.session.gw.readState('p1')), p2: clone(h.session.gw.readState('p2'))});
const visible = (h, side) => h.s.statusCardState().find(c => c.side === side && c.visible);
function cardMatches(h, side = 'p1') {
  const member = live(h)[side].find(m => m.active), card = h.s._display.snapshot().find(c => c.side === side && c.active), view = visible(h, side);
  assert(member && card && view); assert.equal(card.hp, member.hp, side + ' shown HP equals the engine');
  assert.equal(card.maxhp, member.maxhp); assert.equal(card.status, member.status); assert.equal(view.condition.kind, member.status || 'none');
  if (side === 'p1') assert.deepEqual(clone(view.hp.numbers), {current: member.hp, total: member.maxhp}); else assert.equal(view.hp.numbers, null);
  return {member, card, view};
}
function opening(h) {
  const batch = h.batches.findLast(b => events(b.messages).some(e => e.type === 'switch'));
  assert(batch); const wire = events(batch.messages), switches = wire.filter(e => e.type === 'switch');
  assert.equal(switches.length, 2); assert.equal(wire.filter(e => e.type === 'turn').length, 1); assert.equal(wire.find(e => e.type === 'turn').args[0], '1');
  assert.equal(wire.filter(e => e.type === 'move' || e.type === 'cant' || e.type === 'faint').length, 0);
  assert.equal(JSON.stringify(batch.messages), batch.wire, 'Scene must not repair or mutate original public messages');
  for (const side of ['p1', 'p2']) {
    const m = live(h)[side].find(m => m.active), e = switches.find(e => e.args[0] === side + 'a: ' + m.id);
    assert(e); assert.equal(e.args[2], m.hp + '/' + m.maxhp + (m.status ? ' ' + m.status : ''), 'native opening condition'); cardMatches(h, side);
  }
  assert.deepEqual(clone(h.flow.game()), h.before); return clone(wire);
}
async function pick(h, key, mode) {
  await h.p.inMode(mode); await h.frames(1); const input = h.s.inputState(); assert(input.ready);
  const at = input.items.findIndex(v => v.key === key); assert(at >= 0, 'missing key ' + key); h.s._menu.select(at); h.s.onMenuOk();
}
async function move(h, slot = 1) { await pick(h, 'fight', 'main'); await pick(h, slot, 'moves'); await h.p.inMode('main'); }
async function finishRun(h) {
  const before = live(h), count = h.installs; await pick(h, 'run', 'main'); await h.p.inMode('end');
  assert.equal(h.session.ended.reason, 'run'); assert.deepEqual(live(h), before, 'successful escape adds no residual or PP cost');
  await pick(h, 'end', 'end'); await h.frames(8); assert.equal(h.flow.lastOutcome.commit, 'applied', JSON.stringify(h.flow.lastOutcome)); assert.equal(h.installs, count + 1);
  return clone(h.flow.game());
}
function report(name, h, data) { console.log('OPENING_STATE ' + JSON.stringify({name, ...data, installs: h.installs, execution: 'COMPILED_SCENE_CONTROLLED_NODE_VM', NW: 0})); }
for (const lang of ['en', 'zh']) test(lang + ' default sample damage, escape, second Scene preserves actual 15/18 HP and PP', async () => {
  const h = await world({lang}); try {
    await h.start(); opening(h); await move(h); const damaged = live(h).p1[0]; assert.equal(damaged.hp, 15); assert.equal(damaged.maxhp, 18); cardMatches(h);
    const saved = await finishRun(h); assert.equal(saved.party[0].hp, damaged.hp);
    await h.start(); const wire = opening(h); assert.equal(h.initial.p1[0].hp, damaged.hp); assert.deepEqual(h.initial.p1[0].pp, damaged.pp);
    assert.equal(h.installs, 1); const final = await finishRun(h); assert.equal(final.party[0].hp, damaged.hp);
    report(lang + '-default-carry', h, {damaged, saved: saved.party, opening: wire, final: final.party});
  } finally {h.cleanup();}
});
for (const [status, foe, moveId] of [['slp', 'parasect', 'spore'], ['psn', 'gengar', 'toxic']]) test('native ' + status + ' infliction survives escape and second compiled Scene opening', async () => {
  const h = await world({author(input) {addSpecies(input, 'snorlax', ['splash']); addSpecies(input, 'pidgey', ['splash']); addSpecies(input, foe, [moveId]);}, members: [{species: 'Snorlax', level: 100, abilityIndex: 1}]});
  try {
    await h.start({species: foe, level: 5}); opening(h); await move(h); const afflicted = live(h).p1[0]; assert.equal(afflicted.status, status === 'psn' ? 'tox' : 'slp'); cardMatches(h);
    const saved = await finishRun(h); assert.equal(saved.party[0].status, status); assert.equal(saved.party[0].statusCount, status === 'slp' ? afflicted.statusCount : 0);
    await h.start({species: 'pidgey', level: 5}); const wire = opening(h); const before = live(h); assert.equal(before.p1[0].statusCount, saved.party[0].statusCount); assert.deepEqual(before.p1[0].pp, afflicted.pp);
    await move(h); cardMatches(h); const after = live(h);
    if (status === 'slp') {assert.equal(after.p1[0].statusCount, before.p1[0].statusCount - 1); assert.deepEqual(after.p1[0].pp, before.p1[0].pp);}
    else {assert.equal(after.p1[0].hp, before.p1[0].hp - Math.floor(before.p1[0].maxhp / 8)); assert.equal(after.p1[0].pp.splash, before.p1[0].pp.splash - 1);}
    assert.equal(after.p2[0].pp.splash, before.p2[0].pp.splash - 1); assert.deepEqual(clone(h.flow.game()), h.before);
    report(status + '-native-carry', h, {afflicted, saved: saved.party, opening: wire, before, after});
  } finally {h.cleanup();}
});
for (const status of ['psn', 'tox', 'brn', 'par', 'slp', 'frz']) test('explicit carried save ' + status + ' is public on the very first Scene frame, with no opening turn cost', async () => {
  const h = await world({author(input) {addSpecies(input, 'snorlax', ['splash']); addSpecies(input, 'pidgey', ['splash']);}, members: [{species: 'Snorlax', level: 100, abilityIndex: 1,
    saved: {hp: 300, status: status === 'tox' ? 'psn' : status, statusCount: status === 'tox' ? 1 : status === 'slp' ? 3 : 0, moves: [{id: 'splash', pp: 17, maxpp: 64, ppUps: 3}]}}]});
  try {await h.start(); const wire = opening(h); assert.equal(h.initial.p1[0].status, status); assert.equal(h.initial.p1[0].hp, 300); assert.equal(h.initial.p1[0].pp.splash, 17); assert.equal(h.session.currentRequest().active[0].moves[0].maxpp, 64); assert.equal(h.installs, 0); report('carried-' + status, h, {opening: wire, initial: h.initial});} finally {h.cleanup();}
});
test('fainted lead is bypassed, injured reserve switch uses native condition, and status stays attached to identity', async () => {
  const h = await world({author(input) {addSpecies(input, 'snorlax', ['splash']); addSpecies(input, 'pidgey', ['splash']);}, members: [
    {species: 'Snorlax', level: 100, abilityIndex: 1, saved: {hp: 0}},
    {species: 'Snorlax', level: 100, abilityIndex: 1, saved: {hp: 300, status: 'brn', statusCount: 0}},
    {species: 'Snorlax', level: 100, abilityIndex: 1, saved: {hp: 350, status: 'par', statusCount: 0}},
  ]});
  try {
    await h.start(); opening(h); assert.equal(h.session.gw.activeId('p1'), 'OPEN-P2'); assert.equal(live(h).p1.find(m => m.id === 'OPEN-P1').fainted, true);
    const before = live(h); await pick(h, 'party', 'main'); await pick(h, 'OPEN-P3', 'party'); await pick(h, 'switch-in', 'party-command'); await h.p.inMode('main');
    assert.equal(h.session.gw.activeId('p1'), 'OPEN-P3'); const shown = cardMatches(h); assert.equal(shown.card.hp, 350); assert.equal(shown.card.status, 'par');
    for (const m of live(h).p1) assert.deepEqual(m.pp, before.p1.find(x => x.id === m.id).pp);
    assert.equal(live(h).p1.find(m => m.id === 'OPEN-P2').hp, 300, 'switch-out precedes burn residual'); assert.deepEqual(clone(h.flow.game()), h.before);
    report('faint-switch', h, {before, after: live(h), shown});
  } finally {h.cleanup();}
});
test('native entry Immunity sees carried poison before publication and its cure is not overwritten', async () => {
  const h = await world({author(input) {addSpecies(input, 'snorlax', ['splash']); addSpecies(input, 'pidgey', ['splash']);},
    members: [{species: 'Snorlax', level: 100, abilityIndex: 0, saved: {hp: 300, status: 'psn', statusCount: 0}}]});
  try {
    await h.start(); assert.equal(h.session.party[0].ability, 'Immunity');
    const batch = h.batches.findLast(b => events(b.messages).some(e => e.type === 'switch')), wire = events(batch.messages);
    const enter = wire.findIndex(e => e.type === 'switch' && e.args[0] === 'p1a: OPEN-P1');
    const cure = wire.findIndex(e => e.type === '-curestatus' && e.args[0] === 'p1a: OPEN-P1');
    assert.equal(wire[enter].args[2], '300/430 psn'); assert(cure > enter, 'native entry update cures only after send-out');
    assert.equal(live(h).p1[0].status, ''); assert.equal(live(h).p1[0].hp, 300); cardMatches(h);
    assert.equal(JSON.stringify(batch.messages), batch.wire); assert.equal(wire.filter(e => e.type === 'move').length, 0);
    assert.equal(h.flow.game().party[0].status, 'psn', 'entry effect is not committed while the battle is live');
    report('entry-immunity', h, {opening: wire, after: live(h)});
  } finally {h.cleanup();}
});
test('natural foe sleep is displayed and captured with its exact remaining count and unused PP', async () => {
  const h = await world({author(input) {addSpecies(input, 'parasect', ['spore']); addSpecies(input, 'pidgey', ['splash']);},
    members: [{species: 'Parasect', level: 100}], bag: {masterball: 1}});
  try {
    await h.start({species: 'pidgey', level: 5}); opening(h); await move(h); const before = live(h), target = before.p2[0];
    assert.equal(target.status, 'slp'); assert(target.statusCount >= 1 && target.statusCount <= 3, 'remaining count comes from the actual native sleep turn'); cardMatches(h, 'p2');
    await pick(h, 'bag', 'main'); await pick(h, 'masterball', 'bag'); await pick(h, 'use', 'bag-command'); await h.p.inMode('end');
    assert.equal(h.session.ended.reason, 'caught'); const result = h.session.result(), captured = result.captured[0];
    assert.equal(captured.hp, target.hp); assert.equal(captured.status, target.status); assert.equal(captured.statusCount, target.statusCount);
    assert.deepEqual(Object.fromEntries(captured.moves.map(m => [m.id, m.pp])), target.pp); assert.deepEqual(live(h), before, 'capture action does not execute the sleeping foe or spend another move PP');
    assert.equal(h.installs, 0); assert.deepEqual(clone(h.flow.game()), h.before);
    // The shared controlled host does not implement the receiving UI. Stop at the real capture
    // result, before handoff; do not fake that UI or claim a durable receiving commit.
    report('foe-capture', h, {before, captured, receivingHandoff: 'NOT_EXECUTED'});
  } finally {h.cleanup();}
});
for (const status of ['slp', 'brn']) test('direct real Session seeds injured ' + status + ' foe before native send-out and preserves capture data', async () => {
  const c = content(input => {addSpecies(input, 'snorlax', ['splash']); addSpecies(input, 'pidgey', ['splash']);});
  const player = E.memberFactory.createMember({id: 'SEED-P1', species: 'Snorlax', level: 100, abilityIndex: 1}, c, () => 0);
  const foe = E.memberFactory.createMember({id: 'SEED-F1', species: 'Pidgey', level: 5}, c, () => 0);
  foe.hp -= 3; foe.status = status; foe.statusCount = status === 'slp' ? 3 : 0; foe.moves[0].pp = 17;
  const state = E.state.newGame({content: c, party: [E.speciesKey.toPersistentMember(player, c)]});
  state.inventory = E.inventory.inventoryFromBag({masterball: 1}, E.itemCatalog.catalogOf(c));
  const s = await E.session.BattleSession.create({game: E.speciesKey.battleView(state, c), content: c, battleId: 'foe-opening-' + status, seed: [1, 2, 3, 4], expGain: false,
    foe: {kind: 'wild', team: [foe]}});
  const messages = s.take(), wire = events(messages), before = clone(s.gw.readState('p2')[0]);
  assert.equal(wire.find(e => e.type === 'switch' && e.args[0] === 'p2a: SEED-F1').args[2], before.hp + '/' + before.maxhp + ' ' + status);
  assert.equal(before.statusCount, foe.statusCount); assert.equal(before.pp.splash, 17); assert.equal(wire.filter(e => e.type === 'turn').length, 1);
  const r = await s.throwBall('masterball'); assert(r.ok); assert.equal(s.ended.reason, 'caught'); const captured = s.result().captured[0];
  assert.equal(captured.hp, foe.hp); assert.equal(captured.status, status); assert.equal(captured.statusCount, foe.statusCount); assert.equal(captured.moves[0].pp, 17);
  assert.deepEqual(s.gw.readState('p2')[0], before); assert.equal(events(r.messages).filter(e => e.type === 'move' || e.type === 'cant' || e.type === '-damage').length, 0);
  console.log('OPENING_STATE ' + JSON.stringify({name: 'direct-foe-' + status, opening: wire, before, captured, execution: 'REAL_SESSION_SYNTHETIC_CARRIED_RECORD', NW: 0}));
});
