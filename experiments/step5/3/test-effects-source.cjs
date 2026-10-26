'use strict';
// Real default Showdown/session source integration; fault injections and controlled revival are explicitly synthetic.
const test=require('node:test'),assert=require('node:assert/strict');
const {register}=require('node:module'),{pathToFileURL}=require('node:url'),{resolve}=require('node:path');
register('data:text/javascript,'+encodeURIComponent(`import{readFile}from'node:fs/promises';import{stripTypeScriptTypes}from'node:module';export async function load(url,context,next){if(url.endsWith('.ts'))return{format:'module',source:stripTypeScriptTypes(await readFile(new URL(url),'utf8'),{sourceUrl:url}),shortCircuit:true};return next(url,context);}`),pathToFileURL(__filename));
const pure=import(pathToFileURL(resolve(__dirname,'../../../src/framework/rules/battle-consumption.ts')));
const E=require('../../../js/engine/build/engine.cjs'),clone=x=>JSON.parse(JSON.stringify(x)),D=E.dex.createDexLookup(),C=clone(E.fixtures.content);
for(const id of ['splash','surgingstrikes','substitute','quickattack','return','transform']){const m=D.move(id);C.moves[id]={id:m.id,name:m.name,pp:m.pp};}
for(const id of ['Zoroark','Ditto'])C.species[id]={base:D.species(id).baseStats,growth:'medium',baseExp:50,evYield:{},catchRate:255,learnset:{}};
function member(id,species,level,moves,extra={}){
 const ivs={hp:31,atk:31,def:31,spa:31,spd:31,spe:31},evs={},hp=E.growth.computeStats(C.species[species].base,ivs,evs,level,'hardy').hp;
 return {id,species,form:0,level,exp:E.growth.minExp(C.species[species].growth,level),hp,status:'',item:'',ability:D.species(species).abilities[0],nature:'hardy',gender:'M',ivs,evs,moves:moves.map(id=>({id,pp:D.move(id).pp,maxpp:D.move(id).pp})),friendship:99,...extra};
}
async function make({party=[member('P1','Charizard',50,['flamethrower'])],foes=[member('F1','Pidgey',5,['splash'])],driver}={}){
 const game=E.state.newGame({party,bag:{potion:4,masterball:3},content:C,money:1000}),context={battleId:'effects-source',generation:2,contentIdentity:'a'.repeat(64),playerIds:game.party.map(m=>m.id),initialLevels:Object.fromEntries(game.party.map(m=>[m.id,m.level])),mapId:123};
 const s=await E.session.BattleSession.create({game,battleId:context.battleId,content:C,seed:[1,2,3,4],foe:{kind:'wild',team:foes},evidence:context,...(driver?{driver}:{})});s.take();return{s,game,context};
}
function seal(s){const raw=s.result();return E.session.sealBattleEffects(s,{battleId:raw.battleId,generation:2,contentIdentity:'a'.repeat(64),rawHash:E.state.resultHash(raw)});}
async function resolved(s,game){const source=seal(s);assert.ok(source);return(await pure).resolveBattleEffects({seal:source,expectedBinding:source.binding,expectedContext:source.context,membersBefore:game.party});}

