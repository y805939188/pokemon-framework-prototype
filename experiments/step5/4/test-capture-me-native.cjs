'use strict';
// SYNTHETIC_CONTROL only. Real author content/Session and installed MZ method
// contracts are exercised; audio/render scheduling is not native execution.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process'),{stripTypeScriptTypes}=require('node:module');
const ROOT=path.resolve(__dirname,'../../..'),PLAN=require('./capture-me-native-plan.json'),E=require('../../../js/engine/build/production.cjs'),{BattleSession}=require('../../../js/engine/game/session.cjs');
let tmp,mod,fixture,source,nodes,content,sceneHost,sceneTemp;
const eq=(a,b,label)=>assert.equal(JSON.stringify(a),JSON.stringify(b),label),clone=v=>JSON.parse(JSON.stringify(v));
function mutateNative(code){
 const name=process.env.PF_CAPTURE_NATIVE_MUTATION;if(!name)return code;
 const variants={duration:["G.performance.now() - h.start >= PLAN.waitMs","G.performance.now() - h.start >= 0",1],map:["value.isStarted() &&","true &&",2],load:["eq(code, 0, 'real DataManager.loadGame success code')","eq(code, true, 'real DataManager.loadGame success code')",1]},v=variants[name];assert(v,'known explicit test mutation');assert.equal(code.split(v[0]).length-1,v[2],'exact source gate count');return code.split(v[0]).join(v[1]);
}
test.before(async()=>{
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-capture-native-'));
 const entry=path.join(tmp,'entry.ts');fs.writeFileSync(entry,'export * from '+JSON.stringify(path.join(ROOT,'src/plugins/flowtest/d2-capture-me.ts'))+';\nexport { musicNativeContent } from '+JSON.stringify(path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'))+';');
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',plugins:[{name:'explicit-native-driver-negative-control',enforce:'pre',transform(code,id){if(id===path.join(ROOT,'src/plugins/flowtest/d2-capture-me.ts'))return mutateNative(code);}}],build:{outDir:path.join(tmp,'compiled'),emptyOutDir:false,minify:false,lib:{entry,formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 mod=require(path.join(tmp,'compiled/entry.cjs'));fixture=mod;content=fixture.musicNativeContent(E,assert);
 source=mutateNative(fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-capture-me.ts'),'utf8'));nodes=[];const parse=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})).parseAst;
 (function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);for(const x of Object.values(n))walk(x);})(parse(source,{lang:'ts'}));
});
test.after(()=>{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});if(sceneTemp)fs.rmSync(sceneTemp,{recursive:true,force:true});});
function init(name){const n=nodes.find(n=>n.type==='VariableDeclarator'&&n.id.name===name);assert(n,name);return stripTypeScriptTypes(source.slice(n.init.start,n.init.end));}
function helper(name,deps){return vm.runInNewContext('(({'+Object.keys(deps).join(',')+'})=>('+init(name)+'))')(deps);}
test('native plan freezes exact product and15 ordered cases, two-process denominator',()=>{
 assert.equal(PLAN.productCommit,'f021b33767fae6969d735ffde981f968a80d2218');assert.equal(PLAN.waitMs,3500);
 assert.deepEqual(PLAN.groups.flatMap(g=>g.ids),Array.from({length:15},(_,i)=>'ME'+String(i+1).padStart(2,'0')));assert.equal(PLAN.groups.length,7);
 assert.equal(PLAN.assets.length,5);assert.equal(PLAN.assets.find(a=>a.name==='long').seconds/1.2,5);assert(PLAN.assets.find(a=>a.name==='short').seconds<3.5);
 // Headless CI does not install ignored generated plugin bundles. The package
 // freeze checks actual bundle bytes against f021. This digest now records the
 // post-wild-faint-choice source for headless controls only. No requalification of
 // the historical fifteen-case App/PLAN is implied: new native packaging must rebind separately.
 const crypto=require('node:crypto'),product=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlow.ts'));assert.equal(crypto.createHash('sha256').update(product).digest('hex'),'097e1ec915d829016b26b293c5cce338134ca3caa4d850e435f3edf677eaa871','current source identity; historical native plan requires rebind');
});
for(const kind of ['map','title'])test('actual driver readiness rejects unstarted/changing/incomplete '+kind,()=>{
 class Map{}class Title{}let changing=false;const G={Scene_Map:Map,Scene_Title:Title,SceneManager:{isSceneChanging:()=>changing}},v=new(kind==='map'?Map:Title)();let started=false,active=true,busy=false;
 Object.assign(v,{isStarted:()=>started,isBusy:()=>busy,_commandWindow:{isOpenAndActive:()=>active}});assert.equal(mod.captureHostReady(G,v,kind),false);started=true;
 if(kind==='map'){v._messageWindow={};v._spriteset={};started=false;assert.equal(mod.captureHostReady(G,v,kind),false,'allocated windows do not imply Scene.start');started=true;delete v._messageWindow;delete v._spriteset;}
 if(kind==='map'){assert.equal(mod.captureHostReady(G,v,kind),false);v._messageWindow={};assert.equal(mod.captureHostReady(G,v,kind),false);v._spriteset={};}
 assert.equal(mod.captureHostReady(G,v,kind),true);changing=true;assert.equal(mod.captureHostReady(G,v,kind),false);changing=false;
 if(kind==='title'){active=false;assert.equal(mod.captureHostReady(G,v,kind),false);active=true;busy=true;assert.equal(mod.captureHostReady(G,v,kind),false);}
 assert.equal(mod.captureHostReady(G,{},kind),false);
});
test('installed MZ loadGame really resolves0 and driver rejects booleans/diagnostics',async()=>{
 const s=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),m=s.match(/DataManager\.loadGame = function\([^)]*\) \{[\s\S]*?\n\};/);assert(m);
 const order=[],box={DataManager:{makeSavename:id=>'file'+id,createGameObjects:()=>order.push('create'),extractSaveContents:x=>order.push(x),correctDataErrors:()=>order.push('correct')},StorageManager:{loadObject:async()=>({controlled:'save'})}};
 vm.runInNewContext(m[0],box);const code=await box.DataManager.loadGame(2);assert.equal(code,0);assert.deepEqual(order,['create',{controlled:'save'},'correct']);
 mod.captureLoadSucceeded(code,{_psSaveInfo:{}},assert,eq);for(const bad of [true,false,1,undefined,null])assert.throws(()=>mod.captureLoadSucceeded(bad,{_psSaveInfo:{}},assert,eq));
 assert.throws(()=>mod.captureLoadSucceeded(0,{_psSaveError:{message:'bad'},_psSaveInfo:{}},assert,eq));assert.throws(()=>mod.captureLoadSucceeded(0,{},assert,eq));
});
test('actual initial reset admits started Title once, triggers transfer then waits actual started Map',async()=>{
 class Map{}class Title{}let current=new Title(),started=false,transfers=0,installed=0;
 current.isStarted=()=>started;current.isBusy=()=>false;current._commandWindow={isOpenAndActive:()=>true};
 const G={Scene_Map:Map,Scene_Title:Title,SceneManager:{isSceneChanging:()=>false},$gameSystem:{},$gameMessage:{clear(){}},$gameMap:{_interpreter:{clear(){}}}};
 const mapReady=()=>mod.captureHostReady(G,current,'map'),titleReady=()=>mod.captureHostReady(G,current,'title');
 const deps={G,PLAN,flow:{_app:null,app:()=>({})},mapReady,titleReady,waitFor:async p=>{if(p())return;started=true;if(p())return;throw Error('bounded wait');},assert,install:()=>installed++,makeState:()=>({fixture:true}),clearMessages(){},toMapId:async()=>{transfers++;current=new Map();current.isStarted=()=>true;current._messageWindow={};current._spriteset={};},press:async()=>{},named:x=>PLAN.prefix+x};
 const reset=vm.runInNewContext('(({'+Object.keys(deps).join(',')+'})=>{let firstReset=true,settings;return '+init('reset')+';})')(deps);
 await reset();assert.equal(installed,1);assert.equal(transfers,1);assert(mapReady());await reset();assert.equal(installed,2);
 current=new Title();current.isStarted=()=>true;current.isBusy=()=>false;current._commandWindow={isOpenAndActive:()=>true};await assert.rejects(reset(),/bounded wait/);assert.equal(installed,2);
});
test('Gen8 source fixture actually captures and emits growth without prematurely writing state',async()=>{
 const game=mod.captureMENativeState(E,content),before=clone(game),s=await BattleSession.create({game:E.speciesKey.battleView(game,content),battleId:'native-capture-qualification',content,seed:PLAN.seed,foe:{kind:'wild',team:[E.memberFactory.createMember({id:'FOE-1',species:'Pidgey',level:3},content,()=>0)]}});s.take();const r=await s.throwBall('masterball');assert(r.ok&&s.finished);assert(r.messages.some(m=>m.kind==='end'&&m.reason==='caught'));assert(r.messages.some(m=>m.kind==='growth'));eq(game,before);assert(r.messages.flatMap(m=>m.kind==='events'?m.events:[]).some(e=>e.type==='rpg'&&e.args[4]==='caught'));
});
test('frozen failed-ball seed is real breakout, not a fabricated negative message',async()=>{
 const game=mod.captureMENativeState(E,content),foe=E.memberFactory.createMember({id:'FOE-1',species:'Snorlax',level:100},content,()=>0),s=await BattleSession.create({game:E.speciesKey.battleView(game,content),battleId:'native-failed-ball-qualification',content,seed:PLAN.seed,foe:{kind:'wild',team:[foe]}});s.take();const r=await s.throwBall('pokeball');assert(r.ok&&!s.finished);assert(!r.messages.flatMap(m=>m.kind==='events'?m.events:[]).some(e=>e.type==='rpg'&&e.args[4]==='caught'));
});
test('actual driver completeWait rejects early completion, unconfirmed stop and predeadline growth',async()=>{
 async function control({early=false,stop=true,growth=false}={}){let now=100,done=false;const h={start:100,growth:[],app:{saveBlocked:true},scene:{},before:{money:1}};
 const phase=()=>({completed:done,lease:{stopConfirmed:stop,fault:null},error:null,cancelled:false});const G={performance:{now:()=>now}};
 const f=helper('completeWait',{PLAN,G,phase,assert,eq,flow:{game:()=>h.before},frames:async()=>{now+=500;if(growth)h.growth.push({at:now,capture:{completed:false}});if(now>=100+(early?3000:3500))done=true;},inMode:async()=>h.growth.push({at:now,capture:{completed:true}}),clone});return f(h);}
 await control();await assert.rejects(control({early:true}),/full logical3500/);await assert.rejects(control({stop:false}),/own stop ACK/);await assert.rejects(control({growth:true}),/no early growth/);
});
test('actual throwBall invokes real Session through Scene.act, preserving returned refusal/result',async()=>{
 const sent=[],result={ok:false,reason:'trainer-battle'},h={session:{throwBall:async name=>{sent.push(name);return result;}},scene:{act(fn,kind){assert.equal(kind,'ball');Promise.resolve(fn()).then(r=>sent.push(r));}}};
 const f=helper('throwBall',{waitFor:async p=>{for(let i=0;i<8&&!p();i++)await Promise.resolve();assert(p());}});eq(await f(h,'pokeball'),result);assert.equal(h.action,result);eq(sent,['pokeball',result]);
});
test('actual stage-start oracle requires semantic caught event, Gotcha log and uninstalled state',async()=>{
 async function control({log=true,semantic=true,changed=false,growth=false}={}){const before={party:['p']},after={party:['p','caught']},view={started:true,track:{name:'clip'},lease:{phaseStartedAt:100}},action={ok:true,messages:[{kind:'end',reason:'caught'},{kind:'events',events:semantic?[{type:'rpg',args:['ball','p1','masterball','F','caught']}]:[]}]};
 const h={scene:{_failure:null,_D:{event:()=>['Gotcha']}},session:{finished:true,result:()=>({reason:'caught'})},app:{saveBlocked:true},before,growth:growth?[{}]:[],logs:log?[{line:'Gotcha',at:99}]:[]};
 const f=helper('caught',{throwBall:async()=>action,waitFor:async p=>assert(p()),assert,eq,phase:()=>view,flow:{running:true,game:()=>changed?after:before},G:{$gameSystem:{isSaveEnabled:()=>false}},objects:[{folder:'me/',name:'clip'}]});await f(h);assert.equal(h.start,100);}
 await control();for(const bad of [{log:false},{semantic:false},{changed:true},{growth:true}])await assert.rejects(control(bad));
});
test('actual decoder qualifier rejects corrupt/timing/type/channel mismatches without fitting range',async()=>{
 const asset={logicalName:'clip',kind:'me',expectedNativeChannels:2,nativeDurationRangeSeconds:[(88200-2)/44100,(88200+2)/44100]},base={ready:true,error:false,decoded:[{tag:'[object AudioBuffer]',duration:2,sampleRate:44100,channels:2}]};
 const f=v=>helper('nativeReady',{assert,waitFor:async p=>assert(p()),readNative:()=>v,input:{assets:[asset]},mark(){}})({name:'clip',folder:'me/',ready:()=>true,buffer:{isError:()=>v.error}});
 await f(base);for(const bad of [{...base,error:true},{...base,decoded:[{...base.decoded[0],duration:1.9}]},{...base,decoded:[{...base.decoded[0],channels:1}]},{...base,decoded:[{...base.decoded[0],tag:'[object Object]'}]}])await assert.rejects(f(bad));
});
test('case list really contains all producer callbacks and fresh consumer without conditional test-only bypass',()=>{
 const fixed=nodes.filter(n=>n.type==='CallExpression'&&n.callee.name==='run'&&n.arguments[0]?.type==='Literal').map(n=>n.arguments[0].value);
 eq([...fixed].sort(),['ME01','ME02','ME05','ME06','ME07','ME08','ME09','ME12','ME13','ME14','ME15'].sort());
 assert(source.includes("[['ME03', 'missing', 'missing'], ['ME04', 'corrupt', 'failed']]"));assert(source.includes("[['ME10', 'load'], ['ME11', 'newgame']]"));
 assert(!source.includes('AUTHOR_EXECUTED'));assert(source.includes("nativeClaim: 'NOT_SELF_QUALIFIED'"));
});

