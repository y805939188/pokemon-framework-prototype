'use strict';
const assert=require('node:assert/strict');
const {setup,dispose}=require(process.cwd()+'/experiments/step5/3/pokedex/ui-host.cjs');
let w;
try {
  w=setup();w.open();
  const G=w.G,m=w.manager,scene=m._scene;
  assert.equal(scene.constructor,G.Scene_PSPokedex);assert(w.p());
  class Previous extends G.Scene_MenuBase {}
  class ExternalTarget extends G.Scene_MenuBase {}
  G.Scene_MenuBase.prototype.stop=function(){};
  G.Scene_MenuBase.prototype.popScene=function(){m.pop();};
  m.goto=function(C){this._nextScene=C?new C():null;if(this._scene)this._scene.stop?.();};
  m.pop=function(){if(this._stack.length)this.goto(this._stack.pop());else this.goto(null);};
  m._stack=[Previous];
  const intended=new ExternalTarget();m._nextScene=intended;
  // This is the exact native changeScene ordering: old.terminate() runs while _nextScene already holds the external target.
  scene.terminate();
  const actual=m._nextScene;
  console.log(JSON.stringify({intendedPreserved:actual===intended,actualConstructor:actual?.constructor?.name,currentClosed:!w.p(),stackLength:m._stack.length}));
  assert.equal(actual,intended,'old pokedex terminate must not replace an already selected native scene target');
} finally {dispose();}
