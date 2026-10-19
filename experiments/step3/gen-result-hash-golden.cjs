'use strict';
// Generates experiments/step3/fixtures/result-hash-golden.json: real and synthetic BattleResults with the hash computed by
// the ORIGINAL resultHash (node:crypto SHA-256 over canonical JSON), so the portable implementation can be checked
// against values that existed before it. Run only against an implementation that still uses node:crypto:
//   git show 4ce31e1:src/framework/rules/state.ts   (the generating commit)
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const F = E.fixtures;
const { BattleSession } = E.session;

async function session(foe, id, mutate) {
  const game = F.makeGame(); if (mutate) mutate(game);
  const s = await BattleSession.create({ game, content: F.content, battleId: id, seed: [1, 2, 3, 4], foe });
  s.take(); return s;
}
(async () => {
  const entries = [];
  const add = (name, result) => entries.push({ name, result: JSON.parse(JSON.stringify(result)), hash: E.state.resultHash(result) });
  let s = await session({ kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5)] }, 'GOLD-run'); await s.run(); add('wild run', s.result());
  s = await session({ kind: 'wild', team: [F.foeMember('W2-1', 'Snorlax', 40, { moves: ['protect'] })] }, 'GOLD-caught'); await s.throwBall('masterball'); const caught = s.result(); add('caught with master ball', caught);
  s = await session({ kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5)] }, 'GOLD-win', g => { g.party[0].exp = E.growth.minExp('parabolic', 51) - 1; g.party[0].hp = 70; });
  await s.useItem('potion', 'A-0001');
  for (let i = 0; i < 8 && !s.finished; i++) { if (s.pendingLearn) { await s.decideLearn(null); continue; } await s.chooseMove(1); }
  add('trainer win with potion, level-up, declined move', s.result());
  s = await session({ kind: 'trainer', team: [F.foeMember('T2-1', 'Pidgey', 5)] }, 'GOLD-win2', g => { g.party[0].exp = E.growth.minExp('parabolic', 51) - 1; });
  for (let i = 0; i < 8 && !s.finished; i++) { if (s.pendingLearn) { await s.decideLearn(0); continue; } await s.chooseMove(1); }
  add('trainer win, learned a move over slot 0', s.result());
  // synthetic edge cases on top of a real result
  const base = JSON.parse(JSON.stringify(caught));
  const cap = Object.values(base.captured || [])[0] || base.captured[0];
  for (const [label, nickname] of [['unicode nickname', '波波と🐦'], ['astral characters only', '😀😀😀'], ['escapes and quotes', 'a"b\\c\n\t'], ['empty string', '']]) {
    const r = JSON.parse(JSON.stringify(base)); r.captured[0].nickname = nickname; r.battleId = 'GOLD-' + label; add('synthetic: ' + label, r);
  }
  const shuffled = {}; for (const k of Object.keys(base).reverse()) shuffled[k] = base[k]; add('synthetic: same result, keys in reverse insertion order', shuffled);
  const long = JSON.parse(JSON.stringify(base)); long.battleId = 'GOLD-long'; long.bag = {}; for (let i = 0; i < 300; i++) long.bag['item' + i] = i - 150; add('synthetic: long document (many bag entries)', long);
  const out = path.join(__dirname, 'fixtures', 'result-hash-golden.json');
  fs.writeFileSync(out, JSON.stringify({ generator: 'experiments/step3/gen-result-hash-golden.cjs', algorithm: 'node:crypto SHA-256 over canonical JSON (sorted keys), as in rules/state.ts at 4ce31e1', entries }, null, 1) + '\n');
  console.log('wrote', entries.length, 'entries');
})().catch(e => { console.error(e); process.exit(1); });
