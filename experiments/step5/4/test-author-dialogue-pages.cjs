'use strict';
// Real App/Gen8 and compiled Scene. Font widths/renderer/input/clock are controlled, not actual NW typography.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs'),PLAN=require('./victory-music-native-plan.json');
const FONT=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'))).advanced.fontSize;
assert(Number.isFinite(FONT)&&FONT>0,'configured font size for the controlled measurement model');
const EN=('I have trained my team with care, and I will keep learning from this battle. ').repeat(16)+'FINAL_AUTHOR_TAIL';
const ZH=('我会认真照顾伙伴并继续努力训练，下次见面时我们会一起变得更强。').repeat(18)+'作者最后一句';
let temp,plugins,entryText,fixture;
test.before(async()=>{
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-author-pages-'));plugins={};
  for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
    const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
    const code=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
  }
  if(process.env.PF_AUTHOR_DIALOGUE_MUTATION){assert.equal(process.env.PF_AUTHOR_DIALOGUE_MUTATION,'truncate');const marker='Window_PSText.prototype.textPages = function(text) {';assert.equal(plugins.PS_BattleFlow.split(marker).length,2);plugins.PS_BattleFlow=plugins.PS_BattleFlow.replace(marker,marker+' return [[this.fitText(text)]];');}
  const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'fixture'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});fixture=require(path.join(temp,'fixture/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open({lang='en',opening='',ending='You won this time.',fast=false}={}){
  const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow;
  // Same 26px half/full-width model as the independent R9 reproducer; real runtime uses Window.textWidth.
  G.Window_Base.prototype.textWidth=text=>Array.from(String(text)).reduce((n,c)=>n+(c.codePointAt(0)<128?FONT/2:FONT),0);G.Window_Base.prototype.lineHeight=()=>FONT+10;
  const content=fixture.musicNativeContent(E,assert),type=content.trainerTypes['music-type-normal'];type.openingText=opening;type.loseText=ending;type.baseMoney=20;content.trainers['music-normal'][0].name='Avery';
  const parameters=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const v=parameters.call(this,name);return name==='PS_BattleFlow'?{...v,language:lang}:v;};
  flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=fast;G.$gameSystem._psGame=fixture.musicNativeState(E,content);
  await h.p.toMapId(5,8,9);const system=G.$gameSystem,descriptor=Object.getOwnPropertyDescriptor(system,'_psGame'),before=JSON.stringify(flow.game());let value=descriptor.value;const installs=[];
  const get=()=>value,set=v=>{installs.push(v);value=v;};Object.defineProperty(system,'_psGame',{configurable:true,enumerable:descriptor.enumerable,get,set});
  flow.openBattle({kind:'trainer',trainer:{id:'music-normal',version:1},battleId:'author-pages-'+path.basename(h.w.root),seq:1,canLose:true});await h.waitFor(()=>!!h.p.battle()?._session,'actual Session');
  const s=h.p.battle(),app=flow.app(),shows=[];for(const method of ['add','setLines']){const fn=s._log[method];s._log[method]=function(...args){const result=fn.apply(this,args);shows.push({at:G.performance.now(),frame:G.Graphics.frameCount,lines:Array.from(this._lines)});return result;};}return {...h,s,flow,app,before,installs,content,shows,cleanup(){if(flow.running)flow.abort(Error('owned author-page test cleanup'));const d=Object.getOwnPropertyDescriptor(system,'_psGame');if(d?.get===get&&d?.set===set)Object.defineProperty(system,'_psGame',{...descriptor,value});}};
}
const visible=h=>Array.from(h.s._log._lines),sameState=h=>{assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(h.installs.length,0);assert(h.app.saveBlocked);};
async function collectOpening(h){
  await h.waitFor(()=>h.s._log.pause,'challenge pause');await h.p.press('ok');const pages=[];
  for(let n=0;n<32;n++){
    await h.waitFor(()=>h.s._log.pause||h.s.inputState().ready,'author page or main');if(h.s.inputState().ready)return pages;
    const step=h.s._queue[0],challenge=E.i18n.translatorFor(h.flow.translator().lang).t('trainer.challenged',{name:'Avery'});pages.push(visible(h).filter(t=>t!==challenge));sameState(h);assert(!h.s.inputState().ready);
    await h.p.press('ok');await h.waitFor(()=>h.s.inputState().ready||h.s._log.pause&&h.s._queue[0]!==step,'new page or normal main');
  }
  throw Error('bounded author opening pages');
}
for(const [lang,text]of [['en',EN],['zh',ZH]])test(lang+' long opening preserves every author character across width-limited pages before send-outs',async()=>{
  const h=await open({lang,opening:text});try{const pages=await collectOpening(h);assert.equal(pages.flat().join(''),text,'complete authored opening, no ellipsis/lost suffix');assert(pages.length>1);assert(pages.every(p=>p.length<=h.s._log._max&&p.every(t=>h.s._log.textWidth(t)<=h.s._log.innerWidth)));sameState(h);assert(h.s.inputState().ready);}finally{h.cleanup();}
});
test('explicit authored line breaks and empty paragraph are displayed without dropping text',async()=>{
  const text='First paragraph.\n\n第二段保留原文。\r\nFinal line.',h=await open({opening:text});try{const pages=await collectOpening(h);assert.equal(pages.flat().join(''),text.replace(/\r\n|\r|\n/g,''));assert(pages.flat().includes(''),'empty authored paragraph survives');assert(pages.flat().includes('第二段保留原文。'));}finally{h.cleanup();}
});
test('every long opening page receives its own natural three-second pause',async()=>{
  const h=await open({opening:EN});try{await h.waitFor(()=>h.s._log.pause,'challenge');await h.p.press('ok');await h.waitFor(()=>h.s._log.pause,'first author page');
    for(let i=0;i<2;i++){const step=h.s._queue[0],start=h.shows.at(-1).at;await h.frames(100);assert.equal(h.s._queue[0],step);assert(h.s._log.pause);sameState(h);await h.waitFor(()=>h.s._queue[0]!==step,'natural page timeout');assert(h.G.performance.now()-start>=3000);await h.waitFor(()=>h.s._log.pause||h.s.inputState().ready,'next author page');}
    sameState(h);
  }finally{h.cleanup();}
});
for(const [lang,text]of [['en',EN],['zh',ZH]])test(lang+' long terminal feedback is fully read before a single actual state installation and reward',async()=>{
  const h=await open({lang,ending:text,fast:true});try{
    const rewards=[];h.G.$gameMessage.add=line=>rewards.push(line);await h.p.inMode('main');await h.p.fightUntilEnd();const header=E.i18n.translatorFor(lang).t('trainer.defeated',{name:'Avery'}),pages=[];
    // A terminal page must never auto-advance, including test fast mode.
    const first=visible(h);h.w.tick(5000);await h.frames(120);assert.deepEqual(visible(h),first);sameState(h);
    for(let n=0;n<32;n++){
      let lines=visible(h);if(!n){const at=lines.indexOf(header);if(at>=0)lines=lines.slice(at);}pages.push(lines);sameState(h);
      if(pages.flat().join('')===header+text){
        // A second callback in the update which drew the last page cannot finish before it was presented.
        if(n){h.s.onMenuOk();sameState(h);assert.deepEqual(visible(h),lines);}
        await h.frames(1);h.s.onMenuOk();await h.frames(2);break;
      }
      await h.frames(1);h.s.onMenuOk();assert(h.flow.running,'cannot commit while the authored tail was never displayed');sameState(h);
      const next=visible(h);h.s.onMenuOk();h.s.onEnd();sameState(h);assert.deepEqual(visible(h),next,'same-update callbacks cannot skip another page');
    }
    assert.equal(pages.flat().join(''),header+text,'all terminal author text survives');assert(pages.length>1);assert(pages.every(p=>p.length<=h.s._log._max&&p.every(t=>h.s._log.textWidth(t)<=h.s._log.innerWidth)));
    assert.equal(h.installs.length,1);assert.equal(h.flow.game().money,1060);assert.equal(h.flow.lastOutcome.commit,'applied');assert(!h.app.saveBlocked);const after=JSON.stringify(h.flow.game());h.s.onMenuOk();h.s.onEnd();await h.frames(2);assert.equal(h.installs.length,1);assert.equal(JSON.stringify(h.flow.game()),after);assert.equal(rewards.filter(x=>x===E.i18n.translatorFor(lang).t('trainer.reward',{money:60})).length,1);
  }finally{h.cleanup();}
});
test('cancel while long terminal pages remain releases the root without committing unread feedback',async()=>{
  const h=await open({ending:EN,fast:true});try{await h.p.inMode('main');await h.p.fightUntilEnd();sameState(h);h.flow.abort(Error('normal cancellation with unread author pages'));await h.waitFor(()=>h.s._aborted&&h.s.inputState().ready,'actual aborted end menu after host update');assert.equal(h.s._log.pause,false);h.s.onEnd();await h.frames(2);assert.equal(h.installs.length,0);assert.equal(JSON.stringify(h.flow.game()),h.before);assert(!h.app.saveBlocked);}finally{h.cleanup();}
});
