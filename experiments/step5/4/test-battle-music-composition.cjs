'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {createCompositionHostFactory}=require('./battle-music-composition-host.cjs');
const ROOT=path.resolve(__dirname,'../../..');let temp,world;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-music-composition-'));const plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution']){const p=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',path.join(temp,name)],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);plugins[name]=fs.readFileSync(path.join(temp,name,name+'.js'),'utf8');}
 const variant=process.env.PF_MUSIC_COMPOSITION_MUTATION;
 if(variant){
  const variants={evolution:['PS_Evolution','if (!(!!this.request.battleOp','if (!(false && !!this.request.battleOp'],memo:['PS_BattleFlow','const track = audio?._bgmSequence || audio?._pendingBgmSequence ? audio.saveBgm() : audio?._currentBgm;','const track = audio?._currentBgm;'],channel:['PS_BattleFlow',' && audio?._bgmSequence === expectedSequence && audio?._pendingBgmSequence === expectedPending',''],op:['PS_Evolution',' && (!this.request.battleOp || flow()._op === this.request.battleOp)','']};
  const row=variants[variant];assert(row,'known explicit compiled mutation');const before=plugins[row[0]];assert.equal(before.split(row[1]).length-1,1,'exact compiled gate occurrence');plugins[row[0]]=before.replace(row[1],row[2]);const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');console.log(JSON.stringify({variant,plugin:row[0],before:hash(before),after:hash(plugins[row[0]])}));
 }
 world=createCompositionHostFactory({ROOT,work:temp,plugins});
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function pending(options={}){
 const w=world({evolution:'plugin',...options});w.playWorld('Map',17);w.open();const battle=await w.scene();w.find('Battle wild')[0].load();battle.onEnd();battle.terminate();
 assert(w.flow.running&&w.app.saveBlocked&&w.app.pendingEvolution);assert.equal(w.channel().buffer,'Battle wild');return w;
}
function ready(w){for(const b of w.created)if(!b.destroys&&!b._ready)b.load();w.tick(100);}
function returned(w){ready(w);assert.equal(w.channel().buffer,'Map');assert(w.channel().playing);assert.equal(w.plays().at(-1).offset,17);assert(w.music().requests.some(r=>r.kind==='return'&&r.state==='requested'));assert(!w.flow.running&&!w.app.saveBlocked);}
for(const mode of ['normal','cancel','technical'])test('compiled three-plugin '+mode+' evolution retains root BGM until terminal, then restores world once',async()=>{
 const w=await pending({cancellable:mode==='cancel'}),r=w.G.PSEvolution.show(),c=w.manager._scene._controller;assert(r&&c);assert.equal(c.audioCaptured,false);assert.equal(c.savedBgm,undefined);assert.equal(w.channel().buffer,'Battle wild');assert(w.music().current);assert(!w.music().requests.some(r=>r.kind==='return'));
 if(mode==='technical')c.dispose();else c.resolve('e',{kind:mode==='cancel'?'cancel':'animation-complete'});
 returned(w);const count=w.find('Map').length;c.close('duplicate');c.dispose();assert.equal(w.find('Map').length,count,'duplicate teardown cannot request a second return');
 w.open();await w.scene();assert.equal(w.music().memo.track.name,'Map');assert.equal(w.music().memo.position,17,'next battle remembers the true world');
});
test('painting failure after real evolution Controller creation technically retires the continuation and restores world',async()=>{
 const w=await pending(),init=w.G.Window_Base.prototype.initialize;w.G.Window_Base.prototype.initialize=function(...a){init.apply(this,a);this.contents.clear=()=>{throw Error('controlled paint failure');};};
 const r=w.G.PSEvolution.show();assert(r.done);assert(w.manager._scene._failure);returned(w);assert.match(w.manager._scene._failure,/controlled paint failure/,'failure is observable');
});
test('unknown/partial domain recovery does not force root completion just to restore music',async()=>{
 const w=await pending();w.app.resolveEvolution=()=>({status:'refused',reason:'unknown-write'});w.G.PSEvolution.show();const c=w.manager._scene._controller;c.dispose();
 assert(w.app.pendingEvolution&&w.app.saveBlocked&&w.flow.running);assert.equal(w.channel().buffer,'Battle wild');assert(!w.music().requests.some(r=>r.kind==='return'));
});
test('real foreign BGM during evolution survives old completion and becomes the next world memo',async()=>{
 const w=await pending();w.G.PSEvolution.show();const c=w.manager._scene._controller,foreign=w.playWorld('Foreign',3);c.resolve('e',{kind:'animation-complete'});ready(w);assert.equal(w.AM._bgmBuffer,foreign);assert.equal(foreign.destroys,0);assert(!w.music().requests.some(r=>r.kind==='return'));
 w.open();await w.scene();assert.equal(w.music().memo.track.name,'Foreign');assert.equal(w.music().memo.position,3);
});
test('external ME remains owned across evolution root return and gates actual BGM start',async()=>{
 const w=await pending();w.G.PSEvolution.show();const c=w.manager._scene._controller;w.AM.playMe({name:'Foreign',volume:100,pitch:100,pan:0});const me=w.AM._meBuffer;me.load();c.resolve('e',{kind:'animation-complete'});ready(w);
 assert.equal(w.AM._meBuffer,me);assert.equal(me.destroys,0);const bgm=w.AM._bgmBuffer;assert.equal(bgm.name,'Map');assert.equal(bgm.plays.length,0);w.AM.stopMe();assert.equal(bgm.plays.length,1);assert.equal(bgm.plays[0].offset,17);
});
for(const mode of ['abort','load','newgame','generation','op-replacement'])test('old evolution '+mode+' cannot replay over a successor',async()=>{
 const w=await pending();w.G.PSEvolution.show();const c=w.manager._scene._controller;
 if(mode==='abort')w.flow.abort(Error('controlled abort'));else if(mode==='load')w.G.DataManager.extractSaveContents({system:new w.G.Game_System()});else if(mode==='newgame')w.G.DataManager.setupNewGame();else if(mode==='generation')w.app.stateGeneration++;else w.flow._op={...w.flow._op};
 let domainCalls=0;const resolve=w.app.resolveEvolution;w.app.resolveEvolution=function(...a){domainCalls++;return resolve.apply(this,a);};const foreign=w.playWorld('Foreign',3);c.dispose();c.close('late');ready(w);if(mode!=='abort')assert.equal(domainCalls,0,'stale controller never resolves or closes a successor root');assert.equal(w.AM._bgmBuffer,foreign);assert.equal(foreign.destroys,0);
});
test('non-battle evolution retains its original save/stop/replay behavior',()=>{
 const w=world({evolution:'plugin'});w.playWorld('Map',17);w.app.pendingEvolution={token:'standalone',revision:1,memberId:'m1',phase:'selection',selection:{cancellable:true,source:{species:'Charmeleon'},target:{species:'Charizard'}}};
 w.app.resolveEvolution=()=>{w.app.pendingEvolution=null;return {status:'committed'};};w.G.PSEvolution.show();const c=w.manager._scene._controller;assert(c.audioCaptured);assert.equal(c.savedBgm.name,'Map');assert.equal(w.AM._bgmBuffer,null);c.resolve('e',{kind:'animation-complete'});ready(w);assert.equal(w.channel().buffer,'Map');assert.equal(w.plays().at(-1).offset,17);
});
function sequenceWorld({map=false,looped=false,empty=false,evolution}={}){
 const sequence={enabled:true,entries:[{type:'track',name:'Map'},{type:'silence',duration:1}]};const w=world({evolution,dataSystem:{reactorMusicSequences:[null,{id:1,name:'Field',sequence}]}});
 if(map){w.G.$dataMap={bgmSequence:sequence,bgm:{name:empty?'':'Map',volume:80,pitch:100,pan:0}};w.G.$gameMap={mapId:()=>5};}
 const key=map?5:'library:1';w.AM.playBgm({name:empty?'':'Map',volume:80,pitch:100,pan:0,sequence:key,looped});ready(w);assert.equal(w.AM.saveBgm().sequence,key);return {w,key};
}
for(const opt of [{},{looped:true},{map:true},{empty:true}])test('host world sequence survives normal battle/Scene return '+JSON.stringify(opt),async()=>{
 const {w,key}=sequenceWorld(opt);w.open();const s=await w.scene();w.find('Battle wild')[0].load();assert.equal(w.music().memo.track?.sequence,key);if(opt.looped)assert.equal(w.music().memo.track.looped,true);
 s.onEnd();s.terminate();ready(w);assert.equal(w.AM.saveBgm().sequence,key);if(opt.looped)assert(w.AM.saveBgm().looped);assert.equal(w.music().requests.at(-1).state,'requested');assert.equal(w.AM._bgmBuffer,null);assert(w.AM._bgmSequence);assert(w.find('Map').some(b=>b._isPlaying&&!b.destroys));
 w.open();await w.scene();assert.equal(w.music().memo.track?.sequence,key,'next battle snapshots the restored sequence');
});
for(const kind of ['bgm','sequence'])test('genuine '+kind+' successor during battle is not replaced by old sequence memo',async()=>{
 const {w}=sequenceWorld();w.open();const s=await w.scene();w.find('Battle wild')[0].load();let foreign;
 if(kind==='bgm')foreign=w.playWorld('Foreign',3);else{w.G.$dataSystem.reactorMusicSequences.push({id:2,name:'Other',sequence:{entries:[{type:'track',name:'Foreign'},{type:'silence',duration:1}]}});w.AM.playBgm({name:'Foreign',volume:80,pitch:100,pan:0,sequence:'library:2'});foreign=w.AM._bgmSequence;}
 s.onEnd();s.terminate();ready(w);assert.equal(kind==='bgm'?w.AM._bgmBuffer:w.AM._bgmSequence,foreign);assert(!w.music().requests.some(r=>r.kind==='return'));
});
for(const mode of ['abort','foreign'])test('sequence restore '+mode+' reentry cannot leave orphan own playback or overwrite successor',async()=>{
 const {w}=sequenceWorld();w.open();const s=await w.scene();w.find('Battle wild')[0].load();let injected=false,foreign;
 w.hook=(kind,b)=>{if(!injected&&kind==='create'&&String(b._url).endsWith('/Map.ogg')){injected=true;if(mode==='abort')w.flow.abort(Error('restore reentry'));foreign=w.playWorld('Foreign',3);}};
 s.onEnd();s.terminate();ready(w);assert(injected);assert.equal(w.AM._bgmBuffer,foreign);assert.equal(foreign.destroys,0);assert(w.find('Map').every(b=>b.destroys>0),'all old sequence allocations retired');
});
test('sequence world memo survives intro, battle preparation and normal return with looped flag',async()=>{
 const {w,key}=sequenceWorld({looped:true}),i=new w.G.Game_Interpreter();w.commands['PS_BattleFlow:PlayTrainerIntro'].call(i,{trainerId:'npc',version:'1'});w.find('Intro')[0].load();w.G.Graphics.frameCount++;assert.equal(i.updateWaitMode(),false);
 w.open(true);const s=await w.scene();w.find('Authored')[0].load();assert.equal(w.music().memo.track?.sequence,key);assert(w.music().memo.track.looped);s.onEnd();s.terminate();ready(w);assert.equal(w.AM.saveBgm().sequence,key);assert(w.AM.saveBgm().looped);
});
test('sequence world and formal evolution share the root until final return',async()=>{
 const {w,key}=sequenceWorld({looped:true,evolution:'plugin'});w.open();const s=await w.scene();w.find('Battle wild')[0].load();s.onEnd();s.terminate();w.G.PSEvolution.show();const c=w.manager._scene._controller;assert(!c.audioCaptured);assert.equal(w.channel().buffer,'Battle wild');c.resolve('e',{kind:'animation-complete'});ready(w);assert.equal(w.AM.saveBgm().sequence,key);assert(w.AM.saveBgm().looped);assert(!w.flow.running&&!w.app.saveBlocked);
});
test('pending map sequence is retained as a deferred native request and starts when its map becomes available',async()=>{
 const w=world();w.AM.playBgm({name:'Map',volume:80,pitch:100,pan:0,sequence:6});assert.equal(w.AM._pendingBgmSequence.key,6);w.open();const s=await w.scene();w.find('Battle wild')[0].load();s.onEnd();s.terminate();assert.equal(w.AM.saveBgm().sequence,6);assert.equal(w.AM._pendingBgmSequence.key,6);assert.equal(w.music().requests.at(-1).state,'requested');
 w.G.$gameMap={mapId:()=>6};w.G.$dataMap={bgmSequence:{entries:[{type:'track',name:'Map'},{type:'silence',duration:1}]}};w.AM.playBgm(w.AM.saveBgm());ready(w);assert.equal(w.AM._bgmSequence.key,6);assert(w.find('Map').some(b=>b._isPlaying&&!b.destroys));
});
for(const pending of [false,true])test('bufferless '+(pending?'pending':'playing')+' sequence successor is distinguished even when battle BGM is missing',async()=>{
 const {w}=pending?{w:world()}:sequenceWorld();if(pending)w.AM.playBgm({name:'Map',volume:80,pitch:100,pan:0,sequence:6});w.open(false,{music:{global:{wildBattle:'Absent'}}});const s=await w.scene();assert.equal(w.music().requests.at(-1).state,'missing');
 if(pending)w.AM.playBgm({name:'Map',volume:80,pitch:100,pan:0,sequence:7});else{w.G.$dataSystem.reactorMusicSequences.push({id:2,sequence:{entries:[{type:'track',name:'Foreign'},{type:'silence',duration:1}]}});w.AM.playBgm({name:'Foreign',volume:80,pitch:100,pan:0,sequence:'library:2'});}
 const next=pending?w.AM._pendingBgmSequence:w.AM._bgmSequence;s.onEnd();s.terminate();ready(w);assert.equal((pending?w.AM._pendingBgmSequence:w.AM._bgmSequence)===next,true,'successor identity unchanged');assert(!w.music().requests.some(r=>r.kind==='return'));
});
test('native sequence play failure after partial source start reports failure and retires its own allocations',async()=>{
 const {w}=sequenceWorld();w.open();const s=await w.scene();w.find('Battle wild')[0].load();let injected=false;w.hook=(kind,b)=>{if(!injected&&kind==='play'&&b.name==='Map'){injected=true;throw Error('controlled partial play failure');}};
 s.onEnd();s.terminate();assert(injected);assert.equal(w.music().requests.at(-1).state,'failed');assert.match(w.music().requests.at(-1).detail,/controlled partial play failure/);assert.equal(w.AM._bgmSequence,null);assert(w.find('Map').every(b=>b.destroys>0));
});
for(const mode of ['abort','foreign'])test('native sequence second stop '+mode+' cannot publish over a successor',async()=>{
 const {w}=sequenceWorld();w.open();const s=await w.scene();w.find('Battle wild')[0].load();let calls=0,foreign;const stop=w.AM.stopBgm;w.AM.stopBgm=function(...a){const r=stop.apply(this,a);if(++calls===2){if(mode==='abort')w.flow.abort(Error('stop reentry'));foreign=w.playWorld('Foreign',3);}return r;};
 s.onEnd();s.terminate();ready(w);assert(calls>=2);assert.equal(w.AM._bgmBuffer,foreign);assert.equal(foreign.destroys,0);assert.equal(w.find('Map').length,1,'old return never allocated a new sequence source');
});
for(const fail of [false,true])test('synchronous sequence restore restores native method identities even on failure='+fail,async()=>{
 const {w}=sequenceWorld();w.open();const s=await w.scene();w.find('Battle wild')[0].load();const methods=['playBgm','stopBgm','createBuffer','_advanceBgmSequence','_startBgmSequenceTrack'],before=methods.map(k=>w.AM[k]);
 if(fail)w.hook=(kind,b)=>{if(kind==='play'&&b.name==='Map')throw Error('controlled failure');};s.onEnd();s.terminate();methods.forEach((k,i)=>assert.equal(w.AM[k],before[i],k+' restored'));
});
test('world sequence return preserves an external ME and uses the native duck/resume policy',async()=>{
 const {w,key}=sequenceWorld();w.open();const s=await w.scene();w.find('Battle wild')[0].load();w.AM.playMe({name:'Foreign',volume:100,pitch:100,pan:0});const me=w.AM._meBuffer;me.load();s.onEnd();s.terminate();ready(w);assert.equal(w.AM._meBuffer,me);assert.equal(me.destroys,0);assert.equal(w.AM.saveBgm().sequence,key);assert.equal(w.AM._bgmSequence.duck,w.AM.BGM_SEQUENCE_ME_DUCK);w.AM.stopMe();assert.equal(w.AM._bgmSequence.duck,1);
});
