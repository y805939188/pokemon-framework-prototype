import type { LearningPage } from './learning-screen.ts';
export function drawLearningPage(win:any,p:LearningPage,ports:{font:string;text:(key:string,params?:Record<string,string|number>)=>string;textOr:(key:string,fallback:string)=>string;move:(id:string)=>any}):string[]{
 const tr=ports.text;
   const b=win.contents,w=b.width,h=b.height;b.clear();b.fontFace=ports.font||'sans-serif';b.fontSize=20;const rendered:string[]=[];
   const fit=(value:string,width:number)=>{let s='';for(const c of Array.from(value)){if(win.textWidth(s+c)>width){while(s&&win.textWidth(s+'…')>width)s=Array.from(s).slice(0,-1).join('');return s+'…';}s+=c;}return s;};
   const line=(s:string,y:number,x=12,width=w-24,color='#fff')=>{s=fit(s,width);rendered.push(s);b.textColor=color;b.drawText(s,x,y,width,30,'left');};
   line(tr('title'),8,12,w-24,'#b8e3ff');
   // Two measured title lines allow long localized prompts without overlapping the selectable rows.
   let current='',n=0;for(const char of Array.from(p.title)){if(win.textWidth(current+char)>w-24&&current){line(current,48+n*30);current='';if(++n===2)break;}current+=char;}if(n<2)line(current,48+n*30);
   const selected=p.rows[p.cursor]?.moveId,info=selected?ports.move(selected):null,left=selected?Math.floor(w*.46):w;
   const visible=Math.max(1,Math.floor((h-200)/34)),start=Math.max(0,p.cursor-visible+1);
   for(let i=start;i<Math.min(p.rows.length,start+visible);i++){
    const row=p.rows[i]!,y=124+(i-start)*34,detail=row.details??'',right=win.textWidth(detail);
    if(i===p.cursor)b.fillRect(8,y,left-16,32,'#435f80');
    if(detail)line(detail,y,left-16-right,right);line((i===p.cursor?'▶ ':'  ')+row.text,y,12,left-40-right);
   }
   if(selected){
    const x=left+14,width=w-x-12;line(tr('details'),122,x,width,'#b8e3ff');
    line(tr('type',{value:info?.type||'—'}),156,x,width);line(tr('category',{value:info?.category||'—'}),190,x,width);
    line(tr('power',{value:info?.power??'—'}),224,x,width);line(tr('accuracy',{value:info?.accuracy===0?'—':info?.accuracy??'—'}),258,x,width);
    const description=ports.textOr('move.description.'+selected,info?.description||tr('noDescription'));
    let part='',y=302;for(const char of Array.from(description as string)){if(win.textWidth(part+char)>width&&part){line(part,y,x,width);part='';y+=28;if(y>h-110)break;}part+=char;}if(y<=h-110)line(part,y,x,width);
   }
   if(p.error)line(p.error,h-74,12,w-24,'#ffe09a');line(tr('help'),h-38,12,w-24,'#b8e3ff');
 return rendered;
}
