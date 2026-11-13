'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), path=require('node:path'),fs=require('node:fs');
const observe=value=>{if(process.env.PF_INITIAL_FIELD_OBSERVATIONS)fs.appendFileSync(process.env.PF_INITIAL_FIELD_OBSERVATIONS,JSON.stringify(value)+'\n');};
const {gateway:G}=require('../../../js/engine/build/production.cjs');
const root=path.resolve(__dirname,'../../..');
const normalizeClock=messages=>messages.map(m=>m.kind!=='events'?m:{...m,events:m.events.map(e=>{if(e.type!=='t:')return e;assert.equal(e.args.length,1);assert.match(e.args[0],/^\d+$/);assert.equal(e.raw,'|t:|'+e.args[0]);observe({kind:'excluded-engine-wall-clock',actual:e});return{...e,args:['TIME'],raw:'|t:|TIME'};})});
const set=(name,moves=['Splash'],ability='Run Away',species='Snorlax',item='')=>({name,species,moves,ability,item,level:100,nature:'Hardy',evs:{hp:252,def:252,spd:252}});
async function create(initialField,p=set('P1'),f=set('F1'),rest=[],seed=[1,2,3,4]){
 const opts={engineRoot:path.join(root,'js/engine/showdown'),formatid:'gen8rpgcustomgame',seed,players:[{name:'Player',team:[p,...rest]},{name:'Trainer',team:[f]}],...(initialField===undefined?{}:{initialField})};
 const gw=await G.BattleGateway.create(opts);await gw.choose('p1','team '+[p,...rest].map((_,i)=>i+1).join(''));await gw.choose('p2','team 1');const opening=gw.drain();return{gw,b:gw._debugBattle(),opts,opening};
}
async function turn(s,a='move 1',b='move 1'){assert.equal(await s.gw.choose('p1',a),true);assert.equal(await s.gw.choose('p2',b),true);return s.gw.drain();}
const weather={none:'',sun:'sunnyday',rain:'raindance',sandstorm:'sandstorm',hail:'hail',harshsun:'desolateland',heavyrain:'primordialsea',strongwinds:'deltastream'};
const terrain={none:'',electric:'electricterrain',grassy:'grassyterrain',misty:'mistyterrain',psychic:'psychicterrain'};
for(const [name,id]of Object.entries(weather))test('IF02 initial weather '+name,async()=>{const s=await create({weather:name});assert.equal(s.b.field.weather,id);if(id){assert.equal(s.b.field.weatherState.duration,undefined);assert.equal(s.b.field.weatherState.source,undefined);assert.match(JSON.stringify(s.opening),/-weather/);}});
for(const[name,id]of Object.entries(terrain))test('IF03 initial terrain '+name,async()=>{const s=await create({terrain:name});assert.equal(s.b.field.terrain,id);if(id){assert.equal(s.b.field.terrainState.duration,undefined);assert.equal(s.b.field.terrainState.source,undefined);}});
for(const name of ['harshsun','heavyrain','strongwinds'])test('W01 '+name+' rejects native Drought and ordinary move',async()=>{const s=await create({weather:name},set('P1',['Rain Dance']),set('F1',['Splash'],'Drought'));assert.equal(s.b.field.weather,weather[name]);const pp=s.gw.readState('p1')[0].pp.raindance;const m=await turn(s);assert.equal(s.b.field.weather,weather[name]);assert.equal(s.gw.readState('p1')[0].pp.raindance,pp-1);assert.match(JSON.stringify(m),/-fail/);});
test('W03 stored primal guard survives Cloud Nine suppression',async()=>{const s=await create({weather:'harshsun'},set('P1',['Rain Dance']),set('F1',['Splash'],'Cloud Nine'));assert.equal(s.b.field.effectiveWeather(),'');await turn(s);assert.equal(s.b.field.weather,'desolateland');});
test('W04 legal primal swap and source ending restore default',async()=>{const s=await create({weather:'harshsun'},set('P1',['Splash'],'Primordial Sea'),set('F1'),[set('P2')]);assert.equal(s.b.field.weather,'primordialsea');await turn(s,'switch 2');assert.equal(s.b.field.weather,'desolateland');assert.equal(s.b.field.weatherState.duration,undefined);});
test('W05 ordinary default permits native Drought',async()=>{const s=await create({weather:'rain'},set('P1'),set('F1',['Splash'],'Drought'));assert.equal(s.b.field.weather,'sunnyday');assert.equal(s.b.field.weatherState.duration,5);});
test('IF04 temporary rain expiry restores sand and same-turn residual exactly once',async()=>{const s=await create({weather:'sandstorm'},set('P1',['Rain Dance','Splash']));await turn(s);assert.equal(s.b.field.weather,'raindance');for(let i=0;i<3;i++)await turn(s,'move 2');const before=s.b.sides[0].active[0].hp;const m=await turn(s,'move 2');assert.equal(s.b.field.weather,'sandstorm');assert.equal(s.b.field.weatherState.duration,undefined);assert.equal(before-s.b.sides[0].active[0].hp,Math.floor(s.b.sides[0].active[0].maxhp/16));assert.match(JSON.stringify(m),/Sandstorm/);for(let i=0;i<6;i++)await turn(s,'move 2');assert.equal(s.b.field.weather,'sandstorm');});
test('IF05 temporary terrain naturally restores default; Defog removes it without restoration',async()=>{const s=await create({terrain:'grassy'},set('P1',['Electric Terrain','Splash','Defog']));await turn(s);for(let i=0;i<4;i++)await turn(s,'move 2');assert.equal(s.b.field.terrain,'grassyterrain');assert.equal(s.b.field.terrainState.duration,undefined);await turn(s,'move 3');assert.equal(s.b.field.terrain,'');});
test('IF01 all-none preserves complete raw/PRNG/state against omitted options',async()=>{const a=await create(),b=await create({weather:'none',terrain:'none',environment:'none'});const norm=normalizeClock;assert.deepEqual(norm(a.opening),norm(b.opening));assert.deepEqual(norm(await turn(a)),norm(await turn(b)));assert.equal(a.b.prng.getSeed(),b.b.prng.getSeed());assert.deepEqual(a.gw.readState('p1'),b.gw.readState('p1'));});
const envs={none:['Normal','Tri Attack'],grass:['Grass','Energy Ball'],tallgrass:['Grass','Energy Ball'],movingwater:['Water','Hydro Pump'],stillwater:['Water','Hydro Pump'],puddle:['Water','Mud Bomb'],underwater:['Water','Hydro Pump'],cave:['Rock','Power Gem'],rock:['Ground','Earth Power'],sand:['Ground','Earth Power'],forest:['Bug','Energy Ball'],forestgrass:['Bug','Energy Ball'],snow:['Ice','Ice Beam'],ice:['Ice','Ice Beam'],volcano:['Fire','Lava Plume'],graveyard:['Ghost','Shadow Ball'],sky:['Flying','Air Slash'],space:['Dragon','Draco Meteor'],ultraspace:['Psychic','Psyshock']};
for(const[env,[type,move]]of Object.entries(envs))test('IF07 environment '+env+' real Nature Power / Camouflage',async()=>{const s=await create({environment:env},set('P1',['Nature Power','Camouflage']));const pp=s.gw.readState('p1')[0].pp.naturepower;const messages=await turn(s);assert.match(JSON.stringify(messages),new RegExp(move));assert.equal(s.gw.readState('p1')[0].pp.naturepower,pp-1);await turn(s,'move 2');assert.deepEqual(s.b.sides[0].active[0].getTypes(),[type]);});
for(const[name,called]of [['electric','Thunderbolt'],['grassy','Energy Ball'],['misty','Moonblast'],['psychic','Psychic']])test('IF07 native terrain precedence '+name,async()=>{const s=await create({terrain:name,environment:'volcano'},set('P1',['Nature Power']));assert.match(JSON.stringify(await turn(s)),new RegExp(called));});
async function secondarySample({environment='cave',ability='Parental Bond',foeAbility='Run Away',item='',sourceHp,foeHp,sub=false,terrain,seed}={}){
 const s=await create({environment,...(terrain?{terrain}:{})},set('P1',['Secret Power','Splash'],ability,'Kangaskhan'),set('F1',sub?['Substitute','Splash']:['Splash'],foeAbility,'Snorlax',item),[],seed);
 if(sub)await turn(s,'move 2');if(sourceHp)s.gw.seedState('p1',[{id:'P1',hp:sourceHp}]);if(foeHp)s.gw.seedState('p2',[{id:'F1',hp:foeHp}]);
 const draws=[],returns=[];let depth=0;const native=s.b.random,secondary=s.b.actions.secondaries,event=s.b.runEvent;
 s.b.random=function(...args){const result=native.apply(this,args);if(depth&&args[0]===100)draws.push({args,result});return result;};
 s.b.actions.secondaries=function(...args){depth++;try{return secondary.apply(this,args);}finally{depth--;}};
 s.b.runEvent=function(...args){const result=event.apply(this,args);if(args[0]==='ModifySecondaries')returns.push({hit:args[3]?.hit,pb:args[3]?.multihitType,values:JSON.parse(JSON.stringify(result))});return result;};
 let messages;try{messages=await turn(s,'move 1',sub?'move 2':'move 1');}finally{s.b.random=native;s.b.actions.secondaries=secondary;s.b.runEvent=event;}
 observe({kind:'native-secondary',environment,ability,foeAbility,item,sub,sourceHp,foeHp,terrain,draws,returns,messages,sourceFinal:s.b.sides[0].pokemon[0].hp,targetFinal:s.b.sides[1].pokemon[0].hp,seedFinal:s.b.prng.getSeed()});
 return{...s,draws,returns,messages};
}
test('S01 PB flinch executes one native environment draw after two actual hits',async()=>{const s=await secondarySample();assert.equal(s.draws.length,1,JSON.stringify(s.returns));assert.match(JSON.stringify(s.messages),/hitcount.*2/);assert.equal(s.returns.at(-1).values[0].chance,30);});
test('S02 PB sleep has one chance draw, independent from sleep duration RNG',async()=>{const s=await secondarySample({environment:'grass'});assert.equal(s.draws.length,1,JSON.stringify(s.returns));assert.equal(s.returns.at(-1).values[0].status,'slp');assert.match(JSON.stringify(s.messages),/hitcount.*2/);});
test('S03 Sheer Force deletes environment secondary before native damage calculation',async()=>{const s=await secondarySample({ability:'Sheer Force'});assert.equal(s.draws.length,0);assert.equal(s.returns.length,0);const normal=await secondarySample({ability:'Run Away'});assert.ok(s.gw.readState('p2')[0].hp<normal.gw.readState('p2')[0].hp);});
test('S04 Serene Grace doubles the same definition to 60 before one native evaluation',async()=>{const s=await secondarySample({ability:'Serene Grace'});assert.equal(s.draws.length,1);assert.equal(s.returns.at(-1).values[0].chance,60);});
test('S05 wholly absorbed Substitute has no environment opportunity',async()=>{const s=await secondarySample({sub:true});assert.equal(s.draws.length,0,JSON.stringify(s.returns));assert.ok(s.b.sides[1].active[0].volatiles.substitute);});
test('S06 first-hit KO has no secondary opportunity',async()=>{const s=await secondarySample({foeHp:1});assert.equal(s.draws.length,0);assert.equal(s.gw.ended,true);});
test('S07 qualified Jaboca Berry first-hit source KO ends actual PB loop, living body still evaluated once',async()=>{const s=await secondarySample({environment:'grass',item:'Jaboca Berry',sourceHp:1});assert.equal(s.b.sides[0].pokemon[0].hp,0);assert.ok(s.b.sides[1].pokemon[0].hp>0);assert.match(JSON.stringify(s.messages),/Jaboca Berry/);assert.match(JSON.stringify(s.messages),/hitcount.*1/);assert.equal(s.draws.length,1,JSON.stringify(s.returns));});
test('S08 none and terrain preserve native PB opportunity and entire engine PRNG',async()=>{for(const field of [{},{terrain:'electric'},{terrain:'grassy'},{terrain:'misty'},{terrain:'psychic'}]){const native=await create(field,set('P1',['Secret Power'],'Parental Bond','Kangaskhan')),active=await create({...field,environment:field.terrain?'cave':'none'},set('P1',['Secret Power'],'Parental Bond','Kangaskhan'));assert.deepEqual(normalizeClock(await turn(native)),normalizeClock(await turn(active)));assert.deepEqual(native.gw.readState('p1'),active.gw.readState('p1'));assert.deepEqual(native.gw.readState('p2'),active.gw.readState('p2'));assert.equal(native.b.prng.getSeed(),active.b.prng.getSeed());}});
test('IF09 snapshot/checkpoint restore covered field without replay; expiry and hook identity remain',async()=>{const s=await create({weather:'sandstorm',terrain:'grassy',environment:'cave'},set('P1',['Rain Dance','Electric Terrain','Splash']));await turn(s);await turn(s,'move 2');const events=s.b.events;const token=s.gw.checkpoint();const snapshot=s.gw.snapshot();assert.equal(s.b.events,events);assert.doesNotMatch(JSON.stringify(snapshot),/onSetWeather|onModifySecondaries/);const naked=await G.BattleGateway.restore(snapshot,{engineRoot:s.opts.engineRoot});assert.deepEqual(naked.drain(),[]);const restored=await G.showdownDriverFactory.fromCheckpoint(token);const r={gw:restored,b:restored._debugBattle()};assert.equal(r.b.field.weather,'raindance');assert.equal(r.b.field.terrain,'electricterrain');assert.deepEqual(restored.drain(),[]);assert.equal(r.b.events.onSetWeather.length,1);for(let i=0;i<4;i++){const a=await turn(s,'move 3'),b=await turn(r,'move 3');assert.deepEqual(a,b);}assert.equal(r.b.field.weather,'sandstorm');assert.equal(r.b.field.terrain,'grassyterrain');assert.equal(r.b.prng.getSeed(),s.b.prng.getSeed());await assert.rejects(G.BattleGateway.restore(snapshot,{engineRoot:s.opts.engineRoot,initialField:{weather:'sun'}}));});
test('IF10 invalid config rejected before sim construction, cross-battle defaults never leak',async()=>{for(const invalid of [null,[],{weather:'Snow'},{weather:'shadow'},{extra:1},{terrain:1}])await assert.rejects(G.BattleGateway.create({initialField:invalid,engineRoot:'/not-an-engine'}),/initialField/);const a=await create({weather:'rain'}),b=await create();assert.equal(a.b.field.weather,'raindance');assert.equal(b.b.field.weather,'');});

