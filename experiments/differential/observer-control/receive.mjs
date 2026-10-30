#!/usr/bin/env node
// Read-only public receiver. There is no CLI/model/process launch or private-file route here.
import {constants,closeSync,fstatSync,lstatSync,openSync,readSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseJson} from '../lib/json.mjs';
import {createControlGate} from './gate.mjs';

export function receive(args){
 if(args.length!==10&&args.length!==12)throw Error('CONTROL_ARGUMENTS_REJECTED');
 for(const [i,key]of [[0,'--binding'],[2,'--expected-binding'],[4,'--kit'],[6,'--public-root'],[8,'--kind']])if(args[i]!==key)throw Error('CONTROL_ARGUMENTS_REJECTED');
 if(args.length===12&&args[10]!=='--accepted-audit')throw Error('CONTROL_ARGUMENTS_REJECTED');
 if(process.env.NODE_OPTIONS||process.env.NODE_PATH||process.execArgv.length)throw Error('CONTROL_NODE_POLICY_REJECTED');
 const p=resolve(args[1]),st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>65536||realpathSync(p)!==p)throw Error('CONTROL_BINDING_FILE_REJECTED');
 const fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW);let data;
 try{const a=fstatSync(fd);if(a.ino!==st.ino||a.dev!==st.dev||a.size!==st.size)throw Error('CONTROL_BINDING_FILE_CHANGED');const b=Buffer.alloc(65537),n=readSync(fd,b,0,b.length,0),z=fstatSync(fd);if(n!==st.size||n>65536||z.size!==a.size||z.mtimeMs!==a.mtimeMs)throw Error('CONTROL_BINDING_FILE_CHANGED');data=b.subarray(0,n);}finally{closeSync(fd);}
 if(!/^[0-9a-f]{64}$/.test(args[3])||args[3]==='0'.repeat(64)||createHash('sha256').update(data).digest('hex')!==args[3])throw Error('CONTROL_BINDING_EXTERNAL_HASH_MISMATCH');
 const text=data.toString('utf8');if(!Buffer.from(text,'utf8').equals(data))throw Error('CONTROL_BINDING_UTF8_REJECTED');
 return createControlGate({binding:parseJson(text),kitRoot:args[5],publicRoot:args[7],acceptedAuditSHA256:args.length===12?args[11]:null}).inspect(args[9]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=receive(process.argv.slice(2));console.log(JSON.stringify(result));process.exitCode=result.metadataGate==='NOT_YET_PUBLISHED'?3:0;}
 catch(error){const code=typeof error.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(error.code)?error.code:typeof error.message==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(error.message)?error.message:'CONTROL_REJECTED';console.log(JSON.stringify({metadataGate:'REJECTED_WHOLE_STATUS',code,referenceQualification:'NOT_ATTESTED',actualDualRun:'NOT_ATTESTED'}));process.exitCode=2;}
}