function compiledSceneHost(){
 if(sceneHost)return sceneHost;
 // Reuse explicit controlled host setup, not test callbacks/expectations.
 const text=fs.readFileSync(path.join(__dirname,'test-capture-me-scene.cjs'),'utf8'),parse=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})).parseAst;
 const before=parse(text).body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.object?.name==='test'&&n.expression.callee.property.name==='before');assert(before);
 const body=text.slice(before.expression.arguments[0].body.start,before.expression.arguments[0].body.end),deps={fs,path,os,vm,assert,E,ROOT,require,spawnSync,__dirname,process,flush:async()=>{for(let i=0;i<16;i++)await Promise.resolve();}};
 const result=vm.runInNewContext('(({'+Object.keys(deps).join(',')+'})=>{let temp,createHost,Step,planOf,config;(()=>'+body+')();return {createHost,temp};})')(deps);sceneHost=result.createHost;sceneTemp=result.temp;return sceneHost;
}
test('ME12 actual trainer Session and compiled Scene submit one blocked ball without capture or persistent writes',async()=>{
 const T=require('../../../js/engine/build/testing.cjs'),state=T.fakes.createMemoryState(mod.captureMENativeState(E,content));let rng=PLAN.worldSeed;
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),content:()=>({content,dex:E.dex.createDexLookup()}),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>PLAN.seed}),random:n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return Math.floor(rng/4294967296*n);},clock:()=>12345});
 const request={kind:'trainer',trainer:{id:'music-normal',version:1},battleId:PLAN.version+'/ME12#1',seq:1,canLose:true},session=await app.startTrainerBattle(request);session.take();
 const f=compiledSceneHost()();f.open=()=>f.flow.openBattle(request);const s=await f.ready(true,session),before=clone(state.current()),beforeBall=session.bag.masterball,events=[];let aborted=0;
 const waitFor=async(pred,label)=>{for(let i=0;i<100&&!pred();i++){f.tick(f.time+100);await new Promise(setImmediate);}assert(pred(),label);};
 const h={scene:s,session,app,request,before},throwBall=helper('throwBall',{waitFor}),n=nodes.find(n=>n.type==='CallExpression'&&n.callee.name==='run'&&n.arguments[0]?.value==='ME12');assert(n);
 const deps={reset:async()=>{},world:async()=>{},open:async kind=>{assert.equal(kind,'trainer');return h;},throwBall,assert,eq,clone,mark:(kind,value)=>events.push({kind,...value}),flow:{game:()=>state.current()},inMode:async mode=>waitFor(()=>s._mode===mode&&!s._busy&&s._queue.length===0,'actual '+mode),phase:()=>s.captureMelodyState(),objects:f.me().map(buffer=>({folder:'me/',name:'Capture',buffer})),named:()=> 'Capture',abortScene:async()=>{aborted++;f.cleanup();app.abortBattle(session,Error('own ME12 control cleanup'));}};
 try{
  const result=await vm.runInNewContext('(({'+Object.keys(deps).join(',')+'})=>('+stripTypeScriptTypes(source.slice(n.arguments[1].start,n.arguments[1].end))+'))')(deps)();
  assert.equal(result.action.ok,true);assert.equal(session.bag.masterball,beforeBall-1);assert.equal(session.finished,false);assert.equal(app.pendingReceiving,null);assert.equal(app.pendingPokedex,null);eq(state.current(),before);
  assert.equal(f.me().length,0);assert.equal(s.captureMelodyState(),null);assert.equal(aborted,1);assert(events.some(e=>e.kind==='trainer-blocked-ball-action'&&e.action.ok));
 }finally{f.cleanup();app.abortBattle(session,Error('own ME12 control final cleanup'));}
});
test('single pre-destroy failure in compiled Scene cannot ACK and lifecycle retry releases its owner',async()=>{
 const f=compiledSceneHost()(),s=await f.ready(),start=f.caught(),b=f.me()[0];b.failDestroy=1;
 f.tick(start+3500);assert(s._failure);assert(!s.captureMelodyState().completed);assert.equal(f.finishes,0);assert.equal(f.aborts,1);assert(s.captureMelodyState().error);assert(b.destroyed>0,'actual own cleanup body eventually invoked');s.terminate();
});
test('actual phase-start oracle runs against real Session messages and compiled Scene',async()=>{
 const game=mod.captureMENativeState(E,content),session=await BattleSession.create({game:E.speciesKey.battleView(game,content),battleId:'capture-native-oracle-real',content,seed:PLAN.seed,foe:{kind:'wild',team:[E.memberFactory.createMember({id:'FOE-1',species:'Pidgey',level:3},content,()=>0)]}});
 const f=compiledSceneHost()(),s=await f.ready(false,session);try{
  const action=await session.throwBall('masterball'),start=f.caught(action.messages),h={scene:s,session,app:f.app,before:clone(f.flow.game()),growth:[],logs:f.lines.map(r=>({line:r.line,at:r.time}))};
  const caught=helper('caught',{throwBall:async()=>action,waitFor:async p=>assert(p()),assert,eq,phase:()=>s.captureMelodyState(),flow:f.flow,G:f.G,objects:f.me().map(buffer=>({folder:'me/',name:'Capture',buffer}))});
  await caught(h);assert.equal(h.start,start);f.tick(start+3500);assert(s.captureMelodyState().completed);
 }finally{f.cleanup();}
});
test('actual load/newgame callbacks validate host replacement before releasing late callbacks',async()=>{
 const run=nodes.filter(n=>n.type==='CallExpression'&&n.callee.name==='run'&&n.arguments[0]?.name==='id').find(n=>source.slice(n.arguments[1].body.start,n.arguments[1].body.end).includes('loadControlSlot'));assert(run);
 const body=stripTypeScriptTypes(source.slice(run.arguments[1].start,run.arguments[1].end));
 for(const kind of ['load','newgame']){
  let game={id:'baseline'},h,stopped=false,released=false;const flow={running:false,operationPending:()=>false,musicState:()=>({current:false}),game:()=>game},old={onBeforeSave(){}},G={$gameSystem:old,Scene_Map:class{},SceneManager:{goto(){}},DataManager:{loadGame:async()=>{h.app.stateGeneration++;h.app.saveBlocked=false;G.$gameSystem={_psSaveInfo:{}};flow.running=false;game={id:'baseline'};return 0;},setupNewGame(){h.app.stateGeneration++;h.app.saveBlocked=false;G.$gameSystem={};flow.running=false;}}};
  const row={plays:[],destroyed:1},gate={row};const deps={kind,PLAN,G,flow,assert,eq,clone,reset:async()=>{},world:async()=>{},settledSave:async n=>assert.equal(n,2),holdNext:()=>gate,named:x=>x,open:async()=>{h={app:{stateGeneration:1,saveBlocked:true}};flow.running=true;return h;},caught:async()=>{},nativeReady:async()=>{},captureLoadSucceeded:mod.captureLoadSucceeded,makeState:()=>({id:'new'}),mapReady:()=>true,waitFor:async p=>assert(p()),toMapId:async()=>{stopped=true;},clearMessages(){},release:()=>{assert(stopped);released=true;},frames:async()=>{},phase:()=>({cancelled:true}),audio:{_meBuffer:null}};
  await vm.runInNewContext('(({'+Object.keys(deps).join(',')+'})=>('+body+'))')(deps)();assert(released);assert(!h.app.saveBlocked);
 }
});

