'use strict';
// Real App -> Session -> pinned Gen8: permanent species, native Crowned base forme and copied Transform forme are distinct.
const test=require('node:test'),assert=require('node:assert/strict');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs');
const DOGS=[['Zacian','rustedsword','behemothblade'],['Zamazenta','rustedshield','behemothbash']];
const clone=v=>structuredClone(v);
const actor=w=>w.s.gw._debugBattle().sides[0].pokemon.find(p=>p.name==='A');
const state=w=>w.s.gw.readState('p1').find(p=>p.id==='A');
const permanentStats=(w,m=w.s.party[0])=>E.growth.computeStats(w.content.species[w.dog[0]].base,m.ivs,m.evs,m.level,m.statNature??m.nature);
function unchanged(w){assert.deepEqual(w.port.read(),w.initial);assert.equal(w.port.replaced.length,0);}
async function open(dog,{levelUp=false,transform=false,expGain=true,primary='ironhead'}={}){
 const [species,item]=dog,input=inputs({party:2,moves:transform?['seismictoss']:['splash']});
 const moves=[primary,...(transform?['transform']:[]),'splash'];
 input.species.push({id:species.toLowerCase(),showdownId:species.toLowerCase(),nameKey:'species.'+species.toLowerCase(),growth:'slow',baseExp:335,evYield:{},catchRate:10,learnset:moves.map(move=>({level:1,move})),source:'author-placeholder'});
 input.species.find(p=>p.id==='pidgey').evYield={hp:1};
 input.items.push({id:item,name:item,namePlural:item,pocket:1,price:0,source:'author-placeholder'});
 input.trainers[0].party.forEach(p=>{p.level=3;});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(),joined=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(joined.errors,[]);const content=joined.content;
 const mon=E.memberFactory.createMember({id:'A',species,level:50},content,()=>0),backup=E.memberFactory.createMember({id:'R',species:'Snorlax',level:50},content,()=>0);
 mon.item=item;mon.exp=E.growth.minExp(content.species[species].growth,levelUp?51:50)-(levelUp?1:0);
 mon.evs.hp=7;mon.hp=permanentStats({content,dog},mon).hp-10;if(primary==='ironhead')mon.moves[0]={id:'ironhead',pp:2,maxpp:24,ppUps:3};
 const game=E.state.newGame({content,party:[mon,backup].map(m=>E.speciesKey.toPersistentMember(m,content)),bag:{maxether:2},money:1000});game.nextMemberOrdinal='3';
 const port=T.fakes.createMemoryState(game),initial=clone(port.read());
 const app=new E.app.GameApplication({state:port,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),content:()=>({content,dex}),random:()=>0,clock:()=>12345});
 const req={battleId:'crowned-growth-'+species+'-'+levelUp+'-'+transform+'-'+expGain,trainer:{id:'c-basic',version:1},seq:1,canLose:true,expGain,moneyGain:false};
 const s=await app.startTrainerBattle(req);s.take();const details=actor({s}).details;
 assert.equal(actor({s}).baseSpecies.name,species+'-Crowned');assert.equal(actor({s}).set.species,species);
 return {dog,s,app,req,port,initial,content,details};
}
function natural(w){
 const p=actor(w),battle=w.s.gw._debugBattle(),expected=battle.spreadModify(battle.dex.species.get(w.dog[0]+'-Crowned').baseStats,p.set);
 assert.equal(p.species.name,w.dog[0]+'-Crowned');assert.equal(p.baseSpecies.name,w.dog[0]+'-Crowned');assert.equal(p.transformed,false);
 assert.deepEqual({...p.storedStats},Object.fromEntries(Object.entries(expected).filter(([k])=>k!=='hp')));assert.equal(p.speed,p.storedStats.spe);
 assert.equal(p.ability,w.dog[0]==='Zacian'?'intrepidsword':'dauntlessshield');
}
function projected(w){
 const p=actor(w),m=w.s.party[0],expected=permanentStats(w);
 assert.equal(w.s.broken,null);assert.deepEqual(state(w).stats,expected);assert.equal(p.maxhp,expected.hp);
 assert.equal(p.details,w.details.replace(', L50',', L'+m.level));assert.equal(p.set.species,w.dog[0]);
 assert.equal(w.s.gw.permanentMoveSlot('p1','A','ironhead'),0);assert.equal(state(w).pp[w.dog[2]],undefined);unchanged(w);
}
for(const dog of DOGS)for(const levelUp of [false,true])for(const transform of [false,true])test(dog[0]+' Crowned '+(levelUp?'level-up':'same-level')+' growth, Transform='+transform,async()=>{
 const w=await open(dog,{levelUp,transform});try{
  const beforeEngine=w.s.gw.snapshot(),order=w.s.party[0].moves.map(m=>m.id);
  assert.equal(await E.session.reorderBattleSummaryMoves(w.s,'A',0,order.length-1,order),true);assert.equal(w.s.gw.snapshot(),beforeEngine);
  const iron=w.s.party[0].moves.findIndex(m=>m.id==='ironhead');
  assert((await w.s.useItem('maxether','A',{moveSlot:iron})).ok);assert.equal(state(w).pp.ironhead,8);assert.equal(w.s.bag.maxether,1);
  let copied;
  if(transform){assert((await w.s.chooseMove(2)).ok);assert.equal(actor(w).transformed,true);assert.equal(actor(w).species.name,'Pidgey');copied=clone(actor(w).storedStats);assert.equal(w.s.currentRequest().active[0].moves[0].id,'seismictoss');}
  const before={hp:actor(w).hp,maxhp:actor(w).maxhp,exp:w.s.party[0].exp};
  // This real KO used to throw stat mismatch before the assertions below.
  assert((await w.s.chooseMove(1)).ok);
  assert.equal(w.s.party[0].level,levelUp?51:50);assert.equal(w.s.party[0].evs.hp,8);assert(w.s.party[0].exp>before.exp);
  assert.equal(actor(w).hp,E.growth.hpAfterRecalc(before.hp,before.maxhp,actor(w).maxhp));projected(w);
  if(transform){assert.equal(actor(w).transformed,true);assert.deepEqual({...actor(w).storedStats},copied);assert.equal(state(w).pp.ironhead,8);assert.equal(state(w).pp.transform,9);assert.equal(state(w).pp.seismictoss,undefined);}
  else {natural(w);assert.equal(state(w).pp.ironhead,7);}
  const prior=clone(state(w));await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(state(w),prior);projected(w);
  if(transform){assert.equal(actor(w).transformed,true);assert.deepEqual({...actor(w).storedStats},copied);}
  else natural(w);
  assert((await w.s.chooseSwitch('R')).ok);assert((await w.s.chooseSwitch('A')).ok);natural(w);projected(w);
  assert.equal(w.s.currentRequest().active[0].moves[0].id,dog[2]);assert.equal(w.s.currentRequest().active[0].moves[0].maxpp,8);
  assert.equal(w.s.currentRequest().active[0].moves[0].pp,transform?8:7);
  assert((await w.s.chooseMove(1)).ok);assert(w.s.finished);projected(w);
  const result=w.s.result(),ironResult=result.members.A.moves.find(m=>m.id==='ironhead');assert.deepEqual(ironResult,{id:'ironhead',pp:transform?7:6,maxpp:24});
  const outcome=w.app.finishBattle(w.s,w.req);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.port.replaced.length,1);
  const saved=clone(w.port.read()),member=saved.party[0];assert.equal(member.species,dog[0].toLowerCase());assert.equal(member.form,0);assert.equal(member.item,dog[1]);
  assert.equal(member.level,w.s.party[0].level);assert.equal(member.exp,w.s.party[0].exp);assert.deepEqual(member.evs,w.s.party[0].evs);assert.equal(member.hp,result.members.A.hp);
  assert.deepEqual(member.moves.find(m=>m.id==='ironhead'),{...ironResult,ppUps:3});assert(!member.moves.some(m=>m.id===dog[2]||m.id==='seismictoss'));
  assert.equal(saved.appliedBattles[w.req.battleId].hash,E.state.resultHash(result));w.app.finishBattle(w.s,w.req);assert.equal(w.port.replaced.length,1);assert.deepEqual(w.port.read(),saved);
 }finally{w.app.abortBattle(w.req,Error('owned Crowned growth cleanup'));}
});
for(const dog of DOGS)test(dog[0]+' disabled EXP still projects the permanent basis and abort preserves saved state',async()=>{
 const w=await open(dog,{expGain:false});try{assert((await w.s.chooseMove(1)).ok);natural(w);projected(w);assert.equal(w.s.party[0].level,50);assert.equal(w.s.party[0].evs.hp,7);assert.equal(state(w).pp.ironhead,1);w.app.abortBattle(w.req,Error('controlled abort'));unchanged(w);}finally{w.app.abortBattle(w.req,Error('cleanup'));}
});
for(const dog of DOGS)test('explicit '+dog[0]+'-Crowned input is not collapsed to its base species during growth',async()=>{
 const species=dog[0]+'-Crowned',gw=await E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[{name:'P',team:[{name:'A',species,item:dog[1],level:50,moves:['splash']}]},{name:'F',team:[{name:'B',species:'Snorlax',level:50,moves:['splash']}]}]});
 assert(await gw.choose('p1','team 1'));assert(await gw.choose('p2','team 1'));gw.drain();
 const b=gw._debugBattle(),p=b.sides[0].pokemon[0],expected=b.spreadModify(b.dex.species.get(species).baseStats,{...p.set,level:51});
 assert.deepEqual(gw.applyGrowth('p1','A',{level:51,expect:{stats:expected}}).stats,expected);assert.deepEqual(gw.readState('p1')[0].stats,expected);assert.equal(p.details,species+', L51');
});

for(const dog of DOGS)test(dog[0]+' growth identity does not depend on owning the opening Iron Head rewrite',async()=>{
 const w=await open(dog,{levelUp:true,primary:'aerialace'});try{
  assert.equal(w.s.gw.permanentMoveSlot('p1','A','ironhead'),null);assert.equal(state(w).ppMax,undefined);
  assert((await w.s.chooseMove(1)).ok);assert.equal(w.s.party[0].level,51);natural(w);assert.deepEqual(state(w).stats,permanentStats(w));unchanged(w);
  assert((await w.s.chooseMove(1)).ok);assert(w.s.finished);const outcome=w.app.finishBattle(w.s,w.req);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.port.read().party[0].species,dog[0].toLowerCase());
 }finally{w.app.abortBattle(w.req,Error('owned no-Iron-Head cleanup'));}
});
