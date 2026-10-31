import {receive} from './receive.mjs';
import {comparePackages} from './protocol.mjs';
try{
 const r=receive(process.argv.slice(2),import.meta.url,'compare.mjs');
 const report=comparePackages(r.reference,r.candidate,r.context);
 report.harness='fixed-v2-cli';report.executionAuditSHA256=r.auditHash;
 console.log(JSON.stringify(report));process.exitCode=report.status==='PASS_OBSERVATIONAL'?0:report.status==='BLOCKED'?3:1;
}catch(e){console.log(JSON.stringify({status:'REJECTED_WHOLE_PACKAGE',code:/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'OBS2_COMPARE_REJECTED'}));process.exitCode=2;}
