'use strict';
// Authored synthetic content and in-memory state only. Runtime is the locally
// prepared production/testing pair; no host, saved game or reference replay.
const assert = require('node:assert/strict');
const {E, T, inputs} = require('../../step5/4/trainer-ai-integration/fixtures.cjs');
const clone = value => structuredClone(value);

function world(options = {}) {
  const input = inputs({party: 2, moves: ['splash'], recordStrategy: options.strategy});
  input.species.find(species => species.id === 'snorlax').learnset =
    ['splash', 'tackle', 'protect', 'rest', 'fling'].map(move => ({level: 1, move}));
  for (const foe of input.trainers[0].party) foe.level = 1;
  const compiled = E.contentCompile.compileContent(input);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup(), assembled = E.contentRuntime.assembleContent(compiled.data, dex);
  assert.deepEqual(assembled.errors, []);
  const content = assembled.content;
  const party = ['P1', 'P2'].map((id, index) => {
    const member = E.memberFactory.createMember({id, species: 'Snorlax', level: 50}, content, () => 0);
    member.moves = (options.moves ?? ['tackle', 'protect', 'rest', 'splash']).map(id => ({id, pp: dex.move(id).pp, maxpp: dex.move(id).pp}));
    if (index === 0) member.item = options.held ?? '';
    return E.speciesKey.toPersistentMember(member, content);
  });
  const game = E.state.newGame({content, party, bag: {potion: 3, masterball: 2}, money: 1000});
  game.nextMemberOrdinal = '3';
  const state = T.fakes.createMemoryState(game), projection = T.fakes.createRecordingProjection();
  const sessions = options.sessions ?? E.composition.createBattleSessionFactory({
    content: () => content, seed: () => [1, 2, 3, 4], replacementOffers: options.replacementOffers ?? false,
    ...(options.registry ? {trainerAiStrategies: options.registry} : {}),
  });
  const app = new E.app.GameApplication({state, sessions, content: () => ({content, dex}), projection,
    random: () => 0, clock: () => 1000, itemWorld: () => ({mapId: 5})});
  const request = {battleId: options.battleId ?? 'contract-battle', kind: 'wild', seq: 1,
    foes: [{species: 'Pidgey', level: 1}], expGain: false, moneyGain: false, canLose: true};
  return {E, T, content, dex, state, projection, sessions, app, request};
}

function directOptions(w, driver, extra = {}) {
  const game = E.speciesKey.battleView(w.state.read(), w.content), battleId = 'contract-direct';
  const foe = E.memberFactory.createMember({id: 'F1', species: 'Pidgey', level: 1}, w.content, () => 0);
  return {game, content: w.content, driver, battleId, expGain: false,
    foe: {kind: 'wild', team: [foe]},
    evidence: {battleId, generation: 0, contentIdentity: E.contentRuntime.validatedContentIdentity(w.content),
      playerIds: game.party.map(member => member.id), initialLevels: Object.fromEntries(game.party.map(member => [member.id, member.level]))},
    ...extra};
}

module.exports = {E, T, world, clone, directOptions};