const effects={grass:{status:'slp'},tallgrass:{status:'slp'},movingwater:{boosts:{atk:-1}},stillwater:{boosts:{atk:-1}},puddle:{boosts:{spe:-1}},underwater:{boosts:{atk:-1}},cave:{volatileStatus:'flinch'},rock:{boosts:{accuracy:-1}},sand:{boosts:{accuracy:-1}},forest:{status:'slp'},forestgrass:{status:'slp'},snow:{status:'frz'},ice:{status:'frz'},volcano:{status:'brn'},graveyard:{volatileStatus:'flinch'},sky:{boosts:{spe:-1}},space:{volatileStatus:'flinch'},ultraspace:{boosts:{def:-1}}};
for(const[environment,effect]of Object.entries(effects))test('IF08 actual native secondary definition '+environment,async()=>{const s=await secondarySample({environment,ability:'Run Away'});assert.equal(s.draws.length,1);assert.deepEqual(s.returns.at(-1).values,[{chance:30,...effect}]);});
test('IF08 native Shield Dust still rejects delayed environment effect',async()=>{const s=await secondarySample({foeAbility:'Shield Dust'});assert.equal(s.draws.length,0);assert.deepEqual(s.returns.at(-1).values,[]);});
test('IF09 atomic serializer excludes only owned hooks and restores exact table on throw',async()=>{const s=await create({weather:'rain',environment:'cave'}),extension=require(path.join(root,'js/engine/showdown/dist/config/custom-formats.js')).initialFields;const callback=()=>{};s.b.onEvent('ModifyMove',s.b.format,3,callback);const original=s.b.events,thirdParty=original.onModifyMove.at(-1);assert.throws(()=>extension.snapshot(s.b,()=>{assert.deepEqual(s.b.events.onModifyMove,[thirdParty]);assert.equal(s.b.events.onSetWeather,undefined);throw Error('serializer fault');}),/serializer fault/);assert.equal(s.b.events,original);extension.attach(s.b);assert.equal(original.onSetWeather.length,1);assert.equal(original.onModifyMove.length,2);});

