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
 const gw=await E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[{name:'P1',team:[{name:'A',species:mode==='transform'?'Ditto':'Snorlax',level:100,moves:[mode],ability:mode==='transform'?'Limber':'Immunity'}]},{name:'P2',team:[{name:'B',species:'Pidgey',level:100,moves:['splash'],ability:'Keen Eye'}]}]});assert(await gw.choose('p1','team 1'));assert(await gw.choose('p2','team 1'));gw.drain();const original=gw.readState('p1')[0].pp[mode];assert(await gw.choose('p1','move 1'));assert(await gw.choose('p2','move 1'));gw.drain();const before=gw.awaitingChoice('p1').active[0].moves[0];assert.equal(before.id,'splash');assert.equal(gw.permanentMoveSlot('p1','A',mode),0);assert.equal(gw.permanentMoveSlot('p1','A','splash'),null);assert.equal(gw.readState('p1')[0].pp[mode],original-1);assert(await gw.act('p1',{kind:'item',item:'ether',target:'A',moveSlot:0}));assert(await gw.choose('p2','move 1'));gw.drain();assert.equal(gw.readState('p1')[0].pp[mode],original);assert.equal(gw.awaitingChoice('p1').active[0].moves[0].pp,before.pp);assert.equal(gw.readState('p1')[0].pp.splash,undefined);
});

test('default catalog exposes three move targets and two member targets without losing Leppa Berry field identity',()=>{
 const c=E.itemCatalog.legacyCatalog();for(const id of ['ether','maxether','leppaberry','elixir','maxelixir']){assert.equal(c[id].battleId,id);assert.equal(c[id].battleUse,['elixir','maxelixir'].includes(id)?'member':'move');assert.equal(c[id].effect.family,'pp');assert.equal(c[id].fieldUse,'member');}assert.equal(c.leppaberry.pocket,5);assert(c.leppaberry.flags.includes('Berry'));
});

