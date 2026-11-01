import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJSON,need,writeNew,sha,file,resultOutput} from './safe.mjs';
import {preflight} from './produce.mjs';
import {formalEntry} from './freeze.mjs';
import {receive,prepareControls} from './admission.mjs';
import {compareBundles} from './compare.mjs';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{need(process.argv.length>=5,'CLI_ARGS');formalEntry(path.resolve(process.argv[3]),process.argv[4],import.meta.url,'cli.mjs');if(process.argv[2]==='prepare'){need(process.argv.length===10,'CLI_PREPARE_ARGS');const [root,pin,mode,authorization,out,qp,qh]=process.argv.slice(3);need(['authorized','hold'].includes(authorization),'CONTROL_AUTHORIZATION');console.log(JSON.stringify(prepareControls({root:path.resolve(root),pin,mode,out:path.resolve(out),authorized:authorization==='authorized',qualificationPath:qp==='NONE'?null:path.resolve(qp),qualificationSHA256:qh==='NONE'?null:qh})));process.exit(0);}
 const [cmd,root,pin,pinsFile,...args]=process.argv.slice(2);need(['preflight','receive','compare'].includes(cmd),'CLI_MODE');const pins=readJSON(pinsFile);const a=preflight(path.resolve(root),pin,pins);
  if(cmd==='preflight'){need(args.length===0,'CLI_ARGS');console.log(JSON.stringify({status:a.status,mode:a.mode,cases:a.cases,businessCalls:0,dispatchSHA256:pins.dispatchSHA256,configSHA256:pins.configSHA256}));}
  else{need(args.length===5,'CLI_ARGS');const [ref,can,audit,auditPin,out]=args;const target=resultOutput(path.resolve(root),[ref,can,audit],out);const accepted=receive({parent:pins,frozenRoot:path.resolve(root),referencePath:ref,candidatePath:can,auditPath:audit,auditSHA256:auditPin});
   if(cmd==='receive'){const receipt={status:accepted.status,referenceRecords:accepted.reference.records.length,candidateRecords:accepted.candidate.records.length,auditSHA256:auditPin,referenceSHA256:sha(file(ref)),candidateSHA256:sha(file(can))};writeNew(target,receipt);console.log(JSON.stringify(receipt));}
   else{const result=compareBundles(accepted);writeNew(target,result);console.log(JSON.stringify({status:result.status,denominator:result.denominator,comparable:result.comparable,workflowEqual:result.workflowEqual,workflowDifferent:result.workflowDifferent,notComparable:result.notComparable,completeOnBoth:result.completeOnBoth,nativeSelectedDifferent:result.nativeSelectedDifferent}));process.exitCode=result.status==='PASS_SELECTED_FACTS_ONLY'?0:1;}
  }
 }catch(e){console.log(JSON.stringify({status:'REJECTED',code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'INTAKE_ERROR'}));process.exitCode=2;}
}
