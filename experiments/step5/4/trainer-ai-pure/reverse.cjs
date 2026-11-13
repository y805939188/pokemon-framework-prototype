'use strict';
// Isolated counterfactuals: temporary copies only, never edit the author source to mutate it.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..'),modulePath=path.join(root,'src/framework/rules/trainer-ai.ts'),testPath=path.join(root,'experiments/step5/4/test-trainer-ai.cjs');
const output=process.argv[2];if(!output)throw Error('supply a fresh evidence output directory');fs.mkdirSync(output,{recursive:false});
const original=fs.readFileSync(modulePath,'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const mutations=[
 ['incomplete-moves-before-item',"if(req.legalMoves.length===0)return {kind:'error',binding,reason:req.legalItems.length?'invalid-snapshot':'no-legal-action'};",''],
 ['extra-field-admission','actual.length === expected.length && expected.every','expected.every'],
 ['invalid-rng-clamp','if (!Number.isSafeInteger(x) || x < 0 || x >= n) throw new BadRandom();','x = Math.max(0, Math.min(n-1, Number(x)||0));'],
 ['selection-input-alias','return select(c.skill, c.candidates, random);','return select(skill, candidates, random);'],
 ['cumulative-inclusive','if (n < accumulated)','if (n <= accumulated)'],
 ['skip-weight-draw','const n = draw(random, total);','const n = 0;'],
 ['hp-probability-endpoint','draw(random,100)<30','draw(random,100)<=30'],
 ['force-negative-rejection',"if (!candidates.length) return {kind:'error',reason:'no-legal-action'};","if (!candidates.length || Math.max(...candidates.map(c=>c.score))<100) return {kind:'error',reason:'no-legal-action'};"],
 ['discard-public-immunity',"if (x.predictFailure && (x.publicFailure !== 'none' || (x.family === 'basic-damage' && x.publicTypeMultiplier.numerator === 0)))",'if (false)'],
];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-c-ai-reverse-')),results=[];
try{
 for(const[id,from,to]of mutations){
  assert.equal(original.split(from).length-1,1,id+' mutation must hit exactly once');
  const changed=original.replace(from,to),file=path.join(temp,id+'.ts');fs.writeFileSync(file,changed);
  const r=cp.spawnSync(process.execPath,['--test',testPath],{cwd:root,env:{...process.env,PF_TRAINER_AI_TEST_MODULE:file},encoding:'utf8'});
  fs.writeFileSync(path.join(output,id+'.stdout'),r.stdout??'');fs.writeFileSync(path.join(output,id+'.stderr'),r.stderr??'');
  const assertions=Number((r.stdout??'').match(/# fail (\d+)/)?.[1]??0),caught=r.status===1&&assertions>0&&!/SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND/.test(r.stderr??'');
  results.push({id,exit:r.status,failedAssertions:assertions,caught,mutantSHA256:hash(changed)});
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});}
assert.equal(fs.readFileSync(modulePath,'utf8'),original,'author source unchanged');
const report={sourceSHA256:hash(original),scope:'counterfactual pure-module tests only; no source/host integration',results,caught:results.filter(r=>r.caught).length,total:mutations.length};
fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=results.every(r=>r.caught)?0:1;
