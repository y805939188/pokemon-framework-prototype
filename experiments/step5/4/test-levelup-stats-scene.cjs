'use strict';
// Compiled production Scene and original App/Session/Gen8. Raster/input/audio
// ports are controlled; no native execution or real font claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(process.env.PF_LEVEL_STATS_ROOT||path.resolve(__dirname,'../../..')),E=require(path.join(ROOT,'js/engine/build/production.cjs')),PLAN=require(path.join(ROOT,'experiments/step5/4/victory-music-native-plan.json'));let temp,plugins,entryText,fixture;
test.before(async()=>{temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-level-scene-'));plugins={};for(const n of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){const out=path.join(temp,n),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:n},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);const code=fs.readFileSync(path.join(out,n+'.js'),'utf8');if(n==='PS_BattleFlowTest')entryText=code;else plugins[n]=n==='PS_BattleFlow'&&process.env.PF_LEARNING_CANCEL_TEST_PLUGIN?fs.readFileSync(process.env.PF_LEARNING_CANCEL_TEST_PLUGIN,'utf8'):code;}const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'fixture'),minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});fixture=require(path.join(temp,'fixture/entry.cjs'));});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open({lang='en',levels=1,atCap=false,evBoundary=false,expOffset=-1,normalLearning=false,normalGrowth=false,noLearn=false,machineMove=null,machineKind='hm',levelLearnset=null,moveSlots=4,normalAward=false,capture=false}={}){
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow,content=fixture.musicNativeContent(E,assert),oldParameters=G.PluginManager.parameters;
 G.PluginManager.parameters=function(name){const v=oldParameters.call(this,name);return name==='PS_BattleFlow'?{...v,language:lang}:v;};
 const refresh=G.Window_Base.prototype.refresh;G.Window_Base.prototype.refresh=function(...args){const r=refresh.apply(this,args);if(this.page&&this.drawAllItems)this.drawAllItems();return r;};
 const destroyed=[],draws=[],addWindow=G.Scene_MenuBase.prototype.addWindow;G.Scene_MenuBase.prototype.addWindow=function(view){addWindow.call(this,view);view.parent={removeChild(){}};};G.Window_Base.prototype.destroy=function(){destroyed.push(this);this._destroyed=true;};const draw=G.Window_Base.prototype.drawText;G.Window_Base.prototype.drawText=function(...args){draws.push({window:this,args});return draw.apply(this,args);};let sounds=0;G.SoundManager.playOk=()=>sounds++;
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=true;
 if(machineMove)content.items['test-machine']={...content.items.potion,id:'test-machine',name:'Test machine',namePlural:'Test machines',pocket:4,fieldUse:machineKind,battleUse:'none',move:machineMove,legacyIds:[],consumable:false,flags:[],battleId:undefined};
 const level=atCap?100:normalAward?5:evBoundary?30:50;content.species.Snorlax.learnset[51]=noLearn?[]:['Rest'];if(levelLearnset)for(const [at,moves]of Object.entries(levelLearnset))content.species.Snorlax.learnset[at]=moves;assert(content.moves.Rest,'real learning fixture exists');if(normalAward){assert(content.moves['Hyper Voice']);content.species.Pidgey.baseExp=600;}const member=E.memberFactory.createMember({id:'LEVEL-P1',species:'Snorlax',level},content,()=>0);if(evBoundary){assert.equal(member.ivs.spe,0,'fixture has IV0, not an assumed31');assert.equal(member.nature,'hardy');member.evs={...member.evs,spe:15};}const state=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(member,content)],money:1000,bag:{masterball:2}});state.badges.fill(true);state.nextMemberOrdinal='2';state.party[0].moves=[{id:'tackle',pp:35,maxpp:35},{id:'growl',pp:40,maxpp:40},{id:'splash',pp:40,maxpp:40},{id:'protect',pp:10,maxpp:10}];state.party[0].moves=state.party[0].moves.slice(0,moveSlots);if(normalAward)state.party[0].moves[0]={id:'hypervoice',pp:10,maxpp:10};const curve=content.species.Snorlax.growth;if(!atCap)state.party[0].exp=normalAward?E.growth.minExp(curve,level+1)-1:E.growth.minExp(curve,level+levels)+expOffset;G.$gameSystem._psGame=state;const before=JSON.stringify(flow.game());
 await h.p.toMapId(5,8,9);flow.openBattle({kind:'wild',foes:[{species:'Pidgey',level:3}],battleId:'level-'+path.basename(h.w.root),seq:1,canLose:true});await h.p.inMode('main');const s=h.p.battle(),initialCard=s.presentationState().cards.find(c=>c.side==='p1'),initialView=s.statusCardState?.().find(c=>c.side==='p1'),messages=[],growthPauses=[],paused=s.pausedMessages,push=s.pushMessages;if(typeof paused==='function')s.pausedMessages=function(lines){const steps=paused.call(this,lines);growthPauses.push(...steps.filter(step=>typeof step!=='string'));return steps;};s.pushMessages=function(msgs){messages.push(...msgs);return push.call(this,msgs);};if(normalGrowth||normalLearning)flow.fast=false;s.act(()=>capture?s._session.throwBall('masterball'):s._session.chooseMove(1),capture?'ball':'move');await h.waitFor(()=>!s._busy,'real battle action result');
 await h.waitFor(()=>(normalGrowth||normalLearning)?s.ordinaryMessageState?.():s.levelStatsState?.()||['learn','end'].includes(s._mode),'stat panel, message or old next menu');
 return{...h,G,flow,s,before,initialCard,initialView,destroyed,draws,messages,growthPauses,get sounds(){return sounds;},state(){return s.levelStatsState?.();},cleanup(){if(flow.running)flow.abort(Error('owned level stats cleanup'));s.terminate();}};
}
async function firstLearningStage(h){
 for(let i=0;i<12&&h.state();i++)await h.p.press('ok');
 await h.waitFor(()=>['learn','learn-initial'].includes(h.s._mode)&&!h.s._busy&&h.s._queue.length===0,'real initial learning stage');
}
async function enterLearningSelector(h){
 await firstLearningStage(h);
 if(h.s._mode==='learn-initial'){await h.frames(1);const i=h.s._menu._items.findIndex(x=>x.ext==='forget-move');assert(i>=0);h.s._menu.select(i);h.s.onMenuOk();await h.frames(1);}
 await h.p.inMode('learn');
}
for(const lang of ['en','zh'])test(lang+' actual per-level delta then total windows block learning/menus and leave persistent state untouched',async()=>{const h=await open({lang});try{
 const s=h.s,page=h.state();assert(page,'level-up must show the actual stats window before learning');assert.equal(page.phase,'delta');assert.equal(page.level,51);assert.equal(page.rows.length,6);assert(!s.inputState().ready);assert.equal(s._menu.visible,false);assert(s._session.pendingLearn);assert.equal(s._mode,'messages');assert.equal(JSON.stringify(h.flow.game()),h.before);
 const m=h.messages.find(x=>x.kind==='growth'),d=E.battlePresentation.readGrowthDisplay(s._session,m),stats=d.segments.find(x=>x.levelUp).levelUp.stats;assert(stats,'detached computed six stats required');assert.deepEqual(Array.from(page.rows,x=>x.value),['hp','atk','def','spa','spd','spe'].map(k=>stats.after[k]-stats.before[k]));const first=s._levelStatsWindow;assert(first.pause&&first.visible);const numericDraws=()=>h.draws.filter(x=>x.window===first&&x.args[4]==='right').map(x=>x.args[0]);assert.deepEqual(numericDraws(),Array.from(page.rows,x=>'+'+x.value),'actual delta draw calls, not just DTO');assert.deepEqual(h.draws.filter(x=>x.window===first&&x.args[2]>0&&x.args[4]!=='right').map(x=>x.args[0]),lang==='zh'?['HP','攻击','防御','特攻','特防','速度']:['HP','Attack','Defense','Sp. Atk','Sp. Def','Speed'],'all six real localized draw labels');assert(h.draws.some(x=>x.window===first&&x.args[0]===(lang==='zh'?'攻击':'Attack')));
 await h.p.press('cancel');assert.equal(h.state().phase,'delta','BACK cannot advance');await h.frames(20);assert.equal(h.state().phase,'delta','fast mode cannot auto confirm');
 await h.p.press('ok');assert.equal(h.state().phase,'total');assert.deepEqual(Array.from(h.state().rows,x=>x.value),['hp','atk','def','spa','spd','spe'].map(k=>stats.after[k]));assert.deepEqual(numericDraws().slice(-6),Array.from(h.state().rows,x=>String(x.value)),'actual total draw calls');assert.equal(h.sounds,1);assert.equal(JSON.stringify(h.flow.game()),h.before);
 await h.p.press('ok');await enterLearningSelector(h);assert.equal(h.state(),null);assert.equal(h.sounds,2);assert.equal(h.destroyed.filter(x=>x===first).length,1);assert.equal(JSON.stringify(h.flow.game()),h.before);const choose=s._menu._items.findIndex(x=>x.ext===null);s._menu.select(choose);s.onMenuOk();await h.p.inMode('learn-giveup');await h.frames(1);s._menu.select(0);s.onMenuOk();await h.p.inMode('end');s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(h.flow.game().party[0].level,51);const after=JSON.stringify(h.flow.game());s.onEnd();assert.equal(JSON.stringify(h.flow.game()),after);
 }finally{h.cleanup();}});
