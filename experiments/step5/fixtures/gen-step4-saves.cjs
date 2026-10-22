'use strict';
// Generates the step 4 (schema 3) migration samples of step 5.0 (prompt §2.4, plan checkpoint P-1) WITH THE STEP 4 CODE:
// run it against a checkout of c789620 whose engine is built (pnpm --dir src build:engine) and whose Showdown is staged.
//   node experiments/step5/fixtures/gen-step4-saves.cjs --root <c789620 checkout> [--out <dir>]
// Every state change goes through the step 4 GameApplication and real Showdown-backed sessions over the step 4 sample
// content, except the setup steps marked SETUP below (balls in the bag, and a potion count above the stage cap, which
// step 4's own tests also write directly to stand for an older save). No player save is read or written.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('--root', ''));
const OUT = path.resolve(arg('--out', path.join(__dirname, 'step4-saves')));
const E = require(path.join(ROOT, 'js/engine/build/engine.cjs'));
const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (E.state.GAME_SCHEMA !== 3) throw new Error(`expected a step 4 build (schema 3), got schema ${E.state.GAME_SCHEMA} at ${head}`);
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sample', f), 'utf8'));
const compiled = E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') });
if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
const content = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()).content;
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; };
const clone = x => JSON.parse(JSON.stringify(x));

function world(seed) {
  const state = E.fakes.createMemoryState(E.state.newGame({ party: [] }));
  let engineSeed = [seed, 2, 3, 4];
  const sessions = E.composition.createBattleSessionFactory({ content: () => content, seed: () => engineSeed });
  const app = new E.app.GameApplication({ state, sessions, projection: E.fakes.createRecordingProjection(), content: () => ({ content, dex: E.dex.createDexLookup() }), random: lcg(seed) }, { startMoney: 3000 });
  return { state, app, setSeed: s => { engineSeed = [s, 2, 3, 4]; } };
}
const results = {};
let seq = 0;
async function catchOne(w, species, level, ball) {
  for (let k = 1; k < 60; k++) {
    seq++; w.setSeed(k);
    const req = { battleId: `wild#${seq}`, kind: 'wild', foes: [{ species, level }], seq };
    const s = await w.app.startBattle(req);
    for (let t = 0; t < 4 && !s.finished; t++) await s.throwBall(ball);
    if (!s.finished) { w.app.abortBattle(req, new Error('generator: not caught with this seed')); continue; }
    const o = w.app.finishBattle(s, req);
    if (o.commit !== 'applied') throw new Error(`${req.battleId}: ${JSON.stringify(o)}`);
    results[req.battleId] = s.result();
    return o;
  }
  throw new Error(`could not catch ${species}`);
}

(async () => {
  // full: starter grant, six catches (four fill the party, two go to the boxes), an over-cap potion amount
  const w = world(11);
  if (w.app.startNewGame().status !== 'started') throw new Error('new game');
  const claim = w.app.claimGrant('starter'); if (claim.status !== 'applied') throw new Error(JSON.stringify(claim));
  w.state.replace({ ...clone(w.state.current()), bag: { ...w.state.current().bag, masterball: 6 } }); // SETUP: balls
  for (const [sp, lv] of [['pidgey', 3], ['caterpie', 2], ['pidgey', 4], ['caterpie', 3], ['pidgey', 2], ['caterpie', 4]]) await catchOne(w, sp, lv, 'masterball');
  const full = clone(w.state.current());
  full.bag.potion = 5000; // SETUP: an amount above the stage cap of 999, as an older save may hold (kept, never trimmed)
  // defeat: the starter loses to a much stronger foe; money loss and heal are settled with the result (D3)
  const d = world(5);
  d.app.startNewGame(); d.app.claimGrant('starter');
  let lost;
  for (let k = 1; k < 40 && !lost; k++) {
    seq++; d.setSeed(k);
    const req = { battleId: `wild#${seq}`, kind: 'wild', foes: [{ species: 'snorlax', level: 40 }], seq };
    const s = await d.app.startBattle(req);
    for (let t = 0; t < 30 && !s.finished; t++) { if (s.pendingLearn) { await s.decideLearn(null); continue; } await s.chooseMove(1); }
    if (!s.finished) { d.app.abortBattle(req, new Error('generator: unfinished')); continue; }
    const o = d.app.finishBattle(s, req);
    if (o.code === 4 && o.commit === 'applied') { lost = o; results[req.battleId] = s.result(); }
  }
  if (!lost) throw new Error('no defeat');
  const defeat = clone(d.state.current());
  for (const g of [full, defeat]) { const p = E.saveSchema.validateGame(g); if (p.length || g.schema !== 3) throw new Error(JSON.stringify(p)); }
  fs.mkdirSync(OUT, { recursive: true });
  const files = { 'full.json': full, 'defeat.json': defeat, 'results.json': results };
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), JSON.stringify(v, null, 1) + '\n');
  const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const manifest = {
    generatedBy: 'experiments/step5/fixtures/gen-step4-saves.cjs', codeCommit: head, schema: 3,
    engine: sha(path.join(ROOT, 'js/engine/build/engine.cjs')), content: compiled.data.inputsHash,
    setupSteps: ['bag.masterball = 6 before the catches (balls only; the catches themselves are real battles)', 'full.json: bag.potion = 5000 after the catches (an over-cap amount, kept by every schema)'],
    summary: { full: { party: full.party.map(m => `${m.id}:${m.species}`), boxes: full.boxes.map(m => `${m.id}:${m.species}`), dex: full.dex, claims: Object.keys(full.claims), battles: Object.keys(full.appliedBattles).length }, defeat: { money: defeat.money, battles: Object.keys(defeat.appliedBattles) } },
    files: Object.fromEntries(Object.keys(files).map(f => [f, sha(path.join(OUT, f))])),
  };
  fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(JSON.stringify(manifest.summary));
})().catch(e => { console.error(e); process.exit(1); });
