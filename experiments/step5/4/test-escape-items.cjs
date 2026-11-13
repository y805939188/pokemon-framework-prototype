'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/production.cjs'),F=require('../../../js/engine/fixtures/game.cjs');
async function open(item='pokedoll',{trainer=false,noRun=false,trap=false}={}){
 const content=structuredClone(F.content);content.items=E.itemCatalog.legacyCatalog();
 // Explicit author item makes the old missing battle handler independently observable.
 content.items[item]={...content.items.potion,id:item,name:'Escape toy',namePlural:'Escape toys',pocket:7,battleUse:'direct',battleId:item,fieldUse:'none',legacyIds:[item]};
 const game=E.state.newGame({content,party:[F.member('A','Snorlax',100,{moves:['tackle'],ability:'Immunity'}),F.member('R','Snorlax',100,{moves:['tackle'],ability:'Immunity'})],bag:{[item]:2},money:1000});const before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content,battleId:'toy-'+item,seed:[1,2,3,4],foe:{kind:trainer?'trainer':'wild',noRun,team:[F.foeMember('B','Pidgey',100,{moves:['tackle'],ability:trap?'Arena Trap':'Keen Eye'})]}});s.take();return{s,game,before};
}
test('Poke Doll executes in the item stage, spends one, and escapes before any foe move',async()=>{
 const {s,game,before}=await open(),foe=s.gw.readState('p2');const r=await s.useItem('pokedoll','A');assert(r.ok,JSON.stringify(r));assert(s.finished);assert.equal(s.ended.reason,'run');assert.equal(s.bag.pokedoll,1);assert.deepEqual(s.gw.readState('p2'),foe);assert.equal(s.result().bag.pokedoll,-1);assert.equal(JSON.stringify(game),before);
});
for(const item of ['fluffytail','poketoy'])test(item+' uses the same guaranteed item escape and refuses reuse after end',async()=>{
 const {s,game,before}=await open(item),foe=s.gw.readState('p2');const r=await s.useItem(item,'A');assert(r.ok,JSON.stringify(r));assert(s.finished);assert.equal(s.ended.reason,'run');assert.equal(s.bag[item],1);assert.deepEqual(s.gw.readState('p2'),foe);assert.equal(s.result().bag[item],-1);assert.equal(JSON.parse(s.gw.snapshot()).rpg.attempts.p1||0,0);assert.deepEqual(await s.useItem(item,'A'),{ok:false,reason:'choice-rejected'});assert.equal(s.bag[item],1);assert.equal(JSON.stringify(game),before);
});
for(const flags of [{trainer:true},{noRun:true}])test(JSON.stringify(flags)+' rejects the direct item before reserving or acting',async()=>{
 const {s,game,before}=await open('pokedoll',flags),snap=s.gw.snapshot();assert.deepEqual(await s.useItem('pokedoll','A'),{ok:false,reason:'item-no-effect'});assert.equal(s.bag.pokedoll,2);assert.equal(s.ledger.length,0);assert.equal(s.gw.snapshot(),snap);assert.equal(JSON.stringify(game),before);
});
test('no-target items cannot be redirected to a bench or unknown member',async()=>{
 const {s}=await open(),snap=s.gw.snapshot();for(const id of ['R','missing']){assert.deepEqual(await s.useItem('pokedoll',id),{ok:false,reason:'unknown-target'});assert.equal(s.bag.pokedoll,2);assert.equal(s.ledger.length,0);assert.equal(s.gw.snapshot(),snap);}
});
test('a staged toy does not end early and repeated cancel refunds only once',async()=>{
 const {s,game,before}=await open();assert.deepEqual(await s.useItem('pokedoll','A',{commit:false}),{ok:true,staged:true});assert.equal(s.bag.pokedoll,1);assert(!s.finished);assert.equal(s.ended,null);await s.cancel();await s.cancel();assert.equal(s.bag.pokedoll,2);assert.equal(s.ledger.filter(e=>e.state==='refunded').length,1);assert(!s.finished);assert.equal(JSON.stringify(game),before);
});
test('an actual Arena Trap refusal of normal Run does not block the escape toy',async()=>{
 const {s}=await open('pokedoll',{trap:true}),foe=s.gw.readState('p2');assert.deepEqual(s.gw.query('p1','run'),{allowed:false,reason:'trapped'});const r=await s.useItem('pokedoll','A');assert(r.ok);assert(s.finished);assert.equal(s.ended.reason,'run');assert.deepEqual(s.gw.readState('p2'),foe);assert.equal(JSON.parse(s.gw.snapshot()).rpg.attempts.p1||0,0);assert(r.messages.flatMap(m=>m.events??[]).some(e=>e.type==='rpg'&&e.args.join(',')==='run,p1,ok,item,0'));
});
test('default compatibility metadata exposes three consumable battle-only direct toys',()=>{
 const c=E.itemCatalog.legacyCatalog();for(const id of ['pokedoll','fluffytail','poketoy']){assert.equal(c[id].battleId,id);assert.equal(c[id].battleUse,'direct');assert.equal(c[id].fieldUse,'none');assert.equal(c[id].pocket,7);assert.equal(c[id].consumable,true);}
});
