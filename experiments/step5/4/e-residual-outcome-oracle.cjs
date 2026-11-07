'use strict';
const {assert,events,member,targets,verifyPP}=require('./e-residual-outcome-common.cjs');
function verify(c,rows){
 for(let i=0;i<c.turns.length;i++){
  const row=rows[i],p=member(row.after,'RES-P1'),ev=events(row);verifyPP(row,'RES-P1',c.turns[i]);
  assert.equal(p.hp,c.expectedHP[i],'exact combined residual HP at turn '+(i+1));
  const tox=ev.findIndex(e=>e.type==='-damage'&&targets(e,'RES-P1')&&e.args.some(v=>/\[from\] psn/.test(v)));
  assert(tox>=0,'actual toxic residual event');
  if(c.kind==='grass'){
   const heal=ev.findIndex(e=>e.type==='-heal'&&targets(e,'RES-P1')&&e.args.some(v=>/Grassy Terrain/i.test(v)));
   assert(heal>=0&&heal<tox,'actual Grassy Terrain heal precedes poison for this member');
  }else{
   const sand=ev.findIndex(e=>e.type==='-damage'&&targets(e,'RES-P1')&&e.args.some(v=>/Sandstorm/i.test(v)));
   if(i<4)assert(sand>=0&&sand<tox,'actual Sandstorm damage precedes poison');
   else{
    assert.equal(sand,-1,'fifth-turn weather expiry prevents weather damage');
    const weatherEnd=ev.findIndex(e=>e.type==='-weather'&&e.args[0]==='none');
    assert(weatherEnd>=0&&weatherEnd<tox,'fifth-turn natural weather end precedes poison');
   }
  }
 }
 if(c.exit==='abort'){
  const fresh=rows[c.turns.length],ev=events(fresh);assert.equal(member(fresh.after,'RES-P1').hp,c.initialHP);assert.equal(member(fresh.after,'RES-P1').status,'');
  assert(!ev.some(e=>e.type==='-damage'||e.type==='-weather'||e.type==='-status'),'old combined residuals cannot enter the fresh battle');
 }
}
module.exports={verify};
