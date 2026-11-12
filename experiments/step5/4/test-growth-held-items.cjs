'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./trainer-ai-integration/fixtures.cjs'),{E,T}=F;
const clone=v=>JSON.parse(JSON.stringify(v));
const powers={powerweight:'hp',powerbracer:'atk',powerbelt:'def',powerlens:'spa',powerband:'spd',poweranklet:'spe'};
function supplied({foeItem='',foeMove='splash',party=1,luckySource=false,foeLevel=5}={}){
 const input=F.inputs({party,moves:[foeMove],skill:0});
 input.species.find(s=>s.id==='snorlax').learnset=(luckySource?['seismictoss']:['seismictoss','trick','splash','fling','magicroom']).map(move=>({level:1,move}));
 for(const mon of input.trainers[0].party)Object.assign(mon,{level:foeLevel,...(foeItem?{item:foeItem}:{})});
 for(const id of ['luckyegg','machobrace',...Object.keys(powers),'leftovers'])if(!input.items.some(i=>i.id===id))input.items.push({id,name:id,namePlural:id,pocket:1,source:'author-placeholder'});
 input.grants=luckySource?[{id:'growth-held',source:'author-placeholder',members:[{species:'snorlax',level:20,item:'luckyegg'}],items:{},money:0}]:[];
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);
 return{content:assembled.content,dex};
}
async function open({item='',evs={},bench=false,wild=false,expGain=true,nearLevel=false,...options}={}){
 const c=supplied(options),game=E.state.newGame({content:c.content,party:[],money:1000,bag:{masterball:1}});
 const m=E.memberFactory.createMember({id:'P1',species:'Snorlax',level:20},c.content,()=>0);m.item=item;if(nearLevel)m.exp=E.growth.minExp(c.content.species.Snorlax.growth,21)-1;m.evs={...m.evs,...clone(evs)};m.moves=['seismictoss','trick','splash','fling'].map(id=>{const move=c.dex.move(id);return{id,pp:move.pp,maxpp:move.pp};});
 if(options.magicRoom){const move=c.dex.move('magicroom');m.moves[2]={id:'magicroom',pp:move.pp,maxpp:move.pp};}
 m.hp=E.growth.computeStats(c.content.species.Snorlax.base,m.ivs,m.evs,m.level,m.nature).hp;
 game.party=[E.speciesKey.toPersistentMember(m,c.content)];
 if(bench){const b=E.memberFactory.createMember({id:'P2',species:'Snorlax',level:20},c.content,()=>0);b.moves=[{id:'seismictoss',pp:20,maxpp:20}];game.party.push(E.speciesKey.toPersistentMember(b,c.content));}
 game.nextMemberOrdinal=bench?'3':'2';const state=T.fakes.createMemoryState(game),before=JSON.stringify(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),content:()=>c,random:()=>0,clock:()=>12345,sessions:E.composition.createBattleSessionFactory({content:()=>c.content,seed:()=>[1,2,3,4]})},{receivingProfile:{mode:0,naming:1}});
 const request={battleId:'growth-held',seq:1,canLose:true,expGain,...(wild?{kind:'wild',foes:[{species:'pidgey',level:5}]}:{trainer:{id:'c-basic',version:1}})};
 const s=wild?await app.startBattle(request):await app.startTrainerBattle(request);s.take();
 return{s,app,state,before,request,initial:clone(m),cleanup(){app.abortBattle(request,Error('owned held-growth cleanup'));}};
}
async function action(w,slot){const r=await w.s.chooseMove(slot);assert(r.ok,JSON.stringify(r));return r;}
function unchanged(w){assert.equal(JSON.stringify(w.state.read()),w.before);assert.equal(w.state.replaced.length,0);}
function install(w){unchanged(w);assert(w.s.finished);const result=w.app.finishBattle(w.s,w.request);assert.equal(result.commit,'applied',JSON.stringify(result));assert.equal(w.state.replaced.length,1);assert.equal(w.app.finishBattle(w.s,w.request).commit,'already-applied');assert.equal(w.state.replaced.length,1);return w.state.read().party.find(m=>m.id==='P1');}
const expectedExp=13; // WP30: floor(50 * (20/35)^2.5) + 1; Lucky Egg floors the subsequent * 3/2.

