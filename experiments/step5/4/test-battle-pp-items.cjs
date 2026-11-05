'use strict';
// Real Gen8 item queue and Session; input game remains unchanged until application commit.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/production.cjs'),F=require('../../../js/engine/fixtures/game.cjs');
async function open(item, moves=['splash','tackle'], options={}) {
 const game=E.state.newGame({content:F.content,party:[F.member('A','Snorlax',100,{moves,ability:'Immunity'}),F.member('R','Snorlax',100,{moves:['splash'],ability:'Immunity'})],bag:{[item]:2},money:1000});
 for(const mon of game.party)for(const [index,m] of mon.moves.entries()){m.maxpp=m.id==='splash'?40:F.PP[m.id];m.pp=mon.id==='A'?(options.pp?.[index]??0):m.maxpp;}if(options.hp!==undefined)game.party[0].hp=options.hp;const before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content:F.content,battleId:'pp-'+item,seed:[1,2,3,4],foe:{kind:'trainer',team:[F.foeMember('B','Snorlax',100,{moves:['protect'],ability:'Immunity'})]}});s.take();return {s,game,before};
}
test('selected Ether restores permanent and active Splash PP through the real item turn',async()=>{
 const {s,game,before}=await open('ether');{const r=await s.useItem('ether','A',{moveSlot:0});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(s.gw.readState('p1').find(m=>m.id==='A').pp.splash,10);assert.equal(s.currentRequest().active[0].moves[0].pp,10);assert.equal(s.party[0].moves[0].pp,10);assert.equal(s.party[0].moves[1].pp,0);assert.equal(s.bag.ether,1);assert.equal(JSON.stringify(game),before);}
});
test('Elixir restores each missing permanent slot without selecting one move',async()=>{
 const {s,game,before}=await open('elixir');{const r=await s.useItem('elixir','A');assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(s.party[0].moves.map(m=>m.pp),[10,10]);assert.equal(s.bag.elixir,1);assert.equal(JSON.stringify(game),before);}
});
for(const [item,expected] of [['maxether',[40,0]],['leppaberry',[10,0]],['maxelixir',[40,35]]])test(item+' uses its actual selected/all PP contract',async()=>{
 const {s,game,before}=await open(item);const result=await s.useItem(item,'A',{...(['maxelixir'].includes(item)?{}:{moveSlot:0})});assert(result.ok,JSON.stringify(result));assert.deepEqual(s.party[0].moves.map(m=>m.pp),expected);assert.deepEqual(s.currentRequest().active[0].moves.map(m=>m.pp),expected);assert.equal(s.bag[item],1);assert.equal(JSON.stringify(game),before);
});
for(const item of ['ether','elixir'])test(item+' clips only actual PP gains at each permanent total',async()=>{
 const {s}=await open(item,['splash','tackle'],{pp:[35,32]});assert((await s.useItem(item,'A',{...(item==='ether'?{moveSlot:0}:{})})).ok);assert.deepEqual(s.party[0].moves.map(m=>m.pp),item==='ether'?[40,32]:[40,35]);
});
test('invalid/missing move slot and selected-full PP refuse before reservation or engine mutation',async()=>{
 const {s,game,before}=await open('ether',['splash','tackle'],{pp:[40,0]});const engine=s.gw.snapshot();
 for(const moveSlot of [undefined,-1,2,0.5,'0',0]){const r=await s.useItem('ether','A',{moveSlot});assert.deepEqual(r,{ok:false,reason:'item-no-effect'});assert.equal(s.bag.ether,2);assert.equal(s.ledger.length,0);assert.equal(s.gw.snapshot(),engine);assert.equal(JSON.stringify(game),before);}
});
test('all-full PP and fainted PP-deficient targets have no action or consumption',async()=>{
 for(const options of [{pp:[40,35]},{hp:0}]){const {s,game,before}=await open('elixir',['splash','tackle'],options),engine=s.gw.snapshot();assert.deepEqual(await s.useItem('elixir','A'),{ok:false,reason:'item-no-effect'});assert.equal(s.bag.elixir,2);assert.equal(s.ledger.length,0);assert.equal(s.gw.snapshot(),engine);assert.equal(JSON.stringify(game),before);}
});
test('staged PP item reserves once, applies no early effect, and repeated cancel refunds once',async()=>{
 const {s,game,before}=await open('ether');assert.deepEqual(await s.useItem('ether','A',{moveSlot:0,commit:false}),{ok:true,staged:true});assert.equal(s.bag.ether,1);assert.equal(s.gw.readState('p1')[0].pp.splash,0);await s.cancel();await s.cancel();assert.equal(s.bag.ether,2);assert.equal(s.ledger.filter(e=>e.state==='refunded').length,1);assert.equal(s.party[0].moves[0].pp,0);assert.equal(JSON.stringify(game),before);
});
test('registration refusal refunds a PP item exactly once without applying a gain',async()=>{
 const {s}=await open('ether');s.gw.act=async()=>false;assert.deepEqual(await s.useItem('ether','A',{moveSlot:0}),{ok:false,reason:'not-registered'});await s.cancel();assert.equal(s.bag.ether,2);assert.equal(s.ledger.filter(e=>e.state==='refunded').length,1);assert.equal(s.party[0].moves[0].pp,0);
});
test('checkpoint retains restored PP and the one consumed item after a later move',async()=>{
 const {s}=await open('ether');assert((await s.useItem('ether','A',{moveSlot:0})).ok);const saved=s._checkpoint();assert((await s.chooseMove(1)).ok);assert.equal(s.party[0].moves[0].pp,9);await s._restoreCheckpoint(saved);assert.equal(s.bag.ether,1);assert.equal(s.party[0].moves[0].pp,10);assert.equal(s.currentRequest().active[0].moves[0].pp,10);
});
for(const mode of ['transform','mimic'])test('PP recovery while '+mode+' has a temporary copy leaves the copy unchanged',async()=>{
 const gw=await E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[{name:'P1',team:[{name:'A',species:mode==='transform'?'Ditto':'Snorlax',level:100,moves:[mode],ability:mode==='transform'?'Limber':'Immunity'}]},{name:'P2',team:[{name:'B',species:'Pidgey',level:100,moves:['splash'],ability:'Keen Eye'}]}]});assert(await gw.choose('p1','team 1'));assert(await gw.choose('p2','team 1'));gw.drain();const original=gw.readState('p1')[0].pp[mode];assert(await gw.choose('p1','move 1'));assert(await gw.choose('p2','move 1'));gw.drain();const before=gw.awaitingChoice('p1').active[0].moves[0];assert.equal(before.id,'splash');assert.equal(gw.readState('p1')[0].pp[mode],original-1);assert(await gw.act('p1',{kind:'item',item:'ether',target:'A',moveSlot:0}));assert(await gw.choose('p2','move 1'));gw.drain();assert.equal(gw.readState('p1')[0].pp[mode],original);assert.equal(gw.awaitingChoice('p1').active[0].moves[0].pp,before.pp);assert.equal(gw.readState('p1')[0].pp.splash,undefined);
});

test('default catalog exposes three move targets and two member targets without losing Leppa Berry field identity',()=>{
 const c=E.itemCatalog.legacyCatalog();for(const id of ['ether','maxether','leppaberry','elixir','maxelixir']){assert.equal(c[id].battleId,id);assert.equal(c[id].battleUse,['elixir','maxelixir'].includes(id)?'member':'move');assert.equal(c[id].effect.family,'pp');assert.equal(c[id].fieldUse,'member');}assert.equal(c.leppaberry.pocket,5);assert(c.leppaberry.flags.includes('Berry'));
});
