'use strict';
// Compiled formal Scene + real content/App/Session/Gen8. Controlled Window/input/audio/raster ports, no NW claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),{E,authored}=require('./transform-learning-fixtures.cjs');
const ROOT=path.resolve(__dirname,'../../..'),PLAN=require('./victory-music-native-plan.json');let temp,plugins,entryText;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-transform-learning-scene-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
  let file=path.join(ROOT,'js/plugins',name+'.js');
  if(process.env.PF_TRANSFORM_SLOTS_PREBUILT!=='1'){
   const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);file=path.join(out,name+'.js');
  }
  const code=fs.readFileSync(file,'utf8');if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
 }
});test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open(learnMoves){
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow,{content,game}=authored({own:1,copied:4,learnMoves});
 // Exercise the installed visibility rule, with only scroll position/raster ports controlled.
 G.Window_Selectable=function Selectable(){};
 const windowSource=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8');
 for(const method of ['row','ensureCursorVisible']){const key='Window_Selectable.prototype.'+method+' = function',start=windowSource.indexOf(key),end=windowSource.indexOf('\n};',start);assert(start>=0&&end>start);vm.runInContext(windowSource.slice(start,end+3),G,{filename:'installed-reactor_windows.js#'+method});}
 Object.assign(G.Window_Command.prototype,{row:G.Window_Selectable.prototype.row,ensureCursorVisible:G.Window_Selectable.prototype.ensureCursorVisible,itemHeight(){return 32;},scrollY(){return this._scrollY??0;},scrollTo(_x,y){this._scrollY=y;},smoothScrollTo(_x,y){this._scrollY=y;}});
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=true;G.$gameSystem._psGame=game;
 const before=JSON.stringify(flow.game());await h.p.toMapId(5,8,9);
 flow.openBattle({kind:'trainer',trainer:{id:'c-basic',version:1},battleId:'transform-learning-scene',seq:1,canLose:true,battleStyle:'set'});
 await h.p.inMode('main');return {...h,flow,s:h.p.battle(),before,cleanup(){if(flow.running)flow.abort(Error('owned Transform scene cleanup'));}};
}
function choose(h,key){const v=h.s.inputState();assert(v.ready);const at=v.items.findIndex(x=>x.key===key);assert(at>=0,'actual menu key '+key);h.s._menu.select(at);h.s.onMenuOk();}
async function move(h,n){choose(h,'fight');await h.p.inMode('moves');choose(h,n);await h.p.inMode('main');}
for(const learnMoves of [['rest'],['rest','amnesia','agility']])test('formal move menu presents, navigates and submits '+(4+learnMoves.length)+' actual Transform learning slots',async()=>{
 const h=await open(learnMoves);try{
  await move(h,1);assert.equal(h.s._session.gw._debugBattle().sides[0].active[0].transformed,true);
  await move(h,2);const count=4+learnMoves.length,s=h.s,session=s._session;
  assert.equal(session.currentRequest().active[0].moves.length,count);assert.equal(session.party[0].moves.length,1+learnMoves.length);
  choose(h,'fight');await h.p.inMode('moves');assert.equal(s._menu.maxCols(),2);assert.equal(s._menu._items.length,count);
  s._menu.select(0);for(let i=0;i<(count-1)/2;i++)s._menu.cursorDown(false);assert.equal(s._menu.index(),count-1);
  s._menu.cursorRight(false);assert.equal(s._menu.index(),count-1);s._menu.cursorDown(false);assert.equal(s._menu.index(),count-1);
  s._menu.cursorUp(false);assert.equal(s._menu.index(),count-3);s._menu.cursorDown(false);assert.equal(s._menu.index(),count-1);
  const bottom=(Math.floor((count-1)/2)+1)*s._menu.itemHeight();assert(bottom-s._menu.scrollY()<=s._menu.innerHeight,'selected extra row is visible using the installed scroll rule');if(count===7)assert(s._menu.scrollY()>0,'navigation must actually request scrolling');
  s.onMenuCancel();assert.equal(s._mode,'main');choose(h,'fight');assert.equal(s._menu.index(),count-1,'actual cursor memory survives cancel/reopen');
  const id=learnMoves.at(-1),pp=session.gw.readState('p1')[0].pp[id],before=session.currentRequest().active[0].moves.at(-1).pp;
  s.onMenuOk();await h.p.inMode('main');assert.equal(session.currentRequest().active[0].moves.at(-1).pp,before-1);assert.equal(session.gw.readState('p1')[0].pp[id],pp);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(session.broken,null);
 }finally{h.cleanup();}
});
