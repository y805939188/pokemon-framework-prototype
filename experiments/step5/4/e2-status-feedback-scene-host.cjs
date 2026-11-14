'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs'),{createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),PLAN=require('./victory-music-native-plan.json');
const crypto=require('node:crypto');const clone=v=>JSON.parse(JSON.stringify(v));let work,plugins,entryText;const buildRecords=[];
function prepare(){
 work=fs.mkdtempSync(path.join(os.tmpdir(),'pf-e2-status-feedback-scene-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
  const out=path.join(work,name),start=new Date().toISOString(),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--configLoader','runner','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});buildRecords.push({name,start,end:new Date().toISOString(),exit:r.status,stdout:r.stdout,stderr:r.stderr});assert.equal(r.status,0,r.stdout+r.stderr);
  const code=fs.readFileSync(path.join(out,name+'.js'),'utf8');buildRecords.at(-1).sha256=crypto.createHash('sha256').update(code).digest('hex');if(process.env.PF_E_SCENE_ARTIFACT_DIR){const artifacts=path.join(process.env.PF_E_SCENE_ARTIFACT_DIR,'compiled');fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,name+'.js'),code);}if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
 }
}
function cleanup(){console.log('SCENE_BUILD_OBSERVATION '+JSON.stringify({stem:'e2-status-feedback-scene',buildRecords}));if(work)fs.rmSync(work,{recursive:true,force:true});}
function contentFor(c){
 const dir=path.join(ROOT,'content/sample'),input=Object.fromEntries(['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'].filter(n=>fs.existsSync(path.join(dir,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'))]));
 input.manifest.id=c.id.toLowerCase();
 if(c.items)input.items=clone(c.items);
 for(const config of [c.player,c.reserve,c.foe].filter(Boolean)){
  let s=input.species.find(s=>s.id===config.species);
  if(!s){s={id:config.species,showdownId:config.species,nameKey:'species.'+config.species,growth:'medium',baseExp:100,evYield:{},catchRate:45,source:'author-placeholder'};input.species.push(s);}s.learnset=config.moves.map(move=>({level:1,move}));delete s.evolutions;
 }
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);return {content:assembled.content,input};
}
async function open(c){
 const h=createVictoryDriverHost({ROOT,work,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow,{content,input}=contentFor(c),parameters=G.PluginManager.parameters;
 G.Bitmap.prototype.fillRect=()=>{};G.PluginManager.parameters=function(name){const p=parameters.call(this,name);return name==='PS_BattleFlow'?{...p,language:c.lang}:p;};
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=c.seed??[1,2,3,4];flow.rng=()=>0;flow.fast=true;
 const state=E.state.newGame({content,party:[],money:1000});
 for(const [i,config]of [c.player,c.reserve].filter(Boolean).entries()){
  const species=E.dex.createDexLookup().species(config.species).name,m=E.memberFactory.createMember({id:'SCENE-P'+(i+1),species,level:config.level,nature:'hardy',abilityIndex:config.abilityIndex},content,()=>0);assert.deepEqual(m.moves.map(x=>x.id),config.moves);if(config.status){m.status=config.status;m.statusCount=config.statusCount??0;}if(c.owner)m.owner=clone(c.owner);state.party.push(E.speciesKey.toPersistentMember(m,content));
 }
 state.nextMemberOrdinal=String(state.party.length+1);state.badges.fill(c.badges===undefined);if(c.badges!==undefined)for(let i=0;i<c.badges;i++)state.badges[i]=true;let saved=state,installs=0;
 Object.defineProperty(G.$gameSystem,'_psGame',{configurable:true,get:()=>saved,set:v=>{installs++;saved=v;}});
 await h.p.toMapId(5,8,9);const initial=clone(flow.game());const request={kind:'wild',foes:[{species:c.foe.species,level:c.foe.level}],battleId:c.id,seq:1,canLose:true,expGain:false};flow.openBattle(request);await h.p.inMode('main');
 const s=h.p.battle(),lines=[],logAdd=s._log.add;s._log.add=function(line){lines.push(line);return logAdd.call(this,line);};flow.fast=false;
 const session=s._session,calls=[],original=session.chooseMove;session.chooseMove=async function(...args){const row={slot:args[0],before:live(this)};calls.push(row);row.result=await original.apply(this,args);row.after=live(this);return row.result;};
 return {...h,G,flow,s,session,initial,input,content,request,calls,lines,rows:[],get installs(){return installs;},cleanup(){if(flow.running)flow.abort(Error('owned e2-status-feedback-scene cleanup'));s.terminate();}};
}
function live(s){return {p1:clone(s.gw.readState('p1')),p2:clone(s.gw.readState('p2')),active:s.gw.activeId('p1'),request:clone(s.currentRequest()),bag:clone(s.bag)};}
function unchanged(h){assert.equal(h.installs,0);assert.deepEqual(clone(h.flow.game()),h.initial);}
async function mode(h,want){
 for(let i=0;i<5000;i++){
  if((Array.isArray(want)?want:[want]).includes(h.p.battle()?._mode)&&!h.p.battle()._busy&&h.p.battle()._queue.length===0&&h.p.battle().inputState().ready)return;
  const ordinary=h.p.battle()?.ordinaryMessageState?.();if(ordinary?.phase==='full')await h.p.press('ok');else await h.frames(1);
 }
 throw Error('bounded semantic mode '+want+' '+JSON.stringify({mode:h.p.battle()?._mode,busy:h.p.battle()?._busy,queue:h.p.battle()?._queue.length,errors:h.w.errors}));
}
async function pick(h,key){await h.frames(1);const v=h.s.inputState();assert(v.ready,'actual semantic input ready for '+key);const at=v.items.findIndex(x=>x.key===key);assert(at>=0,'published key '+key+' in '+h.s._mode);h.s._menu.select(at);h.s.onMenuOk();}
async function move(h,slot){await mode(h,'main');unchanged(h);await pick(h,'fight');await mode(h,'moves');await pick(h,slot);await mode(h,['main','end']);unchanged(h);return h.calls.at(-1);}
function cards(h){
 const text=[],win=h.s._status,draw=win.drawText;win.drawText=function(value,...args){text.push({value,args});return draw.call(this,value,...args);};try{win.refresh();}finally{win.drawText=draw;}
 return {views:clone(h.s.statusCardState()),text};
}
async function swap(h,id){await mode(h,'main');const before=live(h.session);await pick(h,'party');await mode(h,'party');await pick(h,id);await mode(h,'party-command');await pick(h,'switch-in');await mode(h,'main');unchanged(h);return {before,after:live(h.session),cards:cards(h)};}
async function finish(h,alreadyFinished=false){
 if(!alreadyFinished){await mode(h,'main');await pick(h,'run');}await mode(h,'end');unchanged(h);const result=h.session.result();await pick(h,'end');await h.frames(8);assert.equal(h.flow.lastOutcome.commit,'applied',JSON.stringify(h.flow.lastOutcome));assert.equal(h.installs,1);const saved=clone(h.flow.game());
 assert.equal(saved.appliedBattles[h.request.battleId].hash,E.state.resultHash(result));for(const p of saved.party){const r=result.members[p.id];assert.equal(p.hp,r.hp);assert.equal(p.status,r.status);assert.deepEqual(p.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),r.moves);}assert.equal(saved.money,h.initial.money);assert.deepEqual(saved.inventory,h.initial.inventory);
 h.s.onEnd();await h.frames(2);assert.equal(h.installs,1);assert.deepEqual(clone(h.flow.game()),saved);return {result,outcome:clone(h.flow.lastOutcome),saved,installs:h.installs};
}
module.exports={ROOT,E,assert,clone,prepare,cleanup,open,live,unchanged,mode,pick,move,cards,swap,finish};
