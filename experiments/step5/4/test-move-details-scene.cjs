'use strict';
// Compiled product Scene + real App/Session/Gen8. Actual installed item geometry;
// bitmap/text/audio/input delivery remain explicit controlled ports. No NW claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),ROOT=path.resolve(__dirname,'../../..'),PRODUCT=process.env.PF_MOVE_DETAILS_PRODUCT_ROOT||ROOT,E=require('../../../js/engine/build/production.cjs'),PLAN=require('./victory-music-native-plan.json');
let temp,plugins,entryText,fixture;
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-move-details-'));plugins={};
 for(const name of['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:PRODUCT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);let code=fs.readFileSync(path.join(out,name+'.js'),'utf8');
  if(name==='PS_BattleFlow'&&process.env.PF_MOVE_DETAILS_SCENE_MUTATION){const variants={'remove-pp': ['if (view.pp !== null) {','if (false) {'],'remove-type': ['this.drawText(view.typeLabel,','this.drawText("",'],'foreground-tile': ['this.contentsBack.fillRect(','this.contents.fillRect(']},change=variants[process.env.PF_MOVE_DETAILS_SCENE_MUTATION];assert(change,'known explicit display mutation');assert.equal(code.split(change[0]).length,2,'one actual compiled display gate');code=code.replace(...change);}
  if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
 }
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'fixture'),minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});fixture=require(path.join(temp,'fixture/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function open(lang='en'){
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow,content=fixture.musicNativeContent(E,assert),parameters=G.PluginManager.parameters;
 G.PluginManager.parameters=function(name){const p=parameters.call(this,name);return name==='PS_BattleFlow'?{...p,language:lang}:p;};flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=true;
 const state=fixture.musicNativeState(E,content);state.party[0].moves=[{id:'tackle',pp:0,maxpp:35},{id:'ember',pp:6,maxpp:25},{id:'watergun',pp:12,maxpp:25},{id:'growl',pp:40,maxpp:40}];G.$gameSystem._psGame=state;const before=JSON.stringify(flow.game());await h.p.toMapId(5,8,9);
 flow.openBattle({kind:'wild',foes:[{species:'Pidgey',level:3}],battleId:'move-details-'+path.basename(h.w.root),seq:1,canLose:true});await h.p.inMode('main');const s=h.p.battle();
 return{...h,s,flow,before,cleanup(){if(flow.running)flow.abort(Error('owned move-details cleanup'));}};
}
function choose(h,key){const v=h.s.inputState();assert(v.ready);const at=v.items.findIndex(i=>i.key===key);assert(at>=0);h.s._menu.select(at);h.s.onMenuOk();}
function draw(h){
 const G=h.G,s=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8'),menu=h.s._menu;
 function install(name){const a=s.indexOf(name+' = function'),b=s.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(s.slice(a,b+3),G,{filename:'installed-reactor_windows.js#'+name});}
 // The shared controlled Win is not the real host constructor. Install the real
 // geometry bodies explicitly, retaining the real Scrollable->Base delegation.
 install('Window_Base.prototype.itemHeight');G.Window_Scrollable={prototype:{itemHeight:G.Window_Base.prototype.itemHeight}};G.Window_Selectable={prototype:G.Window_Command.prototype};
 for(const name of['itemWidth','itemHeight','colSpacing','rowSpacing','itemRect'])install('Window_Selectable.prototype.'+name);
 G.Window_Command.prototype.drawItem=function(i){this._fallbackDraw=i;};
 menu.innerWidth=784;menu.innerHeight=172;menu.lineHeight=()=>36;menu.scrollBaseX=()=>0;menu.scrollBaseY=()=>0;
 const rows=[];menu.changePaintOpacity=v=>{rows.push({kind:'opacity',value:v});};menu.changeTextColor=v=>{menu._textColour=v;};menu.resetTextColor=()=>{menu._textColour='RESET';};
 menu.drawText=(text,x,y,width,align)=>rows.push({kind:'text',text,x,y,width,align,colour:menu._textColour});menu.contents.fillRect=(x,y,width,height,colour)=>rows.push({kind:'fill',x,y,width,height,colour});menu.contentsBack={fillRect:(x,y,width,height,colour)=>rows.push({kind:'back-fill',x,y,width,height,colour})};
 for(let i=0;i<menu._items.length;i++)menu.drawItem(i);
 return rows;
}
for(const lang of['en','zh'])test(lang+' real four-slot menu paints type badges and four PP bands without writing or registering a choice',async()=>{
 const h=await open(lang);try{choose(h,'fight');const before=JSON.stringify({state:h.flow.game(),request:h.s._session.currentRequest(),bag:h.s._session.bag});const rows=draw(h),texts=rows.filter(r=>r.kind==='text');
  for(const [text,colour]of[['PP 0/35','#bd2929'],['PP 6/25','#b35d00'],['PP 12/25','#8b7300'],['PP 40/40','#202028']])assert(texts.some(r=>r.text===text&&r.colour===colour),'actual PP draw '+text);
  for(const label of lang==='en'?['Normal','Fire','Water']:['一般','火','水'])assert(texts.some(r=>r.text===label),'actual localized type draw '+label);
  assert(rows.some(r=>r.kind==='fill'&&r.colour==='#cf6a38'),'actual Fire-colour badge/stripe');assert(h.s._menu._items.every(i=>i.enabled===true));assert.equal(h.s._menu._textColour,'RESET');
  for(const r of rows)if(['text','fill','back-fill'].includes(r.kind)){assert(r.x>=0&&r.y>=0&&r.width>0);assert(r.x+r.width<=784);assert(r.y+(r.height??36)<=172,'two visible rows fit actual default window');}
  assert.equal(JSON.stringify({state:h.flow.game(),request:h.s._session.currentRequest(),bag:h.s._session.bag}),before);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
test('PP0 remains focusable and refused by the real Session, preserving cursor and displayed PP',async()=>{
 const h=await open();try{choose(h,'fight');draw(h);const request=JSON.stringify(h.s._session.currentRequest());choose(h,1);await h.waitFor(()=>h.s.inputState().ready&&!h.s._busy,'real refused candidate');assert.equal(h.s._mode,'moves');assert.equal(h.s._menu.index(),0);assert.equal(JSON.stringify(h.s._session.currentRequest()),request);assert(draw(h).some(r=>r.kind==='text'&&r.text==='PP 0/35'&&r.colour==='#bd2929'));assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('normal legal action refreshes PP from the new public request and reentry keeps the move cursor',async()=>{
 const h=await open();try{choose(h,'fight');choose(h,4);await h.p.inMode('main');choose(h,'fight');assert.equal(h.s._menu.index(),3);assert(draw(h).some(r=>r.kind==='text'&&r.text==='PP 39/40'));assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('PP-less Recharge and nonpositive totals omit graphical PP while still exposing a badge and enabled candidate',async()=>{
 const h=await open();try{const s=h.s,original=s._session.currentRequest;const req=JSON.parse(JSON.stringify(original.call(s._session)));req.active[0].moves=[{id:'recharge',move:'Recharge',disabled:false},{id:'tackle',move:'Tackle',pp:0,maxpp:0,disabled:'disabled'}];s._session.currentRequest=()=>req;choose(h,'fight');const rows=draw(h);assert(rows.some(r=>r.kind==='text'&&r.text==='Recharge'));assert(rows.some(r=>r.kind==='text'&&r.text==='Normal'));assert(!rows.some(r=>r.kind==='text'&&String(r.text).startsWith('PP')));assert(s._menu._items.every(i=>i.enabled===true));s._session.currentRequest=original;}finally{h.cleanup();}
});
test('missing checked metadata uses a neutral badge and does not fabricate a move type or block the real menu',async()=>{
 const h=await open();try{h.flow._content.meta.showdownSourceChecked=false;choose(h,'fight');const rows=draw(h);assert.equal(rows.filter(r=>r.kind==='text'&&r.text==='?').length,4);assert(rows.some(r=>r.kind==='fill'&&r.colour==='#707781'));assert(h.s.inputState().ready);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('returning to the main menu delegates its original single-line rendering and height',async()=>{
 const h=await open();try{choose(h,'fight');draw(h);const expanded=h.s._menu.itemHeight();h.s.onMenuCancel();const menu=h.s._menu;assert.equal(h.s._mode,'main');menu.drawItem(0);assert.equal(menu._fallbackDraw,0);assert(menu.itemHeight()<expanded);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('large opaque tiles paint behind the real host cursor layer, leaving its ordinary selection visible',async()=>{
 const source=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8');const C={Window:function(){},Sprite:class{},PIXI:{Container:class{constructor(){this.children=[];}addChild(c){this.children.push(c);}}}};vm.createContext(C);
 for(const name of['_createAllParts','_createContentsBackSprite','_createCursorSprite','_createContentsSprite']){const marker='Window.prototype.'+name+' = function',a=source.indexOf(marker),b=source.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(source.slice(a,b+3),C);}
 for(const name of['_createContainer','_createBackSprite','_createFrameSprite','_createArrowSprites','_createPauseSignSprites'])C.Window.prototype[name]=()=>{};
 C.Window.prototype._createClientArea=function(){this._clientArea=new C.PIXI.Container();};const w=new C.Window();w._createAllParts();const layers=w._clientArea.children;assert(layers.indexOf(w._contentsBackSprite)<layers.indexOf(w._cursorSprite));assert(layers.indexOf(w._cursorSprite)<layers.indexOf(w._contentsSprite));
 const h=await open();try{choose(h,'fight');const rows=draw(h);assert.equal(rows.filter(r=>r.kind==='back-fill'&&r.colour==='#fffdf5').length,4,'whole tiles stay behind the cursor');assert(!rows.some(r=>r.kind==='fill'&&r.colour==='#fffdf5'),'opaque foreground must not cover the actual cursor layer');}finally{h.cleanup();}
});
