import {resolve} from 'node:path';
import {buildBundle} from './bundle.mjs';
import {requireV2} from './protocol.mjs';
try{
 requireV2(process.argv.length===6&&process.argv[2]==='--legacy-kit'&&process.argv[4]==='--out','BUILD_ARGUMENTS');
 const c=buildBundle(resolve(process.argv[3]),resolve(process.argv[5]));
 console.log(JSON.stringify({status:'FROZEN_TOOLS_NOT_SOURCE_QUALIFICATION',observationFreezeHash:c.freezeHash,legacyFreezeHash:c.kit.freeze.hash,requestHash:c.kit.request.requestHash,totalCaseCount:354}));
}catch(e){console.log(JSON.stringify({status:'REJECTED',code:/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'OBS2_BUILD_FAILED'}));process.exitCode=2;}
