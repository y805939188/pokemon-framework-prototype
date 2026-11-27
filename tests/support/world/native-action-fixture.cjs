'use strict';
// Actual pinned button/touch action bodies and a one-use controlled input.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./mz-integration-support.cjs');
async function nativeAction(kind,parent,options={}) {
  const h=await fixture({functionManager:options.functionManager}),G=h.G,trace=[];let available=true,request;
  const source=fs.readFileSync(path.resolve(__dirname,'../../../js/reactor_objects.js'),'utf8');
  for(const name of ['triggerAction','triggerButtonAction','triggerTouchAction','triggerTouchActionD1']) {
    const a=source.indexOf('Game_Player.prototype.'+name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a);
    vm.runInContext(source.slice(a,b+4),G,{filename:'pinned-real-action:'+name});
  }
  G.Input.isTriggered=key=>available&&kind==='button'&&key==='ok';
  h.player.getOnOffVehicle=()=>false;h.player.direction=()=>h.player._direction;
  h.map.airship=()=>({pos:()=>false});h.temp.isDestinationValid=()=>available&&kind==='touch';
  h.temp.destinationX=()=>h.player.x;h.temp.destinationY=()=>h.player.y;
  h.player.checkEventTriggerHere=triggers=>{trace.push({triggers:Array.from(triggers),blocked:h.app.saveBlocked,canMove:h.player.canMove(),steps:h.state().steps});if(triggers.includes(0))h.map.startsEvent=true;};
  // Capture the actual existing permit at its real delivery point; copies grant nothing.
  const host=h.app.ports.completedSteps,dispatch=host.dispatchArrival;
  host.dispatchArrival=function(actual){request=actual;return dispatch.call(this,actual);};
  const trigger=h.player.triggerAction;
  h.player.triggerAction=function(){
    const row={kind,at:'triggerAction',blocked:h.app.saveBlocked,steps:h.state().steps};trace.push(row);
    if(row.blocked)options.beforeAction?.(h,request);
    row.canMove=this.canMove();
    try{return row.result=trigger.call(this);}finally{available=false;}
  };
  if(parent){h.complete();await h.settle();}else assert.equal(h.player.triggerAction(),true);
  return {h,request,trace,event:h.map.running,steps:h.state().steps,saveBlocked:h.app.saveBlocked};
}
module.exports={nativeAction};