test('GHI01 author Lucky Egg source is canonical and normal grant/holdable admission is available',()=>{
 const c=supplied({luckySource:true});assert.deepEqual(c.dex.heldItem('luckyegg'),{id:'luckyegg',holdable:true,mail:false});assert.equal(c.dex.heldItem('lucky-egg'),null);assert(c.content.grants['growth-held']);
});
for(const item of ['', 'leftovers','luckyegg','machobrace',...Object.keys(powers)])test('GHI02 formal trainer KO applies held growth and installs exactly once: '+(item||'none'),async()=>{
 const w=await open({item});try{const r=await action(w,1);assert(w.s.finished);assert(r.messages.some(m=>m.kind==='growth'));const m=install(w),expected={spe:item==='machobrace'?2:1};if(powers[item])expected[powers[item]]=(expected[powers[item]]??0)+8;
 assert.equal(m.exp-w.initial.exp,item==='luckyegg'?19:expectedExp);for(const stat of E.growth.STAT_KEYS)assert.equal(m.evs[stat]??0,expected[stat]??0,stat);assert.equal(m.item,item);assert.equal(w.s.gw.readState('p1').find(m=>m.id==='P1').stats.hp,E.growth.computeStats(w.s.content.species.Snorlax.base,m.ivs,m.evs,m.level,m.nature).hp);
 }finally{w.cleanup();}
});
for(const [item,evs,expected]of [['poweranklet',{spe:250},{spe:252}],['powerweight',{hp:252,spe:250},{hp:252,spe:251}],['powerweight',{atk:252,def:252,spa:5},{atk:252,def:252,spa:5,hp:1}],['machobrace',{spe:251},{spe:252}]])test('GHI03 per-stat/total caps retain fixed stat iteration: '+item+JSON.stringify(evs),async()=>{
 const w=await open({item,evs});try{await action(w,1);const m=install(w);for(const stat of E.growth.STAT_KEYS)assert.equal(m.evs[stat]??0,expected[stat]??0,stat);}finally{w.cleanup();}
});
for(const [item,foeItem,expected,amount]of [['powerbracer','powerweight',{spe:1,hp:8},13],['powerweight','leftovers',{spe:1,hp:8},13],['powerweight','luckyegg',{spe:1,hp:8},19],['luckyegg','leftovers',{spe:1},19]])test('GHI04 real Trick chooses the current handler, or per-effect recovery fallback, without stacking: '+item+' -> '+foeItem,async()=>{
 const w=await open({item,foeItem});try{await action(w,2);unchanged(w);await action(w,1);const m=install(w);assert.equal(m.exp-w.initial.exp,amount);for(const stat of E.growth.STAT_KEYS)assert.equal(m.evs[stat]??0,expected[stat]??0,stat);assert.equal(m.item,item,'trainer temporary swaps recover original ownership');}finally{w.cleanup();}
});
for(const item of ['luckyegg','machobrace','powerbracer'])test('GHI05 real Knock Off keeps recovery growth on subsequent KO: '+item,async()=>{
 const w=await open({item,foeMove:'knockoff'});try{await action(w,3);assert(w.s.take().every(m=>m.kind!=='growth'));await action(w,1);const m=install(w);assert.equal(m.exp-w.initial.exp,item==='luckyegg'?19:13);assert.equal(m.evs.spe,item==='machobrace'?2:1);assert.equal(m.evs.atk??0,item==='powerbracer'?8:0);assert.equal(m.item,item);}finally{w.cleanup();}
});
test('GHI06 real Fling consumes the Power item and its recovery, so later KO has no bonus',async()=>{
 const w=await open({item:'powerbracer',foeLevel:20});try{await action(w,4);assert(!w.s.finished,'Fling must not KO the target');for(let i=0;i<5&&!w.s.finished;i++)await action(w,1);const m=install(w);assert.equal(m.evs.atk??0,0);assert.equal(m.evs.spe,1);assert.equal(m.item,'');}finally{w.cleanup();}
});
test('GHI07 switched-out participant keeps own Lucky Egg identity and receives growth; active teammate does not borrow it',async()=>{
 const w=await open({item:'luckyegg',bench:true});try{assert((await w.s.chooseSwitch('P2')).ok);await action(w,1);const p1=install(w),p2=w.state.read().party.find(m=>m.id==='P2');assert.equal(p1.exp-w.initial.exp,19);assert.equal(p2.exp-w.initial.exp,13);assert.equal(p1.item,'luckyegg');assert.equal(p2.item,'');}finally{w.cleanup();}
});
for(const item of ['luckyegg','poweranklet'])test('GHI08 capture and expGain=false obey the same held growth boundary: '+item,async()=>{
 for(const expGain of [true,false]){const w=await open({item,wild:true,expGain});try{assert((await w.s.throwBall('masterball')).ok);const m=install(w);assert.equal(m.exp-w.initial.exp,expGain?(item==='luckyegg'?19:13):0);assert.equal(m.evs.spe??0,expGain?(item==='poweranklet'?9:1):0);}finally{w.cleanup();}}
});
test('GHI09 Magic Room does not suppress the growth handler (not a field-effective item event)',async()=>{
 const w=await open({item:'powerbracer',magicRoom:true});try{await action(w,3);await action(w,1);const m=install(w);assert.equal(m.evs.atk,8);assert.equal(m.evs.spe,1);}finally{w.cleanup();}
});
test('GHI10 checkpoint restores the authoritative item/recovery pair before real Trick and KO',async()=>{
 const w=await open({item:'powerbracer',foeItem:'powerweight'});try{const checkpoint=w.s._checkpoint();await action(w,2);await w.s._restoreCheckpoint(checkpoint);await action(w,1);const m=install(w);assert.equal(m.evs.atk,8);assert.equal(m.evs.hp??0,0);assert.equal(m.item,'powerbracer');}finally{w.cleanup();}
});

