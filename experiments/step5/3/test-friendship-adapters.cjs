'use strict';
// E1a adapter integration only. Actual source/core and built item paths; no C/D/F candidate consumer.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const E=require('../../../js/engine/build/engine.cjs');
const {setup,plan,count}=require('../2/ef-support.cjs');
const source=name=>import(pathToFileURL(path.resolve(__dirname,'../../../src/framework/rules',name+'.ts')).href);
const pure=source('friendship'),battle=source('battle-evidence');
const clone=x=>JSON.parse(JSON.stringify(x));
const battleMethods=['levelup','battleitem','faint','faintbad'];
const itemMethods=['vitamin','wing','evberry','powder','energyroot','revivalherb'];
const edges=[0,99,100,178,179,199,200,254,255];
const member=(h,{sameMap=false,luxuryBall=false,sootheBell=false}={})=>({friendship:h,item:sootheBell?'soothebell':'',ball:luxuryBall?'luxuryball':'',...(sameMap?{origin:{map:0}}:{})});
const mods=bits=>({sameMap:!!(bits&1),luxuryBall:!!(bits&2),sootheBell:!!(bits&4),affection:!!(bits&8)});

test('E1a battle four methods retain all modifier/tier combinations through the shared core',async()=>{
 const {planFriendshipChange}=await pure,{battleFriendshipValue}=await battle;
 for(const method of battleMethods)for(const h of edges)for(let bits=0;bits<16;bits++){
  const m=mods(bits),expected=planFriendshipChange(Object.freeze(member(h,m)),method,{mapId:m.sameMap?0:undefined,AFFECTION_EFFECTS:m.affection});
  assert.equal(expected.status,'ready');assert.equal(battleFriendshipValue(h,method,Object.freeze(m)),expected.after,`${method}/${h}/${bits}`);
 }
});
test('E1a item six methods retain actual map/ball/item identity and soft-cap cases',async()=>{
 const {planFriendshipChange}=await pure;
 for(const method of itemMethods)for(const h of edges)for(const mapId of [undefined,0,8])for(const origin of [undefined,{map:null},{map:0},{map:8}])for(const affection of [false,true]){
  const m={friendship:h,item:'SOOTHEBELL',ball:'LUXURYBALL',...(origin?{origin:{...origin}}:{})},before=clone(m),c={settings:{AFFECTION_EFFECTS:affection}},world=Object.freeze({mapId});
  const expected=planFriendshipChange(m,method,{mapId,AFFECTION_EFFECTS:affection});assert.equal(expected.status,'ready');
  E.itemEffects.changeFriendship(m,method,c,world);assert.deepEqual(m,{...before,friendship:expected.after});assert.deepEqual(c,{settings:{AFFECTION_EFFECTS:affection}});
 }
});
test('E1a decisive nonlinear chains keep order, floor and the evberry cap exception',async()=>{
 const {battleFriendshipValue}=await battle,all={sameMap:true,luxuryBall:true,sootheBell:true,affection:false};
 assert.equal(battleFriendshipValue(99,'battleitem',all),103);assert.equal(battleFriendshipValue(103,'levelup',all),112);
 const m={...member(99,all)},c={settings:{AFFECTION_EFFECTS:false}},values=[];
 for(const method of itemMethods){E.itemEffects.changeFriendship(m,method,c,{mapId:0});values.push(m.friendship);}
 // WP30 wing tier100..199 is2: floor((2+map1+ball1)*1.5)=6.
 assert.deepEqual(values,[109,115,125,120,110,95]);
 m.friendship=175;c.settings.AFFECTION_EFFECTS=true;E.itemEffects.changeFriendship(m,'vitamin',c,{mapId:0});assert.equal(m.friendship,179);
 E.itemEffects.changeFriendship(m,'evberry',c,{mapId:0});assert.equal(m.friendship,189);E.itemEffects.changeFriendship(m,'powder',c,{mapId:0});assert.equal(m.friendship,184);
 assert.equal(battleFriendshipValue(200,'battleitem',all),200,'zero base delta never acquires bonuses');
});
test('E1a adapter family boundaries do not expose all thirteen methods or prototype names',async()=>{
 const {battleFriendshipValue}=await battle;
 for(const method of ['walking','groom','machine',...battleMethods,'unknown','constructor','__proto__','toString']){
  const m=member(99),before=clone(m);assert.throws(()=>E.itemEffects.changeFriendship(m,method,{},{}),e=>e.reason==='unknown-friendship-method');assert.deepEqual(m,before);
 }
 for(const method of ['walking',...itemMethods,'unknown','constructor','__proto__'])assert.equal(battleFriendshipValue(99,method,mods(0)),null);
});
test('E1a trusted out-of-domain values keep battle skip versus item refusal and raw values',async()=>{
 const {battleFriendshipValue}=await battle;
 for(const h of [-1,256,1.5,NaN,Infinity]){
  for(const method of battleMethods)assert.equal(battleFriendshipValue(h,method,mods(15)),null);
  for(const method of [...itemMethods,'unknown']){const m=member(h);assert.throws(()=>E.itemEffects.changeFriendship(m,method,{},{}),e=>e.reason==='friendship-out-of-domain');assert.ok(Object.is(m.friendship,h));}
 }
 for(const h of [undefined,null,'70'])assert.equal(battleFriendshipValue(h,'levelup',mods(0)),null);
 const m={item:''};E.itemEffects.changeFriendship(m,'vitamin',{},{});assert.equal(m.friendship,75,'existing optional member value still defaults to70');
});
test('E1a actual field planning rejects invalid friendship without spending or mutating the original game',()=>{
 for(const id of ['protein','pomegberry','energypowder','energyroot','revivalherb']){
  const x=setup({bag:{[id]:2},edit:g=>{g.party[0].friendship=256;g.party[0].hp=id==='revivalherb'?0:1;g.party[0].evs.atk=0;}}),before=clone(x.game);
  assert.throws(()=>plan(x,id),e=>e.reason==='friendship-out-of-domain');assert.deepEqual(x.game,before);assert.equal(count(x.game,id,x.content),2);
 }
});
