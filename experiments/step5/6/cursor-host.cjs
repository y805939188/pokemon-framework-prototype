'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {textHost,ROOT}=require('./text-host.cjs');
const codes={Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,ShiftLeft:16,ControlLeft:17,KeyZ:90,KeyX:88,KeyB:66,Space:32};
const names={ShiftLeft:'Shift',ControlLeft:'Control',KeyZ:'z',KeyX:'x',KeyB:'b',Space:' '};
function cursorHost({nativeInput=false,gamepads=null,...options}={}){
 const h=textHost({...options,configure(G,{load}){
  if(!nativeInput)return;
  const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8');
  load(core,['Input.clear','Input.update','Input.isPressed','Input.isTriggered','Input.isRepeated','Input._isEscapeCompatible','Input._onKeyDown','Input._onKeyUp','Input._shouldPreventDefault','Input.virtualClick']);
  vm.runInContext(core.slice(core.indexOf('Input.keyMapper = {'),core.indexOf('Input.gamepadMapper = {')),G);
  if(gamepads){
   G.navigator={getGamepads:gamepads};
   load(core,['Input._pollGamepads','Input._updateGamepadState','Input._updateDirection','Input._signX','Input._signY','Input._makeNumpadDirection']);
   const a=core.indexOf('Input.gamepadMapper = {'),b=core.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(core.slice(a,b+3),G);
  }else{G.Input._pollGamepads=()=>{};G.Input._updateDirection=()=>{};}
  G.Input.keyRepeatWait=24;G.Input.keyRepeatInterval=6;G.Input.clear();
  G.document.addEventListener('keydown',e=>G.Input._onKeyDown(e));G.document.addEventListener('keyup',e=>G.Input._onKeyUp(e));
 }});
 function frame(...keys){h.keys.clear();keys.forEach(k=>h.keys.add(k));if(nativeInput)h.G.Input.update();h.tick(25,...keys);h.keys.clear();}
 function down(code,extra={}){return h.doc.dispatch('keydown',{code,key:names[code]??code,keyCode:codes[code]??0,...extra});}
 function up(code){const e=h.doc.dispatch('keyup',{code,key:names[code]??code,keyCode:codes[code]??0});frame();return e;}
 function press(code){const e=down(code);frame();up(code);return e;}
 function focus(index){assert(h.scene()._grid);h.scene()._grid.index=index;h.scene().refresh();}
 function click(index){const s=h.scene();s._buttons[index].dispatch('click');if(s.current())frame();}
 return {...h,frame,down,up,press,focus,click,get balloon(){return h.balloon;}};
}
module.exports={cursorHost,ROOT};
