/** Adapter-only focus/clock rules. No resource mutations or host dependencies. */
import type { InputFrame } from '../management/model.ts';
export function quantityStep(value:number,maximum:number,frame:InputFrame,shop=false):{value:number;done:boolean;cancelled:boolean} {
 const order=shop?['left','right','up','down','use','back']:['back','use','up','down','left','right'];
 const key=order.find(k=>['use','back'].includes(k)?frame.triggered[k as 'use'|'back']:frame.repeated[k as 'up'|'down'|'left'|'right']);
 if(key==='back')return {value:0,done:true,cancelled:true};
 if(key==='use')return {value,done:true,cancelled:false};
 if(key==='up')value=value===maximum?1:value+1;
 if(key==='down')value=value===1?maximum:value-1;
 if(key==='left')value=Math.max(1,value-10);
 if(key==='right')value=Math.min(maximum,value+10);
 return {value,done:false,cancelled:false};
}
export function nextPocket(pocket:number,delta:number,counts:readonly number[],filtered:boolean):number {
 for(let n=0;n<8;n++){pocket=(pocket-1+delta+8)%8+1;if(!filtered||counts[pocket-1])return pocket;}
 return pocket;
}
export function animationPhase(milliseconds:number,frames:number,frameSeconds:number):number{return Math.floor(milliseconds/(frameSeconds*1000))%frames;}
export function itemIconFrame(milliseconds:number,width:number,height:number):number {const frames=height===48?Math.max(1,Math.floor(width/48)):1;return Math.floor((milliseconds%1000)/1000*frames);}