test('V2 actual initial Illusion display is separate from stable ID; untouched bench never appears',async()=>{
 const {s,game}=await make({foes:[member('F1','Zoroark',20,['splash'],{ability:'Illusion'}),member('F2','Snorlax',50,['splash'])]});
 // Existing wild multi-foe ball gate rejects capture; exit via the legal run action without relaxing that gate.
 for(let i=0;i<8&&!s.finished;i++)await s.run();assert(s.finished);const raw=s.result(),source=seal(s),r=await resolved(s,game);
 assert(r.appearances.some(x=>x.memberId==='F1'&&x.display.battleSpecies==='Snorlax'));
 assert.equal(r.appearances.some(x=>x.memberId==='F2'),false);assert.deepEqual(source.observer.appearances.F2,{status:'complete',value:[]});
 assert.equal(source.version,2);assert.equal(r.binding.rawHash,E.state.resultHash(raw));
});
test('V2 observer failure cannot erase acknowledged control friendship, capture or XP',async()=>{
 const {s,game}=await make({party:[member('P1','Charizard',50,['flamethrower'],{hp:50})]});
 s.gw.drainObservations=()=>{throw Error('synthetic missing observer');};await s.useItem('potion','P1');await s.throwBall('masterball');
 const r=await resolved(s,game);assert.equal(r.critical.P1.status,'unavailable');assert.equal(r.damage.P1.status,'unavailable');
 assert.equal(r.friendshipReplacements.P1,s.party[0].friendship);assert(r.friendshipReplacements.P1>99);assert.equal(s.result().captured.length,1);assert(s.result().members.P1.exp>game.party[0].exp);
});
test('V2 D-only failure leaves K, display, no-faint coverage and control friendship',async()=>{
 const {s,game}=await make({party:[member('P1','Charizard',50,['flamethrower'],{hp:50})]});
 const drain=s.gw.drainObservations.bind(s.gw);s.gw.drainObservations=()=>{const b=drain();b.issues.push({group:'damage',memberId:'P1',reason:'synthetic bad D'});return b;};
 await s.useItem('potion','P1');await s.throwBall('masterball');const r=await resolved(s,game);
 assert.equal(r.damage.P1.status,'unavailable');assert.equal(r.critical.P1.status,'complete');assert(r.appearances.length);assert(r.friendshipReplacements.P1>99);assert.equal(r.faint.P1.coverage.status,'complete');
});
test('V2 actual faint hook identities match across sources; synthetic revival cannot erase positive prefix',async()=>{
 const {s,game}=await make({party:[member('P1','Pidgey',5,['splash'],{hp:1}),member('P2','Snorlax',100,['splash'])],foes:[member('F1','Charizard',100,['quickattack'])]});
 await s.chooseMove(1);await s.chooseForcedSwitch('P2');
 // Existing controlled seed operation used only as a test fixture; no natural in-battle revive feature is claimed.
 s.gw.seedState('p1',[{id:'P1',hp:5}]);s.gw.drainObservations=()=>{throw Error('synthetic late observer interruption');};await s.throwBall('masterball');
 const source=seal(s),r=await resolved(s,game),a=source.observer.members.P1.faint.positiveOccurrences[0],b=source.control.members.P1.faint.positiveOccurrences[0];
 assert(a&&b);assert.equal(a.hookKey,b.hookKey);assert.equal(a.memberId,'P1');assert.equal(b.memberId,'P1');assert.equal(r.faint.P1.positiveOccurrences.length,1);assert.equal(r.damage.P1.status,'unavailable');
 assert.equal(r.friendshipReplacements.P1,94);assert(s.result().members.P1.hp>0);
 assert.deepEqual((await pure).planBattleReadiness({member:{...s.party[0],hp:5,readyToEvolve:true,evolutionReadiness:'known'},faint:r.faint.P1,damage:r.damage.P1}),{readyToEvolve:false,evolutionReadiness:'known'});
});
test('V2 actual source cursors and hook associations roll back with gateway/session checkpoint',async()=>{
 const {s}=await make(),checkpoint=s._checkpoint();await s.chooseMove(1);assert(s.finished);const first=seal(s);
 await s._restoreCheckpoint(checkpoint);await s.chooseMove(1);assert.deepEqual(seal(s),first);
 assert.equal(first.observer.defeats.F1.value[0].hookKey,'faint:1');
 assert.equal(first.observer.defeats.F1.value[0].display.battleSpecies,'Pidgey');
});
test('V2 missing display only closes that projection; primary and independent K/D/friend remain',async()=>{
 const {s,game}=await make();const drain=s.gw.drainObservations.bind(s.gw);s.gw.drainObservations=()=>{const b=drain();for(const f of b.records)if(['appearance','display','faint'].includes(f.kind))delete f.display;return b;};
 await s.chooseMove(1);const source=seal(s),r=await resolved(s,game);assert.equal(source.observer.defeats.F1.status,'unavailable');assert.equal(r.critical.P1.status,'complete');assert.equal(r.damage.P1.status,'complete');assert.equal(s.result().outcome.winner,'Player');
});
test('V2 default source counts each actual critical hit and exact substitute loss separately from body HP',async()=>{
 const a=await make({party:[member('P1','Zoroark',50,['splash','surgingstrikes'])],foes:[member('F1','Snorlax',100,['substitute'])]});
 await a.s.chooseMove(1);await a.s.chooseMove(2);await a.s.throwBall('masterball');const k=await resolved(a.s,a.game);assert.equal(k.critical.P1.value,3);
 const b=await make({party:[member('P1','Charizard',100,['substitute'])],foes:[member('F1','Snorlax',50,['surgingstrikes'])]});
 await b.s.chooseMove(1);await b.s.throwBall('masterball');const d=await resolved(b.s,b.game);assert.equal(d.damage.P1.value.total,68);assert.equal(d.damage.P1.value.resetCoverage,'complete');
});
test('V2 control receipt survives an exception in the old optional friendship copy',async()=>{
 const {s,game}=await make({party:[member('P1','Charizard',50,['flamethrower'],{hp:50})]});
 Object.defineProperty(s._evidence.value,'friendship',{get(){throw Error('synthetic old-copy failure');},configurable:true,enumerable:false});
 await s.useItem('potion','P1');await s.throwBall('masterball');const r=await resolved(s,game);
 assert(r.friendshipReplacements.P1>99);assert.equal(s.result().captured.length,1);assert(s.result().members.P1.exp>game.party[0].exp);
});
test('V2 natural Transform records normalized display changes even when legacy details stay the same',async()=>{
 const {s,game}=await make({party:[member('P1','Snorlax',50,['splash'])],foes:[member('F1','Ditto',50,['transform'])]});
 await s.chooseMove(1);await s.throwBall('masterball');const r=await resolved(s,game),displayed=r.appearances.filter(x=>x.memberId==='F1').map(x=>x.display.battleSpecies);
 assert(displayed.includes('Ditto'));assert(displayed.includes('Snorlax'));assert.equal(s.result().captured[0].species,'Ditto');
});
