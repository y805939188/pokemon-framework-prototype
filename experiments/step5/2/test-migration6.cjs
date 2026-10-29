'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs'),H=require('../1/legacy-test-support.cjs');
const F=E.fixtures,S=E.state,I=E.inventory,clone=x=>structuredClone(x);
const options={content:F.content,speciesKey:E.speciesKey.identityKeys};
function old5(){const game=clone(F.makeGame());game.schema=5;delete game.defeatedTrainers;game.bag=I.aggregateBag(game.inventory);delete game.inventory;delete game.badges;game.dex={seen:clone(game.dex.seen),owned:clone(game.dex.owned)};for(const m of E.storage.allMembers(game)){delete m.evolutionReadiness;delete m.cannotTrade;delete m.statNature;for(const move of m.moves)delete move.ppUps;}return game;}
const migrate=raw=>E.saveSchema.migrateGame(raw,options);
test('P52-04 FR180: schema1..5 through6 to7 is deterministic, no data loss and no source mutation',()=>{
 for(const version of [1,2,3,4,5]){
  const raw=version===5?old5():H.legacyGame(F.makeGame(),version);raw.bag.potion=1500;raw.money=2000000;
  const before=clone(raw),one=migrate(raw),two=migrate(raw);assert.equal(one.ok,true,JSON.stringify(one));assert.deepEqual(one,two);assert.deepEqual(raw,before);
  assert.equal(one.state.schema,S.GAME_SCHEMA);assert.equal(I.aggregateBag(one.state.inventory).potion,1500);assert.equal(one.state.money,2000000);assert.deepEqual(one.state.badges,Array(8).fill(false));assert.equal('bag'in one.state,false);assert.equal(E.saveSchema.validateGame(one.state).length,0);
  assert.deepEqual(migrate(one.state).state,one.state);assert.deepEqual(one.state.appliedBattles,raw.appliedBattles);assert.equal(one.state.party[0].moves[0].ppUps,0);
 }
});
test('P52-04/13/14 FR194: trusted255 EV and explicit PP metadata survive; ambiguous PP rejects all',()=>{
 const raw=old5();raw.party[0].evs.hp=255;raw.party[0].moves[0].ppUps=2;raw.party[0].moves[0].maxpp=21;const before=clone(raw),r=migrate(raw);assert.equal(r.ok,true);assert.equal(r.state.party[0].evs.hp,255);assert.equal(r.state.party[0].moves[0].ppUps,2);assert.deepEqual(r.state.party[0].owner,raw.party[0].owner);assert.equal(r.state.party[0].personalID,raw.party[0].personalID);assert.deepEqual(raw,before);
 delete raw.party[0].moves[0].ppUps;const bad=clone(raw);const refused=migrate(raw);assert.equal(refused.ok,false);assert.match(refused.error.message,/ambiguous-move-pp/);assert.deepEqual(raw,bad);
});
test('P52-04/28 FR181: unknown item, insufficient finite pocket, unavailable PP content preserve original',()=>{
 for(const [raw,opts] of [[{...old5(),bag:{alien:1}},options],[{...old5(),bag:{potion:1500}},{...options,content:{...F.content,settings:{BAG_POCKET_SLOTS:[-1,1,-1,-1,-1,-1,-1,-1]}}}],[old5(),{}]]){
  const bytes=JSON.stringify(raw),r=E.saveSchema.migrateGame(raw,opts);assert.equal(r.ok,false);assert.equal(JSON.stringify(raw),bytes);
 }
});
test('P52-04/39 FR180: T1 1201 is refused before truncation, with original bytes and recovery marker',()=>{
 const raw=H.legacyGame(F.makeGame(),4);raw.boxes=Array.from({length:1201},(_,i)=>({...clone(raw.party[0]),id:'old-'+i}));const before=JSON.stringify(raw);const r=migrate(raw);assert.equal(r.ok,false);assert.equal(r.error.code,'capacity-exceeded');assert.equal(r.error.limit,1200);assert.equal(JSON.stringify(raw),before);
});
test('P52-05/13/16 FR191: battle result retains PP by identity, calculation nature projects, protocol unchanged',()=>{
 const game=F.makeGame(),m=game.party[0];m.statNature='brave';m.moves[0].ppUps=2;m.moves[0].maxpp=21;m.moves[0].pp=17;
 const raw={protocol:1,battleId:'metadata',outcome:{kind:'run',winner:null},members:{[m.id]:{moves:[{id:'protect',pp:10,maxpp:10},{id:m.moves[0].id,pp:9,maxpp:21}]}},bag:{potion:-1},captured:[],dex:{seen:[],owned:[]}},before=clone(raw),hash=S.resultHash(raw);
 const r=S.applyBattleResult(game,raw,undefined,undefined,{content:F.content});assert.deepEqual(r.state.party[0].moves.map(x=>x.ppUps),[0,2]);assert.equal(r.state.party[0].statNature,'brave');assert.equal(r.state.party[0].nature,m.nature);assert.deepEqual(raw,before);assert.equal(S.resultHash(raw),hash);
 const view=E.speciesKey.toBattleMember(m,F.content);assert.equal(view.nature,'brave');assert.equal('statNature'in view,false);assert.equal('ppUps'in S.protocolMember(m).moves[0],false);
 const next=I.aggregateBag(r.state.inventory);assert.equal(next.potion,2);assert.equal(S.applyBattleResult(r.state,raw,undefined,undefined,{content:F.content}).status,'already-applied');
});
test('P52-05/29 FR180: a forged bag is not authority and current schema rejects persistent receipts',()=>{
 const g=F.makeGame(),before=I.aggregateBag(g.inventory);g.bag={potion:999};g.journal={id:'fake'};assert.deepEqual(I.aggregateBag(g.inventory),before);const errors=E.saveSchema.validateGame(g);assert.ok(errors.some(x=>x.path==='$.bag'));assert.ok(errors.some(x=>x.path==='$.journal'));
});
test('P52-13/16: persistent growth keeps both nature identities and validates battle PP mismatches',()=>{
 const member=clone(F.makeGame().party[0]);member.statNature='brave';const grown=E.growth.applyExpPersistent(member,1,F.content).member;assert.equal(grown.nature,member.nature);assert.equal(grown.statNature,'brave');
 const game=F.makeGame(),m=game.party[0];const bad={protocol:1,battleId:'bad-pp',outcome:{kind:'run',winner:null},members:{[m.id]:{moves:[{id:m.moves[0].id,pp:1,maxpp:999}]}},bag:{potion:-1},captured:[],dex:{seen:[],owned:[]}};const before=clone(game);assert.throws(()=>S.applyBattleResult(game,bad,undefined,undefined,{content:F.content}),/ambiguous-move-pp/);assert.deepEqual(game,before);
});
test('P52-04/28: invalid current SaveStore.save refuses before creating any file or backup',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'p52-store-')),file=path.join(root,'state.json'),raw=old5(),bytes=JSON.stringify(raw);fs.writeFileSync(file,bytes);const store=new E.store.SaveStore(file,{},options.speciesKey,F.content),bad=F.makeGame();bad.inventory.pockets[1][0].quantity=0;assert.throws(()=>store.save(bad),e=>e.info.code==='invalid');assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(root),['state.json']);fs.rmSync(root,{recursive:true});
});
test('P52-04: current custom inventory validates structurally, requires content to load and validates item identities',()=>{
 const game=F.makeGame(),catalog=clone(F.content.items);catalog.local={...catalog.potion,id:'local',pocket:8};game.inventory=I.addItems(game.inventory,'local',1,catalog,I.inventoryPolicy());assert.deepEqual(E.saveSchema.validateGame(game),[]);assert.equal(E.saveSchema.migrateGame(game).error.code,'needs-content');assert.equal(E.saveSchema.migrateGame(game,{content:F.content}).error.code,'invalid');assert.equal(E.saveSchema.migrateGame(game,{content:{...F.content,items:catalog}}).ok,true);
});
test('P52-04/05/32: unresolved current inventory blocks grants before RNG and even empty battle deltas',()=>{
 const game=F.makeGame();game.inventory.pockets[0].push({itemId:'unmapped',quantity:1});const before=clone(game);let draws=0;assert.throws(()=>E.grants.applyGrant(game,'any',{...F.content,grants:{any:{id:'any',members:[{species:'Pidgey',level:3}],items:{},money:0}}},()=>{draws++;return 0;}),/unmapped/);assert.equal(draws,0);const result={protocol:1,battleId:'unknown',outcome:{kind:'run',winner:null},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}};assert.throws(()=>S.applyBattleResult(game,result),/unmapped/);assert.deepEqual(game,before);
});