test('fresh consumer executes its whole Title-Continue-load-idempotence chain and rejects missing producer cases',async()=>{
 const n=nodes.find(n=>n.type==='CallExpression'&&n.callee.name==='run'&&n.arguments[0]?.value==='ME15');assert(n);const callback=stripTypeScriptTypes(source.slice(n.arguments[1].start,n.arguments[1].end));
 const actualFS=require('node:fs'),crypto=require('node:crypto'),dir=actualFS.mkdtempSync(path.join(tmp,'consumer-')),producerPath=path.join(dir,'producer.json'),savedPath=path.join(dir,'expected.json'),slotPath=path.join(dir,'file1.rmmzsave');
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),stable=v=>E.contentCompile.canonicalJson(v),inputBytes=Buffer.from('fixed test input'),input={chain:'synthetic-control-chain',driverPluginSHA256:'driver',packageHead:'head'},state={captured:['BIRD'],appliedBattles:{capture:{}}};
 const saved={version:PLAN.version,chain:input.chain,fixtureSHA256:hash(stable(content)),packageHead:input.packageHead,productCommit:PLAN.productCommit,slot:1,state,result:{battleId:'capture'},bgmOnSave:{name:PLAN.prefix+'world'}};actualFS.writeFileSync(slotPath,'controlled compressed-byte stand-in; not a native save');saved.saveSHA256=hash(actualFS.readFileSync(slotPath));actualFS.writeFileSync(savedPath,JSON.stringify(saved));
 const produced={overall:'pass',results:PLAN.groups.flatMap(g=>g.ids).filter(id=>id!=='ME15').map(id=>({id,status:'pass'})),captureMENative:{inputSHA256:hash(inputBytes),chain:input.chain,driverPluginSHA256:input.driverPluginSHA256,producer:{expectedSHA256:hash(actualFS.readFileSync(savedPath))}},env:{packageInfo:{gitHead:input.packageHead}}};
 const fileHash=f=>hash(actualFS.readFileSync(f)),args={'ps-capture-me-producer-report':producerPath,'ps-capture-me-expected':savedPath,'ps-capture-me-producer-sha':null,'ps-capture-me-expected-sha':fileHash(savedPath)};
 let current,loaded=0,installed=0;class Title{constructor(){this._commandWindow={selectSymbol:v=>assert.equal(v,'continue'),isCurrentItemEnabled:()=>true};}}class Load{constructor(){this._listWindow={selectSavefile:v=>assert.equal(v,1),savefileId:()=>1,isOpenAndActive:()=>true};}isStarted(){return true;}isBusy(){return false;}}class Map{}
 const G={Scene_Title:Title,Scene_Load:Load,$gameSystem:{_psSaveInfo:{},_bgmOnSave:saved.bgmOnSave},$gameMap:{_interpreter:{_waitMode:''}},StorageManager:{filePath:()=>slotPath},DataManager:{makeSavename:()=> 'file1'},SceneManager:{goto:T=>current=new T(),isSceneChanging:()=>false}};
 const flow={running:false,operationPending:()=>false,app:()=>({saveBlocked:false}),musicState:()=>({current:false}),game:()=>state,commit:r=>{eq(r,saved.result);return 'already-applied';}};
 const deps={arg:k=>args[k],fileHash,fs:actualFS,assert,eq,PLAN,hash,inputBytes,input,stable,content,install:()=>installed++,G,flow,scene:()=>current,titleReady:()=>current instanceof Title,mapReady:()=>current instanceof Map,waitFor:async p=>assert(p()),press:async key=>{assert.equal(key,'ok');if(current instanceof Title)current=new Load();else{current._loadSuccess=true;loaded++;current=new Map();}},active:async name=>assert.equal(name,PLAN.prefix+'world'),named:x=>PLAN.prefix+x,frames:async()=>{},audio:{_meBuffer:null}};
 const run=vm.runInNewContext('(({'+Object.keys(deps).join(',')+'})=>('+callback+'))')(deps);
 const write=()=>{actualFS.writeFileSync(producerPath,JSON.stringify(produced));args['ps-capture-me-producer-sha']=fileHash(producerPath);};write();await run();assert.equal(loaded,1);assert.equal(installed,1);
 produced.results.pop();write();await assert.rejects(run(),/all14 real producer/);assert.equal(loaded,1,'no load after incomplete producer');
 produced.results.push({id:'ME14',status:'pass'});write();actualFS.appendFileSync(slotPath,'changed');await assert.rejects(run(),/same-run compressed save/);assert.equal(loaded,1);
});

