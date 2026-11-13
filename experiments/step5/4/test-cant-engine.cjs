'use strict';
// Synthetic initial conditions, real pinned Gen8 actions/protocol. No reference-game replay.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../../../js/engine/build/production.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
assert.equal(fs.readFileSync(require('node:path').resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),'7244fe8e28fa8bc4d0809ae30d183c608b62bb2b');
const team=(name,species,moves,ability)=>({name,species,moves,ability,level:50});
const actor=(e,side)=>e.args[0]===`${side}a: ${side==='p1'?'A':'B'}`;
const state=g=>({p1:clone(g.readState('p1')[0]),p2:clone(g.readState('p2')[0])});
async function open(left,right,seed=[9,10,11,12]) {
 const gw=await E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',seed,players:[{name:'Player',team:[left]},{name:'Foe',team:[right]}]});
 assert(await gw.choose('p1','team 1'));assert(await gw.choose('p2','team 1'));gw.drain();
 for(const [side,m]of [['p1',left],['p2',right]]){const s=gw.readState(side)[0];gw.seedState(side,[{id:s.id,hp:s.hp,moves:m.moves.map(id=>{const move=E.dex.createDexLookup().move(id);return{id,pp:move.pp,maxpp:move.pp};})}]);}
 return gw;
}
async function turn(g,p1=1,p2=1){const before=state(g);assert(await g.choose('p1','move '+p1));assert.deepEqual(state(g),before);assert(await g.choose('p2','move '+p2));const messages=g.drain();assert(!messages.some(m=>m.kind==='error'),JSON.stringify(messages));return{before,after:state(g),events:messages.flatMap(m=>m.events||[])};}
function descriptions(row){const before=JSON.stringify(row);for(const lang of ['en','zh']){const d=E.describe.make({A:'Alpha',B:'Beta'},E.i18n.translatorFor(lang));for(const e of row.events.filter(e=>e.type==='cant')){assert.equal(d.event(e).length,1);assert(!d.event(e)[0].includes('[missing:'));}}assert.equal(JSON.stringify(row),before);}
for(const side of ['p1','p2']) for(const status of ['slp','par','frz']) test(`${side} real ${status} blocking, unchanged blocked PP, order and status`,async()=>{
 const fast=team(side==='p1'?'A':'B','Aerodactyl',['splash'],'Pressure'),slow=team(side==='p1'?'B':'A','Slowpoke',['splash'],'Oblivious'),g=await open(side==='p1'?fast:slow,side==='p1'?slow:fast);
 const initial=state(g);g.seedState(side,[{id:initial[side].id,hp:initial[side].hp,status,statusCount:3}]);let count=0;
 for(let i=0;i<5;i++){const r=await turn(g),cant=r.events.filter(e=>e.type==='cant'&&actor(e,side)&&e.args[1]===status),moves=r.events.filter(e=>e.type==='move'&&actor(e,side));count+=cant.length;assert.equal(cant.length+moves.length,1);assert.equal(r.before[side].pp.splash-r.after[side].pp.splash,moves.length);if(cant.length)assert.equal(r.after[side].status,status);const actions=r.events.filter(e=>e.type==='cant'||e.type==='move');assert(actor(actions[0],side),'faster actor stays first even while blocked');descriptions(r);}
 assert(count>0,'fixed sequence actually exercised blocking, not just allowed actions');
});
for(const side of ['p1','p2'])test(`${side} real flinch and one-turn recovery`,async()=>{
 const hit=team(side==='p1'?'B':'A','Aerodactyl',['fakeout','splash'],'Pressure'),target=team(side==='p1'?'A':'B','Slowbro',['splash'],'Own Tempo'),g=await open(side==='p1'?target:hit,side==='p1'?hit:target);
 const first=await turn(g);const cant=first.events.find(e=>e.type==='cant'&&actor(e,side)&&e.args[1]==='flinch');assert(cant);assert.equal(first.after[side].pp.splash,40);assert.equal(first.after[side].status,'');assert(first.events.findIndex(e=>e===cant)>first.events.findIndex(e=>e.type==='move'&&e.args[1]==='Fake Out'));descriptions(first);
 const next=await turn(g,side==='p1'?1:2,side==='p1'?2:1);assert(!next.events.some(e=>e.type==='cant'));assert.equal(next.after[side].pp.splash,39);
});
for(const side of ['p1','p2'])test(`${side} Hyper Beam recharge differs from Dig preparation, one PP only`,async()=>{
 for(const id of ['hyperbeam','dig']){const attacker=team(side==='p1'?'A':'B','Snorlax',[id,'splash'],'Thick Fat'),target=team(side==='p1'?'B':'A','Shuckle',['splash'],'Sturdy'),g=await open(side==='p1'?attacker:target,side==='p1'?target:attacker,[1,2,3,4]);
 const a=await turn(g);assert.equal(a.before[side].pp[id]-a.after[side].pp[id],1);assert(!a.events.some(e=>e.type==='cant'&&e.args[1]==='recharge'));if(id==='dig')assert(a.events.some(e=>e.type==='-prepare'&&actor(e,side)));const b=await turn(g);assert.equal(b.after[side].pp[id],a.after[side].pp[id]);if(id==='hyperbeam'){assert(b.events.some(e=>e.type==='cant'&&actor(e,side)&&e.args[1]==='recharge'));assert(!b.events.some(e=>e.type==='move'&&actor(e,side)));}else{assert(!b.events.some(e=>e.type==='cant'));assert(b.events.some(e=>e.type==='move'&&actor(e,side)&&e.args[1]==='Dig'));}descriptions(b);}
});
for(const id of ['snore','sleeptalk'])test(`sleep-usable ${id} follows cant|slp and still spends appropriate PP`,async()=>{
 const g=await open(team('A','Snorlax',[id,'splash'],'Thick Fat'),team('B','Shuckle',['splash'],'Sturdy'));
 g.seedState('p1',[{id:'A',hp:state(g).p1.hp,status:'slp',statusCount:3}]);const r=await turn(g),cant=r.events.findIndex(e=>e.type==='cant'&&actor(e,'p1')&&e.args[1]==='slp'),move=r.events.findIndex(e=>e.type==='move'&&actor(e,'p1'));
 assert(cant>=0&&move>cant);assert.equal(r.before.p1.pp[id]-r.after.p1.pp[id],1);assert.equal(r.after.p1.status,'slp');assert.equal(r.after.p1.pp.splash,r.before.p1.pp.splash,'called Sleep Talk move does not spend its own PP');descriptions(r);
});
test('real Truant loafing uses actor and preserves PP',async()=>{const g=await open(team('A','Slaking',['splash'],'Truant'),team('B','Shuckle',['splash'],'Sturdy'));await turn(g);const r=await turn(g);assert(r.events.some(e=>e.type==='cant'&&e.args[1]==='ability: Truant'));assert.equal(r.before.p1.pp.splash,r.after.p1.pp.splash);descriptions(r);});
test('real Damp reports holder rather than mover: safe fallback never accuses holder',async()=>{const g=await open(team('A','Snorlax',['explosion'],'Thick Fat'),team('B','Politoed',['splash'],'Damp'));const r=await turn(g),e=r.events.find(e=>e.type==='cant'&&e.args[1]==='ability: Damp');assert(e);assert(actor(e,'p2'));assert(e.args.includes('[of] p1a: A'));for(const lang of ['en','zh'])assert.deepEqual(E.describe.make({A:'Mover',B:'Holder'},E.i18n.translatorFor(lang)).event(e),[lang==='zh'?'行动受到了限制。':'An action was restricted.']);});
