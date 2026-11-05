'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs'), { installNativeSettings } = require('./battle-effects-settings-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-battle-effects-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code;
    else plugins[name] = name === 'PS_BattleFlow' && process.env.PF_EFFECTS_SCENE_TEST_PLUGIN ? fs.readFileSync(process.env.PF_EFFECTS_SCENE_TEST_PLUGIN, 'utf8') : code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({lang='en',player,legacy,override,command,afterOpen,fast=false,trainerLevel=3,foes=[{species:'Pidgey',level:3}]}={}) {
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true,beforeProduct:G=>installNativeSettings(G,ROOT)}});
 const G=h.G,flow=h.w.flow,content=fixture.musicNativeContent(E,assert),parameters=G.PluginManager.parameters;
 G.Bitmap.prototype.fillRect=()=>{};content.trainers['music-normal'][0].party[0].level=trainerLevel;
 G.PluginManager.parameters=function(name){const p=parameters.call(this,name);return name==='PS_BattleFlow'?{...p,language:lang}:p;};
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=fast;
 const data={...(legacy===undefined?{}:{battleEffects:legacy}),...(player===undefined?{}:{psBattleEffects:player})};G.ConfigManager.applyData(data);
 const state=fixture.musicNativeState(E,content);state.party=[E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'EFFECT-P1',species:'Snorlax',level:50},content,()=>0),content)];state.nextMemberOrdinal='2';state.inventory=E.inventory.inventoryFromBag({masterball:2,pokeball:2},E.itemCatalog.catalogOf(content));G.$gameSystem._psGame=state;
 const before=JSON.stringify(flow.game());let installs=0,doc=G.$gameSystem._psGame;Object.defineProperty(G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
 await h.p.toMapId(5,8,9);const request={kind:command==='StartTrainerBattle'?'trainer':'wild',...(command==='StartTrainerBattle'?{trainer:{id:'music-normal',version:1}}:{foes}),battleId:'effects-'+path.basename(h.w.root),seq:1,canLose:true,...(override===undefined?{}:{battleEffects:override})};
 if(command){const interpreter=new G.Game_Interpreter();h.w.commands['PS_BattleFlow:'+command].call(interpreter,{trainerId:'music-normal',version:'1',foes:foes.map(f=>f.species+':'+f.level).join(','),canLose:'true',...(override===undefined?{}:{battleEffects:override})});assert.equal(interpreter._waitMode,'psBattle');}else flow.openBattle(request);
 const op=flow._op;assert(op);assert.equal(installs,0);if(afterOpen)afterOpen({G,flow,op,request});
 await h.waitFor(()=>!!h.p.battle()?._session,'real Effects Scene Session');const s=h.p.battle();
 const completed=[],add=s._log.add;s._log.add=function(line){completed.push(line);return add.call(this,line);};
 return {...h,s,flow,op,request,before,completed,installs:()=>installs,cleanup(){if(flow.running)flow.abort(Error('owned Effects cleanup'));s.terminate();}};
}
async function ready(h){await h.p.inMode('main');assert.equal(h.s._failure,null);assert.equal(h.s.pictureState().effects,h.op.battleEffects);assert(h.s.pictureState().actors.filter(a=>a.body===1).length===2);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(h.installs(),0);}
for(const [command,player,rule,effective]of [
 ['StartBattle',false,'inherit',false],['StartBattle',false,'on',true],['StartBattle',true,'off',false],
 ['StartTrainerBattle',false,'inherit',false],['StartTrainerBattle',false,'on',true],['StartTrainerBattle',true,'off',false]
])test(command+' '+rule+' captures '+effective+' before opening; later settings and request do not change it',async()=>{
 const h=await open({command,player,override:rule,afterOpen({G,op}){assert.equal(op.battleEffects,effective);G.ConfigManager.psBattleEffects=!effective;op.request.battleEffects=!effective;}});try{await ready(h);assert.equal(h.op.battleEffects,effective);assert.equal(h.s.pictureState().effects,effective);}finally{h.cleanup();}
});
test('old missing config defaults On and missing new field migrates legacy Off into the actual Scene',async()=>{for(const [options,effective]of [[{},true],[{legacy:false},false],[{legacy:false,player:true},true]]){const h=await open(options);try{assert.equal(h.op.battleEffects,effective);await ready(h);}finally{h.cleanup();}}});
for(const lang of ['en','zh'])test(lang+' Effects off retains blocked ball, messages, HP/EXP, faint audio and one final data install',async()=>{
 const h=await open({lang,trainerLevel:40,command:'StartTrainerBattle',player:true,override:'off',afterOpen:({G,op})=>{G.ConfigManager.psBattleEffects=true;op.request.battleEffects=true;}});try{
  await ready(h);const s=h.s,session=s._session,start=JSON.parse(h.before),lead=start.party[0];
  s.act(()=>session.throwBall('masterball'),'item');await h.waitFor(()=>s.children.some(x=>x._psBallFeedback),'actual blocked ball starts after its preceding message');const ball=s.ballFeedbackState();assert.equal(ball.effects,false);assert.equal(ball.plan.outcome,'blocked');assert(!ball.animationDone);assert(s.children.some(x=>x._psBallFeedback));assert.equal(h.installs(),0);
  await h.p.inMode('main');assert(s.ballFeedbackState().animationDone);assert(!s.children.some(x=>x._psBallFeedback));assert(h.completed.some(line=>line===h.flow.translator().t('ball.blocked')));assert.equal(JSON.stringify(h.flow.game()),h.before);
  const samples=[],faintFlags=[],original=s._pictures.ports.prepareFaint;s._pictures.ports.prepareFaint=actor=>{const media=original(actor);faintFlags.push(media.snapshot().battleEffects);return media;};
  const paint=s._display.ports.paint;s._display.ports.paint=cards=>{samples.push(cards.map(c=>({...c})));return paint(cards);};
  let moves=0;for(;moves<6&&!session.finished;){moves++;s.act(()=>session.chooseMove(1),'move');await h.waitFor(()=>!s._busy,'real move resolves');if(!session.finished)await h.p.inMode('main');}
  assert(session.finished,'ordinary battle reaches its real terminal result');
  // Normal terminal paused messages deliberately do not auto-close (WP67-A §9.1).
  for(let i=0;i<8&&s._mode!=='end';i++){
   await h.waitFor(()=>s._mode==='end'||s._session.finished&&s.ordinaryMessageState()?.implementation==='paused-message-v1'&&s.ordinaryMessageState()?.phase==='full','normal terminal paused message');
   if(s._mode!=='end')await h.p.press('ok');
  }
  await h.p.inMode('end');
  const foeHP=samples.flatMap(cards=>cards.filter(c=>c.side==='p2').map(c=>c.hp));assert(foeHP.some(hp=>hp>0&&hp<Math.max(...foeHP)),'real KO still interpolates HP');
  const ratios=samples.flatMap(cards=>cards.filter(c=>c.side==='p1').map(c=>c.ratio));assert(new Set(ratios).size>2,'earned experience still interpolates '+JSON.stringify({ratios:[...new Set(ratios)],before:lead.exp,after:session.party[0].exp,foeLevel:session.foeTeam[0].level,audio:s.presentationState().audio}));assert.deepEqual(faintFlags,[false]);assert(s.presentationState().faintAudio.some(row=>row.kind==='faint-effect'));
  assert(s.pictureState().actors.every(a=>a.side!=='p2'));assert(session.finished);assert(session.party[0].exp>lead.exp);assert.equal(session.bag.masterball,1);assert.equal(session.party[0].moves[0].pp,lead.moves[0].pp-moves);assert.equal(h.installs(),0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  for(let i=0;i<8&&h.flow.running;i++){await h.frames(2);s.onMenuOk();}assert.equal(h.installs(),1,JSON.stringify({outcome:h.flow.lastOutcome,mode:s._mode,input:s.inputState(),pages:s._endFeedbackPages,failure:s._failure,errors:h.w.errors}));assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(h.flow.game().party[0].exp,session.party[0].exp);assert.equal(E.inventory.aggregateBag(h.flow.game().inventory).masterball,1);const saved=JSON.stringify(h.flow.game());h.flow.finish(session,h.op);assert.equal(h.installs(),1);assert.equal(JSON.stringify(h.flow.game()),saved);
 }finally{h.cleanup();}
});
test('Effects off retains actual successful capture, target hide and capture melody; abort installs no data',async()=>{
 const h=await open({player:false});try{await ready(h);const s=h.s;s.act(()=>s._session.throwBall('masterball'),'item');await h.waitFor(()=>!!s.ballFeedbackState(),'capture feedback');assert.equal(s.ballFeedbackState().effects,false);assert.equal(s.ballFeedbackState().plan.outcome,'caught');assert(!s.ballFeedbackState().animationDone);s.onEnd();assert.equal(h.installs(),0);await h.waitFor(()=>s.captureMelodyState()?.started,'actual capture melody');assert(s.ballFeedbackState().animationDone);assert(!s.captureMelodyState().completed);assert(s.children.some(x=>x._psBallFeedback));h.flow.abort(Error('controlled capture cancel'));await h.frames(2);assert(s.ballFeedbackState().cancelled);assert(!s.children.some(x=>x._psBallFeedback));assert.equal(h.installs(),0);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('invalid direct and both event overrides fail before a Scene or a sequence is allocated',async()=>{
 const h=await open({player:false});try{await ready(h);h.flow.abort(Error('prepare validation'));h.s.terminate();h.flow._op=null;await h.p.toMapId(5,8,9);const seq=h.G.$gameSystem._psBattleSeq,pushed=h.G.SceneManager._scene;
  for(const value of ['off',null,0])assert.throws(()=>h.flow.openBattle({kind:'wild',foes:[{species:'Pidgey',level:3}],seq:2,battleId:'bad',battleEffects:value}),/boolean/);
  for(const command of ['StartBattle','StartTrainerBattle'])for(const value of [false,'false','bad'])assert.throws(()=>h.w.commands['PS_BattleFlow:'+command].call(new h.G.Game_Interpreter(),{trainerId:'music-normal',version:'1',battleEffects:value}),/on, off or inherit/);
  assert.equal(h.G.$gameSystem._psBattleSeq,seq);assert.equal(h.G.SceneManager._scene,pushed);assert.equal(h.flow._op,null);assert.equal(h.installs(),0);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
test('a cancelled Off operation cannot affect the next battle which captures the current On option',async()=>{
 const h=await open({player:false});try{await ready(h);const old=h.op;h.flow.abort(Error('owned old battle'));h.s.terminate();await h.p.toMapId(5,8,9);h.G.ConfigManager.psBattleEffects=true;h.flow.openBattle({kind:'wild',foes:[{species:'Pidgey',level:3}],seq:2,battleId:'effects-successor',canLose:true});const next=h.flow._op;assert.notEqual(next,old);assert.equal(next.battleEffects,true);await h.p.inMode('main');const scene=h.p.battle();assert.equal(scene.pictureState().effects,true);h.s.onEnd();assert.equal(h.G.SceneManager._scene,scene);assert.equal(h.flow._op,next);assert.equal(h.installs(),0);assert.equal(JSON.stringify(h.flow.game()),h.before);scene.terminate();}finally{h.cleanup();}
});