// V-1: Summary order belongs to the individual; the engine retains its permanent order.
async function sortedPPWorld({item='ether',target='A',otherFull=false,doubles=false}={}) {
 const game=E.state.newGame({content:F.content,party:['A','R','S'].map(id=>F.member(id,'Snorlax',100,{moves:['splash','tackle'],ability:'Immunity'})),bag:{[item]:2},money:1000});
 for(const mon of game.party) for(const m of mon.moves){m.maxpp=m.id==='splash'?40:35;m.pp=mon.id===target?(m.id==='splash'?(otherFull?40:2):3):m.maxpp;}
 const before=JSON.stringify(game),s=await E.session.BattleSession.create({game,content:F.content,battleId:'sorted-pp-'+item+'-'+target,seed:[1,2,3,4],doubles,formatid:doubles?'gen8rpgdoublescustomgame':'gen8rpgcustomgame',foe:{kind:'trainer',team:(doubles?['B','C']:['B']).map(id=>F.foeMember(id,'Snorlax',100,{moves:['protect'],ability:'Immunity'}))}});s.take();
 const engine=s.gw.snapshot();assert.equal(await E.session.reorderBattleSummaryMoves(s,target,0,1,['splash','tackle']),true);
 assert.equal(s.gw.snapshot(),engine,'Summary must retain engine wrapper order');
 return {s,game,before};
}
function checkSortedPP({s,game,before},target,expected,item) {
 const mon=s.party.find(m=>m.id===target),live=s.gw.readState('p1').find(m=>m.id===target);
 assert.deepEqual(mon.moves.map(m=>[m.id,m.pp]),[['tackle',expected.tackle],['splash',expected.splash]]);
 assert.equal(live.pp.tackle,expected.tackle);assert.equal(live.pp.splash,expected.splash);
 const request=s.currentRequest();const i=request.side.pokemon.findIndex(m=>m.ident==='p1: '+target);
 if(request.side.pokemon[i].active) assert.deepEqual(request.active[i].moves.map(m=>[m.id,m.pp]),[['splash',expected.splash],['tackle',expected.tackle]]);
 assert.equal(s.bag[item],1);assert.equal(s.ledger.length,1);assert.equal(s.ledger[0].state,'consumed');assert.equal(JSON.stringify(game),before);
}
for(const item of ['ether','maxether','leppaberry'])for(const target of ['A','R'])for(const otherFull of [false,true])test('sorted single PP '+item+' targets '+target+' by identity, other-full='+otherFull,async()=>{
 const world=await sortedPPWorld({item,target,otherFull});const result=await world.s.useItem(item,target,{moveSlot:0});assert.equal(result.ok,true,JSON.stringify(result));
 checkSortedPP(world,target,{tackle:item==='maxether'?35:13,splash:otherFull?40:2},item);
 assert(result.messages.flatMap(m=>m.events??[]).some(e=>e.type==='rpg'&&e.args[0]==='item'&&e.args[4]==='ok'),'must execute, never refund an unrelated full slot');
});
for(const item of ['elixir','maxelixir'])test('sorted all-move '+item+' remains independent of individual order',async()=>{
 const world=await sortedPPWorld({item});assert((await world.s.useItem(item,'A')).ok);
 checkSortedPP(world,'A',item==='elixir'?{tackle:13,splash:12}:{tackle:35,splash:40},item);
});
for(const target of ['A','S'])test('doubles sorted PP maps '+target+' before registering either active slot',async()=>{
 const world=await sortedPPWorld({target,doubles:true}),specs=[{kind:'item',item:'ether',target,moveSlot:0},{move:1}];
 const original=structuredClone(specs);assert((await world.s.chooseDoubles(specs)).ok);assert.deepEqual(specs,original,'translation must not rewrite caller slots');
 checkSortedPP(world,target,{tackle:13,splash:2},'ether');
 assert.equal(world.s.gw.readState('p1').find(m=>m.id==='R').pp.splash,39,'the other active member still acts once');
});
test('missing or ambiguous permanent move identity refuses before any reservation or choice, in singles and doubles',async()=>{
 for(const doubles of [false,true])for(const mode of ['missing','duplicate','unavailable']){
  const {s,game,before}=await sortedPPWorld({doubles});
  // Guard controls only: a normal Summary never creates missing/duplicate permanent slots.
  const mon=s.gw._debugBattle().getSide('p1').pokemon.find(m=>m.name==='A');
  if(mode==='missing')mon.baseMoveSlots=mon.baseMoveSlots.filter(m=>m.id!=='tackle');
  if(mode==='duplicate')mon.baseMoveSlots.push({...mon.baseMoveSlots.find(m=>m.id==='tackle')});
  if(mode==='unavailable')s.gw.permanentMoveSlot=undefined;
  const engine=s.gw.snapshot(),request=JSON.stringify(s.currentRequest()),party=JSON.stringify(s.party);
  assert.deepEqual(s.canUseItem('ether','A',0),{ok:false,reason:'item-no-effect'});
  const result=doubles?await s.chooseDoubles([{kind:'item',item:'ether',target:'A',moveSlot:1},{kind:'item',item:'ether',target:'A',moveSlot:0}]):await s.useItem('ether','A',{moveSlot:0});
  assert.deepEqual(result,{ok:false,reason:'item-no-effect'});assert.equal(s.bag.ether,2);assert.equal(s.ledger.length,0);
  assert.equal(s.gw.snapshot(),engine);assert.equal(JSON.stringify(s.currentRequest()),request);assert.equal(JSON.stringify(s.party),party);assert.equal(JSON.stringify(game),before);
 }
});
test('permanent lookup uses engine order and rejects a duplicated individual identity',async()=>{
 const {s,game,before}=await sortedPPWorld();
 assert.equal(s.gw.permanentMoveSlot('p1','A','tackle'),1);assert.equal(s.gw.permanentMoveSlot('p1','A','splash'),0);
 assert.equal(s.gw.permanentMoveSlot('p1','A','rest'),null);assert.equal(s.gw.permanentMoveSlot('p1','missing','tackle'),null);
 s.party[0].moves.push({...s.party[0].moves[0]});const engine=s.gw.snapshot();
 assert.deepEqual(await s.useItem('ether','A',{moveSlot:0}),{ok:false,reason:'item-no-effect'});
 assert.equal(s.bag.ether,2);assert.equal(s.ledger.length,0);assert.equal(s.gw.snapshot(),engine);assert.equal(JSON.stringify(game),before);
});
