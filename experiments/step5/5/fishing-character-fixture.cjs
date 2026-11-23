'use strict';
// Controlled headless character sheets: fixture art and bitmap loading, never production art.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function install(G,options={}){
 const root=process.env.PF_E3_NATIVE_ROOT||path.dirname(path.dirname(process.env.PF_MZ_OBJECTS));
 const read=name=>fs.readFileSync(path.join(root,'js/reactor_'+name+'.js'),'utf8');
 const objects=read('objects'),managers=read('managers'),sprites=read('sprites'),core=read('core');
 const add=(text,name)=>{const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'pinned-fishing-character:'+name});};
 G.Game_CharacterBase??=function(){};for(const key of ['setImage','characterName','characterIndex','tileId','maxPattern','pattern','resetPattern','isOriginalPattern','straighten','updatePattern','hasStepAnime','hasWalkAnime','direction'])add(objects,'Game_CharacterBase.prototype.'+key);
 G.$dataSystem??={};G.$dataSystem.rrMultiFrames=true;
 const multi=objects.indexOf('Game_CharacterBase.rrFramesOf = function');assert(multi>=0);vm.runInContext('(()=>{'+objects.slice(multi)+'})();',G,{filename:'pinned-fishing:actual-post-native-multiframe-object-chain'});
 const P=G.Game_CharacterBase.prototype,images=[],loads=[],bitmaps=new Map();
 const player=G.$gamePlayer;player._characterName??='FixtureWalking';player._characterIndex??=1;player._tileId??=0;
 for(const key of ['characterName','characterIndex','tileId','pattern','updatePattern','hasStepAnime','hasWalkAnime'])player[key]=P[key];
 player.setImage=function(name,index){images.push({name,index});return Reflect.apply(P.setImage,this,[name,index]);};
 G.ImageManager??={};G.Utils??={};G.Utils.extractFileName=name=>name.split('/').pop();
 G.Bitmap??=function(){};add(core,'Bitmap.prototype.isReady');add(core,'Bitmap.prototype.isError');
 G.Bitmap._sweepStalledLoads=()=>{};G.Bitmap._loadWatchList=[];
 const bitmap=name=>{if(!bitmaps.has(name))bitmaps.set(name,Object.assign(Object.create(G.Bitmap.prototype),{_loadingState:'loaded',_degradedToBlank:false,_url:'fixture:'+name,width:/\[f4\]/i.test(name)?768:576,height:384,addLoadListener(fn){fn(this);}}));return bitmaps.get(name);};
 G.ImageManager.loadBitmap=function(folder,name){loads.push({folder,name});return bitmap(name);};
 // Installed loadCharacter's only closed helper sets nearest-neighbour filtering.
 G._setBitmapNearest=bitmap=>{bitmap.smooth=false;return bitmap;};
 add(managers,'ImageManager.loadCharacter');add(managers,'ImageManager.isBigCharacter');add(managers,'ImageManager.isObjectCharacter');
 G.$gameMap.tilesetId??=()=>1;G.Sprite_Character??=function(){};
 for(const key of ['updateBitmap','isImageChanged','setCharacterBitmap','updateCharacterFrame','characterBlockX','characterBlockY','characterPatternX','characterPatternY','patternWidth','patternHeight'])add(sprites,'Sprite_Character.prototype.'+key);
 const multiSprite=sprites.indexOf('const _rrMultiPatternWidth =');assert(multiSprite>=0);vm.runInContext('(()=>{'+sprites.slice(multiSprite)+'})();',G,{filename:'pinned-fishing:actual-post-native-multiframe-sprite-chain'});
 const sprite=Object.assign(Object.create(G.Sprite_Character.prototype),{_character:player});
 const profiles={FishingCharacter:JSON.stringify({name:'FixtureFishing[f4]',index:2}),SurfFishingCharacter:JSON.stringify({name:'FixtureSurfFishing[f4]',index:3}),SurfCharacter:JSON.stringify({name:'FixtureSurf',index:4}),...options.parameters};
 const parameters=G.PluginManager?.parameters;
 if(parameters)G.PluginManager.parameters=function(name){const p=Reflect.apply(parameters,this,[name]);return name==='PS_World'?{...p,...profiles}:p;};
 return {images,loads,bitmaps,bitmap,profiles,sprite,frame(character=G.$gamePlayer){sprite._character=character;sprite.updateBitmap();sprite._bushDepth=0;sprite.updateHalfBodySprites=()=>{};let rect;sprite.setFrame=(...value)=>{rect=value;};sprite.updateCharacterFrame();return{raw:character._pattern,pattern:character.pattern(),width:sprite.patternWidth(),blockX:sprite.characterBlockX(),rect};},consume(){sprite._character=G.$gamePlayer;sprite.updateBitmap();return {name:sprite._characterName,index:sprite._characterIndex,bitmap:sprite.bitmap};}};
}
module.exports={install};
