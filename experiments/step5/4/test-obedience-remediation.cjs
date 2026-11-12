'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs');
test.beforeEach(t=>t.mock.method(Date,'now',()=>1793350000000));
const PLAYER={id:0,name:'player',gender:2,language:2},FOREIGN={id:1,name:'other',gender:0,language:7};
const team=(name,species,moves,level=60,ability='Immunity')=>({name,species,level,moves,ability,nature:'hardy',gender:'M',evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31}});
async function create(seed,options={}){
 const gw=await E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',seed:[seed,22,33,44],wild:true,
 players:[{name:'Player',team:[team('player',options.species??'Snorlax',options.moves??['Tackle','Fly'])]},{name:'Wild',team:[team('foe',options.foe??'Snorlax',options.foeMoves??['Splash'],100,'Thick Fat')]}],
 obedience:{player:PLAYER,members:{player:FOREIGN},badges:options.badges??0,anyHighLevel:false,foreignHighLevel:true,generation:1,contentIdentity:'obedience-remediation'}});
 await gw.choose('p1','team 1');await gw.choose('p2','team 1');if(options.status)gw.seedState('p1',[{id:'player',hp:gw.readState('p1')[0].maxhp,status:options.status,statusCount:0}]);gw.drain();return gw;
}
async function turn(gw,choice='move 1',foeChoice='move 1'){await gw.choose('p1',choice);await gw.choose('p2',foeChoice);return gw.drain();}
const runtime=gw=>JSON.parse(gw.snapshot()).rpg.obedienceRuntime;
const trace=gw=>runtime(gw)?.trace??[];
const player=gw=>gw._debugBattle().getSide('p1').active[0];
async function change(options={}){
 for(let seed=1;seed<=120;seed++){
  const gw=await create(seed,options),checkpoint=gw.checkpoint(),before=gw.readState('p1')[0],messages=await turn(gw);
  if(trace(gw).some(e=>e.kind==='change'))return{gw,checkpoint,before,messages,seed};
 }
 assert.fail('natural seed did not reach change');
}
test('O1 changed Fly charges once, remains locked, executes next turn, and replays exactly',async()=>{
 const s=await change(),p=player(s.gw);assert(p.volatiles.twoturnmove,'changed Fly must retain charging state');
 assert.equal(p.activeMoveActions,1);assert.notEqual(p.moveLastTurnResult,false);assert.equal(s.gw.readState('p1')[0].pp.fly,s.before.pp.fly-1);assert.equal(s.gw.readState('p1')[0].pp.tackle,s.before.pp.tackle);
 const after=s.gw.snapshot(),restored=await E.gateway.BattleGateway.fromCheckpoint(s.checkpoint);await turn(restored);assert.deepEqual(JSON.parse(restored.snapshot()),JSON.parse(after));
 const draws=runtime(s.gw).draws,foeHp=s.gw.readState('p2')[0].hp;await turn(s.gw,'move fly');
 assert.equal(runtime(s.gw).draws,draws,'locked continuation makes no obedience draw');assert(!player(s.gw).volatiles.twoturnmove);assert(s.gw.readState('p2')[0].hp<foeHp);assert.equal(s.gw.readState('p1')[0].pp.fly,s.before.pp.fly-1);
});
test('O1 changed first-turn Fake Out succeeds with one action and does not prime Stomping Tantrum',async()=>{
 const s=await change({moves:['Tackle','Fake Out']}),p=player(s.gw);
 assert.equal(p.activeMoveActions,1);assert.equal(p.moveLastTurnResult,true);assert(s.gw.readState('p2')[0].hp<s.gw.readState('p2')[0].maxhp);assert.equal(s.gw.readState('p1')[0].pp.fakeout,s.before.pp.fakeout-1);
});
test('O1 changed self-target move from an attacking selection targets the user without altering Dex',async()=>{
 const s=await change({moves:['Tackle','Harden']});assert.equal(player(s.gw).boosts.def,1);assert.equal(player(s.gw).activeMoveActions,1);assert.equal(player(s.gw).moveLastTurnResult,true);
});
test('O1 changed attack from a self-targeting selection does not hit the user',async()=>{
 const s=await change({moves:['Harden','Tackle']});assert.equal(s.gw.readState('p1')[0].hp,s.before.hp);assert(s.gw.readState('p2')[0].hp<s.gw.readState('p2')[0].maxhp);assert.equal(s.gw.readState('p1')[0].pp.harden,s.before.pp.harden);
});
test('O3 faster same-turn Taunt excludes newly blocked Splash and selects the other legal attack',async()=>{
 const s=await change({moves:['Tackle','Splash','Scratch'],foe:'Deoxys-Speed',foeMoves:['Taunt']}),entry=trace(s.gw).find(e=>e.kind==='change');
 assert(player(s.gw).volatiles.taunt);assert.equal(entry.newMove,'scratch');assert.equal(s.gw.readState('p1')[0].pp.splash,s.before.pp.splash);assert.equal(s.gw.readState('p1')[0].pp.scratch,s.before.pp.scratch-1);
});
test('O3 faster same-turn Encore leaves no alternative rather than reporting an unexecuted move',async()=>{
 let found=false;
 for(let seed=1;seed<=600&&!found;seed++){
  const gw=await create(seed,{moves:['Tackle','Scratch'],foe:'Deoxys-Speed',foeMoves:['Splash','Encore']});await turn(gw);
  if(!trace(gw).some(e=>e.kind==='eligible'&&e.a<e.limit))continue;
  const before=gw.readState('p1')[0].pp;await turn(gw,'move 2','move 2');
  const entries=trace(gw).filter(e=>e.turn===2);if(!entries.some(e=>e.kind==='change'||e.kind==='no-other-move'))continue;
  assert(player(gw).volatiles.encore);assert(entries.some(e=>e.kind==='no-other-move'));assert(!entries.some(e=>e.kind==='change'));assert.deepEqual(gw.readState('p1')[0].pp,before);found=true;
 }
 assert(found,'natural Encore/no-other-move branch');
});
for(const lang of ['en','zh'])test(`O2 ${lang} all obedience outcomes have localized, immutable player-facing descriptions`,()=>{
 const tr=E.i18n.translatorFor(lang),d=E.describe.make({player:'Buddy'},tr);
 for(const [result,detail]of[['sleep','snore'],['ignored','no-other-move'],['change','fly'],['self-sleep','7'],['self-hit','7'],...['0','1','2','3'].map(x=>['refuse',x])]){
  const args=['obedience','p1','player',result,detail],e={type:'rpg',args,raw:'|rpg|'+args.join('|')},before=JSON.stringify(e),text=d.event(e);
  assert.equal(text.length,1);assert(text[0].includes('Buddy'));assert(!text[0].includes('battle.obedience.'));assert.equal(JSON.stringify(e),before);
 }
 assert.deepEqual(tr.diagnostics(),{missingKeys:[],missingParams:[]});
});

