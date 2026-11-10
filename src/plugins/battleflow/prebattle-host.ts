/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrebattleOperation } from './prebattle';
import type { PrebattlePlan } from './prebattle';
import { capturePrebattleBGSMZ, createPrebattleOverlayMZ } from './prebattle-mz';

/** The ordinary Map wrapper. Actual battle Scene/session and their internal opening stay authoritative. */
export function installPrebattleHost(G:any, flow:any, prepareAudio:(op:any)=>void) {
  type Entry={op:any;source:any;app:any;generation:any;operation:PrebattleOperation};
  type DeferredAutosave={entry:Entry;scene:any;map:any;mapId:any;args:any[];doneObserved?:boolean};
  let deferredAutosave:DeferredAutosave|null=null;
  let active:Entry|null=null,last:PrebattleOperation|null=null;
  const mapClass=G.Scene_Map,prototype=mapClass?.prototype;
  const baseBusy=prototype?.isBusy;
  const owner=(e:Entry)=>{
    const bound=e.op.musicPlan?.owner ?? {app:e.app,generation:e.generation};
    return flow._op===e.op&&flow._app===bound.app&&flow._app?.stateGeneration===bound.generation;
  };
  const liveMap=(scene:any)=>!!prototype&&scene instanceof mapClass;
  const ready=(scene:any)=>scene.isStarted?.()&&scene._spriteset&&scene._messageWindow;
  const pending=()=>!!active&&owner(active)&&active.operation.pending();
  // A transfer can request autosave inside Map.start, before the return cover
  // releases the save gate. Retain only that actual request, not every battle end.
  const requestAutosave=prototype?.requestAutosave;
  const flushAutosave=(afterUpdate:boolean)=>{
    const saved=deferredAutosave;if(!saved)return;
    const e=saved.entry;
    if(active!==e||!owner(e)||G.SceneManager._scene!==saved.scene||G.$gameMap!==saved.map||
       G.$gameMap?.mapId?.()!==saved.mapId||['cancelled','failed'].includes(e.operation.phaseName)){
      deferredAutosave=null;return;
    }
    if(e.operation.phaseName!=='done')return;
    // The first done tick still had its interpreter blocked during base update.
    // Let a full ordinary update retire the blackout event chain before saving.
    if(!saved.doneObserved){saved.doneObserved=true;return;}
    if(!afterUpdate)return;
    deferredAutosave=null; // Consume before host callbacks, including reentrant ones.
    requestAutosave.apply(saved.scene,saved.args); // Keep all original autosave/save gates.
  };
  const poll=(scene:any,afterUpdate=false)=>{
    const e=active;if(!e||!liveMap(scene))return;
    if(e.operation.phaseName==='new'){
      if(scene===e.source&&ready(scene)&&(!baseBusy||!baseBusy.call(scene)))e.operation.start(scene);
    }else if(e.operation.phaseName==='return-pending'){
      if(ready(scene))e.operation.tick(scene);
    }else e.operation.tick(scene);
    flushAutosave(afterUpdate);
  };
  if(prototype){
    const update=prototype.update,start=prototype.start,terminate=prototype.terminate;
    if(requestAutosave)prototype.requestAutosave=function(...args:any[]){
      const e=active;
      if(e&&owner(e)&&G.SceneManager._scene===this&&
         ['return-pending','return'].includes(e.operation.phaseName)){
        deferredAutosave??={entry:e,scene:this,map:G.$gameMap,mapId:G.$gameMap?.mapId?.(),args};
        return;
      }
      return requestAutosave.apply(this,args);
    };
    prototype.update=function(...args:any[]){const r=update?.apply(this,args);poll(this,true);return r;};
    prototype.start=function(...args:any[]){const r=start?.apply(this,args);poll(this);return r;};
    prototype.terminate=function(...args:any[]){if(deferredAutosave?.scene===this)deferredAutosave=null;let result;try{active?.operation.mapTerminated(this);}finally{result=terminate?.apply(this,args);}return result;};
    prototype.isBusy=function(...args:any[]){return !!baseBusy?.apply(this,args)||pending();};
    const isMenuEnabled=prototype.isMenuEnabled;
    if(isMenuEnabled)prototype.isMenuEnabled=function(...args:any[]){return !pending()&&isMenuEnabled.apply(this,args);};
  }
  if(G.Game_Player?.prototype?.canMove){
    const canMove=G.Game_Player.prototype.canMove;
    G.Game_Player.prototype.canMove=function(...args:any[]){return !flow.running&&!pending()&&canMove.apply(this,args);};
  }
  // World graphics and characters continue to update. Interpreter commands wait,
  // as they would during the original synchronous wrapper; they cannot grant/heal while entering.
  for(const [type,method]of [[G.Game_Map,'updateInterpreter'],[G.Game_Event,'updateParallel'],[G.Game_CommonEvent,'update']]){
    if(!type?.prototype?.[method])continue;
    const original=type.prototype[method];
    type.prototype[method]=function(...args:any[]){if(pending())return;return original.apply(this,args);};
  }
  return {
    pending, snapshot:()=> (active?.operation??last)?.snapshot()??null,
    open(op:any,plan:Readonly<PrebattlePlan>):boolean{
      const scene=G.SceneManager._scene;
      op.prebattleMode=flow.fast?'developer-fast':liveMap(scene)?'default-map':'non-map-immediate';
      if(flow.fast||!liveMap(scene))return false;
      deferredAutosave=null;
      active?.operation.cancel(false);
      const e:Entry={op,source:scene,app:flow._app,generation:flow._app?.stateGeneration,operation:null as any};
      e.operation=new PrebattleOperation(plan,{
        current:()=>owner(e),now:()=>G.performance.now(),frame:()=>G.Graphics.frameCount,
        overlay:map=>createPrebattleOverlayMZ(G,map,()=>owner(e)),
        captureBGS:()=>capturePrebattleBGSMZ(G,()=>owner(e)),prepareAudio:()=>prepareAudio(op),
        enterBattle:()=>{if(!owner(e)||G.SceneManager._scene!==e.source)throw new Error('stale prebattle handoff');G.SceneManager.push(G.Scene_PSBattle??G.window?.Scene_PSBattle);},
        resetEncounter:()=>G.$gamePlayer?.makeEncounterCount?.(),
        failed:error=>{
          if(flow._op!==op)return;
          flow.abort(error,op);
          if(flow._op===op)try{G.$gameMessage.add(flow.translator().t('management.refused',{reason:String(error instanceof Error?error.message:error)}));}
            catch(messageError){(flow.lastOutcome.hostErrors??=[]).push({step:'prebattle-message',error:String(messageError)});}
        },
      });
      active=e;last=e.operation;op.prebattle=e.operation;poll(scene);return true;
    },
    finish(op:any,normal:boolean){const entry=active;if(entry&&entry.op===op)entry.operation.finish(normal);},
    cancel(){deferredAutosave=null;active?.operation.cancel(false);if(active)last=active.operation;active=null;},
  };
}
