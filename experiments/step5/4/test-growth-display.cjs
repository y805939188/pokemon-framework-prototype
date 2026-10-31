'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BattleSession}=require('../../../js/engine/game/session.cjs'),G=require('../../../js/engine/game/growth.cjs');
const {readGrowthDisplay}=require('../../../js/engine/build/production.cjs').battlePresentation;
const {content,makeGame,foeMember}=require('../../step2/s3/fixtures.cjs');
async function award(level=50,exp){const game=makeGame();game.party[0].level=level;game.party[0].exp=exp??G.minExp('parabolic',level);const s=await BattleSession.create({game,battleId:'display-'+level,content,seed:[1,2,3,4],foe:{kind:'trainer',team:[foeMember('F-1','Pidgey',5),foeMember('F-2','Pidgey',5)]}});s.take();const result=await s.chooseMove(1);assert(result.ok);const growth=result.messages.find(m=>m.kind==='growth');assert(growth);return{s,growth};}
test('real KO publishes the applied EXP interval and each level boundary, preserving the learning gate',async()=>{
 const from=G.minExp('parabolic',51)-1,{s,growth:m}=await award(50,from),d=readGrowthDisplay(s,m);
 assert.equal(d.version,1);assert.equal(d.fromExp,from);assert.equal(d.toExp,s.party[0].exp);assert.equal(d.fromLevel,50);assert.equal(d.toLevel,51);assert.equal(d.segments[0].level,50);assert.equal(d.segments[0].to,1);assert.equal(d.segments[0].levelUp.level,51);
 assert.equal(d.hp,s.party[0].hp);assert.equal(d.maxhp,s.gw.readState('p1').find(p=>p.id===m.member).maxhp);assert(s.pendingLearn,'domain learning remains pending while UI presents growth');
 const sum=d.segments.reduce((n,x)=>n+(x.to-x.from)*(G.minExp('parabolic',x.level+1)-G.minExp('parabolic',x.level)),0);assert(Math.abs(sum-(d.toExp-d.fromExp))<1e-6);assert.equal(d.segments.at(-1).to,d.ratio);
});
test('published presentation objects cannot mutate battle members, engine state or later learning',async()=>{
 const {s,growth:m}=await award(50,G.minExp('parabolic',51)-1),before=JSON.stringify(s.party),engine=JSON.stringify(s.gw.readState('p1'));const d=readGrowthDisplay(s,m);d.hp=0;d.segments[0].levelUp.hp=0;d.segments.length=0;assert(readGrowthDisplay(s,m).segments.length>0);
 assert.equal(JSON.stringify(s.party),before);assert.equal(JSON.stringify(s.gw.readState('p1')),engine);const after=await s.decideLearn(null);assert(after.some(x=>x.kind==='request'));assert.equal(s.party[0].level,51);
});
test('capped maximum-level EXP has no fabricated bar interval or level-up presentation',async()=>{
 const {s,growth:m}=await award(100,G.minExp('parabolic',100));const d=readGrowthDisplay(s,m);assert.equal(d.fromExp,d.toExp);assert.deepEqual(d.segments,[]);assert.equal(d.fromLevel,100);assert.equal(d.toLevel,100);assert.equal(d.ratio,1);assert(!s.pendingLearn);
});
test('ordinary same-level award is a bounded JSON-only segment with no invented level-up',async()=>{
 const {s,growth:m}=await award();const d=JSON.parse(JSON.stringify(readGrowthDisplay(s,m)));assert.equal(d.fromLevel,d.toLevel);assert.equal(d.segments.length,1);assert.equal(d.segments[0].from,0);assert(d.segments[0].to>0&&d.segments[0].to<1);assert.equal(d.segments[0].levelUp,undefined);assert.equal(d.segments[0].to,d.ratio);
});

test('projection read rejects foreign owners, JSON replays and a mutated message without adding wire fields',async()=>{
 const {s,growth:m}=await award();assert.deepEqual(Object.keys(m).sort(),['exp','foe','hp','kind','level','levelUps','member']);assert.equal(Object.getOwnPropertySymbols(m).length,0);assert.equal(readGrowthDisplay({},m),null);assert.equal(readGrowthDisplay(s,JSON.parse(JSON.stringify(m))),null);m.exp++;assert.equal(readGrowthDisplay(s,m),null);
});
test('rollback restores pending display records onto new wire objects and retires delivered old handles',async()=>{
 const {s,growth:m}=await award();const expected=readGrowthDisplay(s,m);s.out.push(m);const cp=s._checkpoint();s.take();await s._restoreCheckpoint(cp);const restored=s.take().find(x=>x.kind==='growth');assert.notEqual(restored,m);assert.deepEqual(restored,m);assert.equal(readGrowthDisplay(s,m),null);assert.deepEqual(readGrowthDisplay(s,restored),expected);
 const changed=s._checkpoint();s.out.push(restored);const mismatch=s._checkpoint();mismatch.state.out[0].exp++;await s._restoreCheckpoint(mismatch);assert.equal(readGrowthDisplay(s,s.take()[0]),null);assert.equal(changed.state.out.length,0);
});
test('legacy checkpoint without presentation remains usable and never invents display from mutable state',async()=>{
 const {s,growth:m}=await award();s.out.push(m);const cp=s._checkpoint();delete cp.presentation;await s._restoreCheckpoint(cp);const restored=s.take()[0];assert.equal(readGrowthDisplay(s,restored),null);assert.equal(restored.exp,m.exp);assert.equal(readGrowthDisplay(s,m),null);
});
test('public projection facade has no producer, restore hook or test capability',()=>{
 const api=require('../../../js/engine/build/production.cjs').battlePresentation,legacy=require('../../../js/engine/build/engine.cjs').battlePresentation;assert.deepEqual(Object.keys(api),['readGrowthDisplay']);assert.equal(api.readGrowthDisplay,legacy.readGrowthDisplay);
});
