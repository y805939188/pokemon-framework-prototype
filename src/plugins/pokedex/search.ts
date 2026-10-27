/** WP66-B search editor. Local draft/focus only; no application state or filtering here. */
import type {pokedexQuery as Q} from '../../framework/rules/index';
type Frame={triggered:Partial<Record<'up'|'down'|'left'|'right'|'action'|'back'|'use',boolean>>;repeated:Partial<Record<'up'|'down'|'left'|'right',boolean>>};
type Action='up'|'down'|'left'|'right'|'action'|'back'|'use';
export class DexSearchEditor {
 draft:Q.DexSearchParameters;directory:Q.DexSearchDirectory;view:any;result:'start'|'cancel'|null=null;notice=false;
 constructor(accepted:Q.DexSearchParameters,directory:Q.DexSearchDirectory){this.draft=[...accepted];this.directory=directory;this.main();}
 private main(focus=0){this.view={kind:'search',focus};}
 openParameter(section:number){
  const indices=[[0],[1],[2,3],[4,5],[6,7],[8],[9]][section]!;
  const values=indices.map(i=>this.draft[i]!);
  if(section===3||section===4){this.view={kind:'size',section,values,focus:0};return;}
  const count=[6,this.directory.names.length,this.directory.types.length,0,0,this.directory.colors.length,this.directory.shapes.length][section]!;
  this.view={kind:'parameter',section,values,count,columns:[2,7,4,0,0,3,5][section],focus:values[0]===-1?count:values[0],rotate:count%2};
 }
 private finishParameter(commit:boolean){const v=this.view;if(commit){const indices=[[0],[1],[2,3],[4,5],[6,7],[8],[9]][v.section]!;indices.forEach((n,i)=>{this.draft[n]=v.values[i];});}this.main(v.section);}
 act(action:Action){this.input({triggered:{[action]:true},repeated:{[action]:true}});}
 input(frame:Frame){
  this.result=null;const v=this.view,t=frame.triggered,r=frame.repeated;
  if(v.kind==='search'){
   const action=(['up','down','left','right','action','back','use']as const).find(k=>t[k]);if(!action)return;this.notice=false;
   const navigation={up:[0,1,0,2,2,3,4,5,4,6],down:[2,2,3,5,6,7,9,7,8,9],left:[0,0,2,3,3,5,5,7,7,8],right:[1,1,2,4,4,6,6,8,9,9]};
   if(action in navigation){v.focus=navigation[action as keyof typeof navigation][v.focus];return;}
   if(action==='action'){v.focus=8;return;}if(action==='back'){this.result='cancel';return;}
   if(v.focus<7)this.openParameter(v.focus);else if(v.focus===7){this.draft=[0,-1,-1,-1,-1,-1,-1,-1,-1,-1];}else this.result=v.focus===8?'start':'cancel';return;
  }
  const direction=(['up','down','left','right']as const).find(k=>v.kind==='size'&&(k==='left'||k==='right')?r[k]:t[k]);
  if(direction){if(v.kind==='size')this.moveSize(direction);else this.moveGrid(direction);}
  // A parameter has an independent button phase after direction; ACTION wins over BACK and USE.
  if(t.action){v.focus=v.kind==='size'?2:v.count+(v.section===0?0:1);return;}
  if(t.back){this.finishParameter(false);return;}if(!t.use)return;
  const ok=v.kind==='size'?2:v.count+(v.section===0?0:1),cancel=ok+1;
  if(v.focus===ok||v.focus===cancel){this.finishParameter(v.focus===ok);return;}
  if(v.kind==='size')return;
  const selected=v.focus===v.count?-1:v.focus;
  if(v.section!==2){v.values[0]=selected;return;}
  const values=v.values as number[];
  if(selected===-1){if(values[1]!==-1)values[1]=-1;else values[0]=-1;v.rotate=1-v.rotate;return;}
  const full=values[0]!==-1&&values[1]!==-1,slot=values[0]===-1?0:values[1]===-1?1:v.rotate;
  if(values[1-slot]===selected)return;values[slot]=selected;if(full)v.rotate=1-v.rotate;
 }
 private moveGrid(direction:'up'|'down'|'left'|'right'){
  const v=this.view,n=v.count,c=v.columns,i=v.focus,last=c*Math.floor((n-1)/c),sort=v.section===0,blank=sort?-1:n,ok=n+(sort?0:1),cancel=ok+1;
  if(direction==='up'){if(i<n){if(i>=c)v.focus=i-c;}else if(i===blank)v.focus=Math.max(0,last-1);else if(i===ok)v.focus=last;else if(i===cancel)v.focus=sort?n-1:blank;}
  else if(direction==='down'){if(i<n){if(i+c<n)v.focus=i+c;else if(i<last)v.focus=i%c<c/2?n-1:blank;else v.focus=i%c<c/2?ok:cancel;}else if(i===blank)v.focus=cancel;}
  else if(direction==='left'){if(i<n&&i>0&&i%c!==0)v.focus=i-1;else if(i===blank)v.focus=n-1;else if(i===cancel)v.focus=ok;}
  else{if(i===ok)v.focus=cancel;else if(i<n){if(!sort&&i===n-1)v.focus=blank;else if(i%c<c-1&&i+1<n)v.focus=i+1;}}
 }
 private moveSize(direction:'up'|'down'|'left'|'right'){
  const v=this.view,[low,high]=v.values as [number,number];
  if(direction==='up'){if(v.focus>1)v.focus=1;else if(v.focus===1)v.focus=0;return;}
  if(direction==='down'){if(v.focus===0)v.focus=1;else if(v.focus===1)v.focus=2;return;}
  if(v.focus===3&&direction==='left'){v.focus=2;return;}if(v.focus===2&&direction==='right'){v.focus=3;return;}if(v.focus>1)return;
  if(v.focus===1){if(direction==='left'&&low>=0)v.values[0]--;else if(direction==='right'&&low<37&&(high===-1||high<37&&high>=low+1))v.values[0]++;return;}
  if(direction==='left'){if(high===-1&&low<36)v.values[1]=36;else if(high===0&&low<0)v.values[1]=37;else if(high>0&&high<37&&low<=high-1)v.values[1]--;}
  else if(high>=37)v.values[1]=0;else if(high===36)v.values[1]=-1;else if(high>=0&&high<36)v.values[1]++;
 }
}