test('multiple applied levels retain chained stat windows and learn at the matching level before continuing',async()=>{const h=await open({levels:3});try{
 const seen=[];for(let i=0;i<3;i++){const level=51+i;assert(h.state(),'every applied level has a real window');assert.equal(h.state().level,level);assert.equal(h.state().phase,'delta');const up=h.messages.filter(m=>m.kind==='growth').flatMap(m=>E.battlePresentation.readGrowthDisplay(h.s._session,m).segments).find(x=>x.levelUp?.level===level).levelUp;if(i)assert.deepEqual(up.stats.before,seen[i-1].stats.after);seen.push(up);await h.p.press('ok');assert.equal(h.state().phase,'total');assert.deepEqual(Array.from(h.state().rows,x=>x.value),['hp','atk','def','spa','spd','spe'].map(k=>up.stats.after[k]));await h.p.press('ok');if(i===0){await enterLearningSelector(h);assert.equal(h.s._session.party[0].level,51);h.s._menu.select(1);h.s.onMenuOk();}if(i<2)await h.waitFor(()=>h.state()?.level===level+1,'next actual level panel');}
 assert.deepEqual(seen.map(x=>x.level),[51,52,53]);assert.equal(h.sounds,6);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.p.inMode('end');assert.equal(h.s._session.party[0].moves[1].id,'rest');
 }finally{h.cleanup();}});
test('normal host abort while a stat page is visible cancels and frees only that owned window without installing growth',async()=>{const h=await open();try{assert(h.state(),'owned stat window visible');const own=h.s._levelStatsWindow;h.flow.abort(Error('normal interruption'));await h.frames(3);assert.equal(h.state(),null);assert.equal(h.destroyed.filter(x=>x===own).length,1);assert.equal(JSON.stringify(h.flow.game()),h.before);assert(!h.flow.app().saveBlocked);h.s._controller.dispose();assert.equal(h.destroyed.filter(x=>x===own).length,1);}finally{h.cleanup();}});
test('maximum-level EXP awards invent no level or stat window',async()=>{const h=await open({atCap:true});try{assert(!h.state(),'capped award has no stats window');assert.equal(h.s._mode,'end');assert.equal(h.sounds,0);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}});
test('actual compiled generic driver confirms each new stat page through USE and then satisfies its original learning readiness predicate',async()=>{const h=await open();try{assert(h.state(),'level modal must exist for this control');const start=entryText.indexOf('async function waitBattlePresentation('),end=entryText.indexOf('async function inMode(',start);assert(start>=0&&end>start,'actual driver has modal-aware semantic waiter');const report={};const wait=new Function('waitFor','battle','frames','press','report','frame',entryText.slice(start,end)+'\nreturn waitBattlePresentation;')(h.waitFor,h.p.battle,h.frames,h.p.press,report,h.G.Graphics.frameCount);await wait(()=>['learn','learn-initial'].includes(h.s._mode)&&!h.s._busy&&h.s._queue.length===0,'learning readiness before selecting a move');assert.deepEqual(report.levelStatsConfirmations.map(x=>[x.level,x.phase]),[[51,'delta'],[51,'total']]);assert.equal(h.sounds,2);assert.equal(h.state(),null);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}});
test('EV15 to16 crosses the old-level Speed boundary and the first displayed delta includes that gain',async()=>{
 const h=await open({evBoundary:true,levels:3});try{
  // Independent fixed WP19 numbers: base Spe30, IV0, neutral nature.
  // L30/EV15=floor((60+3)*.30)+5=23; using EV16 at L30 would be24.
  // L31/32/33 with EV16 are24/25/26. Do not derive expected delta from the projection.
  const growth=h.messages.find(m=>m.kind==='growth'),projection=E.battlePresentation.readGrowthDisplay(h.s._session,growth),levels=projection.segments.filter(x=>x.levelUp).map(x=>x.levelUp);
  assert.deepEqual(levels.map(x=>x.level),[31,32,33]);assert.equal(levels[0].stats.before.spe,23,'first before is genuinely EV-before');assert.equal(h.s._session.party[0].evs.spe,16,'actual foe yielded one Speed EV');
  for(const [index,total]of[24,25,26].entries()){
   assert.equal(h.state().level,31+index);assert.equal(h.state().phase,'delta');assert.equal(h.state().rows.find(r=>r.key==='spe').value,1,'actual Speed delta, independent fixed expectation');
   await h.p.press('ok');assert.equal(h.state().phase,'total');assert.equal(h.state().rows.find(r=>r.key==='spe').value,total);await h.p.press('ok');if(index<2)await h.waitFor(()=>h.state()?.level===32+index,'next EV-boundary level');
  }
  assert.equal(JSON.stringify(h.flow.game()),h.before,'display never commits working growth');
 }finally{h.cleanup();}
});

