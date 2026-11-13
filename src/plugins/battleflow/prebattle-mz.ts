/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrebattleOverlay } from './prebattle';

/** A simple owned cover, separate from battle images/windows. No shared bitmap cache or global renderer changes. */
export function createPrebattleOverlayMZ(G: any, scene: any, current: ()=>boolean): PrebattleOverlay {
  const width=G.Graphics.boxWidth,height=G.Graphics.boxHeight;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('invalid prebattle surface');
  let bitmap:any=null,sprite:any=null,retired=false,colour:string|null=null;
  const dispose=()=>{
    if(retired)return;retired=true;const errors:unknown[]=[];
    for(const release of [()=>sprite?.parent?.removeChild(sprite),()=>{if(sprite)sprite.bitmap=null;},()=>sprite?.destroy(),()=>bitmap?.destroy()])
      try{release();}catch(e){errors.push(e);}
    if(errors.length)throw new AggregateError(errors,'owned prebattle cover cleanup failed');
  };
  try{
    bitmap=new G.Bitmap(1,1);
    if(!current()){dispose();throw new Error('stale prebattle allocation');}
    sprite=new G.Sprite(bitmap);sprite.scale.x=width;sprite.scale.y=height;sprite.opacity=0;
    if(!current()){dispose();throw new Error('stale prebattle cover');}
    scene.addChild(sprite);
    if(!current()){dispose();throw new Error('stale prebattle attachment');}
    return {dispose,paint(next,opacity){
      if(retired||!current())return;
      if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw new Error('invalid prebattle opacity');
      if(colour!==next){bitmap.fillAll(next==='white'?'#ffffff':'#000000');colour=next;}
      if(!retired&&current())sprite.opacity=Math.round(opacity*255);
    }};
  }catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'prebattle allocation and cleanup failed');}throw error;}
}

/** BGS has no seek restoration contract. Restore only our stopped channel, never a new registration/buffer. */
export function capturePrebattleBGSMZ(G:any,current:()=>boolean): {pause():void;restore():void}|null {
  const A=G.AudioManager,beforeBuffer=A?._bgsBuffer,beforeRegistration=A?._currentBgs;
  if(!beforeBuffer||!beforeRegistration?.name||typeof A.saveBgs!=='function')return null;
  const saved=A.saveBgs();if(!saved?.name)return null;
  const track={name:saved.name,volume:saved.volume,pitch:saved.pitch,pan:saved.pan};let paused=false,restored=false;
  return {pause(){
    if(paused||!current())return;paused=true;A.stopBgs();
  },restore(){
    if(!paused||restored||!current())return;
    const unchanged=A._bgsBuffer===beforeBuffer&&A._currentBgs===beforeRegistration;
    const stopped=A._bgsBuffer===null&&A._currentBgs===null;
    if(!unchanged&&!stopped){restored=true;return;} // an actual successor permanently retires this obligation
    A.playBgs({...track},0);restored=true;
  }};
}
