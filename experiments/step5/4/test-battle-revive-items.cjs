'use strict';
// Real Session + fixed Gen8 queue; explicit valid author identity exposes missing old battle support.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/production.cjs'),F=require('../../../js/engine/fixtures/game.cjs');
async function open(item='revive',options={}){
 const content=structuredClone(F.content);content.items=E.itemCatalog.legacyCatalog();
 content.items[item]={...content.items[item],battleUse:'member',battleId:item};
 const members=[F.member('A','Snorlax',100,{moves:['tackle'],ability:'Immunity'}),F.member('R',options.species??'Pidgey',100,{moves:['tackle'],ability:'Keen Eye'})];members[1].hp=options.alive?1:0;if(options.egg)members[1].isEgg=true;
 const game=E.state.newGame({content,party:members,bag:{[item]:2},money:1000}),before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content,battleId:'revive-'+item,seed:[1,2,3,4],foe:{kind:'trainer',team:[F.foeMember('B','Snorlax',3,{moves:['protect'],ability:'Immunity'})]}});s.take();return{s,game,before};
}
for(const item of ['revive','maxrevive','maxhoney'])test(item+' revives a fainted reserve through the real item turn and can actually switch in',async()=>{
 const {s,game,before}=await open(item),beforeLive=s.gw.readState('p1').find(m=>m.id==='R');assert(beforeLive.fainted);assert.equal(beforeLive.hp,0);
 const r=await s.useItem(item,'R');assert(r.ok,JSON.stringify(r));const mon=s.gw.readState('p1').find(m=>m.id==='R'),expected=item==='revive'?Math.max(1,Math.floor(mon.maxhp/2)):mon.maxhp;
 assert.equal(mon.hp,expected);assert.equal(mon.fainted,false);assert.equal(mon.status,'');assert.equal(s.bag[item],1);assert.equal(JSON.parse(s.gw.snapshot()).sides[0].pokemonLeft,2);
 assert((await s.chooseSwitch('R')).ok);assert.equal(s.gw.activeId('p1'),'R');for(let n=0;n<8&&!s.finished;n++)assert((await s.chooseMove(1)).ok);assert(s.finished);assert.equal(s.result().members.R.hp,expected);assert.equal(s.party.find(m=>m.id==='R').hp,expected);assert.equal(JSON.stringify(game),before);
});

for(const alive of [false,true])test((alive?'living':'unknown')+' targets refuse before any item reserve or turn',async()=>{
 const {s,game,before}=await open('revive',{alive}),snap=s.gw.snapshot();for(const target of alive?['A','R']:['missing']){assert.deepEqual(await s.useItem('revive',target),{ok:false,reason:alive?'item-no-effect':'unknown-target'});assert.equal(s.bag.revive,2);assert.equal(s.ledger.length,0);assert.equal(s.gw.snapshot(),snap);assert.equal(JSON.stringify(game),before);}
});
test('eggs are absent from the battle roster and cannot be revived',async()=>{
 const {s,game,before}=await open('revive',{egg:true}),snap=s.gw.snapshot();assert(!s.gw.readState('p1').some(m=>m.id==='R'));assert.deepEqual(await s.useItem('revive','R'),{ok:false,reason:'unknown-target'});assert.equal(s.bag.revive,2);assert.equal(s.gw.snapshot(),snap);assert.equal(JSON.stringify(game),before);
});
test('staged revive has no early HP effect and cancel refunds exactly once',async()=>{
 const {s,game,before}=await open();assert.deepEqual(await s.useItem('revive','R',{commit:false}),{ok:true,staged:true});assert.equal(s.bag.revive,1);assert.equal(s.gw.readState('p1').find(m=>m.id==='R').hp,0);await s.cancel();await s.cancel();assert.equal(s.bag.revive,2);assert.equal(s.ledger.filter(e=>e.state==='refunded').length,1);assert(s.gw.readState('p1').find(m=>m.id==='R').fainted);assert.equal(JSON.stringify(game),before);
});
test('rejected registration refunds without reviving and repeat cancellation cannot mint an item',async()=>{
 const {s}=await open();s.gw.act=async()=>false;assert.deepEqual(await s.useItem('revive','R'),{ok:false,reason:'not-registered'});await s.cancel();assert.equal(s.bag.revive,2);assert.equal(s.ledger.filter(e=>e.state==='refunded').length,1);assert(s.gw.readState('p1').find(m=>m.id==='R').fainted);
});
test('an already revived target refuses another item and checkpoint restore retains its live roster count',async()=>{
 const {s}=await open();assert((await s.useItem('revive','R')).ok);const hp=s.gw.readState('p1').find(m=>m.id==='R').hp,saved=s._checkpoint(),snap=s.gw.snapshot();assert.deepEqual(await s.useItem('revive','R'),{ok:false,reason:'item-no-effect'});assert.equal(s.bag.revive,1);assert.equal(s.gw.snapshot(),snap);assert((await s.chooseSwitch('R')).ok);await s._restoreCheckpoint(saved);assert.equal(s.bag.revive,1);assert.equal(s.gw.readState('p1').find(m=>m.id==='R').hp,hp);assert.equal(JSON.parse(s.gw.snapshot()).sides[0].pokemonLeft,2);assert((await s.chooseSwitch('R')).ok);
});
test('a reserve that actually fainted in this battle is restored and can switch in again',async()=>{
 const member=F.member('R','Pidgey',100,{moves:['tackle'],ability:'Keen Eye'});member.hp=1;
 const g=E.state.newGame({content:F.content,party:[F.member('A','Snorlax',100,{moves:['tackle'],ability:'Immunity'}),member],bag:{revive:1},money:0});const original=JSON.stringify(g);
 const b=await E.session.BattleSession.create({game:g,content:F.content,battleId:'actual-ko-revive',seed:[1,2,3,4],foe:{kind:'trainer',team:[F.foeMember('B','Pidgey',100,{moves:['tackle'],ability:'Keen Eye'})]}});b.take();assert((await b.chooseSwitch('R')).ok);assert(b.currentRequest().forceSwitch[0]);assert(b.gw.readState('p1').find(m=>m.id==='R').fainted);assert.equal(JSON.parse(b.gw.snapshot()).sides[0].pokemonLeft,1);assert((await b.chooseForcedSwitch('A')).ok);assert((await b.useItem('revive','R')).ok);assert.equal(JSON.parse(b.gw.snapshot()).sides[0].pokemonLeft,2);assert(!b.gw.readState('p1').find(m=>m.id==='R').fainted);assert((await b.chooseSwitch('R')).ok);assert.equal(b.gw.activeId('p1'),'R');assert.equal(JSON.stringify(g),original);
});
test('default catalog exposes only these three new battle revives and preserves existing field effect metadata',()=>{
 const c=E.itemCatalog.legacyCatalog();for(const id of ['revive','maxrevive','maxhoney']){assert.equal(c[id].battleId,id);assert.equal(c[id].battleUse,'member');assert.equal(c[id].fieldUse,'member');assert.equal(c[id].effect.family,'revive');assert.equal(c[id].pocket,2);assert.equal(c[id].consumable,true);}assert.equal(c.revivalherb.battleUse,'none');
});