test('IF09 restored primal gate and environment native callbacks work before and after checkpoint',async()=>{const s=await create({weather:'harshsun',environment:'cave'},set('P1',['Secret Power','Rain Dance'],'Parental Bond','Kangaskhan'));for(let n=0;n<2;n++){const restored=await G.showdownDriverFactory.fromCheckpoint(s.gw.checkpoint()),r={gw:restored,b:restored._debugBattle()};assert.equal(r.b.events.onModifyMove.length,1);await turn(r,'move 2');assert.equal(r.b.field.weather,'desolateland');let opportunities=0,depth=0;const random=r.b.random,secondary=r.b.actions.secondaries;r.b.random=function(...args){const result=random.apply(this,args);if(depth&&args[0]===100)opportunities++;return result;};r.b.actions.secondaries=function(...args){depth++;try{return secondary.apply(this,args);}finally{depth--;}};try{await turn(r);assert.equal(opportunities,1);}finally{r.b.random=random;r.b.actions.secondaries=secondary;}}});

test('IF05 native Steel Roller directly removes infinite default terrain without restarting it',async()=>{const s=await create({terrain:'grassy'},set('P1',['Steel Roller']));const pp=s.gw.readState('p1')[0].pp.steelroller;await turn(s);assert.equal(s.b.field.terrain,'');assert.equal(s.gw.readState('p1')[0].pp.steelroller,pp-1);});
test('IF07 Camouflage same-type failure retains native type and normal PP',async()=>{const s=await create({environment:'cave'},set('P1',['Camouflage']));await turn(s);const pp=s.gw.readState('p1')[0].pp.camouflage;const m=await turn(s);assert.deepEqual(s.b.sides[0].active[0].getTypes(),['Rock']);assert.equal(s.gw.readState('p1')[0].pp.camouflage,pp-1);assert.match(JSON.stringify(m),/-fail/);});

