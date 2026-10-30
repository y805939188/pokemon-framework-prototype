/** Small trusted composition registry. Authored content references entries; it never supplies executable code. */
import { createTrainerAiPolicy, createTrainerAiSnapshotValidator } from '../rules/trainer-ai';
import type { TrainerAiCatalog, TrainerAiSnapshot, DecisionPlan, RandomN } from '../rules/trainer-ai';
import { copyStrategyData, freezeStrategyData, strategyReference, defaultStrategyReference } from '../rules/trainer-ai-strategy';
import type { TrainerAiStrategyReference, TrainerAiStrategy, StrategyParameters } from '../rules/trainer-ai-strategy';
import { semanticFingerprint } from '../rules/semantic';
export type { TrainerAiStrategyReference, TrainerAiStrategy, StrategyParameters } from '../rules/trainer-ai-strategy';
export interface TrainerAiStrategyRegistration {
  id:string; version:string; implementationIdentity:string;
  validateParameters(parameters:StrategyParameters):void;
  create(publicCatalog:TrainerAiCatalog):TrainerAiStrategy;
}
export interface PinnedTrainerAiStrategy {
  readonly binding:{readonly id:string;readonly version:string;readonly implementationIdentity:string;readonly parametersHash:string};
  readonly parameters:StrategyParameters;
  instantiate(catalog:TrainerAiCatalog,catalogIdentity:string):BoundTrainerAiStrategy;
}
export interface BoundTrainerAiStrategy {
  readonly binding:PinnedTrainerAiStrategy['binding'] & {readonly catalogIdentity:string};
  decide(snapshot:TrainerAiSnapshot,random:RandomN):DecisionPlan;
}
export interface TrainerAiStrategyRegistry {
  register(entry:TrainerAiStrategyRegistration,active?:boolean):void;
  setActive(id:string,version:string):void;
  resolve(reference?:TrainerAiStrategyReference):PinnedTrainerAiStrategy;
}
const diagnostics=['unmodeled-move-family','omitted-public-modifier','unsupported-trainer-item-family','zero-total-weight','first-legal-fallback','no-voluntary-switch-in-basic-profile'];
function intent(value:unknown,snapshot:TrainerAiSnapshot):DecisionPlan {
  const x=copyStrategyData(value,32768,8) as unknown as DecisionPlan;
  const reject=():never=>{throw new Error('trainer-ai-invalid-strategy-intent');};
  if(!x||Array.isArray(x)||typeof x!=='object')return reject();
  const fields=x.kind==='choose'?['kind','binding','candidateId','retryOrder','diagnostics']:x.kind==='fallback'?['kind','binding','candidateIds','reason','diagnostics']:x.kind==='none'||x.kind==='error'?['kind','binding','reason']:[];
  if(!fields.length||Object.keys(x).length!==fields.length||!fields.every(k=>Object.hasOwn(x,k))||semanticFingerprint(x.binding)!==semanticFingerprint(snapshot.binding))return reject();
  const req=snapshot.request;
  if(x.kind==='none'){if((req.kind!=='wait'&&req.kind!=='finished')||x.reason!==req.kind)return reject();return freezeStrategyData(x);}
  if(req.kind==='wait'||req.kind==='finished')return reject();
  if(x.kind==='error'){if(!['invalid-snapshot','invalid-random-result','no-legal-action','unsupported-request'].includes(x.reason))return reject();return freezeStrategyData(x);}
  if(!Array.isArray(x.diagnostics)||new Set(x.diagnostics).size!==x.diagnostics.length||!x.diagnostics.every(d=>diagnostics.includes(d)))return reject();
  const allowed=req.kind==='move'?[...req.legalMoves,...req.legalItems].map(c=>c.candidateId):req.legalSwitches.map(c=>c.candidateId);
  const order=x.kind==='choose'?x.retryOrder:x.candidateIds;
  if(!Array.isArray(order)||!order.length||new Set(order).size!==order.length||!order.every(id=>typeof id==='string'&&allowed.includes(id)))return reject();
  if(x.kind==='choose'&&x.candidateId!==order[0])return reject();
  if(x.kind==='fallback'&&!['zero-total-weight','no-normal-move'].includes(x.reason))return reject();
  return freezeStrategyData(x);
}
export function createTrainerAiStrategyRegistry():TrainerAiStrategyRegistry {
  const entries=new Map<string,Map<string,TrainerAiStrategyRegistration>>(),active=new Map<string,string>(),identities=new Set<string>();
  const registry:TrainerAiStrategyRegistry={
    register(entry,makeActive=true){
      strategyReference({id:entry.id,version:entry.version,parameters:{}});
      if(!entry.implementationIdentity||typeof entry.implementationIdentity!=='string'||typeof entry.create!=='function'||typeof entry.validateParameters!=='function')throw new Error('trainer-ai-invalid-registration');
      if(entries.get(entry.id)?.has(entry.version)||identities.has(entry.implementationIdentity))throw new Error('trainer-ai-strategy-already-registered');
      // Capture actual functions now; later changes to the caller's descriptor cannot replace this implementation.
      const fixed=Object.freeze({id:entry.id,version:entry.version,implementationIdentity:entry.implementationIdentity,create:entry.create.bind(entry),validateParameters:entry.validateParameters.bind(entry)});
      let versions=entries.get(entry.id);if(!versions){versions=new Map();entries.set(entry.id,versions);}versions.set(entry.version,fixed);identities.add(entry.implementationIdentity);
      if(makeActive)active.set(entry.id,entry.version);
    },
    setActive(id,version){if(!entries.get(id)?.has(version))throw new Error('trainer-ai-unknown-strategy-version');active.set(id,version);},
    resolve(reference){
      const ref=strategyReference(reference??defaultStrategyReference()),versions=entries.get(ref.id);
      if(!versions)throw new Error('trainer-ai-unknown-strategy-id');
      const version=ref.version??active.get(ref.id),entry=version?versions.get(version):undefined;
      if(!entry)throw new Error('trainer-ai-unknown-strategy-version');
      const parameters=freezeStrategyData(ref.parameters);entry.validateParameters(parameters);
      const binding=Object.freeze({id:ref.id,version:entry.version,implementationIdentity:entry.implementationIdentity,parametersHash:semanticFingerprint(parameters)});
      return Object.freeze({binding,parameters,instantiate(catalog:TrainerAiCatalog,catalogIdentity:string):BoundTrainerAiStrategy {
        const validate=createTrainerAiSnapshotValidator(catalog);
        const instance=entry.create(freezeStrategyData(copyStrategyData(catalog,2_000_000,12)) as unknown as TrainerAiCatalog);
        const decide=instance.decide.bind(instance);
        return Object.freeze({binding:Object.freeze({...binding,catalogIdentity}),decide(snapshot:TrainerAiSnapshot,random:RandomN):DecisionPlan {
          // Collector failures precede strategy execution. They must never become strategy fallback.
          const input=freezeStrategyData(validate(snapshot));
          if(input.request.kind==='wait'||input.request.kind==='finished')return {kind:'none',binding:input.binding,reason:input.request.kind};
          let open=true;
          const localRandom:RandomN=n=>{if(!open)throw new Error('trainer-ai-random-closed');return random(n);};
          try {
            const result=decide(input,parameters,localRandom);
            if(result instanceof Promise){void Promise.prototype.then.call(result,()=>{},()=>{});throw new Error('trainer-ai-async-not-supported-batch1');}
            return intent(result,input);
          } finally {open=false;}
        }});
      }});
    },
  };
  registry.register({id:'basic-gen8',version:'1',implementationIdentity:'pokemon-framework/basic-gen8/1',
    validateParameters(parameters){if(Object.keys(parameters).length)throw new Error('trainer-ai-invalid-basic-parameters');},
    create(catalog){const policy=createTrainerAiPolicy(catalog);return {decide:(snapshot,_parameters,random)=>policy.decide(snapshot,random)};},
  });
  return Object.freeze(registry);
}
