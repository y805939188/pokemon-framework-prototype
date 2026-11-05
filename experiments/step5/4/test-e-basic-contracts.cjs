'use strict';
// Bounded E contract sampling: actual pinned Gen8 choices and public Gateway facts, no UI/App/Ruby claim.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { gateway: { BattleGateway } } = require('../../../js/engine/build/production.cjs');
const plan = require('./e-basic-contracts.json');
const ids = Array.from({length:8}, (_, i) => 'ECORE-' + String(i + 1).padStart(2, '0'));
assert.equal(plan.schema, 1); assert.equal(plan.format, 'gen8rpgcustomgame'); assert.deepEqual(plan.seed, [1,2,3,4]);
assert.deepEqual(plan.cases.map(c => c.id), ids, 'exact nonempty selected contracts, never every([])');
assert.deepEqual(plan.headings.map(r => r.featureId).sort(), ['FR-000532','FR-000533','FR-000544','FR-000546']);
assert.equal(fs.readFileSync(path.resolve(__dirname, '../../../js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), plan.showdownSHA);
for (const c of plan.cases) {
  assert(c.featureIds.length && c.featureIds.every(id => plan.headings.some(h => h.featureId === id)));
  assert(Number.isSafeInteger(c.setupTurns) && c.setupTurns >= 0 && Number.isSafeInteger(c.turns) && c.turns > 0);
  test(c.id + ' ' + c.check, async () => {
    const gw = await BattleGateway.create({formatid:plan.format, seed:[...plan.seed], players:[
      {name:'Player',team:[{...structuredClone(c.player),name:'user'}]},
      {name:'Target',team:[{...structuredClone(c.target),name:'target'}]},
    ]});
    assert.equal(await gw.choose('p1','team 1'), true); assert.equal(await gw.choose('p2','team 1'), true);
    const eventsOf = messages => messages.flatMap(m => m.kind === 'events' ? m.events : []);
    const read = side => structuredClone(gw.readState(side)[0]);
    gw.drain();
    const turn = async slot => {
      assert.equal(await gw.choose('p1','move ' + slot), true, 'real player registration');
      assert.equal(await gw.choose('p2','move 1'), true, 'real opposing registration');
      const messages=gw.drain(); assert(!messages.some(m => m.kind === 'error'), 'no engine error treated as a result');
      return eventsOf(messages);
    };
    for(let i=0; i<c.setupTurns; i++) await turn(1);
    const before={player:read('p1'),target:read('p2')}, all=[], stages=[];
    if(c.check==='guaranteed-hit') assert.equal(before.target.boosts.evasion,6,'six actual Double Team uses, no direct stage writes');
    for(let i=0; i<c.turns; i++) {const events=await turn(c.moveSlot);all.push(...events);stages.push({events,target:read('p2')});}
    const after={player:read('p1'),target:read('p2')}, moveId=c.player.moves[c.moveSlot-1];
    assert.equal(after.player.pp[moveId],before.player.pp[moveId]-c.turns,'one real PP deduction per chosen use, including immunity or cap');
    const targetEvent = type => all.some(e => e.type===type && e.args[0]==='p2a: target');
    switch(c.check) {
      case 'type-immune':
        assert.equal(after.target.hp,before.target.hp,'immunity never takes minimum one damage');
        assert.equal(after.target.status,'');assert(targetEvent('-immune'),'actual immunity event');break;
      case 'super-effective':
        assert(after.target.hp<before.target.hp);assert(targetEvent('-supereffective'));break;
      case 'resisted':
        assert(after.target.hp<before.target.hp);assert(targetEvent('-resisted'));break;
      case 'guaranteed-hit':
        assert.equal(after.target.boosts.evasion,6);assert(after.target.hp<before.target.hp);
        assert(!all.some(e=>e.type==='-miss'),'Swift remains a hit at +6 evasion');break;
      case 'poison-immune':
        assert.equal(after.target.status,'');assert.equal(after.target.hp,before.target.hp);
        assert(targetEvent('-immune')||targetEvent('-fail'),'a real immunity/failure event, not merely no status');break;
      case 'poison-applied':
        assert.equal(after.target.status,'tox');assert(after.target.hp<before.target.hp,'ordinary end-turn poison damage');
        assert(all.some(e=>e.type==='-status'&&e.args[0]==='p2a: target'&&e.args[1]==='tox'));break;
      case 'stat-cap':
        assert.equal(before.target.boosts.atk,0);
        assert.deepEqual(stages.map(row=>row.target.boosts.atk),[-1,-2,-3,-4,-5,-6,-6]);
        assert.equal(all.filter(e=>e.type==='-unboost'&&e.args[0]==='p2a: target'&&e.args[1]==='atk'&&Number(e.args[2])>0).length,6);
        // Gen8 records a zero-magnitude wire event at the cap; it is not a seventh actual stat drop.
        assert.deepEqual(stages[6].events.filter(e=>e.type==='-unboost').map(e=>e.args),[['p2a: target','atk','0']]);break;
      default: throw new Error('unrecognized frozen contract ' + c.check);
    }
    console.log('E_CONTRACT_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,format:plan.format,seed:plan.seed,before,after,events:all,scope:'actual raw Gateway/Gen8 only; no App settlement/UI/native/Ruby claim'}));
  });
}