test('W02/W03 full 3 stored primal × 4 ordinary move gate, with both native suppressors',async()=>{for(const weather of['harshsun','heavyrain','strongwinds'])for(const move of['Sunny Day','Rain Dance','Sandstorm','Hail'])for(const suppressor of['Run Away','Cloud Nine','Air Lock']){const s=await create({weather},set('P1',[move]),set('F1',['Splash'],suppressor)),id=move.toLowerCase().replace(/ /g,''),pp=s.gw.readState('p1')[0].pp[id];const messages=await turn(s);assert.equal(s.b.field.weather,({harshsun:'desolateland',heavyrain:'primordialsea',strongwinds:'deltastream'})[weather]);assert.equal(s.gw.readState('p1')[0].pp[id],pp-1);assert.match(JSON.stringify(messages),/-fail/);observe({kind:'stored-weather-gate',weather,move,suppressor,messages});}});
test('IF10 unsupported format rejects before loading/constructing the simulator',async()=>{await assert.rejects(G.BattleGateway.create({engineRoot:'/not-an-engine',formatid:'gen8rpgdoublescustomgame',initialField:{weather:'rain'}}),/initial-field-requires-rpg-singles/);});


// Terrain restoration has two transitions: native clear -> none, then default -> active.
// Observation delegates every native dispatch unchanged; it never supplies a random result.
function recordTerrainPasses(s) {
 const native=s.b.eachEvent,passes=[];
 s.b.eachEvent=function(name,...args){
  if(name==='TerrainChange')passes.push(this.field.terrain);
  return native.call(this,name,...args);
 };
 return{passes,stop(){s.b.eachEvent=native;}};
}
async function beforeTerrainExpiry(s){
 await turn(s);
 for(let i=0;i<3;i++)await turn(s,'move 2');
 assert.equal(s.b.field.terrainState.duration,1);
}
for(const [defaultTerrain,temporary]of[
 ['grassy','Electric Terrain'],['electric','Misty Terrain'],
 ['misty','Psychic Terrain'],['psychic','Grassy Terrain'],
])test('IF05 notification once per transition on natural '+defaultTerrain+' restoration',async()=>{
 const s=await create({terrain:defaultTerrain},set('P1',[temporary,'Splash']));
 await beforeTerrainExpiry(s);
 const trace=recordTerrainPasses(s);
 try{
  await turn(s,'move 2');
  assert.deepEqual(trace.passes,['',terrain[defaultTerrain]]);
  assert.equal(s.b.field.terrain,terrain[defaultTerrain]);
  assert.equal(s.b.field.terrainState.duration,undefined);
  assert.equal(s.b.field.terrainState.source,undefined);
  assert.equal(s.b.field.terrainState.sourceSlot,undefined);
  trace.passes.length=0;
  await turn(s,'move 2');
  assert.deepEqual(trace.passes,[],'infinite default has no repeated change');
 }finally{trace.stop();}
});

