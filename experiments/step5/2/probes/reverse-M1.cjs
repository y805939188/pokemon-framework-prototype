'use strict';
// Author counterexample probes for M1, never an independent review. One mutation at a time; preserve all input bytes.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),outDir=process.argv[2];
if(!outDir)throw Error('usage: node reverse-M1.cjs <absolute evidence directory>');fs.mkdirSync(outDir,{recursive:true});
const f='src/framework/',suite=id=>`experiments/step5/2/test-${id}6.cjs`,cases=[];
function add(id,file,before,after,tests){cases.push({id,file,before,after,tests});}
add('slot-preflight',f+'rules/inventory.ts','if (quantity > capacityFor(inventory, id, catalog, policy))','if (false)','inventory');
add('slot-fill',f+'rules/inventory.ts','for (const slot of pocket) if (slot.itemId === id) { const n = Math.min(left, Math.max(0, policy.perSlot - slot.quantity));','for (const slot of []) if (slot.itemId === id) { const n = Math.min(left, Math.max(0, policy.perSlot - slot.quantity));','inventory');
add('slot-forward-removal',f+'rules/inventory.ts','const n = Math.min(left, slot.quantity);','const n = Math.min(quantity, slot.quantity);','inventory');
add('replace-identities',f+'rules/inventory.ts','slot.itemId = newId;','slot.itemId = oldId;','inventory');
add('automatic-sort-guard',f+'rules/inventory.ts',"||policy.autoSort[pocket-1]","||false",'inventory');
add('legacy-quantity-preserved',f+'rules/save-schema.ts',"inventoryFromBag(doc['bag'] as Record<string,number>,", "inventoryFromBag(Object.fromEntries(Object.entries(doc['bag'] as Record<string,number>).map(([k,v])=>[k,Math.min(v,999)])),",'migration');
add('legacy-PP-ambiguity',f+'rules/save-schema.ts',"if (base===undefined || move['maxpp']!==totalPp(base,boost as number))",'if (false)','migration');
add('move-identity',f+'rules/member-metadata.ts',"const match = unused.find(entry => !used.has(entry.i) && entry.move.id === move.id);","const match = unused.find(entry => !used.has(entry.i));",'migration');
add('calculation-nature',f+'rules/species-key.ts','nature: computedNature(m)','nature: m.nature','migration');
add('growth-nature-roundtrip',f+'rules/growth.ts','nature: member.nature, statNature: member.statNature ?? null','nature: r.member.nature, statNature: null','migration');
add('store-validator',f+'tools/save-store.ts','if (problems.length) throw new SaveError({ code: "invalid", message: "invalid current state; original file untouched", problems });','', 'migration');
add('canonical-intent',f+'app/inventory-session.ts','fingerprint=semanticFingerprint(request);','fingerprint=JSON.stringify(request);','transactions');
add('duplicate-installs-twice',f+'app/inventory-session.ts',"if(old){if(old.fingerprint!==fingerprint)","if(false&&old){if(old.fingerprint!==fingerprint)",'transactions');
add('receipt-before-install',f+'app/inventory-session.ts','    if(changed)try{this.options.install(next);}',"    this.receipts.set(requestId,{fingerprint,outcome:{status:'committed',requestId,result}});\n    if(changed)try{this.options.install(next);}",'transactions');
add('ABA-revision',f+'app/inventory-session.ts','semanticFingerprint(current)!==semanticFingerprint(ticket)','current.itemId!==ticket.itemId||current.quantity!==ticket.quantity','transactions');
add('old-token',f+'app/inventory-session.ts','context.token!==token||','false||','transactions');
add('money-clamp',f+'rules/economy.ts','return Math.min(cap,Math.max(0,value));','return value;','transactions');
add('badge-first-time',f+'rules/economy.ts','if(!before&&owned)','if(owned)','transactions');
add('parent-suspension',f+'app/management.ts','this.child=true;','this.child=false;','transactions');
add('BoxLink-inventory',f+'app/inventory-session.ts',"return Object.values(catalog).some(item=>hasFlag(item,'BoxLink')&&(own(counts,item.id)??0)>0);",'return false;','transactions');
add('rare-q1-port',f+'app/inventory-session.ts',"||item.effect?.family==='rare-candy'&&quantity!==1",'', 'transactions');
add('sort-cancel-order',f+'app/inventory-session.ts',"next.inventory.pockets[sort.pocket-1]=sort.order.map((original,current)=>({original,slot:rows[current]!})).sort((a,b)=>a.original-b.original).map(row=>row.slot);",'', 'transactions');
add('item-source-gate',f+'content/item-input.ts',"const sourceProblem = usable(raw.source);","const sourceProblem = null;",'content');
add('shop-override-validation',f+'content/item-input.ts',"if (raw.overrides !== undefined &&", "if (false &&",'content');
add('encounter-refusal-cache','src/plugins/PS_BattleFlow.ts',"if(heldEncounterGate&&heldEncounterGate.game===gateGame&&heldEncounterGate.map===gateMap&&heldEncounterGate.key===gateKey&&heldEncounterGate.capability===gateCapability)return false;",'', ['experiments/step5/test-plugin-host5.cjs']);
add('encounter-map-invalidation','src/plugins/PS_BattleFlow.ts','JSON.stringify([G.$gameMap?.mapId?.(),heldKey])','JSON.stringify(heldKey)',['experiments/step5/test-plugin-host5.cjs']);
add('fake-semantic-fingerprint','experiments/step5/1/probes/held-contract-model.cjs',"require('../../../../js/engine/build/engine.cjs').semantic.semanticFingerprint(result)",'JSON.stringify(result)',['experiments/step5/1/test-held-contract.cjs']);
const run=(command,args,timeout=180000)=>spawnSync(command,args,{cwd:root,encoding:'utf8',timeout,maxBuffer:16*1024*1024});
const build=()=>run('pnpm',['--dir','src','build:engine']);
function test(file,tag){const r=run(process.execPath,['--test','--test-reporter=tap',file]);fs.writeFileSync(path.join(outDir,tag+'.tap'),r.stdout+r.stderr);return {file,exit:r.status,fail:Number(r.stdout.match(/^# fail (\d+)/m)?.[1]??NaN),cancelled:Number(r.stdout.match(/^# cancelled (\d+)/m)?.[1]??NaN),skipped:Number(r.stdout.match(/^# skipped (\d+)/m)?.[1]??NaN),failing:[...r.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1]),error:r.error?.message};}
for(const c of cases)c.tests=Array.isArray(c.tests)?c.tests:[suite(c.tests)];
const built=build();fs.writeFileSync(path.join(outDir,'baseline-build.log'),built.stdout+built.stderr);if(built.status!==0)throw Error('baseline build failed');
const baseline=[...new Set(cases.flatMap(c=>c.tests))].map((file,i)=>test(file,'baseline-'+i));
if(baseline.some(r=>r.exit!==0||r.fail!==0||r.cancelled!==0||r.skipped!==0)){fs.writeFileSync(path.join(outDir,'baseline.json'),JSON.stringify(baseline,null,2));throw Error('baseline must be fully green before mutation');}
const results=[];
for(const c of cases){const file=path.join(root,c.file),bytes=fs.readFileSync(file),original=bytes.toString();let result={id:c.id,file:c.file};
 try{const count=original.split(c.before).length-1;if(count!==1)throw Error(`anchor matched ${count} times`);fs.writeFileSync(file,original.replace(c.before,c.after));const b=build();fs.writeFileSync(path.join(outDir,c.id+'.build.log'),b.stdout+b.stderr);
 if(b.status!==0)result={...result,verdict:'BUILD-FAILED'};else{const tests=c.tests.map((f,i)=>test(f,c.id+'-'+i));const caught=tests.some(r=>r.fail>0)&&tests.every(r=>r.cancelled===0&&r.skipped===0&&!r.error);result={...result,verdict:caught?'caught':'MISSED',tests};}
 }catch(error){result={...result,verdict:'NOT-APPLIED',error:error.message};}finally{fs.writeFileSync(file,bytes);if(!fs.readFileSync(file).equals(bytes))throw Error('restore mismatch');}
 results.push(result);console.log(`${c.id}: ${result.verdict}`);fs.writeFileSync(path.join(outDir,'results.json'),JSON.stringify({baseline,results},null,2));
}
const restored=build();fs.writeFileSync(path.join(outDir,'restored-build.log'),restored.stdout+restored.stderr);fs.writeFileSync(path.join(outDir,'results.json'),JSON.stringify({baseline,results,restoredBuildExit:restored.status},null,2));
process.exitCode=restored.status===0&&results.every(r=>r.verdict==='caught')?0:1;