for(const expOffset of [-1,10])test('real Session growth restores initial unavailable EXP to '+(expOffset<0?'level-floor zero':'a positive fraction')+' in the actual status window',async()=>{
 const h=await open({levels:3,expOffset,noLearn:true});try{
  assert.equal(h.initialCard.ratio,null);assert.equal(h.initialCard.experienceUnavailable,'outside-level-interval');assert.equal(h.initialView.experience,null,'initial uncertainty must not fabricate an EXP bar');
  for(let index=0;index<3;index++){
   assert.equal(h.state().level,51+index);assert.equal(h.state().phase,'delta');
   const card=h.s.presentationState().cards.find(c=>c.side==='p1');assert.equal(card.experienceUnavailable,undefined,'first valid published level already supersedes initial uncertainty');
   await h.p.press('ok');await h.p.press('ok');if(index<2)await h.waitFor(()=>h.state()?.level===52+index,'next real level panel');
  }
  await h.p.inMode('end');const card=h.s.presentationState().cards.find(c=>c.side==='p1'),view=h.s.statusCardState().find(c=>c.side==='p1'),growth=h.messages.find(m=>m.kind==='growth'),display=E.battlePresentation.readGrowthDisplay(h.s._session,growth);
  assert.equal(card.level,53);assert.equal(card.ratio,display.ratio);assert.equal(card.experienceUnavailable,undefined);assert.equal(view.experienceUnavailable,null);assert.equal(view.experience.ratio,display.ratio);
  if(expOffset<0)assert.equal(display.ratio,0);else assert(display.ratio>0&&display.ratio<1);
  const fills=[],window=h.s._status,fill=window.contents.fillRect;window.contents.fillRect=(x,y,width,height,colour)=>{fills.push({x,y,width,height,colour});return fill.call(window.contents,x,y,width,height,colour);};window.refresh();window.contents.fillRect=fill;
  const width=window.innerWidth/2-12;assert(fills.some(f=>f.x===0&&f.y===72&&f.width===width&&f.colour==='#343b43'),'actual background returns even at level-floor zero');
  assert(fills.some(f=>f.x===0&&f.y===72&&f.width===width*display.ratio&&f.colour==='#589eda'),'actual progress matches the real published fraction');
  assert.equal(JSON.stringify(h.flow.game()),h.before,'working growth remains uncommitted while learning is pending');
 }finally{h.cleanup();}
});

