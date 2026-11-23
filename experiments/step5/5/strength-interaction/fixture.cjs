'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture:base,flush}=require('../world-production-final-wire/fixture.cjs');
function boulder(id=1,name='Native strengthboulder test'){return{id,name,x:3,y:2,pages:[{conditions:{switch1Valid:false,switch2Valid:false,variableValid:false,selfSwitchValid:false,itemValid:false,actorValid:false},image:{tileId:0,characterName:'Actor2',characterIndex:0,direction:2,pattern:1},priorityType:1,through:false,trigger:0,moveType:0,moveSpeed:4,moveFrequency:3,walkAnime:true,stepAnime:false,directionFix:false,list:[{code:355,indent:0,parameters:['this._nativeStrengthFallback=(this._nativeStrengthFallback||0)+1;']},{code:0,indent:0,parameters:[]}]}]};}
async function fixture(options={}){
 const nativeCalls=[],requests=[],moves=[],messages=[];let h;
 h=await base({nativeSetup(n,{maps}){const G=n.G;
  maps[5].events=[null,boulder(1,options.name)];G.$dataMap.events=maps[5].events;G.$gameMap._events=[null,new G.Game_Event(5,1)];
  if(options.block){G.$dataTilesets[1].flags[2]=1;const x=options.block==='source'?3:4;maps[5].data[(0*8+2)*10+x]=2;}
  if(options.ordinaryFailure)G.$gameMap._events[1].canPass=()=>false;
  for(const key of ['executeMove','triggerButtonAction','triggerTouchActionD2']){const original=G.Game_Player.prototype[key];assert.equal(typeof original,'function');G.Game_Player.prototype[key]=function(...args){const r=Reflect.apply(original,this,args);nativeCalls.push({key,args,receiver:this===G.$gamePlayer,result:r});return r;};}
  const move=G.Game_Event.prototype.moveStraight;G.Game_Event.prototype.moveStraight=function(...args){const before={x:this.x,y:this.y,realX:this._realX,realY:this._realY};const r=Reflect.apply(move,this,args);moves.push({id:this.eventId(),args,before,after:{x:this.x,y:this.y,realX:this._realX,realY:this._realY},moving:this.isMoving(),frame:G.Graphics.frameCount});return r;};
  G.TouchInput.isTriggered=()=>false;
 }});
 const {G,app}=h;const run=app.runFieldMove;app.runFieldMove=function(...args){const row={id:args[0],action:structuredClone(args[1]),sourceMap:G.$gameMap.mapId(),generation:app.stateGeneration,frame:G.Graphics.frameCount};requests.push(row);const p=Reflect.apply(run,this,args);row.synchronouslyAdmitted=app.fieldMovePending(args[0]);return p.then(r=>{row.result=structuredClone(r);return r;});};
 const tick=()=>{if(G.$gameMessage.isBusy()&&G.$gameMessage._choices.length===0)G.$gameMessage.clear();h.tick();messages.push({frame:G.Graphics.frameCount,text:[...G.$gameMessage._texts],choices:[...G.$gameMessage._choices],blocked:app.saveBlocked,moving:G.$gameMap.event(1)?.isMoving()});};
 const pump=async(predicate,max=180)=>{for(let i=0;i<max;i++){if(predicate())return;tick();await flush();}throw Error('strength native bounded '+JSON.stringify({requests,moves,point:[G.$gamePlayer.x,G.$gamePlayer.y],message:G.$gameMessage._texts,choices:G.$gameMessage._choices,pending:G.PSWorld.pending(),blocked:app.saveBlocked,diagnostics:G.PSWorld.diagnostics}));};
 const pressOk=()=>{G.Input.trigger.add('ok');G.Input.pressed.add('ok');tick();G.Input.pressed.delete('ok');};
 const touch=()=>{G.$gameTemp.setDestination(3,2);G.TouchInput.isTriggered=()=>true;tick();G.TouchInput.isTriggered=()=>false;};
 const answer=async(value)=>{await pump(()=>G.$gameMessage._choices.length===2);const callback=G.$gameMessage._choiceCallback;assert.equal(typeof callback,'function');G.$gameMessage.onChoice(value);G.$gameMessage.clear();await pump(()=>!G.$gameMessage.isBusy()||requests.at(-1)?.result!==undefined);if(G.$gameMessage.isBusy())G.$gameMessage.clear();await pump(()=>requests.at(-1)?.result!==undefined);return callback;};
 const activate=async()=>{pressOk();await answer(0);assert.equal(app.worldLocalState().strengthUsed,true);};
 const direction=(d)=>{G.Input.dir4=d;const names={2:'down',4:'left',6:'right',8:'up'};for(const k of Object.values(names))G.Input.pressed.delete(k);if(d)G.Input.pressed.add(names[d]);};
 const bootstrap=G.PSFlow.initializeBlackoutCompanions();if(bootstrap)assert.equal((await bootstrap).status,'completed');
 for(let i=0;i<2;i++){tick();await flush();}await pump(()=>!app.saveBlocked&&!G.PSWorld.pending());
 h.saves.length=0;nativeCalls.length=0;h.draws.length=0;h.nativeDraws.length=0;
 function record(extra){const s={case:process.env.PF_STRENGTH_CASE,state:h.state(),local:app.worldLocalState(),records:app.world.records,requests,moves,nativeCalls,messages,point:{x:G.$gamePlayer.x,y:G.$gamePlayer.y,direction:G.$gamePlayer.direction()},steps:h.steps.length,ordinary:h.ordinary.length,saves:h.saves.length,draws:h.draws,nativeDraws:h.nativeDraws,diagnostics:G.PSWorld.diagnostics,extra};fs.writeFileSync(path.join(process.env.PF_STRENGTH_ROOT,'RESULT.json'),JSON.stringify(s,null,2)+'\n',{flag:'wx'});}
 return{...h,G,app,tick,pump,pressOk,touch,answer,activate,direction,record,requests,moves,nativeCalls,messages,boulder};
}
module.exports={fixture,flush};
