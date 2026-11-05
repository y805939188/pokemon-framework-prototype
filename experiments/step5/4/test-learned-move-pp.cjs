'use strict';
// Actual Gateway/Session use after learning; no direct writes to engine objects.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/production.cjs'),F=require('../../../js/engine/fixtures/game.cjs');
const G=E.gateway.BattleGateway,read=(gw,id='A')=>gw.readState('p1').find(m=>m.id===id);
const mon=(name,species,moves,ability='Immunity')=>({name,species,level:100,moves,ability});
async function open(team=[mon('A','Snorlax',['growl','splash','tackle','protect'])],foe=mon('B','Snorlax',['tackle'])){
 const gw=await G.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[{name:'P1',team},{name:'P2',team:[foe]}]});
 assert(await gw.choose('p1',team.length===1?'team 1':'team 12'));assert(await gw.choose('p2','team 1'));gw.drain();return gw;
}
async function turn(gw,choice,foe='move 1'){
 assert(await gw.choose('p1',choice));assert(await gw.choose('p2',foe));
 const messages=gw.drain();assert(!messages.some(m=>m.kind==='error'));return messages.flatMap(m=>m.kind==='events'?m.events:[]);
}
const request=gw=>gw.awaitingChoice('p1');
function learnRest(gw,replaceSlot){gw.applyGrowth('p1','A',{level:100,newMoves:['Rest'],...(replaceSlot===undefined?{}:{replaceSlot})});gw.refreshRequests();}
for(const mode of ['replace','append'])test('ordinary learned Rest '+mode+' PP matches the published request after actual healing',async()=>{
 const gw=await open(mode==='append'?[mon('A','Snorlax',['growl'])]:undefined);await turn(gw,'move 1');
 assert(read(gw).hp<read(gw).maxhp);learnRest(gw,mode==='replace'?1:undefined);assert.equal(request(gw).active[0].moves[1].pp,10);
 const events=await turn(gw,'move 2');assert(events.some(e=>e.type==='move'&&e.args[1]==='Rest'));assert.equal(read(gw).status,'slp');
 assert.equal(request(gw).active[0].moves[1].pp,9);assert.equal(read(gw).pp.rest,9,'permanent PP must reflect the actual newly learned use');
});
test('a real Session automatic append consumes the learned Rest in working data without writing the input game',async()=>{
 const content=structuredClone(F.content);content.species.Snorlax.learnset[51]=['Rest'];
 const game=E.state.newGame({content,party:[F.member('LEARNER','Snorlax',50,{moves:['tackle'],ability:'Immunity'})],bag:{},money:1000});
 game.party[0].exp=E.growth.minExp(content.species.Snorlax.growth,51)-1;game.party[0].hp-=20;const before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content,battleId:'learned-pp-append',seed:[1,2,3,4],foe:{kind:'trainer',team:[F.foeMember('F1','Pidgey',3,{moves:['tackle']}),F.foeMember('F2','Pidgey',4,{moves:['tackle']})]}});s.take();
 const first=await s.chooseMove(1);assert(first.ok);assert.equal(s.ended,null);assert.equal(s.pendingLearn,null);assert.equal(s.party[0].moves[1].id,'rest');
 const used=await s.chooseMove(2);assert(used.ok);assert(used.messages.flatMap(m=>m.events??[]).some(e=>e.type==='move'&&e.args[1]==='Rest'));
 assert.equal(s.currentRequest().active[0].moves[1].pp,9);assert.equal(s.gw.readState('p1')[0].pp.rest,9);assert.equal(s.party[0].moves[1].pp,9);assert.equal(JSON.stringify(game),before);
});
test('checkpoint restore retains normal learned PP use',async()=>{
 let gw=await open();await turn(gw,'move 1');learnRest(gw,1);gw=await G.fromCheckpoint(gw.checkpoint());
 assert.equal(request(gw).active[0].moves[1].pp,10);await turn(gw,'move 2');assert.equal(request(gw).active[0].moves[1].pp,9);assert.equal(read(gw).pp.rest,9);
});
test('actual Transform temporary PP stays separate from learned permanent PP and switch-back use',async()=>{
 const gw=await open([mon('A','Ditto',['transform'],'Limber'),mon('R','Snorlax',['splash'])],mon('B','Snorlax',['splash']));
 const originalTransform=read(gw).pp.transform;learnRest(gw);await turn(gw,'move 1');
 assert.equal(request(gw).active[0].moves[0].id,'splash');assert.equal(request(gw).active[0].moves[0].pp,5);await turn(gw,'move 1');
 assert.equal(request(gw).active[0].moves[0].pp,4);assert.equal(read(gw).pp.rest,10);assert.equal(read(gw).pp.transform,originalTransform-1);assert.equal(read(gw).pp.splash,undefined);
 await turn(gw,'switch 2');const back=request(gw).side.pokemon.findIndex(m=>m.ident==='p1: A');assert(back>=0);await turn(gw,'switch '+(back+1));
 assert.equal(request(gw).active[0].moves[1].id,'rest');const events=await turn(gw,'move 2');assert(events.some(e=>e.type==='move'&&e.args[1]==='Rest'));
 // Full-HP Rest may fail to heal here, but its actual use still spends one PP; main cases prove healing.
 assert.equal(request(gw).active[0].moves[1].pp,9);assert.equal(read(gw).pp.rest,9);assert.equal(read(gw).pp.splash,undefined);
});
test('actual Mimic copy consumes temporary Tackle while permanent Mimic and learned Rest remain distinct',async()=>{
 const gw=await open([mon('A','Snorlax',['mimic','growl'])],mon('B','Pidgey',['tackle'],'Keen Eye'));learnRest(gw,1);const mimic=read(gw).pp.mimic;
 await turn(gw,'move 1');assert.equal(request(gw).active[0].moves[0].id,'tackle');assert.equal(read(gw).pp.mimic,mimic-1);const copied=request(gw).active[0].moves[0].pp;
 await turn(gw,'move 1');assert.equal(request(gw).active[0].moves[0].pp,copied-1);assert.equal(read(gw).pp.mimic,mimic-1);assert.equal(read(gw).pp.tackle,undefined);
 const events=await turn(gw,'move 2');assert(events.some(e=>e.type==='move'&&e.args[1]==='Rest'));assert.equal(read(gw).status,'slp');assert.equal(request(gw).active[0].moves[1].pp,9);
 assert.equal(read(gw).pp.rest,9);assert.equal(read(gw).pp.mimic,mimic-1);assert.equal(read(gw).pp.tackle,undefined);
});


test('learning while already Transformed keeps temporary PP off the permanent slot through restore and switch-back',async()=>{
 let gw=await open([mon('A','Ditto',['transform'],'Limber'),mon('R','Snorlax',['splash'])],mon('B','Snorlax',['splash']));
 const events=await turn(gw,'move 1');assert(events.some(e=>e.type==='-transform'));assert.equal(request(gw).active[0].moves[0].id,'splash');
 learnRest(gw,0);gw=await G.fromCheckpoint(gw.checkpoint());assert.equal(request(gw).active[0].moves[0].id,'rest');assert.equal(read(gw).pp.rest,10);
 await turn(gw,'move 1');assert.equal(request(gw).active[0].moves[0].pp,9);assert.equal(read(gw).pp.rest,10,'a use while transformed is temporary, even after a public growth installation');
 await turn(gw,'switch 2');const back=request(gw).side.pokemon.findIndex(m=>m.ident==='p1: A');await turn(gw,'switch '+(back+1));
 assert.equal(request(gw).active[0].moves[0].id,'rest');assert.equal(request(gw).active[0].moves[0].pp,10);assert.equal(read(gw).pp.rest,10);
});
