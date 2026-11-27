'use strict';
require('../../../experiments/step5/5/regular-field-action-test-runtime.cjs').prepare('combined');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {fixture}=require('../../../experiments/step5/5/field-move-real-parent-fixtures.cjs');
function production(){
  const E=require(process.env.PF_E2_PARENT_ENGINE),source=path.resolve(__dirname,'../../../content/sample');
  const names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
  const input=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(source,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(source,n+'.json'),'utf8'))]));
  Object.assign(input.species.find(s=>s.id==='pidgey'),{catchRate:30,learnset:[{level:1,move:'splash'}],wildItemCommon:[],wildItemUncommon:[],wildItemRare:[]});
  input.species.find(s=>s.id==='snorlax').learnset=[{level:1,move:'splash'},{level:1,move:'rocksmash'},{level:1,move:'sweetscent'}];
  input.mapMetadata={source:'author-placeholder',maps:{7:{environment:'grass'}}};
  const slots=[{species:'pidgey',weight:100,minLevel:10,maxLevel:10}];input.encounters={source:'author-placeholder',tables:[{mapId:7,version:0,types:{Land:{stepChance:100,slots},RockSmash:{stepChance:100,slots},OldRod:{stepChance:0,slots}}}]};
  const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);
  const content=assembled.content,party=[E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},content,()=>0),content)];
  return {E,content,dex,party,sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]})};
}
for(const source of ['rocksmash','honey'])test('actual UI '+source+' -> registered admission -> productionSessionFactory/Showdown preserves source and once',async()=>{
  const p=production(),h=fixture({...p,moveId:source==='honey'?'sweetscent':'rocksmash',bag:{lureball:4,duskball:4},editState(g){g.inventory.registeredItems=['honey'];}});
  const selection=source==='honey'?{kind:'item',itemId:'honey'}:{kind:'move',moveId:'rocksmash',memberId:'P1'},prepared=h.app.prepareFieldShortcutSelection('shortcut',selection);assert.equal(prepared.status,'prepared');
  const outcome=await h.app.executeFieldShortcut(prepared.request);assert.equal(outcome.status,'accepted',JSON.stringify(outcome));const draws=[...h.draws],session=await h.app.startAdmittedWorldBattle(outcome.admission);session.take();
  assert.equal(await h.app.startAdmittedWorldBattle(outcome.admission),session);assert.equal(h.state.stats.rock_smash_battles,source==='rocksmash'?1:0);
  try {const result=await session.throwBall('lureball');assert.equal(result.ok,true,JSON.stringify(result));const event=result.messages.flatMap(m=>m.events||[]).find(e=>e.type==='rpg'&&e.args[0]==='ball');assert(event);assert.equal(Number(event.args[7]),10,'Lure Ball uses actual non-fishing producer');assert.deepEqual(h.draws,draws);assert.equal(h.state.steps,0);assert.equal(await h.app.executeFieldShortcut(prepared.request),outcome);}
  finally{h.app.abortAdmittedWorldBattle(outcome.admission,'done');}assert.equal(h.app.saveBlocked,false);
});
for(const entry of ['throwBall','slots'])test('actual UI fishing -> productionSessionFactory/Showdown '+entry+' gets the genuine fishing source',async()=>{
  const p=production(),h=require('../../../experiments/step5/5/fishing-real-parent-fixtures.cjs').fixture({...p,sessionFactory:p.sessions,shortcutRead:true,bag:{lureball:4},editState(g){g.inventory.registeredItems=['oldrod'];}});
  const prepared=h.app.prepareFieldShortcutSelection('shortcut',{kind:'item',itemId:'oldrod'});assert.equal(prepared.status,'prepared');const pending=h.app.executeFieldShortcut(prepared.request);await h.flush();h.window();h.input(1,{confirm:true});h.finish();
  const outcome=await pending;assert.equal(outcome.status,'accepted',JSON.stringify(outcome));assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,1);const before=[...h.draws],session=await h.app.startAdmittedWorldBattle(outcome.admission);session.take();
  try {const result=entry==='throwBall'?await session.throwBall('lureball'):await session.chooseDoubles([{kind:'ball',ball:'lureball',target:session.gw.activeId('p2'),ctx:{fishing:false,timeOfDay:0}}]);assert.equal(result.ok,true,JSON.stringify(result));const event=result.messages.flatMap(m=>m.events||[]).find(e=>e.type==='rpg'&&e.args[0]==='ball');assert(event);assert.equal(Number(event.args[7]),50,'caller DTO cannot erase the genuine fishing context');assert.deepEqual(h.draws,before);assert.equal(h.state.steps,0);}
  finally{h.app.abortAdmittedWorldBattle(outcome.admission,'done');}assert.equal(h.app.saveBlocked,false);
});
