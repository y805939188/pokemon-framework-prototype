"use strict";
const fs=require('node:fs'),assert=require('node:assert/strict');
const {worker}=require('../mz-slot-worker.cjs');
const {E,T}=require('../trainer-ai-integration/fixtures.cjs');
const {pairHash}=require('./oracle.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const [stage,id,folder,hostRoot,productRoot,planFile]=process.argv.slice(2);
assert(['producer','consumer'].includes(stage));
let observations=0;
function observeRequired(session,result){
 // Read the actual session's detached context. This is test-only observation, not a new authority source.
 const context=session._evidence.snapshot().context;
 assert.equal(context.battleId,result.battleId);assert.equal(context.contentIdentity,E.contentRuntime.validatedContentIdentity(session.content));
 const binding={battleId:context.battleId,generation:context.generation,rawHash:E.state.resultHash(result),contentIdentity:context.contentIdentity};
 const lineage=T.heldDiagnostics.gatewaySettlementLineage(session.gw);assert(lineage);
 const facts=T.heldDiagnostics.gatewaySettlementFacts(session.gw,lineage,binding),before=clone(facts);
 const expected=pairHash(facts);assert.deepEqual(facts,before,'oracle cannot mutate observations');
 assert.equal(facts.coverage,'complete');assert.equal(facts.version,1);
 assert.deepEqual(facts.binding,binding);observations++;
 return{facts,pairHash:expected,source:'read-only actual Session context and testing gateway journal; unchanged required factory'};
}
worker(stage,id,folder,hostRoot,productRoot,JSON.parse(fs.readFileSync(planFile)),observeRequired).then(result=>{
 assert.equal(observations,result.aborted?0:1);
 if(!result.aborted){assert.equal(result.savedPairHash,result.requiredObservation.pairHash);assert.equal(result.installs,1);}
 process.stdout.write(JSON.stringify(result)+'\n');
}).catch(error=>{console.error(error.stack??error);process.exitCode=1;});
