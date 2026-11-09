'use strict';
// Real Gen8 ability callbacks and ordinary moves, not Thief proxies or injected held facts.
// This is an engine/journal contract suite, not App installation, original-Ruby equivalence or NW evidence.
// Showdown 7244fe8: data/abilities.ts Magician/Pickpocket; data/mods/gen8/abilities.ts inherits both.
// In particular, native Magician needs damage, not contact; native Pickpocket needs contact.
// Wild p2 may steal in this pinned engine. Do not replace that behavior with an older WP assumption.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../js/engine/build/production.cjs');
const T = require('../../../js/engine/build/testing.cjs');
const root = path.resolve(__dirname, '../../..');
const engineRoot = path.join(root, 'js/engine/showdown');
const showdownSHA = '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
assert.equal(fs.readFileSync(path.join(engineRoot, 'SOURCE_SHA'), 'utf8').trim(), showdownSHA);
assert.match(fs.readFileSync(path.join(root, 'scripts/showdown.env'), 'utf8'), new RegExp(`SHOWDOWN_SHA="${showdownSHA}"`));

const clone = value => JSON.parse(JSON.stringify(value));
const norm = value => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
const sides = ['p1', 'p2'];
const opposite = side => side === 'p1' ? 'p2' : 'p1';
const idFor = side => side === 'p1' ? 'P1' : 'F1';
const protocolEvents = messages => messages.flatMap(message => message.kind === 'events' ? message.events : []);
const binding = { battleId: 'held-ability-transfer', generation: 1, rawHash: 'a'.repeat(64), contentIdentity: 'b'.repeat(64) };
const set = (name, species, ability, moves, item = '') => ({ name, species, ability, moves, item, level: 50, nature: 'Hardy' });

function fixture(c) {
  const magician = c.ability === 'Magician';
  let receiveMove = magician ? 'Tackle' : 'Splash';
  let donateMove = magician ? 'Splash' : 'Tackle';
  if (c.failure === 'protect') {
    if (magician) donateMove = 'Protect';
    else receiveMove = 'Protect';
  }
  if (c.failure === 'status') receiveMove = 'Growl';
  // Swift guarantees a damaging noncontact hit and cannot introduce a random miss.
  if (c.noncontact) {
    if (magician) receiveMove = 'Swift';
    else donateMove = 'Swift';
  }
  const receiver = set(idFor(c.receiverSide), magician ? 'Delphox' : 'Weavile', c.ability,
    [receiveMove, 'Celebrate'], c.failure === 'occupied' ? 'smoothrock' : '');
  const donorSide = opposite(c.receiverSide);
  const donor = set(idFor(donorSide), c.failure === 'sticky-hold' ? 'Grimer' : 'Snorlax',
    c.failure === 'sticky-hold' ? 'Sticky Hold' : 'Immunity',
    [donateMove, 'Memento'], c.failure === 'empty-donor' ? '' : 'lightclay');
  const players = sides.map(side => ({ name: side === 'p1' ? 'Player' : c.wild ? 'Wild' : 'Trainer',
    team: [side === c.receiverSide ? receiver : donor] }));
  return { receiver, donor, donorSide, players };
}

async function open(c, requiredSettlement) {
  const f = fixture(c);
  const options = { engineRoot, formatid: 'gen8rpgcustomgame', seed: [1, 2, 3, 4],
    wild: c.wild, requiredSettlement, players: clone(f.players) };
  const gw = await E.gateway.BattleGateway.create(options);
  assert.equal(await gw.choose('p1', 'team 1'), true);
  assert.equal(await gw.choose('p2', 'team 1'), true);
  gw.drain();
  const lineage = T.heldDiagnostics.gatewaySettlementLineage(gw);
  if (requiredSettlement) assert(lineage, 'real gateway owns the required source');
  else assert.equal(lineage, null, 'control has no held observer');
  return { ...f, gw, lineage, roster: sides.map(side => ({ id: idFor(side), side,
    initial: f.players[sides.indexOf(side)].team[0].item })) };
}

