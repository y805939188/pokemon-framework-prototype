'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const test=require('node:test'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {fixture,E,clone}=require('./support.cjs');
let builtPlugin,builtDir;
test.before(()=>{
 builtDir=fs.mkdtempSync(path.join(os.tmpdir(),'ps54-held-chain-'));
 const built=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',builtDir],{cwd:path.resolve(__dirname,'../../../..'),env:{...process.env,RR_PLUGIN:'PS_Management'},encoding:'utf8'});
 assert.equal(built.status,0,built.stdout+built.stderr);
 builtPlugin=fs.readFileSync(path.join(builtDir,'PS_Management.js'),'utf8');
});
test.after(()=>{if(builtDir)fs.rmSync(builtDir,{recursive:true,force:true});});
function host(options={}){
 const w=fixture('give'),{app,state}=w;
 const listeners={},windowEvents={},commands={},input={trigger:new Set(),repeat:new Set(),pressed:new Set(),keyMapper:{},isTriggered(k){return this.trigger.has(k)},isRepeated(k){return this.repeat.has(k)},isPressed(k){return this.pressed.has(k)},clear(){this.trigger.clear();this.repeat.clear();this.pressed.clear()}};
 function Base(){}Base.prototype.initialize=function(){};Base.prototype.create=function(){};Base.prototype.start=function(){};Base.prototype.update=function(){};Base.prototype.terminate=function(){};Base.prototype.popScene=function(){manager.popped++;};
 let windowFailures=options.windowFailures??0;function Win(){}Win.prototype.initialize=function(){if(windowFailures-->0)throw Error('injected window resource failure');this.contents={width:792,height:576,clear(){},fillRect(){},drawText(text){this.drawn??=[];this.drawn.push({text,color:this.textColor})}}};Win.prototype.textWidth=s=>String(s).length*10;Win.prototype.activate=function(){};let attachFailures=options.attachFailures??0;Base.prototype.addWindow=function(){if(attachFailures-->0)throw Error('injected attachment failure')};
 const manager={_scene:null,popped:0,isSceneChanging:()=>false,push(C){this._scene=new C();this._scene.create();this._scene.start();},goto(C){this.push(C)}};
 const document={addEventListener(k,fn){(listeners[k]??=new Set()).add(fn)},removeEventListener(k,fn){listeners[k]?.delete(fn)},body:{appendChild(){}},createElement(){const local={};return {style:{},setAttribute(){},addEventListener(k,fn){local[k]=fn},focus(){},remove(){this.removed=true},events:local,value:''}}};
 const G={console,structuredClone,Date,Input:input,TouchInput:{clear(){},isCancelled:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Scene_MenuBase:Base,Scene_Map:Base,Window_Base:Win,Rectangle:function(){},SceneManager:manager,PluginManager:{registerCommand(p,n,f){commands[p+':'+n]=f}},Game_Interpreter:Base,SoundManager:{playBuzzer(){},playCancel(){}},$gameMessage:{add(){}},$gameSwitches:{value:()=>false},$dataMap:{meta:{}},$dataSystem:{switches:Array(36).fill('')},PSFlow:{app:()=>app,_app:app,translator:()=>E.i18n.translatorFor('en'),speciesName:s=>s,resolveReceiving:(...a)=>app.resolveReceiving(...a)}};
 G.window=G;G.addEventListener=(key,fn)=>{(windowEvents[key]??=new Set()).add(fn)};G.document=document;vm.runInNewContext(builtPlugin,G);
 const tick=()=>{G.Graphics.frameCount++;manager._scene.update();input.trigger.clear();input.repeat.clear();};
 const press=(k)=>{input.trigger.add(k);input.repeat.add(k);input.pressed.add(k);tick();input.pressed.delete(k);tick();};
 const ready=()=>{tick();tick();assert.equal(G.PSManagement.current()?.ready,true)};
 const down=()=>press('down'),use=()=>press('ok'),back=()=>press('cancel');
 const choose=key=>{ready();let n=0;while(G.PSManagement.current().view.items[G.PSManagement.current().view.cursor]?.key!==key&&n++<50)down();assert.equal(G.PSManagement.current().view.items[G.PSManagement.current().view.cursor]?.key,key);use();};
 const releaseNative=key=>{input.pressed.delete(['Enter','KeyZ','Space'].includes(key)?'ok':'cancel');for(const fn of listeners.keyup??[])fn({key,code:key,keyCode:key==='Enter'?13:27})};
 return {w,G,app,state,input,listeners,windowEvents,manager,document,tick,press,ready,choose,down,use,back,releaseNative};
}

test('management menu give, natural consumption, reopen, move to empty member and take',async()=>{
 const h=host(), {app,state}=h;const bag=()=>E.inventory.aggregateBag(state.read().inventory);const firstId=state.read().party[0].id;
 function open(){h.G.PSManagement.openParty();h.ready();h.use();h.choose('item');}
 function close(){for(let attempt=0;attempt<12&&!h.manager.popped;attempt++)h.back();assert.equal(h.manager.popped,1,'bounded menu close'); h.manager._scene.terminate();h.manager.popped=0;assert.equal(app.encounterBlocked,false);}
 open();h.choose('give');h.choose('lumberry');assert.equal(state.read().party[0].item,'lumberry');assert.equal(bag().lumberry,1);close();
 const before=clone(state.read()),n=state.replaced.length;
 const req={battleId:'management-chain',trainer:{id:'h3-npc',version:1},seq:1,canLose:true,expGain:false,moneyGain:false};
 const s=await app.startTrainerBattle(req);s.take();
 const allEvents=[]; for(const slot of [1,2,3]) {const result=await s.chooseMove(slot);assert.equal(result.ok,true,JSON.stringify(result));allEvents.push(...result.messages.flatMap(m=>m.kind==='events'?m.events:[]));assert.deepEqual(state.read(),before);}
 assert.equal(allEvents.filter(e=>e.type==='-enditem'&&e.args[1]==='Lum Berry').length,1);assert.equal(s.finished,true);assert.equal(app.finishBattle(s,req).commit,'applied');assert.equal(state.replaced.length,n+1);assert.equal(state.read().party[0].item,'');
 const after=clone(state.read());assert.equal(app.finishBattle(s,req).commit,'already-applied');assert.deepEqual(state.read(),after);
 open();assert.equal(h.G.PSManagement.current().view.items.find(i=>i.key==='take').enabled,false);h.choose('give');h.choose('leftovers');assert.equal(state.read().party[0].item,'leftovers');close();
 assert.equal(state.read().party[0].id,firstId);
 const gift=app.receiveGift({kind:'silent',member:{species:'snorlax',level:50}});assert.equal(gift.status,'applied');const ids=state.read().party.map(m=>m.id);
 open();h.choose('move');h.ready();h.press('right');h.use();h.choose('yes');assert.equal(state.read().party[0].item,'');assert.equal(state.read().party[1].item,'leftovers');close();
 h.G.PSManagement.openParty();h.ready();h.press('right');h.use();h.choose('item');h.choose('take');assert.equal(state.read().party[0].item,'');assert.equal(state.read().party[1].item,'');assert.equal(bag().leftovers,1);assert.equal(bag().lumberry,1);assert.deepEqual(state.read().party.map(m=>m.id),ids);close();
});