test('IF05 normal Mimicry callback observes clear and restored terrain exactly once',async()=>{
 const s=await create({terrain:'grassy'},set('P1',['Electric Terrain','Splash']),
  set('F1',['Splash'],'Mimicry','Stunfisk-Galar'));
 assert.deepEqual(s.b.sides[1].active[0].getTypes(),['Grass']);
 await beforeTerrainExpiry(s);
 assert.deepEqual(s.b.sides[1].active[0].getTypes(),['Electric']);
 const native=s.b.runEvent,callbacks=[];
 s.b.runEvent=function(name,target,...args){
  const current=this.field.terrain,result=native.call(this,name,target,...args);
  if(name==='TerrainChange'&&target?.name==='F1')callbacks.push({terrain:current,types:target.getTypes()});
  return result;
 };
 try{
  const messages=await turn(s,'move 2');
  assert.deepEqual(callbacks,[{terrain:'',types:['Ground','Steel']},{terrain:'grassyterrain',types:['Grass']}]);
  assert.deepEqual(s.b.sides[1].active[0].getTypes(),['Grass']);
  assert.match(JSON.stringify(messages),/Mimicry/);
 }finally{s.b.runEvent=native;}
});

// Independent single-notification control uses the pinned engine's own setter after its own clear.
// Native setTerrain requires a source; this synthetic control supplies its actual active user,
// then removes finite/source metadata to model the source-less infinite default. Product code
// must not use this source-bearing setter for defaults. No random, speed or queue is overwritten.
function useNativeTerrainControl(s,defaultId){
 const field=s.b.field,nativeClear=Object.getPrototypeOf(field).clearTerrain;
 Object.defineProperty(field,'clearTerrain',{configurable:true,value:function(){
  const expired=this.terrainState.duration===0,result=nativeClear.call(this);
  if(result&&expired&&!this.terrain){
   assert.equal(this.setTerrain(defaultId,s.b.sides[0].active[0]),true);
   delete this.terrainState.duration;
   delete this.terrainState.source;
   delete this.terrainState.sourceSlot;
  }
  return result;
 }});
}
async function terrainTiePair(){
 const make=()=>create({terrain:'grassy'},set('P1',['Electric Terrain','Splash']),set('F1'),[],[1,2,3,4]);
 const actual=await make(),control=await make();
 useNativeTerrainControl(control,'grassyterrain');
 assert.deepEqual(normalizeClock(actual.opening),normalizeClock(control.opening));
 for(const s of[actual,control]){
  const [p,f]=s.b.getAllActive();
  assert.equal(p.speed,f.speed);assert.equal(p.item,'');assert.equal(f.item,'');
  assert.equal(p.ability,'runaway');assert.equal(f.ability,'runaway');
 }
 for(let i=0;i<4;i++){
  const move=i?'move 2':'move 1';
  assert.deepEqual(normalizeClock(await turn(actual,move)),normalizeClock(await turn(control,move)));
  assert.equal(actual.b.prng.getSeed(),control.b.prng.getSeed());
 }
 assert.equal(actual.b.field.terrainState.duration,1);
 assert.deepEqual(normalizeClock(await turn(actual,'move 2')),normalizeClock(await turn(control,'move 2')));
 return{actual,control};
}
test('IF05 same-speed itemless expiry preserves PRNG against one native restoration',async()=>{
 const{actual,control}=await terrainTiePair();
 assert.equal(actual.b.prng.getSeed(),control.b.prng.getSeed());
 for(const side of['p1','p2'])assert.deepEqual(actual.gw.readState(side),control.gw.readState(side));
});
test('IF05 same-speed itemless next-turn move order matches one native restoration',async()=>{
 const{actual,control}=await terrainTiePair();
 const a=await turn(actual,'move 2'),b=await turn(control,'move 2');
 const order=messages=>messages.flatMap(m=>m.kind==='events'?m.events:[]).filter(e=>e.type==='move').map(e=>e.args[0]);
 assert.equal(order(a).length,2);
 assert.deepEqual(order(a),order(b));
 assert.deepEqual(normalizeClock(a),normalizeClock(b));
 assert.equal(actual.b.prng.getSeed(),control.b.prng.getSeed());
});