function observe(gw) {
  // Read-only internal diagnostics supplement the public HP/PP view; no engine object is mutated.
  const battle = gw._debugBattle();
  return { state: sides.map(side => gw.readState(side)),
    held: battle.sides.map(side => side.pokemon.map(pokemon => ({ id: pokemon.set.name,
      item: pokemon.item, recycle: pokemon.lastItem, ability: pokemon.ability }))),
    seed: battle.prng.getSeed(), ended: gw.ended };
}

async function turn(gw, choices = ['move 1', 'move 1']) {
  assert.equal(await gw.choose('p1', choices[0]), true, 'p1 choice accepted');
  assert.equal(await gw.choose('p2', choices[1]), true, 'p2 choice accepted');
  const messages = gw.drain();
  assert.equal(messages.some(message => message.kind === 'error'), false, JSON.stringify(messages));
  return messages;
}

function expectJournal(sample, c, success) {
  const facts = T.heldDiagnostics.gatewaySettlementFacts(sample.gw, sample.lineage, binding);
  const resolved = E.heldFacts.resolveRequiredFacts(facts, { binding, roster: sample.roster, wild: c.wild });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  const recipientId = sample.receiver.name, donorId = sample.donor.name;
  const permanent = success && c.wild && c.receiverSide === 'p1';
  const values = (current, recovery) => ({ current, recovery, recycle: '' });
  const beforeDonor = values(sample.donor.item, sample.donor.item);
  const takenDonor = values('', sample.donor.item);
  const beforeReceiver = values(sample.receiver.item, sample.receiver.item);
  const expectedEvents = [];
  const push = (id, side, sourceId, reason, before, after) => expectedEvents.push({
    ordinal: expectedEvents.length + 1, id, side, sourceId, reason, before, after,
  });
  if (success) {
    push(donorId, sample.donorSide, recipientId, 'temporary-remove', beforeDonor, takenDonor);
    if (permanent) push(donorId, sample.donorSide, recipientId, 'transfer-release', takenDonor, values('', ''));
    push(recipientId, c.receiverSide, donorId, permanent ? 'permanent-gain' : 'temporary-receive',
      beforeReceiver, values(sample.donor.item, permanent ? sample.donor.item : sample.receiver.item));
  }
  assert.deepEqual(facts.events, expectedEvents, 'ordered, stable-ID donor and receiver C/I/R transitions');
  const expectedMembers = sample.roster.map(member => ({ ...member,
    ...(!success ? values(member.initial, member.initial) : member.id === recipientId
      ? values(sample.donor.item, permanent ? sample.donor.item : member.initial)
      : values('', permanent ? '' : member.initial)),
  }));
  assert.deepEqual(facts.members, expectedMembers, 'all roster members retain their exact recovery policy');
  assert.deepEqual(facts.money, { amuletCoin: false, happyHour: false, payDay: 0 });
  assert.match(resolved.pairHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(T.heldDiagnostics.gatewaySettlementFacts(sample.gw, sample.lineage, binding), facts,
    'reading the terminal channel does not replay the transfer');
  assert.equal(E.heldFacts.resolveRequiredFacts(facts, { binding, roster: sample.roster, wild: c.wild }).pairHash,
    resolved.pairHash);
}

async function check(c, t) {
  // The paired native runs must share a clock as well as a seed. Otherwise crossing a real
  // second changes only |t:| and fails the exact raw-message comparison nondeterministically.
  const now = 1794220000000;
  t.mock.method(Date, 'now', () => now);
  const sample = await open(c, true), control = await open(c, false);
  const before = observe(sample.gw);
  assert.deepEqual(before, observe(control.gw));
  assert.equal(before.held[sides.indexOf(c.receiverSide)][0].ability, norm(c.ability));
  const messages = await turn(sample.gw), controlMessages = await turn(control.gw);
  const after = observe(sample.gw), events = protocolEvents(messages);
  assert.deepEqual(after, observe(control.gw), 'held observation preserves HP/PP/status/items/PRNG');
  const times = protocolEvents(messages).filter(event => event.type === 't:');
  assert(times.length > 0, 'the native stream still carries its timestamp');
  assert(times.every(event => event.raw === '|t:|' + now / 1000), 'the paired native clock is fixed, not omitted');
  assert.deepEqual(messages, controlMessages, 'held observation preserves the native message stream');
  assert.equal(after.ended, false, 'the triggering turn is not a synthetic terminal shortcut');
  for (const side of sides) {
    const move = norm(sample.players[sides.indexOf(side)].team[0].moves[0]);
    assert.equal(after.state[sides.indexOf(side)][0].pp[move], before.state[sides.indexOf(side)][0].pp[move] - 1,
      side + ' spends exactly one PP on its real selected move');
  }
  const success = !c.failure && !(c.noncontact && c.ability === 'Pickpocket');
  const abilityReceipts = events.filter(event => event.type === '-item'
    && event.args.includes('[from] ability: ' + c.ability));
  assert.equal(abilityReceipts.length, success ? 1 : 0, 'actual ability receipt, never an assumed transfer');
  if (success) {
    const receipt = abilityReceipts[0];
    assert.equal(receipt.args[0], c.receiverSide + 'a: ' + sample.receiver.name);
    assert.equal(norm(receipt.args[1]), sample.donor.item);
    assert(receipt.args.includes('[of] ' + sample.donorSide + 'a: ' + sample.donor.name));
  }
  assert.equal(after.held[sides.indexOf(c.receiverSide)][0].item, success ? sample.donor.item : sample.receiver.item);
  assert.equal(after.held[sides.indexOf(sample.donorSide)][0].item, success ? '' : sample.donor.item);
  const damagedSide = c.ability === 'Magician' ? sample.donorSide : c.receiverSide;
  const index = sides.indexOf(damagedSide);
  if (c.failure === 'protect' || c.failure === 'status') {
    assert.equal(after.state[index][0].hp, before.state[index][0].hp, 'blocked or status move did no damage');
  } else {
    assert(after.state[index][0].hp < before.state[index][0].hp, 'real damaging hit reached the expected target');
    assert(after.state[index][0].hp > 0, 'live target makes the Sticky Hold/ability guard meaningful');
  }
  if (c.failure === 'protect') assert(events.some(event => event.type === '-activate'
    && event.args.includes('move: Protect')), 'ordinary Protect feedback proves the prevented hit');
  if (c.failure === 'sticky-hold') assert(events.some(event => event.type === '-activate'
    && event.args.includes('ability: Sticky Hold')), 'real donor TakeItem veto, not occupied-receiver short circuit');

  // The donor uses Memento; the receiver uses Celebrate. This naturally ends either direction of the battle
  // without another damaging/contact trigger, a debug tie, direct item writes or injected facts.
  const terminal = await turn(sample.gw, ['move 2', 'move 2']);
  assert.deepEqual(terminal, await turn(control.gw, ['move 2', 'move 2']));
  assert.deepEqual(observe(sample.gw), observe(control.gw));
  assert.equal(sample.gw.ended, true, 'ordinary donor self-faint ends the real battle');
  assert.equal(sample.gw.readState(sample.donorSide)[0].hp, 0);
  assert(sample.gw.readState(c.receiverSide)[0].hp > 0);
  assert(protocolEvents(terminal).some(event => event.type === 'faint'
    && event.args[0] === sample.donorSide + 'a: ' + sample.donor.name));
  assert(terminal.some(message => message.kind === 'end'
    && message.winner === sample.players[sides.indexOf(c.receiverSide)].name));
  assert.equal(terminal.some(message => message.kind === 'request'), false,
    'terminal facts do not depend on a subsequent choice request');
  expectJournal(sample, c, success);
}

for (const ability of ['Magician', 'Pickpocket']) {
  for (const wild of [false, true]) {
    for (const receiverSide of sides) {
      for (const failure of [null, 'occupied', 'sticky-hold', 'empty-donor', 'protect']) {
        const title = `${ability} ${wild ? 'wild' : 'trainer'} ${receiverSide} receives: ${failure ?? 'successful transfer'}`;
        test('held ability: ' + title, { concurrency: false }, t => check({ ability, wild, receiverSide, failure }, t));
      }
      test(`held ability: ${ability} ${wild ? 'wild' : 'trainer'} ${receiverSide} noncontact damage`,
        { concurrency: false }, t => check({ ability, wild, receiverSide, noncontact: true }, t));
      if (ability === 'Magician') test(`held ability: Magician ${wild ? 'wild' : 'trainer'} ${receiverSide} status move`,
        { concurrency: false }, t => check({ ability, wild, receiverSide, failure: 'status' }, t));
    }
  }
}
