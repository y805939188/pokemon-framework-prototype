/** Default MZ dex presentation. All persistent edits go through the existing application owner. */
import { pokedexQuery as Q, config as C, type Content } from '../../framework/rules/index';
import type { GameApplication } from '../../framework/app/index';
import { DexSearchEditor } from './search';
type Snapshot = ReturnType<GameApplication['pokedexSnapshot']>;
type Command = Parameters<GameApplication['updatePokedex']>[0];
type Result = ReturnType<GameApplication['updatePokedex']>;
export interface DexScreenPorts {
 snapshot(): Snapshot; content(): Content; text: Record<string,string>; locale: string; currentRegion: number | null;
 directory(): Q.DexSearchDirectory; single?:{species:string;number:Q.DexNumber};
 edit(command: Command): Result; resolve(token: string, revision: number, decision: {kind:'retry'|'technical-terminate'}): Result;
 finish(): void; reload(): void; pending?: Extract<Result,{status:'pending'}>; stopCry(): void; cry(species:string,form:number): void;
}
export class PokedexScreen {
 view:any={kind:'empty'}; done=false; error=''; private snapshot!:Snapshot; private options!:Q.DexQueryOptions;
 private session!:Q.DexSearchSession; private region=-1; private regional=false; private regionCursor=0;
 private pending:Extract<Result,{status:'pending'}>|null=null; private afterWrite:(()=>void)|null=null;
 private editor:DexSearchEditor|null=null; private directory!:Q.DexSearchDirectory;
 constructor(readonly ports:DexScreenPorts){if(ports.pending){this.pending=ports.pending;this.afterWrite=()=>this.open();this.error=ports.pending.view.error??'pokedex-write-pending';this.view={kind:'recovery',reloadRequired:ports.pending.view.reloadRequired,error:this.error,cursor:0};}else this.open();}
 private refresh(){this.snapshot=this.ports.snapshot();const c=C.resolveConfig(this.ports.content().settings);this.options={locale:this.ports.locale,offsets:c.DEXES_WITH_OFFSETS,useCurrentRegion:c.USE_CURRENT_REGION_DEX,currentRegion:this.ports.currentRegion};}
 private open(){this.refresh();if(this.ports.single){this.entry();return;}if(this.snapshot.menu==='hidden'){this.done=true;this.view={kind:'empty'};return;}this.regional=this.snapshot.menu==='regions';if(this.regional)this.regions();else this.selectRegion(this.snapshot.accessible[0]!);}
 private write(command:Command,after:()=>void){
  try{const result=this.ports.edit(command);this.accept(result,after);}catch(e){this.error=String(e);this.view={kind:'error',text:this.error};}
 }
 private accept(result:Result,after:()=>void){
  if(result.status==='pending'&&!(this.ports.single&&result.view.purpose==='summary'&&result.view.phase==='entry'&&!result.view.error)){this.pending=result;this.afterWrite=after;this.error=result.view.error??'pokedex-write-pending';this.view={kind:'recovery',reloadRequired:result.view.reloadRequired,error:this.error,cursor:0};return;}
  if(result.status==='refused'){this.error=result.reason;this.view={kind:'error',text:this.error};return;}
  this.pending=null;this.afterWrite=null;this.error='';this.refresh();after();
 }
 private regions(){this.refresh();this.view={kind:'regions',cursor:this.regionCursor,rows:this.snapshot.accessible.map(region=>{const {seen,owned,allSeen,allOwned}=Q.dexRegionCounts(this.snapshot.dex,this.snapshot.catalog.layout,region);return{region,counts:{seen,owned,allSeen,allOwned}};}).concat([{region:null,counts:null}]as any)};}
 private selectRegion(region:number){this.write({kind:'view',value:{region}},()=>{this.region=region;this.session=Q.createDexSearchSession(this.snapshot.dex,this.snapshot.catalog,region,this.options);this.list();});}
 private list(){this.view={kind:'list',region:this.region,cursor:this.session.cursor,rows:this.session.rows,results:this.session.results,diagnostics:Q.dexList(this.snapshot.dex,this.snapshot.catalog,this.region,this.snapshot.dex.view.mode as Q.DexOrder,this.options).diagnostics};}
 private showSearch(){const e=this.editor!;this.view={...e.view,draft:[...e.draft],notice:e.notice,directory:this.directory};}
 get searching(){return !!this.editor&&['search','parameter','size'].includes(this.view.kind);}
 searchInput(frame:Parameters<DexSearchEditor['input']>[0]){
  if(!this.searching)return;const e=this.editor!;e.input(frame);
  if(e.result==='cancel'){this.editor=null;this.list();return;}
  if(e.result==='start'){
   const draft=[...e.draft]as Q.DexSearchParameters;
   this.write({kind:'view',value:{mode:draft[0]}},()=>{const result=Q.startDexSearch(this.snapshot.dex,this.snapshot.catalog,this.region,this.session,draft,this.directory,this.options);if(result.empty){e.notice=true;this.showSearch();}else{this.session=result.session;this.editor=null;this.list();}});return;
  }
  this.showSearch();
 }
 private cursor(n:number){const next=Math.max(0,Math.min(n,this.session.rows.length-1));if(next===this.session.cursor)return;this.write({kind:'view',value:{region:this.region,cursor:next,searchResults:this.session.results}},()=>{this.session.cursor=next;this.list();});}
 private entry(page=0,battled=false){
  this.refresh();const single=this.ports.single,row=single?{species:single.species,seen:true,number:single.number.number}:this.session.rows[this.session.cursor];if(!row?.seen)return;
  const number=single?single.number:{region:this.region,number:row.number,text:String(row.number).padStart(3,'0')},info=Q.dexInfo(this.snapshot.dex,this.snapshot.catalog,row.species,number);
  const base=this.snapshot.catalog.forms.find(f=>f.species===row.species&&f.form===0),config=C.resolveConfig(this.ports.content().settings);
  const forms=base?.gender?Q.dexForms(this.snapshot.dex,this.snapshot.catalog,row.species,{showAll:config.DEX_SHOWS_ALL_FORMS,gender:base.gender,baseFrontsEqual:true}):[];
  // Translate only proven generated captions. Authored English or empty labels remain authored data.
  for(const choice of forms){const data=this.snapshot.catalog.forms.find(f=>f.species===row.species&&f.form===choice.form),authored=data?.formLabel!==undefined?data.formLabel:data?.formName;
   if(authored==null&&choice.label)(choice as Q.DexFormChoice&{autoLabel?:string}).autoLabel=({'One Form':'oneForm',Male:'male',Female:'female',Genderless:'genderless'}as Record<string,string>)[choice.label];}
  const area=Q.dexArea(row.species); // 5.5 owns the world map provider. No fabricated habitat points.
  this.view={kind:'entry',species:row.species,page,battled,info,forms,area,measurements:info?.heightDm==null||info.weightHg==null?null:Q.dexMeasurements(info.heightDm,info.weightHg,this.ports.locale,'info')};
 }
 private form(index?:number){
  const species=this.view.species??this.view.entry?.species,entry=this.view.kind==='entry'?this.view:this.view.entry;
  const choices=entry.forms as Q.DexFormChoice[];if(choices.length<=1)return;
  this.write({kind:'form',species,baseFrontsEqual:true,...(index===undefined?{}:{selected:index}),text:this.ports.text,currentRegion:this.ports.currentRegion},()=>{const selection=Q.planDexFormSelection(this.snapshot.dex,species,choices,index);this.view={kind:'forms',species,cursor:selection.index,rows:choices,entry};});
 }
 private changeSpecies(direction:-1|1){if(this.ports.single)return;const previous=this.view;let n=this.session.cursor+direction;while(n>=0&&n<this.session.rows.length&&!this.session.rows[n]!.seen)n+=direction;if(n<0||n>=this.session.rows.length)return;this.session.cursor=n;this.entry(previous.page,previous.battled);this.ports.stopCry();this.ports.cry(this.view.species,this.view.info.appearance.form);}
 action(action:'up'|'down'|'left'|'right'|'use'|'back'|'action'){
  if(this.done)return;
  if(this.searching){this.searchInput({triggered:{[action]:true},repeated:{[action]:true}});return;}
  const v=this.view;
  if(v.kind==='error'){if(action==='back'||action==='use')this.close();return;}
  if(v.kind==='recovery'){
   if(action==='back'){if(v.reloadRequired){this.ports.reload();return;}const p=this.pending!;const r=this.ports.resolve(p.view.token,p.view.revision,{kind:'technical-terminate'});if(r.status==='pending')this.accept(r,()=>this.close());else{this.pending=null;this.afterWrite=null;this.close();}}
   else if(action==='use'){const p=this.pending!;this.accept(this.ports.resolve(p.view.token,p.view.revision,{kind:'retry'}),this.afterWrite!);}return;
  }
  if(v.kind==='regions'){if(action==='back'){this.close();return;}if(action==='up'||action==='down'){v.cursor=(v.cursor+(action==='up'?-1:1)+v.rows.length)%v.rows.length;this.regionCursor=v.cursor;}else if(action==='use'){const r=v.rows[v.cursor];if(r.region===null)this.close();else this.selectRegion(r.region);}return;}
  if(v.kind==='list'){
   if(action==='back'){if(this.session.results){const result=Q.backDexSearch(this.snapshot.dex,this.snapshot.catalog,this.region,this.session,this.options);this.write({kind:'view',value:{mode:0,region:this.region,cursor:result.session.cursor}},()=>{this.session=result.session;this.list();});}else if(this.regional)this.regions();else this.close();}
   else if(action==='up'||action==='down')this.cursor(this.session.cursor+(action==='up'?-1:1));
   else if(action==='use'&&this.session.rows[this.session.cursor]?.canOpen){this.entry();this.ports.stopCry();this.ports.cry(this.view.species,this.view.info.appearance.form);}
   else if(action==='action'){this.directory=this.ports.directory();this.editor=new DexSearchEditor(this.session.accepted,this.directory);this.showSearch();}return;
  }
  if(v.kind==='order'){
   if(action==='back'){this.list();return;}if(action==='up'||action==='down')v.cursor=(v.cursor+(action==='up'?-1:1)+6)%6;
   else if(action==='use')this.write({kind:'view',value:{mode:v.cursor}},()=>{this.session=Q.createDexSearchSession(this.snapshot.dex,this.snapshot.catalog,this.region,this.options);this.list();});return;
  }
  if(v.kind==='entry'){
   if(action==='back'){if(this.ports.single){this.close();return;}this.ports.stopCry();if(this.session.results)this.session=Q.refreshDexSearch(this.snapshot.dex,this.snapshot.catalog,this.region,this.session,this.directory??this.ports.directory(),this.options);
    else{const rows=Q.dexList(this.snapshot.dex,this.snapshot.catalog,this.region,this.snapshot.dex.view.mode as Q.DexOrder,this.options).rows;this.session={...this.session,accepted:[...this.session.accepted],rows,cursor:Math.max(0,Math.min(this.session.cursor,rows.length-1))};}this.write({kind:'view',value:{region:this.region,cursor:this.session.cursor,searchResults:this.session.results}},()=>this.list());}
   else if(action==='left'||action==='right')this.entry(Math.max(0,Math.min(2,v.page+(action==='left'?-1:1))),v.battled);
   else if(action==='up'||action==='down')this.changeSpecies(action==='up'?-1:1);
   else if(action==='action'){this.ports.stopCry();if(v.page===0)this.ports.cry(v.species,v.info.appearance.form);}
   else if(action==='use'){if(v.page===0)this.entry(0,!v.battled);else if(v.page===2)this.form();}return;
  }
  if(v.kind==='forms'){
   if(action==='back'||action==='use'){this.entry(2,v.entry.battled);return;}
   if(action==='up'||action==='down')this.form(Q.moveDexFormSelection(v.cursor,v.rows.length,action==='up'?-1:1));
  }
 }
 close(){if(this.done)return;if(this.pending){const p=this.pending;const result=this.ports.resolve(p.view.token,p.view.revision,{kind:'technical-terminate'});if(result.status==='pending'){this.accept(result,()=>this.close());return;}this.pending=null;}
  this.done=true;this.ports.stopCry();this.ports.finish();
 }
}
