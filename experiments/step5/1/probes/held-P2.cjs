'use strict';
// Fixed-engine observations only. No production API/protocol changes and no persistent game state is written.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../../..');
const E = require(path.join(ROOT, 'js/engine/build/engine.cjs'));
async function observe() {
  const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sample', name + '.json'), 'utf8'));
  const compiled = E.contentCompile.compileContent(Object.fromEntries(['manifest','sources','species','overlays','grants'].map(name => [name, read(name)])));
  assert.equal(compiled.ok, true); const dex = E.dex.createDexLookup();
  assert.deepEqual(E.contentRuntime.assembleContent(compiled.data, dex).errors, []); // source use gate precedes external lookup
  const cases = [
    { id: 'consume', move: 'bellydrum', actor: 'Snorlax', item: 'sitrusberry', targetItem: '', expectedActor: '', expect: /\|-enditem\|.*Sitrus Berry.*\[eat\]/ },
    { id: 'knockoff', move: 'knockoff', actor: 'Mew', item: '', targetItem: 'leftovers', expectedTarget: '', expect: /\|-enditem\|.*Leftovers.*Knock Off/ },
    { id: 'thief-wild', move: 'thief', actor: 'Mew', item: '', targetItem: 'leftovers', expectedActor: 'leftovers', expectedTarget: '', expect: /Thief/ },
    { id: 'trick', move: 'trick', actor: 'Mew', item: 'sitrusberry', targetItem: 'leftovers', expectedActor: 'leftovers', expectedTarget: 'sitrusberry', expect: /Trick/ },
    { id: 'fling', move: 'fling', actor: 'Mew', item: 'ironball', targetItem: '', expectedActor: '', expect: /\|-enditem\|.*Iron Ball.*Fling/ },
  ];
  const observations = [];
  for (const c of cases) {
    const gateway = await E.gateway.BattleGateway.create({ formatid: 'gen8rpgcustomgame', seed: [1,2,3,4], wild: true, players: [
      { name: 'Player', team: [{ name: 'ACTOR', species: c.actor, level: 50, moves: [c.move], item: c.item, evs: { hp: 4, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ability: c.actor === 'Mew' ? 'Synchronize' : 'Immunity' }] },
      { name: 'Wild', team: [{ name: 'TARGET', species: 'Snorlax', level: 50, moves: ['splash'], item: c.targetItem, ability: 'Immunity' }] },
    ] });
    const query = () => Object.fromEntries(['p1','p2'].map(side => [side, (gateway.awaitingChoice(side)?.side?.pokemon ?? []).map(p => ({ ident: p.ident, item: p.item, itemObservable: Object.hasOwn(p, 'item') }))]));
    const initial = gateway.drain();
    if (gateway.awaitingChoice('p1')?.teamPreview) { assert.equal(await gateway.choose('p1', 'team 1'), true); assert.equal(await gateway.choose('p2', 'team 1'), true); gateway.drain(); }
    const before = query();
    assert.equal(await gateway.choose('p1', 'move 1'), true, c.id + JSON.stringify({ initial, request: gateway.awaitingChoice('p1'), errors: gateway.drain() })); assert.equal(await gateway.choose('p2', 'move 1'), true);
    const messages = gateway.drain(); const events = messages.filter(m => m.kind === 'events').flatMap(m => m.events.map(e => e.raw));
    const after = query();
    // Tools may inspect the engine as an oracle, never exposed to flow/UI or included in a BattleResult.
    const oracle = Object.fromEntries(['p1','p2'].map(side => [side, gateway._debugBattle().getSide(side).pokemon.map(p => ({ id: p.name, item: p.item, lastItem: p.lastItem }))]));
    if (c.expectedActor !== undefined) assert.equal(oracle.p1[0].item, c.expectedActor, c.id);
    if (c.expectedTarget !== undefined) assert.equal(oracle.p2[0].item, c.expectedTarget, c.id);
    assert.ok(events.some(e => c.expect.test(e)), c.id + ': ' + events.join('\n'));
    observations.push({ id: c.id, initial: { ACTOR: c.item, TARGET: c.targetItem }, before, after, oracle, events, itemEvents: events.filter(e => /^\|-(?:enditem|item)\|/.test(e)) });
  }
  return { at: new Date().toISOString(), head: execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(), dirty: execFileSync('git',['status','--short'],{cwd:ROOT,encoding:'utf8'}), engine: dex.sha(), observations, limits: ['Tool-only private oracle is not a production port.', 'No item write-back, new v1 fields, or permission to change frozen API is implied.', 'Unknown event reasons cannot be guessed; final contract must fail closed.'] };
}
module.exports = { observe };
if (require.main === module) observe().then(report => { const out = process.argv[2]; if (!out) throw Error('provide a new evidence path'); fs.mkdirSync(path.dirname(out),{recursive:true}); if(fs.existsSync(out))throw Error('refusing to overwrite evidence'); fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify({head:report.head,engine:report.engine,observations:report.observations.map(x=>({id:x.id,itemEvents:x.itemEvents,after:x.after}))},null,2)); }).catch(error=>{console.error(error);process.exitCode=1;});
