'use strict';
// Synthetic current-engine/Session regressions. No reference replay, NW or player save.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const E=require('../../../js/engine/build/production.cjs'),F=require('../../../js/engine/fixtures/game.cjs');
const ROOT=path.resolve(__dirname,'../../..');
const set=(name,species='Snorlax',moves=['Splash'],extra={})=>({name,species,moves,level:100,ability:'Immunity',gender:'M',nature:'Hardy',...extra});
async function gateway({player=set('P'),foe=set('F'),rest=[],foeRest=[],initialField,formatid='gen8rpgcustomgame'}={}){
 const gw=await E.gateway.BattleGateway.create({engineRoot:path.join(ROOT,'js/engine/showdown'),formatid,seed:[1,2,3,4],wild:true,players:[{name:'Player',team:[player,...rest]},{name:'Wild',team:[foe,...foeRest]}],...(initialField?{initialField}:{})});
 assert(await gw.choose('p1','team '+[player,...rest].map((_,i)=>i+1).join('')));assert(await gw.choose('p2','team '+[foe,...foeRest].map((_,i)=>i+1).join('')));gw.drain();return gw;
}
async function turn(gw,a='move 1',b='move 1'){assert(await gw.choose('p1',a));assert(await gw.choose('p2',b));return gw.drain();}
const ballEvent=messages=>messages.flatMap(m=>m.events??[]).find(e=>e.type==='rpg'&&e.args[0]==='ball');
async function throwRaw(gw,ball,ctx){assert(await gw.act('p1',{kind:'ball',ball,target:'F',catchRate:30,ctx}));assert(await gw.choose('p2','move 1'));const event=ballEvent(gw.drain());assert(event,'actual ball resolution event');return Number(event.args[7]);}
const lockMoves=['Hyper Beam','Dig','Fly','Outrage'];
for(const move of lockMoves)test(move+' published hard lock refuses all RPG choices before mutation, then legally continues',async()=>{
 const gw=await gateway({player:set('P','Snorlax',[move,'Splash'],{item:'Smoke Ball'})});await turn(gw);
 const req=gw.awaitingChoice('p1');assert.equal(req.active[0].moves.length,1);assert.equal(req.active[0].moves[0].pp,undefined);assert.equal(req.active[0].moves[0].target,undefined);assert.equal(req.active[0].trapped,true);
 const before=gw.snapshot(),b=gw._debugBattle(),lock=b.sides[0].active[0].getLockedMove;
 // A read-only hint must never re-run LockMove/priorityEvent, even when repeatedly queried.
 b.sides[0].active[0].getLockedMove=()=>{throw Error('query must only read published request');};
 try{for(let i=0;i<3;i++){assert.deepEqual(gw.query('p1','automatic-locked'),{allowed:true,moveSlot:1});for(const kind of ['item','ball','run'])assert.deepEqual(gw.query('p1',kind),{allowed:false,reason:'choice-rejected'});}}finally{b.sides[0].active[0].getLockedMove=lock;}
 assert.equal(gw.snapshot(),before,'queries leave PRNG, request, queue and attempts untouched');
 for(const payload of [{kind:'item',item:'pokedoll',target:'P'},{kind:'ball',ball:'masterball',target:'F',catchRate:30},{kind:'run'}]){assert.equal(await gw.act('p1',payload),false);assert.equal(gw.snapshot(),before);}
 assert(await gw.choose('p1','move 1'));const staged=gw.snapshot();assert.equal(await gw.act('p1',{kind:'run'}),false);assert.equal(gw.snapshot(),staged,'a rejected RPG choice cannot cancel the existing move');assert(await gw.choose('p2','move 1'));gw.drain();assert.equal(gw._debugBattle().turn,3);assert.equal(Object.keys(gw._debugBattle().rpg.pending).length,0);
});
for(const [species,ability,item]of [['Gengar','Cursed Body',''],['Rapidash','Run Away',''],['Snorlax','Immunity','Smoke Ball']])test('hard lock precedes certain Run: '+species+'/'+ability+'/'+item,async()=>{
 const gw=await gateway({player:set('P',species,['Hyper Beam'],{ability,item})});await turn(gw);assert.deepEqual(gw.query('p1','run'),{allowed:false,reason:'choice-rejected'});
});
test('ordinary one move under Arena Trap is not a hard lock and still permits a toy',async()=>{
 const gw=await gateway({foe:set('F','Dugtrio',['Splash'],{ability:'Arena Trap'}),rest:[set('R')]});assert.equal(gw.query('p1','run').reason,'trapped');assert(gw.awaitingChoice('p1').active[0].moves[0].pp>0);assert.equal(gw.query('p1','automatic-locked').allowed,false);assert.equal(gw.query('p1','item').allowed,true);assert(await gw.act('p1',{kind:'item',item:'pokedoll',target:'P'}));assert(await gw.choose('p2','move 1'));assert(gw._debugBattle().ended);
});
test('PP-less Struggle remains a selectable soft fallback, not a hard lock',async()=>{
 const gw=await gateway();gw.seedState('p1',[{id:'P',hp:gw.readState('p1')[0].hp,moves:[{id:'splash',pp:0,maxpp:40}]}]);gw.refreshRequests();assert.equal(gw.awaitingChoice('p1').active[0].moves[0].id,'struggle');assert.equal(gw.query('p1','automatic-locked').allowed,false);assert.equal(gw.query('p1','item').allowed,true);
});
async function session({move='Hyper Beam',ball='dreamball',status='',same=true,gender='F',initialField}={}){
 const content=structuredClone(F.content);content.species.Snorlax.catchRate=30;
 for(const id of ['hyperbeam','dig','fly','outrage','splash'])content.moves[id]={id,name:id,pp:{hyperbeam:5,dig:10,fly:15,outrage:10,splash:40}[id]};
 const player=F.member('P','Snorlax',100,{moves:['tackle'],ability:'Immunity'}),foe=F.foeMember('F',same?'Snorlax':'Pidgey',100,{moves:['tackle'],ability:'Immunity'});
 const id=move.toLowerCase().replace(/[^a-z0-9]/g,'');player.moves=[{id,pp:content.moves[id].pp,maxpp:content.moves[id].pp}];foe.moves=[{id:'splash',pp:40,maxpp:40}];foe.gender=gender;foe.status=status;if(status==='slp')foe.statusCount=4;
 const game=E.state.newGame({content,party:[player],bag:{pokedoll:2,masterball:2,potion:2,[ball]:2},money:1000}),before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content,battleId:'capture-run-synthetic',seed:[1,2,3,4],foe:{kind:'wild',team:[foe]},...(initialField?{initialField}:{})});s.take();return{s,game,before};
}
for(const move of lockMoves)test('Session '+move+' lock rejects before bag reservation and remains continuable',async()=>{
 const{s,game,before}=await session({move});assert((await s.chooseMove(1)).ok);const snap=s.gw.snapshot(),bag=structuredClone(s.bag),ledger=structuredClone(s.ledger);
 assert.equal(s.canUseItem('pokedoll','P').ok,false);
 for(const action of [()=>s.useItem('pokedoll','P'),()=>s.useItem('potion','P'),()=>s.throwBall('masterball'),()=>s.run()]){const r=await action();assert.equal(r.ok,false,JSON.stringify(r));assert.equal(s.gw.snapshot(),snap);assert.deepEqual(s.bag,bag);assert.deepEqual(s.ledger,ledger);assert.equal(JSON.stringify(game),before);}
 assert((await s.chooseMove(1)).ok);assert.equal(s.gw._debugBattle().turn,3);
});
for(const [status,x]of [['slp',100],['frz',25],['',10]])test('Dream Ball engine status '+(status||'none')+' x='+x,async()=>{
 const gw=await gateway();if(status)gw.seedState('p2',[{id:'F',hp:gw.readState('p2')[0].hp,status,statusCount:4}]);assert.equal(await throwRaw(gw,'dreamball'),x);
});
test('Dream Ball counts qualified Komala/Comatose without adding a real sleep status bonus',async()=>{
 const gw=await gateway({foe:set('F','Komala',['Splash'],{ability:'Comatose'})});assert.equal(gw.readState('p2')[0].status,'');assert.equal(await throwRaw(gw,'dreamball'),40);
});
test('Comatose on another authored species does not qualify as Komala',async()=>{
 const gw=await gateway({foe:set('F','Snorlax',['Splash'],{ability:'Comatose'})});assert.equal(await throwRaw(gw,'dreamball'),10);
});
for(const [environment,x]of [['underwater',35],['movingwater',10],['none',10]])test('Dive Ball engine environment '+environment,async()=>{assert.equal(await throwRaw(await gateway({initialField:{environment}}),'diveball'),x);});
for(const [player,foe,rest,x,label]of [
 [set('P'),set('F','Snorlax',['Splash'],{gender:'F'}),[],80,'same opposite'],
 [set('P'),set('F'),[],10,'same gender'],
 [set('P'),set('F','Pidgey',['Splash'],{gender:'F'}),[],10,'different species'],
 [set('P','Magnemite'),set('F','Magnemite'),[],10,'genderless'],
 [set('P','Pidgey'),set('F','Snorlax',['Splash'],{gender:'F'}),[set('R')],10,'bench excluded'],
 [set('P','Meowth-Alola'),set('F','Meowth',['Splash'],{gender:'F'}),[],80,'same rule family across forms'],
])test('Love Ball engine '+label,async()=>{assert.equal(await throwRaw(await gateway({player,foe,rest}),'loveball'),x);});
for(const [ball,options,x]of [['dreamball',{status:'slp'},100],['diveball',{initialField:{environment:'underwater'}},35],['loveball',{},80]])test('Session wires '+ball+' and leaves persistent game untouched',async()=>{
 const{s,game,before}=await session({move:'Splash',ball,...options});const result=await s.throwBall(ball);assert(result.ok,JSON.stringify(result));const e=ballEvent(result.messages);assert(e);assert.equal(Number(e.args[7]),x);assert.equal(s.bag[ball],1);assert.equal(JSON.stringify(game),before);
});
test('Shed Shell plus a real wild Mean Look refuses Run before spending a turn',async()=>{
 const gw=await gateway({player:set('P','Snorlax',['Splash'],{item:'Shed Shell'}),foe:set('F','Gengar',['Mean Look'],{ability:'Cursed Body'}),rest:[set('R')]});await turn(gw);const p=gw._debugBattle().sides[0].active[0];assert.equal(p.trapped,false);assert(p.volatiles.trapped);const snap=gw.snapshot();assert.deepEqual(gw.query('p1','run'),{allowed:false,reason:'trapped'});assert.equal(gw.snapshot(),snap);
});

