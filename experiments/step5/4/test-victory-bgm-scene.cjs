'use strict';
// Production Scene + real Gen8 Session. MZ renderer/decoder and application persistence are controlled ports.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs');
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
let temp,host;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-victory-scene-'));
 const built={};
 for(const name of ['PS_BattleFlow','PS_SaveState']){
  const r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',path.join(temp,name)],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);built[name]=fs.readFileSync(path.join(temp,name,name+'.js'),'utf8');
 }
 // Explicit read-only baseline control; normal runs always compile the current production source above.
 if(process.env.PF_VICTORY_BASELINE)built.PS_BattleFlow=fs.readFileSync(process.env.PF_VICTORY_BASELINE,'utf8');
 if(process.env.PF_VICTORY_MUTATION){
  assert.equal(process.env.PF_VICTORY_MUTATION,'omit-cue');const marker='PSFlow._victoryBattleMusic(op);';
  assert.equal(built.PS_BattleFlow.split(marker).length,2);built.PS_BattleFlow=built.PS_BattleFlow.replace(marker,'void op;');
 }
 const source=fs.readFileSync(path.join(__dirname,'test-battle-music-scene.cjs'),'utf8');
 const parse=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})).parseAst;
 const node=parse(source).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='host');assert(node);
 const box={require,fs,path,os,vm,assert,E,ROOT,temp,plugin:built.PS_BattleFlow,savePlugin:built.PS_SaveState,flush};vm.createContext(box);
 vm.runInContext(source.slice(node.start,node.end)+';this.makeHost=host;',box);host=box.makeHost;
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open({trainer=false,session=null,trainerVictory=undefined,...options}={}){
 // This suite owns cue/order assertions; ordinary text pacing is covered separately.
 const f=host(options);f.flow.fast=true;if(trainerVictory!==undefined)f.projection.presentation.victoryBgm=trainerVictory;for(const name of ['Battle victory','V','Wild win','Trainer win','Preset win'])f.write(name);
 if(session){f.session=session;f.app.startBattle=async()=>{f.starts++;f.app.saveBlocked=true;return session;};}
 f.open(trainer);const s=await f.scene();f.lines=[];const add=s._log.add;
 s._log.add=function(line){f.lines.push({line,time:f.time,names:f.names()});return add.call(this,line);};
 f.G.Input.isTriggered=()=>true;f.tick=()=>{f.advance(f.time+100);f.G.Graphics.frameCount++;s.update();};
 f.drain=async()=>{for(let i=0;i<160&&s._mode==='messages';i++){f.tick();await flush();}assert.equal(s._failure,null);assert.notEqual(s._mode,'messages','bounded presentation must drain');};
 f.cleanup=()=>{if(f.flow.running)f.flow.abort(Error('controlled cleanup'));s.terminate();};
 await f.drain();return f;
}
const ending=(reason='win',winner='Player')=>({kind:'end',reason,winner,outcome:null});
for(const trainer of [false,true])test(`real Gen8 ${trainer?'trainer':'wild'} KO reaches compiled Scene: faint/EXP then victory BGM then terminal text`,async()=>{
 const {BattleSession}=require(path.join(ROOT,'js/engine/game/session.cjs')),F=require(path.join(ROOT,'experiments/step2/s3/fixtures.cjs'));
 const session=await BattleSession.create({game:F.makeGame(),content:F.content,battleId:'victory-'+trainer,seed:[1,2,3,4],foe:{kind:trainer?'trainer':'wild',team:[F.foeMember('F-1','Pidgey',5)]}});
 const f=await open({trainer,session});try{
  const s=f.currentScene,result=await session.chooseMove(1);assert(result.ok);assert(session.finished);
  assert(result.messages.some(m=>m.kind==='growth'));assert(result.messages.some(m=>m.kind==='events'&&m.events.some(e=>e.type==='faint')));
  const end=result.messages.find(m=>m.kind==='end');assert.equal(end.reason,'win');assert.equal(end.winner,'Player');
  const before=f.names().length;s.pushMessages(result.messages);assert.equal(f.names().length,before,'planning cannot bypass prior display stages');
  await f.drain();const expected=trainer?'V':'Battle victory',line=f.lines.find(x=>x.line==='end.win');assert(line,'existing localized terminal feedback');
  assert.equal(line.names.at(-1),expected,'victory BGM is already requested before win text');
  assert.equal(f.flow.musicState().player.requests.filter(r=>r.kind==='victory').length,1);
  assert.equal(f.flow.musicState().player.memo.track.name,'Map');assert(f.flow.running);assert.equal(f.finishes,0,'text completion is not root commit');
  assert.equal(s._mode,'end','existing end confirmation retained');assert.equal(f.audio._meBuffer,null,'victory is BGM, not ME');
  s.onEnd();s.terminate();assert.deepEqual(Array.from(f.names()).slice(-2),[expected,'Map']);assert.equal(f.plays.at(-1).pos,17);
 }finally{f.cleanup();}
});
test('queued cue waits for earlier presentation; duplicates cannot restart the victory song',async()=>{
 const f=await open();try{const s=f.currentScene;let done=false;
  s.pushMessages([{kind:'text',text:'before'}]);const c=s._controller;
  // Controller public queue contains the same visual-step contract used by HP/EXP/faint consumers.
  assert(c);c.queue.unshift({kind:'visual',advance:()=>done,cancel(){}});s.pushMessages([ending(),ending()]);
  f.tick();assert.deepEqual(Array.from(f.names()),['Battle wild']);done=true;await f.drain();
  assert.deepEqual(Array.from(f.names()),['Battle wild','Battle victory']);assert.equal(f.flow.musicState().player.memo.position,17);
 }finally{f.cleanup();}
});
test('frozen victory preset keeps distinct name/parameters despite next-battle changes',async()=>{
 const f=await open({trainer:true,settings:{presets:{battle:'Custom:30:90',victory:'Preset win:70:120'}}});try{
  f.projection.presentation.victoryBgm='Mutated';f.flow.setNextBattleMusic({victory:'Next'});f.currentScene.pushMessages([ending()]);await f.drain();
  assert.equal(f.names().at(-1),'Preset win');assert.equal(f.buffers.at(-1).params.volume,35);assert.equal(f.buffers.at(-1).params.pitch,120);
  f.currentScene.onEnd();assert.equal(f.names().at(-1),'Map');assert.equal(f.flow._nextBattleMusic.presets.victory.name,'Next');
 }finally{f.cleanup();}
});
test('wild/trainer map fallback use separate frozen victory fields',async()=>{
 for(const trainer of [false,true]){const f=await open({trainer,trainerVictory:null,settings:{map:{wildVictory:'Wild win',trainerVictory:'Trainer win'}}});try{
  f.currentScene.pushMessages([ending()]);await f.drain();assert.equal(f.names().at(-1),trainer?'Trainer win':'Wild win');
 }finally{f.cleanup();}}
});
test('defeat, draw, run and normal capture feedback cannot trigger victory BGM',async()=>{
 for(const [reason,winner]of [['win','Opponent'],['tie',null],['run',null],['caught',null]]){const f=await open();try{
  f.currentScene.pushMessages([ending(reason,winner)]);await f.drain();assert.deepEqual(Array.from(f.names()),['Battle wild']);assert.equal(f.flow.musicState().player.requests.filter(r=>r.kind==='victory').length,0);
 }finally{f.cleanup();}}
});
test('missing victory resource diagnoses the request without blocking existing win feedback or world return',async()=>{
 const f=await open({settings:{map:{wildVictory:'Missing victory'}}});try{
  f.currentScene.pushMessages([ending()]);await f.drain();assert(f.lines.some(x=>x.line==='end.win'));assert.equal(f.flow.musicState().player.requests.at(-1).state,'missing');
  assert.equal(f.audio._currentBgm.name,'Battle wild');f.currentScene.onEnd();assert.equal(f.names().at(-1),'Map');
 }finally{f.cleanup();}
});
test('victory remains through pending root evolution; final root continuation restores the world memo',async()=>{
 const f=await open();try{
  f.currentScene.pushMessages([ending()]);await f.drain();f.pending='pendingEvolution';f.currentScene.onEnd();
  assert.equal(f.names().at(-1),'Battle victory');assert(f.flow.running);assert(f.app.pendingEvolution);assert.equal(f.flow.musicState().phase,'battle');
  f.pending=null;f.flow.resolveEvolution('pending',1,{kind:'cancel'});assert.equal(f.names().at(-1),'Map');assert.equal(f.plays.at(-1).pos,17);
 }finally{f.cleanup();}
});
test('abort/load/new game retire a queued cue and suppress a pending late decode',async()=>{
 for(const mode of ['abort','load','newgame']){const f=await open({ready:name=>name!=='Battle victory'});try{
  f.currentScene.pushMessages([ending()]);await f.drain();const pending=f.buffers.at(-1);assert.equal(pending.name,'Battle victory');assert(!pending.ready);
  if(mode==='abort')f.flow.abort(Error('cancel'));else if(mode==='load')f.flow.stateReplaced();else f.G.DataManager.setupNewGame();
  f.load(pending);f.advance(f.time+6000);assert(!f.names().includes('Battle victory'));assert(pending.destroyed>0);
 }finally{f.cleanup();}}
});
