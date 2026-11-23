'use strict';
// New-source headless render/audio facade, copied from fixed 12c native harness.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.env.PF_E3_NATIVE_ROOT;assert(root);
const core=fs.readFileSync(root+'/js/reactor_core.js','utf8'),sprites=fs.readFileSync(root+'/js/reactor_sprites.js','utf8'),managers=fs.readFileSync(root+'/js/reactor_managers.js','utf8');
function install(G,text,name){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'pinned-replay:'+name});}
function renderer(G,o){
 function Sprite(bitmap){this.initialize(bitmap);}Object.assign(Sprite.prototype,{initialize(bitmap){this.bitmap=bitmap??null;this.children=[];this.parent=null;this.anchor={};this.scale={};this.visible=true;},update(){for(const c of this.children.slice())c.update?.();},addChild(c){this.children.push(c);c.parent=this;return c;},addChildAt(c,i){this.children.splice(i,0,c);c.parent=this;return c;},removeChild(c){this.children=this.children.filter(x=>x!==c);c.parent=null;},getChildIndex(c){return this.children.indexOf(c);},destroy(){this.destroyed=true;},setBlendColor(){}});G.Sprite=Sprite;
 // Canvas/WebGL/Effekseer backend is headless. The native Bitmap draw calls and native animation lifecycle remain actual.
 G.Bitmap=function(w,h){this.width=w;this.height=h;this._canvas={width:w,height:h};this._context={save(){},restore(){},clearRect(){o.clears++;},fillRect(){},beginPath(){},arc(x,y,r){o.radii.push(r);if(o.failExpansion&&r>64){o.failExpansion=false;throw Error('headless-backend-expand-failed');}},fill(){}};this._baseTexture={update(){},destroy(){}};};
 Object.defineProperty(G.Bitmap.prototype,'context',{get(){return this._context;}});for(const name of ['clear','clearRect','fillAll','fillRect','drawCircle'])install(G,core,'Bitmap.prototype.'+name);G.Bitmap.prototype.destroy=function(){this.destroyed=true;};
 G.Point=function(x=0,y=0){this.x=x;this.y=y;};G.Graphics.width=816;G.Graphics.height=624;
 G.Graphics.effekseer={play(){o.effects++;const end=G.Graphics.frameCount+6;return{get exists(){return G.Graphics.frameCount<end;},setLocation(){},setRotation(){},setScale(){},setSpeed(){},stop(){}};}};
 G.EffectManager={load(name){assert.equal(name,'Flash');o.effectNames.push(name);return{isLoaded:true};},clear(){},checkErrors(){}};
 const a=sprites.indexOf('function Sprite_Animation()'),b=sprites.indexOf('function Sprite_AnimationMV()',a);vm.runInContext(sprites.slice(a,b),G,{filename:'pinned:Sprite_Animation'});
 G.Spriteset_Base=function(){};for(const name of ['authoredAnimationZ','updateAnimations','processAnimationRequests','createAnimation','createAnimationSprite','makeTargetSprites','lastAnimationSprite','isMVAnimation','isScreenAnimation','isAnimationForEach','animationBaseDelay','animationNextDelay','animationShouldMirror','removeAnimation'])install(G,sprites,'Spriteset_Base.prototype.'+name);
 const ss=Object.create(G.Spriteset_Base.prototype);ss._animationSprites=vm.runInContext('[]',G);ss._effectsContainer=new Sprite();ss.findTargetSprite=target=>target===G.$gamePlayer?{setBlendColor(){},visible:true}:null;
 const p=G.Scene_Map.prototype,create=p.createDisplayObjects;p.createDisplayObjects=function(...args){const r=Reflect.apply(create,this,args);this.children=[];this._windowLayer={};this._messageWindow={};this._spriteset??={};this.addChild=Sprite.prototype.addChild;this.children.push(this._windowLayer);this.addChildAt=Sprite.prototype.addChildAt;this.removeChild=Sprite.prototype.removeChild;this.getChildIndex=Sprite.prototype.getChildIndex;return r;};
 const update=p.update;p.update=function(...args){const r=Reflect.apply(update,this,args);for(const s of ss._animationSprites.slice())s.update();ss.updateAnimations();return r;};
 G.$dataAnimations=vm.runInContext('JSON.parse('+JSON.stringify(fs.readFileSync(root+'/data/Animations.json','utf8'))+')',G);o.animationSprites=ss;
 G.AudioManager._seBuffers=[];G.AudioManager.createBuffer=(folder,name)=>{o.buffers.push({folder,name});return{frameCount:-100,isPlaying:()=>false,play(){o.audioHardwareCalls++;}};};G.AudioManager.updateBufferParameters=()=>{};G.AudioManager.cleanupSe=function(){this._seBuffers=this._seBuffers.filter(x=>x.isPlaying());};G.AudioManager._seVolume=100;
 for(const name of ['resolveSeVariant','isMissingLocalSe','playSe','updateSeParameters'])install(G,managers,'AudioManager.'+name);
 const play=G.AudioManager.playSe;G.AudioManager.playSe=function(se){o.sounds.push(structuredClone(se));return Reflect.apply(play,this,[se]);};
 return ss;
}

function presentation(G){install(G,core,'Utils.isNwjs');const o={effects:0,effectNames:[],radii:[],sounds:[],buffers:[],audioHardwareCalls:0,clears:0};renderer(G,o);G.EffectManager.isReady=()=>true;return o;}
module.exports={presentation};
