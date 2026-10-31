// Only direct children/groups created by this call. No shell, ps, credential or session lookup.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
export const LIMITS=Object.freeze({timeoutMs:30000,maxStdoutBytes:16777216,maxStderrBytes:1048576});
export const cleanEnv=()=>({LANG:'C',TZ:'UTC'});
export function groupAbsent(pid){
 if(process.platform==='win32')return null;
 try{process.kill(-pid,0);return false;}catch(e){return e.code==='ESRCH'?true:null;}
}
export async function boundedChild({argv,cwd,limits=LIMITS,signal,onSpawn=()=>{},onMessage=()=>{},extraGroups=new Set()}){
 if(!Array.isArray(argv)||!argv.length||!argv.every(x=>typeof x==='string'&&x&&!x.includes('\0')))throw Error('CHILD_ARGV');
 if(![limits.timeoutMs,limits.maxStdoutBytes,limits.maxStderrBytes].every(x=>Number.isSafeInteger(x)&&x>0))throw Error('CHILD_LIMITS');
 const at=new Date().toISOString(),start=performance.now(),parts={stdout:[],stderr:[]},bytes={stdout:0,stderr:0},digests={stdout:createHash('sha256'),stderr:createHash('sha256')};
 let child,first=null,closed=false,forced=false,spawnError=null,killErrors=[],messages=[],done,hard,force;const tracked=extraGroups;
 const kill=(pid,sig)=>{try{if(process.platform==='win32')process.kill(pid,sig);else process.kill(-pid,sig);}catch(e){if(e.code!=='ESRCH')killErrors.push(e.code??'KILL_ERROR');}};
 const stop=reason=>{if(!first)first=reason;if(!child?.pid)return;kill(child.pid,'SIGTERM');for(const p of tracked)kill(p,'SIGTERM');if(!hard)hard=setTimeout(()=>{if(!closed){kill(child.pid,'SIGKILL');for(const p of tracked)kill(p,'SIGKILL');}},200);if(!force)force=setTimeout(()=>{if(!closed){forced=true;child.stdout.destroy();child.stderr.destroy();if(child.connected)child.disconnect();child.unref();done({code:null,signal:null});}},1000);};
 const aborted=()=>stop('CANCELLED');
 if(signal?.aborted)return {status:'process-error',code:'CANCELLED_BEFORE_SPAWN',pid:null,cleanupVerified:true,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),messages:[],startedAtUTC:at,endedAtUTC:at,durationMs:0,exitCode:null,signal:null,timedOut:false,outputLimitExceeded:false,stdoutBytes:0,stderrBytes:0,stdoutSha256:createHash('sha256').digest('hex'),stderrSha256:createHash('sha256').digest('hex'),killErrors:[]};
 const completion=new Promise(resolve=>{done=resolve;});
 try{child=spawn(argv[0],argv.slice(1),{cwd,env:cleanEnv(),shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe','ipc']});}
 catch(e){spawnError=e.code??'SPAWN_ERROR';done({code:null,signal:null});}
 if(child){
  child.once('error',e=>{spawnError=e.code??'SPAWN_ERROR';});
  child.once('close',(code,signal)=>{closed=true;done({code,signal});});
  for(const stream of ['stdout','stderr'])child[stream].on('data',chunk=>{const b=Buffer.from(chunk),old=bytes[stream],limit=stream==='stdout'?limits.maxStdoutBytes:limits.maxStderrBytes;bytes[stream]+=b.length;digests[stream].update(b);if(old<limit)parts[stream].push(b.subarray(0,limit-old));if(bytes[stream]>limit)stop(stream.toUpperCase()+'_LIMIT');});
  child.on('message',m=>{if(messages.length>=1024||Buffer.byteLength(JSON.stringify(m))>4096){stop('IPC_LIMIT');return;}messages.push(m);try{onMessage(m);}catch{stop('IPC_REJECTED');}});
  if(child.pid)try{onSpawn(child.pid);}catch{stop('SPAWN_CALLBACK');}
 }
 const timer=setTimeout(()=>stop('TIMEOUT'),limits.timeoutMs);signal?.addEventListener('abort',aborted,{once:true});
 if(signal?.aborted)aborted();
 const ended=await completion;clearTimeout(timer);clearTimeout(hard);clearTimeout(force);signal?.removeEventListener('abort',aborted);
 const absent=child?.pid?groupAbsent(child.pid):true;const extraGroupAbsence=[...tracked].map(pid=>({pid,absent:groupAbsent(pid)}));const cleanupVerified=closed&&absent===true&&extraGroupAbsence.every(x=>x.absent===true)&&killErrors.length===0;
 let code=first??(spawnError?'SPAWN_ERROR':ended.signal?'PROCESS_SIGNAL':ended.code!==0?'PROCESS_NONZERO':bytes.stderr?'STDERR_NONEMPTY':!cleanupVerified?'CLEANUP_UNVERIFIED':null);
 if(forced&&!code)code='CLEANUP_UNVERIFIED';
 return {status:code?(code==='TIMEOUT'?'timeout':'process-error'):'success',code,pid:child?.pid??null,cleanupVerified,groupAbsent:absent,extraGroupAbsence,closed,forced,spawnError,killErrors,messages,startedAtUTC:at,endedAtUTC:new Date().toISOString(),durationMs:Math.round(performance.now()-start),exitCode:Number.isInteger(ended.code)&&ended.code>=0?ended.code:null,signal:ended.signal??null,timedOut:first==='TIMEOUT',outputLimitExceeded:first==='STDOUT_LIMIT'||first==='STDERR_LIMIT',stdoutBytes:bytes.stdout,stderrBytes:bytes.stderr,stdoutSha256:digests.stdout.digest('hex'),stderrSha256:digests.stderr.digest('hex'),stdout:Buffer.concat(parts.stdout),stderr:Buffer.concat(parts.stderr)};
}
export function executionView(r,limits=LIMITS){return Object.fromEntries(['status','startedAtUTC','endedAtUTC','durationMs','exitCode','signal','stdoutBytes','stderrBytes','stdoutSha256','stderrSha256','timedOut','outputLimitExceeded'].map(k=>[k,r[k]]).concat(Object.entries(limits)));}