test('Session real Mean Look with Shed Shell refuses Run with no foe action, turn or attempt',async()=>{
 const content=structuredClone(F.content);for(const [id,pp]of [['splash',40],['meanlook',5]])content.moves[id]={id,name:id,pp};
 const p=F.member('P','Snorlax',100,{moves:['tackle'],ability:'Immunity',item:'shedshell'});p.moves=[{id:'splash',pp:40,maxpp:40}];
 const f=F.foeMember('F','Gengar',100,{moves:['tackle'],ability:'Cursed Body'});f.moves=[{id:'meanlook',pp:5,maxpp:5}];
 const game=E.state.newGame({content,party:[p],money:1000}),before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content,battleId:'mean-look-shell',seed:[1,2,3,4],experimentalHeldBattle:true,foe:{kind:'wild',team:[f]}});s.take();assert((await s.chooseMove(1)).ok);
 const live=s.gw._debugBattle().sides[0].active[0];assert.equal(live.trapped,false);assert(live.volatiles.trapped);
 const snap=s.gw.snapshot(),bag=structuredClone(s.bag),ledger=structuredClone(s.ledger);assert.deepEqual(await s.run(),{ok:false,reason:'trapped'});assert.equal(s.gw.snapshot(),snap);assert.deepEqual(s.bag,bag);assert.deepEqual(s.ledger,ledger);assert.equal(JSON.stringify(game),before);
});
