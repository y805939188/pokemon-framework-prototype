'use strict';
// Pure observation oracle; public production data only, never an engine mutation.
const assert=require('node:assert/strict'),plan=require('./e-locked-turn-app-contracts.json');
const clone=v=>JSON.parse(JSON.stringify(v));
function view(s){return{p1:clone(s.gw.readState('p1')[0]),p2:clone(s.gw.readState('p2')[0]),work:clone(s.party[0]),request:clone(s.currentRequest())};}
const events=messages=>messages.flatMap(m=>m.kind==='events'?m.events:[]);
const p1=e=>e.args[0]==='p1a: '+plan.player.id||e.args[0]==='p1: '+plan.player.id;
const p2=e=>/^p2a?: /.test(e.args[0]??'');
function normalRequest(v){
 const moves=v.request.active[0].moves;
 assert.deepEqual(moves.map(m=>m.id),plan.playerMoves.map(m=>m.id));
 for(const m of moves){assert.equal(m.pp,v.p1.pp[m.id]);assert.equal(m.disabled,false);}
}
function lockedRequest(v,id){
 const moves=v.request.active[0].moves;assert.equal(moves.length,1);assert.equal(moves[0].id,id);
 assert.equal(moves[0].pp,undefined);assert(!moves[0].disabled);
}
function verifyTurn(row){
 const {before:b,after:a,phase}=row,ev=events(row.messages),move=phase.startsWith('dig')?'dig':phase.startsWith('hyper')?'hyperbeam':'splash';
 assert.equal(a.p1.id,plan.player.id);assert.equal(a.p1.hp,b.p1.hp);assert.equal(a.p1.status,'');assert(!a.p1.fainted);assert(a.p2.hp>0&&!a.p2.fainted);
 const cost=['dig-charge','hyper-attack','splash'].includes(phase)?1:0;
 for(const m of plan.playerMoves)assert.equal(a.p1.pp[m.id],b.p1.pp[m.id]-(m.id===move?cost:0),'exact player PP at '+phase+'/'+m.id);
 for(const m of a.work.moves)assert.equal(m.pp,a.p1.pp[m.id],'work PP agrees with live engine for '+m.id);
 assert.equal(a.p2.pp.splash,b.p2.pp.splash-1,'the real foe acted once');
 const attacks=ev.filter(e=>e.type==='move'&&p1(e)),damage=ev.filter(e=>e.type==='-damage'&&p2(e));
 if(phase==='dig-charge'){
  assert.equal(a.p2.hp,b.p2.hp);assert.equal(damage.length,0);assert.equal(attacks.length,1);assert.equal(attacks[0].args[1],'Dig');
  assert(ev.some(e=>e.type==='-prepare'&&p1(e)&&e.args[1]==='Dig'));lockedRequest(a,'dig');
 }else if(phase==='dig-attack'||phase==='hyper-attack'){
  assert(a.p2.hp<b.p2.hp,'ordinary attack must land in this frozen seed');assert.equal(damage.length,1);assert.equal(attacks.length,1);assert.equal(attacks[0].args[1],phase==='dig-attack'?'Dig':'Hyper Beam');
  assert(!ev.some(e=>e.type==='-prepare'&&p1(e)));
  if(phase==='dig-attack')normalRequest(a);else lockedRequest(a,'recharge');
 }else if(phase==='hyper-recharge'){
  assert.equal(a.p2.hp,b.p2.hp);assert.equal(damage.length,0);assert.equal(attacks.length,0);
  assert(ev.some(e=>e.type==='cant'&&p1(e)&&e.args[1]==='recharge'));normalRequest(a);
 }else if(phase==='splash'){
  assert.equal(a.p2.hp,b.p2.hp);assert.equal(damage.length,0);assert.equal(attacks.length,1);assert.equal(attacks[0].args[1],'Splash');normalRequest(a);
 }else assert.fail('unknown frozen phase '+phase);
}
module.exports={clone,view,events,normalRequest,lockedRequest,verifyTurn};
