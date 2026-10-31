import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROTOCOL_FREEZE,OWN,readFile,hash,inventory,verifyProducer,need} from './identity.mjs';
import {verifyBundle} from '../observation-v2/bundle.mjs';
export function buildProducer(protocolRoot,out){
 protocolRoot=resolve(protocolRoot);verifyBundle(protocolRoot,PROTOCOL_FREEZE);mkdirSync(out);
 const src=dirname(fileURLToPath(import.meta.url));
 for(const name of inventory(protocolRoot)){
  const to=join(out,'protocol-bundle',name);mkdirSync(dirname(to),{recursive:true});writeFileSync(to,readFile(join(protocolRoot,name)),{flag:'wx'});
 }
 for(const name of OWN){const to=join(out,'producer',name);mkdirSync(dirname(to),{recursive:true});writeFileSync(to,readFile(join(src,name)),{flag:'wx'});}
 const files=inventory(out).map(path=>{const b=readFile(join(out,path));return {path,bytes:b.length,sha256:hash(b)};});
 const m={protocol:'pre54-candidate-producer-freeze-v1',protocolFreezeSHA256:PROTOCOL_FREEZE,files};writeFileSync(join(out,'producer-freeze.json'),JSON.stringify(m,null,2)+'\n',{flag:'wx'});
 return verifyProducer(out,hash(readFile(join(out,'producer-freeze.json'))));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{need(process.argv.length===6&&process.argv[2]==='--protocol-bundle'&&process.argv[4]==='--out','PRODUCER_BUILD_ARGUMENTS');const c=buildProducer(process.argv[3],resolve(process.argv[5]));console.log(JSON.stringify({status:'FROZEN_CANDIDATE_PRODUCER_NOT_INDEPENDENT_ACCEPTANCE',producerFreezeSHA256:c.producerFreezeHash,protocolFreezeSHA256:PROTOCOL_FREEZE}));}
 catch(e){console.log(JSON.stringify({status:'REJECTED',code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'PRODUCER_BUILD_ERROR'}));process.exitCode=2;}
}
