'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('fishing');
// Actual App + production fishing presentation/native slot + production encounter rules. No NW or player data.
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const { fixture, flush } = require('./fishing-real-parent-fixtures.cjs');
const F = require('../3/fixtures-migration7/fixtures.cjs');
const E = require(process.env.PF_E1_PARENT_ENGINE);
const { runWeatherCommand } = require(path.join(process.env.PF_E1_PARENT_OUT, 'src/plugins/world/world-weather-mz.js'));
const copy = x => structuredClone(x);
const generation = [100,1,65536,65536,32,32,32,32,32,32];
function world(options = {}) {
  return fixture({ party: [F.member('P1', { hp:20, friendship:70 })], ...options, editContent(content) {
    if (!options.content) { content.moves.tackle = content.moves.Tackle; for (const [name,s] of Object.entries(content.species)) { s.ruleSpecies='Fixture'+name; s.types=['Normal']; s.wildItemCommon=[]; s.wildItemUncommon=[]; s.wildItemRare=[]; } }
    options.editContent?.(content);
  } });
}
async function caught(h) { const {promise}=await h.start(); h.window(); h.input(1,{confirm:true}); h.finish(); return promise; }
for (const rod of [1,2,3]) for (const entry of ['bag','shortcut']) test(`actual ${entry} rod${rod} producer -> identity admission -> one generated foe`,async()=>{
  const h=world({rod,entry}), admit=h.app.admitWorldBattle.bind(h.app), retire=h.app.world.retireToBattle.bind(h.app.world);let parent,offer,transitions=0;
  h.app.admitWorldBattle=(p,o)=>{parent=p;offer=o;assert(h.app.saveBlocked);assert.throws(()=>h.app.beginInventoryOperation(),/active/);return admit(p,o);};
  h.app.world.retireToBattle=(p,o)=>{assert(h.app.op,'battle reserved before retiring field parent');transitions++;return retire(p,o);};
  const result=await caught(h);assert.equal(result.status,'battle-admitted',JSON.stringify(result));assert.equal(transitions,1);assert.equal(h.sessions.length,0);
  assert.deepEqual(h.draws,[6,100,6,100,...generation]);assert.equal(h.state.steps,0);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);
  assert.throws(()=>admit(parent,offer),/stale/);assert.throws(()=>admit({...parent},offer),/stale/);
  const duplicate=await h.app.runFieldItemHandoff(h.token);assert.equal(duplicate.admission,result.admission);assert.equal(h.statCommits.length,2);
  const before=[...h.draws],first=h.app.startAdmittedWorldBattle(result.admission),second=h.app.startAdmittedWorldBattle(result.admission);assert.equal(first,second);await first;
  assert.equal(h.sessions.length,1);assert.deepEqual(h.draws,before);assert.deepEqual(h.sessions[0].setup.worldCapture,{fishing:true,timeOfDay:2});
  assert.equal(h.sessions[0].setup.initialField.environment,'cave');assert.equal(h.sessions[0].setup.foes.length,1);assert.equal(h.sessions[0].setup.foes[0].species,'A');
  assert.equal(h.app.abortAdmittedWorldBattle(result.admission,'done').status,'aborted');assert.equal(h.app.saveBlocked,false);
});
test('fishing battle ledger collision suffix is deterministic with zero extra RNG and historical entry intact',async()=>{
  const h=world({editState(g){for(const id of ['world:field-item:0:1','world:field-item:0:1:1'])g.appliedBattles[id]={hash:'a'.repeat(64)};}}),r=await caught(h);
  assert.equal(r.status,'battle-admitted',JSON.stringify(r));assert.equal(r.admission.battleId,'world:field-item:0:1:2');assert.deepEqual(h.draws,[6,100,6,100,...generation]);assert.equal(h.state.appliedBattles['world:field-item:0:1'].hash,'a'.repeat(64));h.app.abortAdmittedWorldBattle(r.admission,'stop');
});
for(const change of ['cancel','generation','content','state','inventory','map','scene'])test('generation callback '+change+' keeps fishing prefix but cannot admit old offer',async()=>{
  let h,changed=false;h=world({onRandom(){if(!changed&&h.draws.length===5){changed=true;if(change==='cancel')h.cancel();else if(change==='generation')h.replaceGeneration();else if(change==='content')h.actual({...h.content,settings:{FISHING_AUTO_HOOK:true}});else if(change==='state')h.external(g=>{g.money=456;});else if(change==='inventory')h.external(g=>{g.inventory.pockets[7][0].quantity=0;});else if(change==='map')h.h.root.$gameMap.id=8;else h.h.root.SceneManager._scene={};}}});
  const r=await caught(h);assert(changed);assert.notEqual(r.status,'battle-admitted');assert.equal(h.sessions.length,0);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);assert.deepEqual(h.draws,[6,100,6,100,100]);if(change==='state')assert.equal(h.state.money,456);assert.equal(h.app.saveBlocked,false);
});
test('queued map8/map7/236 during child final effect drains in FIFO before actual C context; first R08 retained',async()=>{
  let h,once=false;h=world({onEffect(effect){if(effect.kind!=='finished'||once)return;once=true;
    h.h.root.$gameMap.id=8;assert.equal(h.app.observeWorldMapEntry({id:'m8',cause:'transfer',previousMapId:7,mapId:8,rebuilt:true}).status,'queued');
    h.h.root.$gameMap.id=7;assert.equal(h.app.observeWorldMapEntry({id:'m7',cause:'transfer',previousMapId:8,mapId:7,rebuilt:true}).status,'queued');
    const root=h.h.root,objects=fs.readFileSync(process.env.PF_MZ_OBJECTS,'utf8'),start=objects.indexOf('Game_Interpreter.prototype.command236 = function'),end=objects.indexOf('\n};',start);
    assert(start>=0&&end>start);vm.runInContext(objects.slice(start,end+4),root);const screen=[];root.$gameParty={inBattle:()=>false};root.$gameScreen={changeWeather(...args){screen.push(args);}};
    const interpreter=new root.Game_Interpreter(),params=['storm',5,60,true];
    const returned=runWeatherCommand({inBattle:()=>false,changeBusiness(intent){const outcome=h.app.setWorldWeather(intent);assert.equal(outcome.status,'queued');return outcome;},diagnose(reason){assert.fail(reason);}},params,()=>interpreter.command236(params));
    assert.equal(returned,true);assert.equal(interpreter._waitCount,60);assert.deepEqual(screen,[['storm',5,60]]);
  }});const r=await caught(h);assert.equal(r.status,'battle-admitted',JSON.stringify(r));assert.deepEqual(h.state.world.visitedMaps,[8,7]);assert.deepEqual(h.state.world.healingSpot,{mapId:8,x:1,y:1});assert.equal(h.state.world.weather.type,'Storm');
  assert.deepEqual(h.draws,[6,100,6,100,100,...generation]);await h.app.startAdmittedWorldBattle(r.admission);assert.equal(h.sessions[0].setup.initialField.weather,'rain');assert.equal(h.sessions[0].setup.initialField.terrain,'electric');
  h.app.abortAdmittedWorldBattle(r.admission,'done');const notices=h.app.flushWorldNotices();assert.deepEqual(notices.receipts.map(x=>[x.kind,x.mapId]),[['map-entry',8],['map-entry',7],['weather-command',undefined]]);
});
test('no able party and no loaded rod type never consume C candidate/generation random',async()=>{
  const h=world({party:[]}),r=await caught(h);assert.equal(r.status,'completed');assert.equal(r.admission,undefined);assert.deepEqual(h.draws,[6,100,6,100]);
  const no=world({noTable:true}),{promise}=await no.start();no.waiting();for(let n=0;n<40&&!no.settled;n++){no.finish();no.tick(1000);await flush();}const done=await promise;
  assert.equal(done.status,'completed');assert.equal(done.fishing.encounter,undefined);assert.deepEqual(no.draws,[6]);assert.equal(no.state.stats.fishing_battles,0);
});
test('actual admissions reject copied data and another application; late completion cannot replace successor',async()=>{
  const h=world(),r=await caught(h),other=world();await assert.rejects(h.app.startAdmittedWorldBattle({...r.admission}),/stale/);await assert.rejects(other.app.startAdmittedWorldBattle(r.admission),/stale/);
  h.replaceGeneration();await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/stale/);assert.equal(h.sessions.length,0);
});
test('copied intent and completion data do not authorize a field encounter or consume RNG',async()=>{
 let h,checked=false;h=world({onEffect(effect){if(effect.kind!=='finished'||checked)return;checked=true;const owner=h.app.world.owner,encounter={kind:'fishing',type:'OldRod',rod:1,mapId:7,facingEnvironment:{status:'value',value:'stillwater'},business:h.app.worldFacts()},fake={status:'completed',encounter,prefix:{countCommitted:true,battlesCommitted:true},cleanup:'completed'};
 const before=[...h.draws];assert.throws(()=>h.app.world.consumeFishingEncounter(owner,fake,encounter),/stale-fishing-intent/);assert.deepEqual(h.draws,before);
 }});const r=await caught(h);assert(checked);assert.equal(r.status,'battle-admitted');assert.equal(h.state.stats.fishing_battles,1);h.app.abortAdmittedWorldBattle(r.admission,'done');
});
test('fishing active request skips repel and ordinary chance/disabled gates without a step write',async()=>{
 const h=world({editState(g){g.world.repelSteps=250;}}),r=await caught(h);assert.equal(r.status,'battle-admitted');assert.deepEqual(h.draws,[6,100,6,100,...generation]);assert.equal(h.state.world.repelSteps,250);assert.equal(h.state.steps,0);h.app.abortAdmittedWorldBattle(r.admission,'done');
});
test('late factory resolution after fishing abort cannot replace successor or replay statistics',async()=>{
 let resolve,creates=0;const pending=new Promise(done=>{resolve=done;});const h=world({sessionFactory:{async create(){return ++creates===1?pending:{};}}}),r=await caught(h);const old=h.app.startAdmittedWorldBattle(r.admission);await flush();
 assert.equal(h.app.abortAdmittedWorldBattle(r.admission,'abort').status,'aborted');const successor=await h.app.startBattle({battleId:'successor',kind:'wild',foes:[{species:'A',level:5}],seq:0});resolve({});await assert.rejects(old,/aborted|late/);assert(successor);assert.equal(h.app.op.battleId,'successor');assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);assert(h.app.saveBlocked);
});
function sampleContent(){
 const source=path.resolve(__dirname,'../../../content/sample'),names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
 const input=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(source,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(source,n+'.json'),'utf8'))]));
 const pidgey=input.species.find(s=>s.id==='pidgey');Object.assign(pidgey,{catchRate:30,learnset:[{level:1,move:'splash'}],wildItemCommon:[],wildItemUncommon:[],wildItemRare:[]});input.species.find(s=>s.id==='snorlax').learnset=[{level:1,move:'splash'}];
 input.mapMetadata={source:'author-placeholder',maps:{7:{environment:'stillwater'}}};input.encounters={source:'author-placeholder',tables:[{mapId:7,version:0,types:{OldRod:{stepChance:0,slots:[{species:'pidgey',weight:100,minLevel:10,maxLevel:10}]}}}]};
 const built=E.contentCompile.compileContent(input);assert.equal(built.ok,true,JSON.stringify(built.errors));const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(built.data,dex);assert.deepEqual(assembled.errors,[]);return {content:assembled.content,dex};
}
for(const entry of ['throwBall','slots'])for(const ball of ['lureball','duskball'])test(`actual fishing production factory Showdown ${entry} ${ball} consumes business facts`,async()=>{
 const {content,dex}=sampleContent(),player=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},content,()=>0),content);
 const factory=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]});const h=world({content,dex,party:[player],hour:21,bag:{lureball:4,duskball:4},sessionFactory:factory});const r=await caught(h);assert.equal(r.status,'battle-admitted',JSON.stringify(r));const before=[...h.draws],session=await h.app.startAdmittedWorldBattle(r.admission);session.take();
 try{const out=entry==='throwBall'?await session.throwBall(ball):await session.chooseDoubles([{kind:'ball',ball,target:session.gw.activeId('p2'),ctx:{fishing:false,timeOfDay:0}}]);assert.equal(out.ok,true,JSON.stringify(out));const event=out.messages.flatMap(m=>m.events||[]).find(e=>e.type==='rpg'&&e.args[0]==='ball');assert(event);assert.equal(Number(event.args[7]),ball==='lureball'?50:30);assert.deepEqual(h.draws,before);assert.equal(h.state.steps,0);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);}finally{h.app.abortAdmittedWorldBattle(r.admission,'test complete');}
});