test('O3 same-turn Taunt with no legal alternative refuses without spending either PP',async()=>{
 let found=false;
 for(let seed=1;seed<=120&&!found;seed++){
  const gw=await create(seed,{moves:['Tackle','Splash'],foe:'Deoxys-Speed',foeMoves:['Taunt']}),before=gw.readState('p1')[0].pp;await turn(gw);
  const entries=trace(gw);if(!entries.some(e=>e.kind==='change'||e.kind==='no-other-move'))continue;
  assert(entries.some(e=>e.kind==='no-other-move'));assert(!entries.some(e=>e.kind==='change'));assert.deepEqual(gw.readState('p1')[0].pp,before);found=true;
 }
 assert(found);
});
test('O3 faster same-turn Disable excludes the last used alternative',async()=>{
 let found=false;
 for(let seed=1;seed<=600&&!found;seed++){
  const gw=await create(seed,{moves:['Tackle','Scratch'],foe:'Deoxys-Speed',foeMoves:['Splash','Disable']});await turn(gw,'move 2');
  if(!trace(gw).some(e=>e.kind==='eligible'&&e.a<e.limit))continue;
  const before=gw.readState('p1')[0].pp;await turn(gw,'move 1','move 2');const entries=trace(gw).filter(e=>e.turn===2);
  if(!entries.some(e=>e.kind==='change'||e.kind==='no-other-move'))continue;
  assert.equal(player(gw).volatiles.disable.move,'scratch');assert(entries.some(e=>e.kind==='no-other-move'));assert(!entries.some(e=>e.kind==='change'));assert.deepEqual(gw.readState('p1')[0].pp,before);found=true;
 }
 assert(found);
});

test('O1 original thaw-capable choice is checked for freeze once, not again after replacing its move',async()=>{
 const s=await change({moves:['Scald','Scratch'],status:'frz'});
 assert.equal(player(s.gw).activeMoveActions,1);assert.equal(s.gw.readState('p1')[0].pp.scald,s.before.pp.scald);assert.equal(s.gw.readState('p1')[0].pp.scratch,s.before.pp.scratch-1);
 assert.equal(s.gw.readState('p1')[0].status,'frz');assert(s.gw.readState('p2')[0].hp<s.gw.readState('p2')[0].maxhp);
 assert(!s.messages.flatMap(m=>m.events??[]).some(e=>e.type==='cant'&&e.args[1]==='frz'));
});
test('O1 changed move still runs lower-priority native flinch once and pays no PP on refusal',async()=>{
 const s=await change({moves:['Tackle','Scratch'],foeMoves:['Fake Out']});
 assert.equal(player(s.gw).activeMoveActions,1);assert.deepEqual(s.gw.readState('p1')[0].pp,s.before.pp);
 assert(s.messages.flatMap(m=>m.events??[]).some(e=>e.type==='cant'&&e.args[1]==='flinch'));
});
test('O1 the cached native move remains untouched by per-use substitution',async()=>{
 const gw=await create(1,{moves:['Harden','Tackle']}),dex=gw._debugBattle().dex,before=JSON.stringify(dex.moves.get('harden')),other=JSON.stringify(dex.moves.get('tackle'));
 const s=await change({moves:['Harden','Tackle']});assert.equal(s.gw._debugBattle().dex,dex);assert.equal(JSON.stringify(dex.moves.get('harden')),before);assert.equal(JSON.stringify(dex.moves.get('tackle')),other);
});