// Normal full-slot cancellation uses the existing selector; no shared-summary or HM claim.
async function learningRoot(h){for(let i=0;i<12&&h.state();i++)await h.p.press('ok');await enterLearningSelector(h);}
async function question(h,skip=false){const pending=h.s._session.pendingLearn;if(skip){h.s._menu.select(h.s._menu._items.findIndex(x=>x.ext===null));h.s.onMenuOk();}else h.s.onMenuCancel();await h.frames(1);assert.equal(h.s._session.pendingLearn,pending,'opening give-up confirmation cannot decide learning');assert.notEqual(h.s._mode,'learn','cancel must open an owned give-up question');await h.p.inMode('learn-giveup');}
async function answer(h,key){await h.frames(1);const at=h.s.inputState().items.findIndex(x=>x.key===key);assert(at>=0,'real learning answer '+key);h.s._menu.select(at);h.s.onMenuOk();await h.frames(1);}
for(const lang of ['en','zh'])test(lang+' full-slot cancellation returns from No and BACK without deciding or changing current state',async()=>{
 const h=await open({lang});try{await learningRoot(h);const s=h.s._session,pending=s.pendingLearn,working=JSON.stringify(s.party),live=JSON.stringify(s.gw.readState('p1'));let calls=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{calls++;return decide(...args);};
 h.s._menu.select(2);
 for(let i=0;i<2;i++){await question(h);assert.equal(h.s._menu.index(),0,'each question defaults to Yes');assert(h.s._log._lines.join(' ').includes(lang==='zh'?'放弃学习':'Give up on learning'));h.s.onMenuOk();assert.equal(calls,0,'same update cannot accept the newly shown Yes');await answer(h,'continue-learning');assert.equal(h.s._mode,'learn');assert.equal(h.s._menu.index(),2);}
 await question(h);await h.frames(1);h.s.onMenuCancel();await h.frames(1);assert.equal(h.s._mode,'learn');assert.equal(h.s._menu.index(),2);
 assert.equal(calls,0);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s.party),working);assert.equal(JSON.stringify(s.gw.readState('p1')),live);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
for(const lang of ['en','zh'])test(lang+' full-slot skip asks first and confirmed give-up completes with one final install',async()=>{
 const h=await open({lang});try{await learningRoot(h);const s=h.s._session,oldMoves=JSON.stringify(s.party[0].moves),lines=[],add=h.s._log.add.bind(h.s._log);h.s._log.add=line=>{lines.push(line);return add(line);};let calls=0,installs=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{calls++;assert.equal(args[0],null);return decide(...args);};let doc=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
 await question(h,true);assert.equal(calls,0);assert.equal(installs,0);h.s.onMenuOk();assert.equal(calls,0);await answer(h,'continue-learning');assert.equal(h.s._mode,'learn');assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext,null);
 await question(h,true);await answer(h,'give-up');h.s.onMenuOk();h.s.onMenuCancel();await h.p.inMode('end');assert.equal(calls,1);assert.equal(JSON.stringify(s.party[0].moves),oldMoves);assert.equal(s.pendingLearn,null);assert(lines.some(line=>line.includes(lang==='zh'?'没有学会':'did not learn')));assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
 await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);const after=JSON.stringify(h.flow.game());h.s.onEnd();assert.equal(installs,1);assert.equal(JSON.stringify(h.flow.game()),after);
 }finally{h.cleanup();}
});
test('declining give-up then selecting an old move uses the real replacement and preserves the save until Continue',async()=>{
 const h=await open();try{await learningRoot(h);const s=h.s._session;await question(h);await answer(h,'continue-learning');h.s._menu.select(0);h.s.onMenuOk();await h.p.inMode('end');assert.equal(s.party[0].moves[0].id,'rest');assert.equal(s.party[0].moves[0].pp,10,'pinned Gen8 Rest PP');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires a pending give-up question without a late learn decision',async()=>{
 const h=await open();try{await learningRoot(h);let calls=0;const s=h.s._session,decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{calls++;return decide(...args);};await question(h);await h.frames(1);if(how==='abort')h.flow.abort(Error('owned learn cancel'));else if(how==='replace')h.flow.stateReplaced();else h.s.terminate();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(2);assert.equal(calls,0);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('normal typed give-up prompt cannot submit a decision while its text is still revealing',async()=>{
 const h=await open();try{await learningRoot(h);let calls=0;const s=h.s._session,decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{calls++;return decide(...args);};h.flow.fast=false;h.s.onMenuCancel();await h.frames(1);assert.equal(h.s._mode,'messages');h.s.onMenuOk();assert.equal(calls,0);await h.p.press('ok');await h.p.inMode('learn-giveup');assert.equal(calls,0);await answer(h,'continue-learning');assert.equal(h.s._mode,'learn');assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});

// Initial full-slot question is separate from cancelling an already accepted selector.
async function initialQuestion(h){await firstLearningStage(h);assert.equal(h.s._mode,'learn-initial','full-slot learning must ask permission before the selector');}
async function initialAnswer(h,key){await h.frames(1);const i=h.s._menu._items.findIndex(x=>x.ext===key);assert(i>=0,'initial learning answer '+key);h.s._menu.select(i);h.s.onMenuOk();await h.frames(1);}
for(const lang of ['en','zh'])test(lang+' initial learning confirmation accepts once before exposing the selector',async()=>{
 const h=await open({lang});try{await initialQuestion(h);const s=h.s._session,pending=s.pendingLearn,working=JSON.stringify(s.party),live=JSON.stringify(s.gw.readState('p1'));let calls=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{calls++;return decide(...args);};
 assert.equal(h.s._menu.index(),0);assert.deepEqual(Array.from(h.s._menu._items,x=>x.ext),['forget-move','decline-learning']);assert(h.s._log._lines.join(' ').includes(lang==='zh'?'遗忘一个招式':'forget a move'));
 h.s.onMenuOk();assert.equal(h.s._mode,'learn-initial','same update cannot consume default Yes');assert.equal(calls,0);
 await initialAnswer(h,'forget-move');assert.equal(h.s._mode,'learn');assert.equal(calls,0);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s.party),working);assert.equal(JSON.stringify(s.gw.readState('p1')),live);assert.equal(JSON.stringify(h.flow.game()),h.before);
 h.s.onMenuCancel();await h.p.inMode('learn-giveup');await answer(h,'continue-learning');assert.equal(h.s._mode,'learn','declining give-up returns to the accepted selector, not the initial question');assert.equal(calls,0);
 h.s._menu.select(0);h.s.onMenuOk();await h.p.inMode('end');assert.equal(calls,1);assert.equal(s.party[0].moves[0].id,'rest');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
for(const lang of ['en','zh'])test(lang+' initial learning confirmation rejection skips directly without a second give-up question',async()=>{
 const h=await open({lang});try{await initialQuestion(h);const s=h.s._session,moves=JSON.stringify(s.party[0].moves),lines=[],add=h.s._log.add.bind(h.s._log);h.s._log.add=line=>{lines.push(line);return add(line);};let calls=0,installs=0;const decide=s.decideLearn.bind(s);s.decideLearn=(slot)=>{calls++;assert.equal(slot,null);return decide(slot);};let doc=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
 await initialAnswer(h,'decline-learning');h.s.onMenuOk();h.s.onMenuCancel();await h.p.inMode('end');assert.equal(calls,1);assert.equal(s.pendingLearn,null);assert.equal(JSON.stringify(s.party[0].moves),moves);assert(!lines.some(line=>line.includes('Give up on learning')||line.includes('放弃学习')));assert(lines.some(line=>line.includes(lang==='zh'?'没有学会':'did not learn')));assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
 await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(installs,1);assert.equal(h.flow.lastOutcome.commit,'applied');const after=JSON.stringify(h.flow.game());h.s.onEnd();assert.equal(installs,1);assert.equal(JSON.stringify(h.flow.game()),after);
 }finally{h.cleanup();}
});
test('BACK at initial learning question declines without opening the accepted selector',async()=>{
 const h=await open();try{await initialQuestion(h);let calls=0;const s=h.s._session,decide=s.decideLearn.bind(s);s.decideLearn=(slot)=>{calls++;assert.equal(slot,null);return decide(slot);};await h.frames(1);h.s.onMenuCancel();await h.p.inMode('end');assert.equal(calls,1);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires the initial learning question without applying a late answer',async()=>{
 const h=await open();try{await initialQuestion(h);let calls=0;const s=h.s._session,pending=s.pendingLearn,moves=JSON.stringify(s.party),decide=s.decideLearn.bind(s);s.decideLearn=(...a)=>{calls++;return decide(...a);};await h.frames(1);if(how==='abort')h.flow.abort(Error('owned initial learning abort'));else if(how==='replace')h.flow.stateReplaced();else h.s.terminate();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(2);assert.equal(calls,0);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s.party),moves);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('initial learning prompt reveals normally while commands stay locked',async()=>{
 const h=await open();try{h.flow.fast=false;const s=h.s._session;let calls=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...a)=>{calls++;return decide(...a);};for(let i=0;i<12&&h.state();i++)await h.p.press('ok');await h.waitFor(()=>h.s._learningInitial&&h.s._mode==='messages','typing initial learning question');assert(!h.s.inputState().ready);h.s.onMenuOk();h.s.onMenuCancel();assert.equal(calls,0);await h.p.press('ok');await h.p.inMode('learn-initial');assert.equal(calls,0);await initialAnswer(h,'forget-move');assert.equal(h.s._mode,'learn');assert.equal(calls,0);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});

test('compiled generic inMode driver explicitly accepts the new question before its old selector predicate',async()=>{
 const h=await open();try{await initialQuestion(h);const start=entryText.indexOf('async function inMode('),stop=entryText.indexOf('async function dismissMessages(',start);assert(start>=0&&stop>start,'actual compiled driver readiness helper');
 const report={},choose=async({key})=>{const i=h.s._menu._items.findIndex(row=>row.ext===key);assert(i>=0);h.s._menu.select(i);h.s.onMenuOk();await h.frames(1);};
 const wait=async(condition,label)=>h.waitFor(condition,label),inMode=new Function('waitBattlePresentation','battle','frames','choose','report','frame',entryText.slice(start,stop)+'\nreturn inMode;')(wait,h.p.battle,h.frames,choose,report,h.G.Graphics.frameCount);
 await inMode('learn');assert.equal(h.s._mode,'learn');assert.deepEqual(report.learningInitialConfirmations.map(row=>row.answer),['forget-move']);assert(h.s._session.pendingLearn);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});


// WP67-A 7.2: actual full-slot announcement uses the existing paused message,
// separately from the subsequent permission question and final result commit.
async function learningNotice(h){
 const message=h.messages.find(m=>m.kind==='learn-prompt');assert(message,'actual pending learning message');const text=h.s._D.message(message)[0];let found=false;
 // Observe the actual growth factories and delegate unchanged. Use real inputs
 // for their front pauses/panels; never turn fast back on to reach the notice.
 for(let i=0;i<2400;i++){
  const step=h.s._ordinaryMessage,view=step?.snapshot();
  if(step&&!h.growthPauses.includes(step)&&view.implementation==='paused-message-v1'){found=true;break;}
  if(step&&!h.growthPauses.includes(step)&&view.phase==='full'&&h.s._log._lines.join(' ')===text)assert.equal(view.implementation,'paused-message-v1','learning notice must remain paused after growth');
  assert.notEqual(h.s._mode,'learn-initial','permission cannot precede the paused announcement');
  if(h.state()||step)await h.p.press('ok');else await h.frames(1);
 }
 assert(found,'bounded actual wants-to-learn paused stage');
 const view=h.s.ordinaryMessageState();assert.equal(view.implementation,'paused-message-v1','full-slot announcement is a paused message, not an ordinary one-second line');
 assert.equal(h.s._mode,'messages');assert.equal(h.s.inputState().ready,false);assert.equal(h.s._learningInitial??null,null,'permission question must wait for the announcement');
 return h.s._ordinaryMessage;
}
for(const lang of ['en','zh'])test(lang+' normal full-slot notification reveals then pauses before the separate permission question',async()=>{
 const h=await open({lang,normalLearning:true});try{const step=await learningNotice(h),s=h.s._session,pending=s.pendingLearn,moves=JSON.stringify(s.party[0].moves),text=h.s._D.message(h.messages.find(m=>m.kind==='learn-prompt'))[0];let decisions=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{decisions++;return decide(...args);};
 assert.equal(step.snapshot().phase,'typing');assert.equal(h.s._log.pause,false);assert(step.snapshot().visible<step.snapshot().total);assert.equal(step.snapshot().total,Array.from(text).length);
 const sounds=h.sounds;h.s.onMenuOk();h.s.onMenuCancel();assert.equal(decisions,0);await h.p.press('ok');assert.equal(step.snapshot().phase,'full','the reveal input cannot also dismiss');assert.equal(h.s._log.pause,true);assert.equal(h.sounds,sounds,'revealing is not a confirmation sound');assert.equal(h.s._log._lines.join(' '),text);assert.equal(s.pendingLearn,pending);
 await h.frames(120);assert.equal(step.snapshot().phase,'full','one-second ordinary dwell must not dismiss a paused learning notice');assert.equal(h.s._learningInitial??null,null);assert.equal(decisions,0);assert.equal(JSON.stringify(s.party[0].moves),moves);assert.equal(JSON.stringify(h.flow.game()),h.before);
 await h.p.press('ok');assert.equal(step.snapshot().phase,'done');assert.equal(h.sounds,sounds+1);await h.p.inMode('learn-initial');assert.equal(decisions,0);assert.equal(s.pendingLearn,pending);assert.equal(h.s._log.pause,false);assert(h.s._log._lines.join(' ').includes(lang==='zh'?'遗忘一个招式':'forget a move'));
 await initialAnswer(h,'decline-learning');await h.p.inMode('end');assert.equal(decisions,1);assert.equal(JSON.stringify(s.party[0].moves),moves);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
test('normal full-slot notification uses its own three-second full-text dwell without choosing a learning answer',async()=>{
 const h=await open({normalLearning:true});try{const step=await learningNotice(h);await h.waitFor(()=>step.snapshot().phase==='full','natural full learning notice');assert.equal(h.s._log.pause,true);const at=step.snapshot().fullyShownAt;
 while(h.G.performance.now()-at<2960)await h.frames(1);assert.equal(step.snapshot().phase,'full');assert.equal(h.s._learningInitial??null,null);assert(h.G.performance.now()-at<3000);
 await h.frames(4);assert.equal(step.snapshot().phase,'done');await h.p.inMode('learn-initial');assert.equal(h.s._menu.index(),0);assert(h.s._session.pendingLearn,'automatic text dwell is not an automatic Yes');assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires a visible full-slot paused notification without a late permission or learn decision',async()=>{
 const h=await open({normalLearning:true});try{const step=await learningNotice(h);await h.p.press('ok');assert.equal(step.snapshot().phase,'full');const s=h.s._session,pending=s.pendingLearn,working=JSON.stringify(s.party);let decisions=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{decisions++;return decide(...args);};
 if(how==='abort')h.flow.abort(Error('owned learning notice abort'));else if(how==='replace')h.flow.stateReplaced();else h.s.terminate();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(3);assert.equal(step.snapshot().phase,'done');assert.equal(h.s._log.pause,false);assert.equal(h.s.ordinaryMessageState(),null);assert.equal(h.s._learningInitial??null,null);assert.equal(decisions,0);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s.party),working);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});

// Shared teaching renderer, original App/Session and compiled Battle Scene.
// Window_Command refresh/raster/input are controlled, not native pixels or fonts.
for(const lang of ['en','zh'])test(lang+' shared learning details show all five choices and live PP, then restore normal menus and commit once',async()=>{
 const h=await open({lang});try{await learningRoot(h);const scene=h.s,session=scene._session,normal=scene._commandMenu,win=scene._menu;
 assert.equal(typeof scene.learningMoveState,'function','production Scene must expose its actual move detail presentation');
 let view=scene.learningMoveState();assert(view,'shared full-window move chooser is visible');assert.notEqual(win,normal);assert.equal(normal.visible,false);assert.equal(normal.active,false);assert.equal(win.page.kind,'moves');
 assert.deepEqual(Array.from(view.page.rows,r=>r.moveId),['tackle','growl','splash','protect','rest']);assert.deepEqual(Array.from(scene.inputState().items,r=>r.key),[0,1,2,3,null]);
 assert.equal(view.page.rows[0].details,session.party[0].moves[0].pp+'/35 PP');assert.equal(session.party[0].moves[0].pp,34,'real KO consumed Tackle PP');assert(view.text.includes(lang==='zh'?'招式详情':'Move details'));assert(view.text.includes(lang==='zh'?'属性：Normal':'Type: Normal'));assert(view.text.includes(lang==='zh'?'威力：40':'Power: 40'));
 // Read-only observation is detached, and selecting a row redraws its actual description.
 view.page.rows[0].text='changed observer';view.text.length=0;assert.notEqual(scene.learningMoveState().page.rows[0].text,'changed observer');
 const draw=[];win.contents.drawText=(...args)=>draw.push(args);win.select(4);view=scene.learningMoveState();assert.equal(view.page.cursor,4);assert.equal(view.page.rows[4].details,lang==='zh'?'保留原有招式':'Keep the old moves');
 assert(view.text.includes(lang==='zh'?'属性：Psychic':'Type: Psychic'));assert(view.text.includes(lang==='zh'?'分类：Status':'Category: Status'));assert(draw.some(args=>String(args[0]).includes('Rest')));assert(draw.some(args=>String(args[0]).includes('Psychic')));assert(view.text.some(t=>t.includes('User sleeps')||t.includes('fully heals')),'locked Gen8 description is rendered');
 // Drawing and pointer rectangles share exactly the same row origin/height/width.
 const rect=win.itemRect(4),left=Math.floor(win.contents.width*.46);assert.equal(rect.x,8);assert.equal(rect.y,124+4*34);assert.equal(rect.width,left-16);assert.equal(rect.height,32);assert.equal(win.maxScrollY(),0);assert.equal(win.maxCols(),1);
 let decisions=0,installs=0,doc=h.G.$gameSystem._psGame;const decide=session.decideLearn.bind(session);session.decideLearn=(...a)=>{decisions++;return decide(...a);};Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
 scene.onMenuOk();await h.p.inMode('learn-giveup');assert.equal(scene._menu,normal);assert.equal(win.visible,false);assert.equal(win.active,false);assert.equal(scene.learningMoveState(),null);assert.equal(decisions,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
 await answer(h,'continue-learning');assert.equal(scene._menu,win);assert.equal(win.index(),4);assert.equal(scene.learningMoveState().page.cursor,4);assert.equal(decisions,0);win.select(3);scene.onMenuOk();await h.p.inMode('end');assert.equal(scene._menu,normal);assert.equal(win.visible,false);assert.equal(win.active,false);assert.equal(session.party[0].moves[3].id,'rest');assert.equal(session.party[0].moves[3].pp,10);assert.equal(session.gw.readState('p1')[0].pp.rest,10);assert.equal(decisions,1);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
 await h.frames(1);scene.onMenuOk();await h.frames(3);assert.equal(installs,1);assert.equal(h.flow.lastOutcome.commit,'applied');scene.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires shared learning details without a late choice and releases its owned window once',async()=>{
 const h=await open();try{await learningRoot(h);const scene=h.s,win=scene._menu,session=scene._session;assert.equal(typeof scene.learningMoveState,'function','real shared detail window required');assert(scene.learningMoveState());let decisions=0;const decide=session.decideLearn.bind(session);session.decideLearn=(...args)=>{decisions++;return decide(...args);};const before=JSON.stringify(session.party);
 if(how==='abort')h.flow.abort(Error('owned detail cancellation'));else if(how==='replace')h.flow.stateReplaced();else scene.terminate();win.select(1);scene.onMenuOk();scene.onMenuCancel();await h.frames(2);assert.equal(decisions,0);assert.equal(JSON.stringify(session.party),before);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(scene.learningMoveState(),null);if(how!=='terminate')scene.terminate();assert.equal(h.destroyed.filter(w=>w===win).length,1);assert.equal(win.visible,false);assert.equal(win.active,false);assert.equal(scene._learningMenu,null);
 }finally{h.cleanup();}
});


// D2/WP67-A 7.1: normal experience/level text owns a pause before bars/panels.
async function growthPause(h,text){
 for(let i=0;i<1200;i++){
  const step=h.s._ordinaryMessage,view=step?.snapshot();
  if(view?.implementation==='paused-message-v1'){
   assert.equal(view.total,Array.from(text).length,'actual next paused growth line, not an unrelated text');return step;
  }
  if(view?.phase==='full'&&h.s._log._lines.join(' ')===text)assert.equal(view.implementation,'paused-message-v1','experience and level text must use the paused contract');
  await h.p.press('ok');
 }
 assert.fail('bounded growth paused-message stage');
}
function growthTexts(h){const msg=h.messages.find(m=>m.kind==='growth');assert(msg&&msg.exp>0&&msg.levelUps.includes(51));return {exp:h.s._D.message({...msg,levelUps:[]})[0],level:h.s._D.message({...msg,exp:0,levelUps:[51]})[0]};}
for(const lang of ['en','zh'])test(lang+' normal growth messages pause before the bar and level stats without committing working growth',async()=>{
 const h=await open({lang,normalGrowth:true});try{
  const texts=growthTexts(h),exp=await growthPause(h,texts.exp),s=h.s._session;
  assert.equal(exp.snapshot().phase,'typing');assert.equal(h.state(),null);assert.equal(s.party[0].level,51,'working growth is already applied');assert.equal(h.s.presentationState().cards.find(c=>c.side==='p1').level,50,'level presentation waits behind experience text');assert.equal(JSON.stringify(h.flow.game()),h.before);
  const sound=h.sounds;await h.p.press('ok');assert.equal(exp.snapshot().phase,'full','the reveal input does not also dismiss');assert.equal(h.s._log._lines.join(' '),texts.exp);assert.equal(h.s._log.pause,true);assert.equal(h.sounds,sound);await h.frames(120);assert.equal(exp.snapshot().phase,'full','ordinary one-second dwell is insufficient');assert.equal(h.state(),null);assert(!h.s.inputState().ready);
  await h.p.press('ok');assert.equal(exp.snapshot().phase,'done');const level=await growthPause(h,texts.level);assert.equal(level.snapshot().phase,'typing');assert.equal(h.state(),null);assert.equal(h.s.presentationState().cards.find(c=>c.side==='p1').level,51);await h.p.press('ok');assert.equal(level.snapshot().phase,'full');assert.equal(h.s._log._lines.join(' '),texts.level);await h.frames(120);assert.equal(level.snapshot().phase,'full');assert.equal(h.state(),null);await h.p.press('ok');await h.waitFor(()=>h.state(),'stats only after level pause');assert.equal(h.state().phase,'delta');await h.p.press('ok');assert.equal(h.state().phase,'total');assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
test('non-terminal growth pause naturally ends only after its own three-second full-text dwell',async()=>{
 const h=await open({normalGrowth:true});try{const texts=growthTexts(h),exp=await growthPause(h,texts.exp);await h.waitFor(()=>exp.snapshot().phase==='full','natural experience full paint');assert.equal(h.s._session.finished,false,'pending learning keeps the Session non-terminal');assert.equal(h.s._log._lines.join(' '),texts.exp);const at=exp.snapshot().fullyShownAt;while(h.G.performance.now()-at<2960)await h.frames(1);assert.equal(exp.snapshot().phase,'full');assert(h.G.performance.now()-at<3000);await h.frames(4);assert.equal(exp.snapshot().phase,'done');assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('terminal experience and level pauses require input, then Continue installs the result exactly once',async()=>{
 const h=await open({normalGrowth:true,noLearn:true});try{let installs=0,doc=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});const texts=growthTexts(h),exp=await growthPause(h,texts.exp);assert.equal(h.s._session.finished,true);await h.p.press('ok');assert.equal(exp.snapshot().phase,'full');await h.frames(400);assert.equal(exp.snapshot().phase,'full','battle-ended pause never auto-closes');assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.p.press('ok');const level=await growthPause(h,texts.level);await h.p.press('ok');await h.frames(400);assert.equal(level.snapshot().phase,'full');assert.equal(h.state(),null);await h.p.press('ok');await h.waitFor(()=>h.state(),'terminal level stats');await h.p.press('ok');await h.p.press('ok');await h.p.inMode('end');assert.equal(installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(installs,1);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(h.flow.game().party[0].level,51);h.s.onEnd();assert.equal(installs,1);}finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires a visible growth pause without leaking input or installing the battle',async()=>{
 const h=await open({normalGrowth:true});try{const texts=growthTexts(h),exp=await growthPause(h,texts.exp);await h.p.press('ok');assert.equal(exp.snapshot().phase,'full');const s=h.s._session,working=JSON.stringify(s.party);if(how==='abort')h.flow.abort(Error('owned growth pause abort'));else if(how==='replace')h.flow.stateReplaced();else h.s.terminate();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(3);assert.equal(exp.snapshot().phase,'done');assert.equal(h.s._log.pause,false);assert.equal(h.s.ordinaryMessageState(),null);assert.equal(h.state(),null);assert.equal(JSON.stringify(s.party),working);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});

// Explicit author catalog classification, not a claim that Tackle is an official Gen8 HM.
for(const lang of ['en','zh'])test(lang+' HM-protected battle choice explains refusal and reselects without a domain decision',async()=>{
 const h=await open({lang,machineMove:'tackle'});try{await learningRoot(h);const s=h.s._session,pending=s.pendingLearn,working=JSON.stringify(s.party),engine=JSON.stringify(s.gw.checkpoint()),request=JSON.stringify(s.currentRequest()),completed=[],add=h.s._log.add.bind(h.s._log);h.s._log.add=line=>{completed.push(line);return add(line);};let decisions=0,installs=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{decisions++;return decide(...args);};let doc=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});const expected=lang==='zh'?'学习时不能替换秘传招式，请重新选择。':'HM moves cannot be replaced while learning. Choose another move.';
 for(let i=0;i<2;i++){h.s._menu.select(0);h.s.onMenuOk();await h.frames(1);await h.p.inMode('learn');assert.equal(completed.filter(line=>line===expected).length,i+1,'actual localized HM warning must be presented');assert.equal(decisions,0);assert.equal(s.pendingLearn,pending);assert.equal(h.s._menu.index(),0);assert.equal(JSON.stringify(s.party),working);assert.equal(JSON.stringify(s.gw.checkpoint()),engine);assert.equal(JSON.stringify(s.currentRequest()),request);assert.equal(JSON.stringify(h.flow.game()),h.before);}
 h.s._menu.select(1);h.s.onMenuOk();await h.p.inMode('end');assert.equal(decisions,1);assert.equal(s.party[0].moves[0].id,'tackle');assert.equal(s.party[0].moves[1].id,'rest');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.equal(h.flow.game().party[0].moves[0].id,'tackle');assert.equal(h.flow.game().party[0].moves[1].id,'rest');h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
test('direct Session battle HM catalog refusal preserves the exact question, output and engine before a normal choice',async()=>{
 const h=await open({machineMove:'tackle'});try{await learningRoot(h);const s=h.s._session,pending=s.pendingLearn,working=JSON.stringify(s._checkpoint());const first=await s.decideLearn(0);assert.equal(s.party[0].moves[0].id,'tackle','Session must not replace the catalog HM even when UI is bypassed');assert.deepEqual(first,[]);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s._checkpoint()),working);assert.deepEqual(await s.decideLearn(0),[]);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s._checkpoint()),working);
 const read=E.battlePresentation.readBattleLearnProtection,projection=read(s,0);assert.deepEqual(projection,{version:1,memberId:'LEVEL-P1',slot:0,moveId:'tackle',reason:'hm-protected'});projection.slot=3;projection.moveId='growl';assert.equal(read(s,0).moveId,'tackle','projection mutation grants no decision authority');assert.equal(read(s,1),null);await s.decideLearn(1);assert.equal(s.party[0].moves[0].id,'tackle');assert.equal(s.party[0].moves[1].id,'rest');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(s.pendingLearn,null);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
test('a catalog TM for the same old move does not gain HM protection or alter ordinary replacement',async()=>{
 const h=await open({machineMove:'tackle',machineKind:'tm'});try{await learningRoot(h);const s=h.s._session;assert.equal(E.battlePresentation.readBattleLearnProtection(s,0),null);h.s._menu.select(0);h.s.onMenuOk();await h.p.inMode('end');assert.equal(s.party[0].moves[0].id,'rest');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('HM rejection of the fourth slot restores that slot and still permits cancelling and giving up',async()=>{
 const h=await open({machineMove:'protect'});try{await learningRoot(h);const s=h.s._session,pending=s.pendingLearn,moves=JSON.stringify(s.party[0].moves);h.s._menu.select(3);h.s.onMenuOk();await h.frames(1);await h.p.inMode('learn');assert.equal(s.pendingLearn,pending);assert.equal(h.s._menu.index(),3);assert.equal(h.s.learningMoveState().page.cursor,3);assert.equal(JSON.stringify(s.party[0].moves),moves);await question(h);await answer(h,'continue-learning');assert.equal(h.s._menu.index(),3);await question(h);await answer(h,'give-up');await h.p.inMode('end');assert.equal(s.pendingLearn,null);assert.equal(JSON.stringify(s.party[0].moves),moves);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
for(const how of ['abort','replace','terminate'])test(how+' retires a typed HM warning and rejects delayed learning input',async()=>{
 const h=await open({machineMove:'tackle'});try{await learningRoot(h);const s=h.s._session,working=JSON.stringify(s.party);let decisions=0;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{decisions++;return decide(...args);};h.flow.fast=false;h.s._menu.select(0);h.s.onMenuOk();await h.frames(1);assert.equal(h.s._mode,'messages','HM refusal must display text rather than silently completing learning');assert.equal(decisions,0);const step=h.s._ordinaryMessage;assert(step);if(how==='abort')h.flow.abort(Error('owned HM warning abort'));else if(how==='replace')h.flow.stateReplaced();else h.s.terminate();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(3);assert.equal(step.snapshot().phase,'done');assert.equal(decisions,0);assert.equal(JSON.stringify(s.party),working);assert.equal(JSON.stringify(h.flow.game()),h.before);h.s.terminate();assert.equal(h.s._learningRetry,null);
 }finally{h.cleanup();}
});

// GLI: ordinary valid level/EXP, real Gen8 KO and compiled production Scene.
for(const lang of ['en','zh'])test('GLI '+lang+' each level waits for its own learning decision before later growth and commits only once',async()=>{
 const h=await open({lang,normalAward:true,levelLearnset:{6:['Rest'],7:['Growl']}});try{
  const s=h.s._session;let doc=h.G.$gameSystem._psGame,installs=0;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  assert.equal(h.initialCard.level,5);assert.equal(h.initialCard.experienceUnavailable,undefined,'valid initial EXP interval');assert.equal(h.state().level,6);
  assert.equal(s.party[0].level,6,'later growth must wait for current-level learning');assert.equal(s.gw.readState('p1')[0].level,6);assert.equal(s.pendingLearn.move.id,'rest');
  await h.p.press('ok');await h.p.press('ok');await enterLearningSelector(h);assert.equal(h.s.presentationState().cards.find(x=>x.side==='p1').level,6);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  h.s._menu.select(1);h.s.onMenuOk();await h.waitFor(()=>h.state()?.level===7,'next level after learning Rest');assert.equal(s.party[0].level,7);assert.equal(s.party[0].moves[1].id,'rest');assert.equal(s.gw.readState('p1')[0].pp.rest,10,'later growth preserves newly learned engine PP');assert.equal(s.pendingLearn.move.id,'growl');
  await h.p.press('ok');await h.p.press('ok');await enterLearningSelector(h);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);h.s._menu.select(2);h.s.onMenuOk();await h.p.inMode('end');assert.equal(s.party[0].moves[2].id,'growl');assert.equal(installs,0);
  const growth=h.messages.filter(m=>m.kind==='growth');assert.deepEqual(growth.map(m=>Array.from(m.levelUps)),[[6],[7]]);assert.equal(growth.reduce((sum,m)=>sum+m.exp,0),269,'award announced once, no duplicated gain');
  await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(installs,1);assert.equal(h.flow.game().party[0].level,7);assert.equal(h.flow.game().party[0].moves[1].id,'rest');assert.equal(h.flow.game().party[0].moves[2].id,'growl');h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});

test('GLI declining the first level preserves moves and still presents the following level once',async()=>{
 const h=await open({normalAward:true,levelLearnset:{6:['Rest'],7:['Growl']}});try{const s=h.s._session;await h.p.press('ok');await h.p.press('ok');await firstLearningStage(h);await h.frames(1);h.s._menu.select(h.s._menu._items.findIndex(x=>x.ext==='decline-learning'));h.s.onMenuOk();await h.waitFor(()=>h.state()?.level===7,'next level after declining');assert.equal(s.pendingLearn,null,'already known Growl is skipped');assert(!s.party[0].moves.some(x=>x.id==='rest'));await h.p.press('ok');await h.p.press('ok');await h.p.inMode('end');assert.equal(JSON.stringify(h.flow.game()),h.before);assert.deepEqual(h.messages.filter(m=>m.kind==='growth').flatMap(m=>Array.from(m.levelUps)),[6,7]);}finally{h.cleanup();}
});
test('GLI empty slots append at their level in the message sequence without duplicating EXP or overwriting slots',async()=>{
 const h=await open({normalAward:true,moveSlots:1,levelLearnset:{6:['Rest'],7:['Growl']}});try{const s=h.s._session;assert.deepEqual(h.messages.filter(m=>['growth','learned'].includes(m.kind)).map(m=>m.kind==='growth'?'level'+m.levelUps.join(','):m.move),['level6','rest']);assert.deepEqual(s.party[0].moves.map(x=>x.id),['hypervoice','rest']);assert.equal(s.gw.readState('p1')[0].pp.rest,undefined,'first learned message has not returned');await h.p.press('ok');await h.p.press('ok');await h.waitFor(()=>h.state()?.level===7,'second automatic learning level');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(s.gw.readState('p1')[0].pp.growl,undefined,'second learned message has not returned');await h.p.press('ok');await h.p.press('ok');await h.p.inMode('end');assert.deepEqual(h.messages.filter(m=>['growth','learned'].includes(m.kind)).map(m=>m.kind==='growth'?'level'+m.levelUps.join(','):m.move),['level6','rest','level7','growl']);assert.deepEqual(s.party[0].moves.map(x=>x.id),['hypervoice','rest','growl']);assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(s.gw.readState('p1')[0].pp.growl,40);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('GLI checkpoint restores a suspended growth stage without overwriting a subsequently learned move or PP',async()=>{
 const h=await open({normalAward:true,levelLearnset:{6:['Rest'],7:['Growl']}});try{const s=h.s._session,cp=s._checkpoint();assert.equal(s.party[0].level,6);const first=await s.decideLearn(1);assert.equal(s.party[0].level,7);const retired=first.find(m=>m.kind==='growth');assert(E.battlePresentation.readGrowthDisplay(s,retired));await s._restoreCheckpoint(cp);assert.equal(s.party[0].level,6);assert.equal(s.gw.readState('p1')[0].level,6);assert.equal(s.pendingLearn.move.id,'rest');assert.equal(E.battlePresentation.readGrowthDisplay(s,retired),null);const again=await s.decideLearn(1);assert.equal(again.filter(m=>m.kind==='growth').length,1);assert.equal(s.pendingLearn.move.id,'growl');assert.equal(s.party[0].moves[1].id,'rest');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('GLI abort at the first learning gate prevents later queued levels and persistent writes',async()=>{
 const h=await open({normalAward:true,levelLearnset:{6:['Rest'],7:['Growl']}});try{await h.p.press('ok');await h.p.press('ok');await enterLearningSelector(h);const s=h.s._session;h.flow.abort(Error('owned interleaving interruption'));h.s.onMenuOk();await h.frames(3);assert.equal(s.party[0].level,6);assert.equal(s.gw.readState('p1')[0].level,6);assert(!s.party[0].moves.some(x=>x.id==='rest'));assert.equal(JSON.stringify(h.flow.game()),h.before);assert(!h.flow.app().saveBlocked);}finally{h.cleanup();}
});


// ELS: the working individual and the active engine own distinct move-table writes.
async function emptyLearnNotice(h,move='rest'){
 const text=h.s._D.message({kind:'learned',member:'LEVEL-P1',move,replaced:null})[0];
 for(let i=0;i<2400;i++){
  const step=h.s._ordinaryMessage,view=step?.snapshot();
  if(step&&view.phase!=='done'&&h.s._log._lines.join(' ')===text)return step;
  if(h.state()||step)await h.p.press('ok');else await h.frames(1);
 }
 assert.fail('bounded real empty-slot learned message: '+move);
}
async function emptyAdvanceUntil(h,condition,label){
 for(let i=0;i<2400;i++){if(condition())return;if(h.state()||h.s._ordinaryMessage)await h.p.press('ok');else await h.frames(1);}
 assert.fail('bounded normal learning continuation: '+label);
}
async function emptyEnd(h){await emptyAdvanceUntil(h,()=>h.s._mode==='end'&&!h.s._busy&&!h.s._queue.length,'end');}
for(const lang of ['en','zh'])test('ELS '+lang+' empty-slot learned message precedes engine append and the next learning level',async()=>{
 const h=await open({lang,normalAward:true,moveSlots:1,normalLearning:true,levelLearnset:{6:['Rest'],7:['Growl']}});try{
  const step=await emptyLearnNotice(h),s=h.s._session;
  assert.equal(s.gw.readState('p1')[0].pp.rest,undefined,'battle move is absent during the learned message');
  assert.deepEqual(s.party[0].moves.map(m=>m.id),['hypervoice','rest'],'individual move is already written');assert.equal(s.party[0].level,6,'future growth still waits');assert.equal(s.finished,false);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(h.s.inputState().ready,false);
  if(step.snapshot().phase==='typing')await h.p.press('ok');else await h.frames(1);await h.frames(4);assert.notEqual(step.snapshot().phase,'done');assert.equal(s.gw.readState('p1')[0].pp.rest,undefined,'the engine stays unchanged before the ordinary message returns');h.s.onMenuOk();h.s.onMenuCancel();assert.equal(s.gw.readState('p1')[0].pp.rest,undefined);
  await emptyAdvanceUntil(h,()=>h.state()?.level===7,'next level after learned message');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(s.party[0].level,7);const second=await emptyLearnNotice(h,'growl');assert.equal(s.gw.readState('p1')[0].pp.growl,undefined);assert(s.party[0].moves.some(m=>m.id==='growl'));assert.equal(JSON.stringify(h.flow.game()),h.before);
  await h.waitFor(()=>second.snapshot().phase==='done','second learned message return');await emptyEnd(h);assert.equal(s.gw.readState('p1')[0].pp.growl,40);assert.equal(JSON.stringify(h.flow.game()),h.before);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.deepEqual(h.flow.game().party[0].moves.map(m=>m.id),['hypervoice','rest','growl']);const saved=JSON.stringify(h.flow.game());h.s.onEnd();assert.equal(JSON.stringify(h.flow.game()),saved);
 }finally{h.cleanup();}
});
test('ELS same-level empty-slot moves each wait for their own returned message',async()=>{
 const h=await open({normalAward:true,moveSlots:1,normalLearning:true,levelLearnset:{6:['Rest','Growl'],7:[]}});try{
  const first=await emptyLearnNotice(h),s=h.s._session;assert.equal(s.gw.readState('p1')[0].pp.rest,undefined);assert(!s.party[0].moves.some(m=>m.id==='growl'));
  const second=await emptyLearnNotice(h,'growl');assert.equal(first.snapshot().phase,'done');assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(s.gw.readState('p1')[0].pp.growl,undefined);await emptyEnd(h);assert.equal(second.snapshot().phase,'done');assert.equal(s.gw.readState('p1')[0].pp.growl,40);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
for(const how of ['abort','replace'])test('ELS '+how+' while an empty-slot message is visible never synchronizes or saves the retired battle',async()=>{
 const h=await open({normalAward:true,moveSlots:1,normalLearning:true,levelLearnset:{6:['Rest'],7:['Growl']}});try{
  const step=await emptyLearnNotice(h),s=h.s._session;assert.equal(s.gw.readState('p1')[0].pp.rest,undefined);const live=JSON.stringify(s.gw.readState('p1'));if(how==='abort')h.flow.abort(Error('owned learned-message abort'));else h.flow.stateReplaced();h.s.onMenuOk();h.s.onMenuCancel();await h.frames(10);assert.equal(step.snapshot().phase,'done');assert.equal(JSON.stringify(s.gw.readState('p1')),live);assert.equal(s.party[0].level,6);assert.equal(JSON.stringify(h.flow.game()),h.before);assert(!h.flow.app().saveBlocked);
 }finally{h.cleanup();}
});
test('ELS pending engine append survives checkpoint and a failed sync restores both sides without duplicate append',async()=>{
 const h=await open({normalAward:true,moveSlots:1,normalLearning:true,levelLearnset:{6:['Rest'],7:[]}});try{
  await emptyLearnNotice(h);const s=h.s._session,cp=s._checkpoint(),before=JSON.stringify(s.party),engine=JSON.stringify(s.gw.readState('p1')),apply=s.gw.applyGrowth.bind(s.gw);let injected=false;
  s.gw.applyGrowth=(...args)=>{const r=apply(...args);if(args[2].newMoves&&!injected){injected=true;throw Error('controlled engine append failure');}return r;};await assert.rejects(E.session.completeLearnedMessage(s),/controlled engine append failure/);assert(injected);assert.equal(E.session.readLearnedMessagePending(s),true);assert.equal(JSON.stringify(s.party),before);assert.equal(JSON.stringify(s.gw.readState('p1')),engine);
  await s._restoreCheckpoint(cp);assert.equal(E.session.readLearnedMessagePending(s),true);await emptyEnd(h);assert.equal(s.gw.readState('p1')[0].pp.rest,10);assert.equal(s.party[0].moves.filter(m=>m.id==='rest').length,1);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});


test('LCI capture growth waits for each empty-slot message before finishing the caught result',async()=>{
 const h=await open({normalAward:true,moveSlots:1,normalLearning:true,levelLearnset:{6:['Rest'],7:['Growl']},capture:true});try{
  await emptyLearnNotice(h);const s=h.s._session;assert.equal(s.captureExpGain,true);assert.equal(s.ended.reason,'caught');assert.equal(s.finished,false);assert(E.session.readLearnedMessagePending(s));assert.equal(s.gw.readState('p1')[0].pp.rest,undefined);assert(s.party[0].moves.some(m=>m.id==='rest'));assert.equal(s.party[0].level,6);assert.throws(()=>s.result(),/not finished/);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await emptyAdvanceUntil(h,()=>h.state()?.level===7,'caught second level after Rest');assert.equal(s.gw.readState('p1')[0].pp.rest,10);await emptyLearnNotice(h,'growl');assert.equal(s.gw.readState('p1')[0].pp.growl,undefined);assert.equal(s.finished,false);await emptyEnd(h);const result=s.result();assert.equal(result.captured.length,1);assert.equal(result.bag.masterball,-1);assert.deepEqual(result.members['LEVEL-P1'].moves.map(m=>m.id),['hypervoice','rest','growl']);assert.equal(s.gw.readState('p1')[0].pp.growl,40);assert.equal(JSON.stringify(h.flow.game()),h.before,'even completed battle presentation has not installed the caught member');
 }finally{h.cleanup();}
});
