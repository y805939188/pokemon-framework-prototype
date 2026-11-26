'use strict';
// This Node game host has no GPU. Supply only renderer primitives while the installed
// Map wrapper drives the real clock, cover op, and SceneManager handoff as usual.
function installRenderer(G) {
 const width=816,height=624;
 G.Graphics.width=width;G.Graphics.height=height;
 G.Graphics.boxWidth=width;G.Graphics.boxHeight=height;
 const bitmap=G.Bitmap;
 if(typeof bitmap!=='function'||typeof bitmap.prototype.fillAll!=='function'||typeof bitmap.prototype.destroy!=='function'){
  G.Bitmap=class extends (typeof bitmap==='function'?bitmap:class{}) {
   constructor(w,h){super(w,h);this.width=w;this.height=h;}
   fillAll(colour){this.colour=colour;}
   destroy(){this.destroyed=true;}
  };
 }
 const Sprite=G.Sprite;
 G.Sprite=class extends (typeof Sprite==='function'?Sprite:class{}) {
  constructor(bitmap){super(bitmap);this.scale??={x:1,y:1};this.bitmap=bitmap;}
  destroy(){this.destroyed=true;if(typeof super.destroy==='function')super.destroy();}
 };
 // The spriteset belongs to this Map birth and is never shared with later Maps.
 return scene=>{
  const layer={children:[]};
  scene._spriteset??=layer;
  scene.addChild??=function(child){return this.addChildAt(child,this.children.length);};
 };
}
function assertOrdinaryHandoff(h) {
 const op=h.G.PSFlow._op,receipt=op?.prebattle?.snapshot();
 if(!op?.session||!receipt)throw Error('real ordinary fishing handoff did not reach the battle session');
 require('node:assert/strict').equal(op.prebattleMode,'default-map');
 require('node:assert/strict').deepEqual(Array.from(receipt.stages,row=>row.phase),['flash','transition','after','battle']);
 return receipt;
}
module.exports={installRenderer,assertOrdinaryHandoff};
