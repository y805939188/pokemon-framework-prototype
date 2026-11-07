import { executeNativeQualificationGroup } from './d2-normal-execution';
import { installNormalHostFixture } from './d2-normal-fixture';
import { nativeQualificationPreflight } from './d2-native-contract';
/** Early route: preparation is read-only; native consumption requires a separately bound live authority. */
import { createReviewedNormalTools } from './d2-normal-tools';
import { createFormalNormalFixture } from './d2-normal-fixture';
export function prepareNormalD2Entry(argv: readonly string[],nodeRequire: any,host?:{G:any;W:any}): any {
  const stages=argv.filter(x=>x.startsWith('--ps-d2-normal-stage='));
  if(stages.length>1)throw Error('ambiguous normal preparation stage');
  const stage=stages[0]?.slice('--ps-d2-normal-stage='.length);
  const base={version:'D2-normal-entry-preparation-v1',route:'d2-normal-f100',nativeAdmission:false,actualBattles:0,
    finalPair:null,actualTrace:null,qualifiedDeadline:null,OSQualification:'NOT_RUN',P4Acceptance:false,
    missing:['complete normal orchestration/receiving/learning/Map/Title','actual full trace and qualified deadlines','final pair/package identities','OS qualification and original successful host gate']};
  if(stage===undefined)return Object.freeze({...base,status:'BLOCKED_BEFORE_EXECUTION',reason:'normal execution is not qualified; no legacy fallback'});
  if(argv.some(x=>x.startsWith('--ps-flow-only=')||x.startsWith('--ps-d1-count=')))throw Error('partial legacy selector is not a normal preparation profile');
  if(stage==='native-preflight'||stage==='native-qualification'){
    const tools=createReviewedNormalTools(nodeRequire),preflight=nativeQualificationPreflight(argv,nodeRequire,tools);
    if(stage==='native-preflight'||!preflight.binding)return preflight;
    return Object.freeze({...preflight,consumer:'EXPLICIT_LIVE_AUTHORITY_REQUIRED_NOT_AUTOSTARTED',
      consume(authority:any,collector:any){
        if(!host)throw Error('actual isolated native host not bound');
        const {G,W}=host,E=nodeRequire('./js/engine/build/production.cjs');
        return executeNativeQualificationGroup(E,G,W,()=>{
          const scene=G.SceneManager._scene;
          if(!(scene instanceof G.Scene_Map)||!scene.isStarted?.()||G.SceneManager.isSceneChanging()||scene.isBusy?.()||!scene._messageWindow||!scene._spriteset)throw Error('actual owned Map must be ready before native fixture attachment');
          return installNormalHostFixture(E,G,W);
        },tools,preflight.binding,authority,collector);
      }});
  }
  if(stage!=='offline-prepare')throw Error('unsupported normal stage: '+stage);
  const tools=createReviewedNormalTools(nodeRequire),policy=tools.compileNavigation();
  const E=nodeRequire('./js/engine/build/production.cjs'),fixture=createFormalNormalFixture(E);
  return Object.freeze({...base,status:'OFFLINE_PREPARED_EXECUTION_BLOCKED',policyCases:policy.cases.length,donorHash:tools.donorHash,
    presentationHash:tools.presentationHash,initialStateHash:tools.hash(fixture.state()),fixture:fixture.describe(),
    stateHostAttached:false,normalDriverInstalled:false,actualInputSent:false,sourceObserver:'AVAILABLE_SEAM_NOT_INSTALLED'});
}
