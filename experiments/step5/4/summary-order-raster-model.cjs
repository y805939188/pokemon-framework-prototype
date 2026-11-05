'use strict';
// Explicit controlled RGBA port, not real glyphs/Pixi/NW qualification. Emits valid PNGs for validator controls.
const zlib=require('node:zlib');
const table=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([size,tag,data,sum]);}
function png(w,h,data){const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;const raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)Buffer.from(data.buffer,data.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function installRaster(G,{blank=false}={}){
 Object.assign(G.Graphics,{width:816,height:624,boxWidth:808,boxHeight:616});
 G.Bitmap.prototype.fillRect=()=>{};
 const init=G.Window_Base.prototype.initialize;G.Window_Base.prototype.initialize=function(rect){init.call(this,rect);Object.assign(this,rect);this.visible=true;this.openness=255;this.renderable=true;};
 G.Scene_PSBattle.prototype.addWindow=function(win){if(typeof this._windowLayer?.addChild!=='function'){const layer={x:4,y:4,children:[],addChild(v){this.children.push(v);v.parent=this;return v;},removeChild(v){this.children=this.children.filter(c=>c!==v);v.parent=null;}};this._windowLayer=layer;this.addChild(layer);}this._windowLayer.addChild(win);};
 G.Bitmap.snap=scene=>{
  const width=G.Graphics.width,height=G.Graphics.height,data=new Uint8ClampedArray(width*height*4);for(let i=3;i<data.length;i+=4)data[i]=255;
  const view=G.PSManagement.current();const windows=[];const walk=n=>{if(n?.contents)windows.push(n);for(const c of n?.children??[])walk(c);};walk(scene);
  const win=windows.at(-1);if(!blank&&view?.view.kind==='summary'&&win?.renderable!==false){for(let y=7;y<height-5;y+=3)for(let x=5;x<width-5;x+=5){const at=(y*width+x)*4;data[at]=80+(x%80);data[at+1]=30+(y%150);data[at+2]=200;}}
  return{width,height,context:{getImageData:()=>({data})},canvas:{toDataURL:()=> 'data:image/png;base64,'+png(width,height,data).toString('base64')},destroy(){}};
 };
}
module.exports={installRaster,png};
