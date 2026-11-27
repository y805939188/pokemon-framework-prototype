'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createNativeSceneManager,createNativeFrameTick}=require('../../support/world/native-frame-manager-support.cjs');
const ROOT=path.resolve(__dirname,'../../..');
const source=fs.readFileSync(path.join(path.dirname(process.env.PF_MZ_RUNTIME||path.join(ROOT,'js/reactor_objects.js')),'reactor_managers.js'),'utf8');

function frame(){
 const G=vm.createContext({Graphics:{frameCount:0},$gameScreen:{_flashDuration:3}});
 const input={trigger:new Set(['ok']),repeat:new Set(['ok'])},manager=createNativeSceneManager(G,source),tick=createNativeFrameTick(G,manager,input);
 const calls=[];
 function Scene(){this.started=false;this.ready=true;this.busy=false;calls.push(['construct',this]);}
 Scene.prototype.stop=function(){this.started=false;calls.push(['stop',this]);};
 Scene.prototype.terminate=function(){calls.push(['terminate',this]);};
 Scene.prototype.create=function(){calls.push(['create',this]);};
 Scene.prototype.isReady=function(){calls.push(['ready',this]);return this.ready;};
 Scene.prototype.isBusy=function(){return this.busy;};
 Scene.prototype.isStarted=function(){return this.started;};
 Scene.prototype.start=function(){this.started=true;calls.push(['start',this]);};
 Scene.prototype.update=function(){calls.push(['update',this]);};
 return {G,manager,tick,input,calls,Scene};
}
const count=(h,kind,scene)=>h.calls.filter(row=>row[0]===kind&&row[1]===scene).length;

test('frame manager is one pinned native static function with own data state and methods',()=>{
 const {G,manager}=frame();assert.strictEqual(G.SceneManager,manager);assert.equal(typeof manager,'function');assert.throws(()=>new manager(),/This is a static class/);
 for(const key of ['_scene','_nextScene','_stack','_exiting','goto','push','pop','isSceneChanging','isCurrentSceneBusy','changeScene','updateScene']){
  const d=Object.getOwnPropertyDescriptor(manager,key);assert(d,key);assert(Object.hasOwn(d,'value'),key);assert.equal(d.get,undefined,key);assert.equal(d.set,undefined,key);assert.equal(d.writable,true,key);assert.equal(d.configurable,true,key);
 }
});

test('real goto and captured tick naturally install one queued Scene and honor readiness before start',()=>{
 const h=frame(),{G,manager,Scene}=h,bootstrap=new Scene();bootstrap.started=true;manager._scene=bootstrap;
 assert.equal(manager.goto(Scene),undefined);const queued=manager._nextScene;queued.ready=false;
 assert.notStrictEqual(queued,bootstrap);assert.strictEqual(G.SceneManager._nextScene,queued);assert.equal(count(h,'stop',bootstrap),1);
 h.tick();assert.strictEqual(manager._scene,queued);assert.equal(manager._nextScene,null);assert.equal(count(h,'terminate',bootstrap),1);assert.equal(count(h,'create',queued),1);assert.equal(count(h,'start',queued),0);
 queued.ready=true;h.tick();assert.equal(count(h,'start',queued),1);assert.equal(count(h,'update',queued),0);
 h.tick();assert.equal(count(h,'create',queued),1);assert.equal(count(h,'start',queued),1);assert.equal(count(h,'update',queued),1);assert.equal(G.Graphics.frameCount,3);assert.equal(G.$gameScreen._flashDuration,0);assert.equal(h.input.trigger.size+h.input.repeat.size,0);
});

test('native busy current Scene retains its queued successor until a later real frame',()=>{
 const h=frame(),old=new h.Scene();old.started=true;old.busy=true;h.manager._scene=old;h.manager.goto(h.Scene);const next=h.manager._nextScene;
 h.tick();assert.strictEqual(h.manager._scene,old);assert.strictEqual(h.manager._nextScene,next);assert.equal(count(h,'create',next),0);
 old.busy=false;h.tick();assert.strictEqual(h.manager._scene,next);assert.equal(count(h,'terminate',old),1);assert.equal(count(h,'create',next),1);assert.equal(count(h,'start',next),1);
});