test('GHI11 normal author grant produces an admitted Lucky Egg holder and the real battle writes boosted EXP',async()=>{
 const c=supplied({luckySource:true}),game=E.state.newGame({content:c.content,party:[],money:1000}),state=T.fakes.createMemoryState(game);
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),content:()=>c,random:()=>0,clock:()=>12345,sessions:E.composition.createBattleSessionFactory({content:()=>c.content,seed:()=>[1,2,3,4]})},{receivingProfile:{mode:0,naming:1}});
 const claimed=app.claimGrant('growth-held');assert.equal(claimed.status,'applied',JSON.stringify(claimed));assert.equal(state.read().party.length,1);assert.equal(state.read().party[0].item,'luckyegg');
 const before=state.read().party[0].exp,request={battleId:'growth-held-grant',seq:1,canLose:true,trainer:{id:'c-basic',version:1}},s=await app.startTrainerBattle(request);
 try{assert.equal(s.gw.readState('p1')[0].id,state.read().party[0].id);assert((await s.chooseMove(1)).ok);assert(s.finished);assert.equal(app.finishBattle(s,request).commit,'applied');assert.equal(state.read().party[0].exp-before,19);assert.equal(state.read().party[0].item,'luckyegg');}finally{app.abortBattle(request,Error('owned grant cleanup'));}
});
test('GHI12 nonterminal KO applies each foe exactly once while persistent state stays unchanged until final install',async()=>{
 const w=await open({item:'luckyegg',party:2});try{await action(w,1);assert(!w.s.finished);unchanged(w);assert.equal(w.s.party[0].exp-w.initial.exp,19);await action(w,1);const m=install(w);assert.equal(m.exp-w.initial.exp,38);assert.equal(m.evs.spe,2);}finally{w.cleanup();}
});
for(const item of ['luckyegg','powerweight'])test('GHI13 level-up cross-checks engine permanent stats after boosted growth: '+item,async()=>{
 const w=await open({item,nearLevel:true});try{const r=await action(w,1);assert(r.messages.some(m=>m.kind==='growth'&&m.levelUps.includes(21)));const m=install(w);assert.equal(m.level,21);assert.equal(m.exp-w.initial.exp,item==='luckyegg'?19:13);const expected=E.growth.computeStats(w.s.content.species.Snorlax.base,m.ivs,m.evs,m.level,m.nature),actual=w.s.gw.readState('p1')[0];assert.deepEqual(actual.stats,expected);assert.equal(actual.maxhp,expected.hp);}finally{w.cleanup();}
});
