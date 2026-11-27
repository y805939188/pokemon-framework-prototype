'use strict';
// Test composition of exact modules from the single official parent emit, not another builder.
const path=require('node:path'),assert=require('node:assert/strict');
const current=require('../../../../scripts/tests/final-production-runtime.cjs').get();
assert.equal(process.env.PF_E3_PARENT_BUNDLE,__filename);
const root=process.env.PF_E2_PARENT_OUT;assert(root);
const load=file=>require(path.join(root,'src',file));
module.exports={...current.E,
 GameApplication:load('framework/app/game-application.js').GameApplication,
 createMZAtomicStatePort:load('plugins/world/atomic-state-mz.js').createMZAtomicStatePort,
 createTransferHost:load('plugins/world/transfer-host.js').createTransferHost,
 releaseRecoveredArrivalMZ:load('plugins/world/recovered-arrival-mz.js').releaseRecoveredArrivalMZ,
 createCompanionIngressMZ:load('plugins/world/event-companion-ingress-mz.js').createCompanionIngressMZ,
 ...load('plugins/world/travel-lease-registry-mz.js')};