test('IF05 no-default natural expiry and direct removal retain only native clear notification',async()=>{
 const noDefault=await create(undefined,set('P1',['Electric Terrain','Splash']));
 await beforeTerrainExpiry(noDefault);
 const natural=recordTerrainPasses(noDefault);
 try{await turn(noDefault,'move 2');assert.deepEqual(natural.passes,['']);assert.equal(noDefault.b.field.terrain,'');}
 finally{natural.stop();}
 for(const move of['Defog','Steel Roller']){
  const s=await create({terrain:'grassy'},set('P1',[move]));
  const trace=recordTerrainPasses(s);
  try{await turn(s);assert.deepEqual(trace.passes,['']);assert.equal(s.b.field.terrain,'');}
  finally{trace.stop();}
 }
});
test('IF09 checkpoint rebind preserves one clear and one restoration notification',async()=>{
 const original=await create({terrain:'grassy'},set('P1',['Electric Terrain','Splash']));
 await beforeTerrainExpiry(original);
 const gw=await G.showdownDriverFactory.fromCheckpoint(original.gw.checkpoint());
 const restored={gw,b:gw._debugBattle()},trace=recordTerrainPasses(restored);
 assert.deepEqual(gw.drain(),[]);
 try{
  assert.deepEqual(normalizeClock(await turn(original,'move 2')),normalizeClock(await turn(restored,'move 2')));
  assert.deepEqual(trace.passes,['','grassyterrain']);
  assert.equal(original.b.prng.getSeed(),restored.b.prng.getSeed());
 }finally{trace.stop();}
});