test('native game activity controls updates while frame and input housekeeping continue',()=>{
 const h=frame();h.manager.goto(h.Scene);h.tick();const scene=h.manager._scene;h.manager.isGameActive=()=>false;h.tick();assert.equal(count(h,'update',scene),0);assert.equal(h.G.Graphics.frameCount,2);h.manager.isGameActive=()=>true;h.tick();assert.equal(count(h,'update',scene),1);
});

test('native push and pop preserve return values and delayed stack/queue semantics',()=>{
 const h=frame();h.manager.goto(h.Scene);h.tick();const initial=h.manager._scene;
 function Menu(){h.Scene.call(this);}Menu.prototype=Object.create(h.Scene.prototype);Menu.prototype.constructor=Menu;
 assert.equal(h.manager.push(Menu),undefined);assert.strictEqual(h.manager._scene,initial);assert.strictEqual(h.manager._stack[0],h.Scene);assert(h.manager._nextScene instanceof Menu);h.tick();const menu=h.manager._scene;
 assert.equal(h.manager.pop(),undefined);assert.strictEqual(h.manager._scene,menu);assert(h.manager._nextScene instanceof h.Scene);assert.equal(h.manager._stack.length,0);h.tick();assert.notStrictEqual(h.manager._scene,initial);assert.equal(count(h,'terminate',menu),1);
});

test('two native goto calls before a tick retain only the last queued Scene',()=>{
 const h=frame();h.manager.goto(h.Scene);const first=h.manager._nextScene;h.manager.goto(h.Scene);const last=h.manager._nextScene;h.tick();assert.notStrictEqual(first,last);assert.strictEqual(h.manager._scene,last);assert.equal(count(h,'create',first),0);assert.equal(count(h,'create',last),1);
});

test('hooks installed on the shared manager receive the same native queue and frame identities',()=>{
 const h=frame(),seen=[],original=h.manager.changeScene;h.G.SceneManager.changeScene=function(...args){seen.push({receiver:this,next:this._nextScene});return Reflect.apply(original,this,args);};
 h.manager.goto(h.Scene);const queued=h.manager._nextScene;h.tick();assert.equal(seen.length,1);assert.strictEqual(seen[0].receiver,h.manager);assert.strictEqual(seen[0].next,queued);assert.strictEqual(h.G.SceneManager._scene,queued);
});

test('real constructor and frame failures preserve Error identity and native prefixes',()=>{
 const h=frame(),construction=Error('native-construction');function Broken(){throw construction;}
 assert.throws(()=>h.manager.goto(Broken),error=>error===construction);assert.equal(h.manager._nextScene,null);
 h.manager.goto(h.Scene);const queued=h.manager._nextScene,creation=Error('native-create');queued.create=()=>{throw creation;};assert.throws(()=>h.tick(),error=>error===creation);assert.strictEqual(h.manager._scene,queued);assert.equal(h.manager._nextScene,null);assert.equal(h.G.Graphics.frameCount,1);assert.equal(h.input.trigger.size,1,'no fake successful frame cleanup');
});

test('old late descriptor-copy replacement leaves the current queue unadvanced by the captured driver',()=>{
 const h=frame(),old=h.manager,bootstrap=new h.Scene();bootstrap.started=true;old._scene=bootstrap;
 const replacement=createNativeSceneManager(h.G,source);Object.defineProperties(replacement,Object.getOwnPropertyDescriptors(old));
 assert.notStrictEqual(replacement,old);replacement.goto(h.Scene);const queued=replacement._nextScene;
 for(let i=0;i<3;i++)h.tick();
 assert.strictEqual(h.G.SceneManager,replacement);assert.strictEqual(replacement._scene,bootstrap);assert.strictEqual(replacement._nextScene,queued);assert.strictEqual(old._scene,bootstrap);assert.equal(count(h,'create',queued),0);assert.equal(count(h,'start',queued),0);assert.equal(replacement._scene!==bootstrap&&replacement._scene.isStarted(),false,'original bootstrap identity gate must remain closed');
});