async function primaryDiagnosticControl({value,throws=true,cleanupFails=false}){
 // Execute the actual run callback, outer catch and complete finally. Only
 // the scenario and owned cleanup ports are controlled; no NW is launched.
 const outer=nodes.find(n=>n.type==='TryStatement'&&n.finalizer&&source.slice(n.finalizer.start,n.finalizer.end).includes('details.primaryError'));
 const declaration=nodes.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='primary'));assert(outer&&declaration);
 const details={cases:{}},results=[],trace=[],firstCleanup=Error('owned-root cleanup failed'),secondCleanup=Error('late-callback cleanup failed');
 const flow={running:true,abort(){trace.push('abort');this.running=false;if(cleanupFails)throw firstCleanup;}},G={performance:{now:()=>100},Graphics:{frameCount:9},PluginManager:{parameters:()=>({})}},audio={};
 const deps={details,results,trace,flow,G,audio,PLAN,holds:[{}],release(){trace.push('release');if(cleanupFails)throw secondCleanup;},unwrap:()=>undefined,objects:[],readNative(){assert.fail('no native buffer in this controlled case');},originals:{createBuffer(){},parameters(){},bgmVolume:47,meVolume:47},stopCounts:{},events:[],draws:0,stateHash:()=> 'controlled-state',writeProgress(){},value,throws};
 const code='(async ({'+Object.keys(deps).join(',')+'})=>{let currentCase="";const run='+init('run')+';'+source.slice(declaration.start,declaration.end)+'try{await run("DIAGNOSTIC",async()=>{if(throws)throw value;return {controlled:true};});}'+source.slice(outer.handler.start,outer.handler.end)+'finally'+source.slice(outer.finalizer.start,outer.finalizer.end)+'})';
 let rejected=false,actual;try{await vm.runInNewContext(stripTypeScriptTypes(code))(deps);}catch(error){rejected=true;actual=error;}
 return {details,results,trace,rejected,actual,firstCleanup,secondCleanup};
}
for(const [label,value]of [['zero',0],['false',false],['empty string',''],['null',null],['Error',Error('original diagnostic Error')]])test('primary diagnostic preserves thrown '+label+' with and without later cleanup errors',async()=>{
 for(const cleanupFails of [false,true]){
  const r=await primaryDiagnosticControl({value,cleanupFails});assert(r.rejected);assert.strictEqual(r.actual,value,'original thrown value/object identity preserved');
  assert.equal(r.details.primaryError,String(value),'set-vs-unset diagnostic uses hadPrimary');assert.equal(r.results.length,1);assert.equal(r.results[0].status,'fail');
  assert.equal(r.results[0].error,String(value?.stack??value),'main failure record remains original');assert.deepEqual(r.trace,['abort','release']);assert.equal(r.details.cleanupErrors.length,cleanupFails?2:0);
  if(cleanupFails){assert.match(r.details.cleanupErrors[0].error,/owned-root cleanup failed/);assert.match(r.details.cleanupErrors[1].error,/late-callback cleanup failed/);}
 }
});
test('no primary exception keeps primaryError unset and succeeds after ordinary cleanup',async()=>{
 const r=await primaryDiagnosticControl({throws:false});assert.equal(r.rejected,false);assert.equal(r.details.primaryError,null);assert.equal(r.results[0].status,'pass');assert.deepEqual(r.trace,['abort','release']);assert.equal(r.details.cleanupErrors.length,0);
});
test('cleanup-only errors still reject and keep primaryError unset',async()=>{
 const r=await primaryDiagnosticControl({throws:false,cleanupFails:true});assert(r.rejected);assert.match(String(r.actual),/capture native cleanup failed/);assert.equal(r.details.primaryError,null);assert.equal(r.details.cleanupErrors.length,2);
});
