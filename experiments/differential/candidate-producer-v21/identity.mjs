import {constants,closeSync,fstatSync,lstatSync,openSync,readSync,readdirSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
export const PROTOCOL_FREEZE='4d85016e743f4e0507086efccee9121ef523484fe8a95c1d518d147eae0b6b15';
export const OWN=Object.freeze(['identity.mjs','bounded.mjs','worker.mjs','coordinator.mjs','produce.mjs','CONTRACT.zh.md']);
export const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
export const hash=b=>createHash('sha256').update(b).digest('hex');
export function readFile(p,max=32*1024*1024,utf8=true){
 p=resolve(p);need(realpathSync(p)===p,'PRODUCER_LINK');const s=lstatSync(p);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=max,'PRODUCER_REGULAR_FILE');
 const fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW);let b;
 try{const a=fstatSync(fd);need(a.ino===s.ino&&a.dev===s.dev&&a.size===s.size,'PRODUCER_FILE_CHANGED');b=Buffer.alloc(s.size+1);const n=readSync(fd,b,0,b.length,0),z=fstatSync(fd);need(n===s.size&&z.size===s.size&&z.mtimeMs===s.mtimeMs,'PRODUCER_FILE_CHANGED');b=b.subarray(0,n);}finally{closeSync(fd);}
 if(utf8)need(Buffer.from(b.toString('utf8'),'utf8').equals(b),'PRODUCER_UTF8');return b;
}
export function inventory(root,rel=''){
 const a=[];for(const e of readdirSync(join(root,rel),{withFileTypes:true})){need(!e.isSymbolicLink(),'PRODUCER_LINK');const p=rel?rel+'/'+e.name:e.name;if(e.isDirectory())a.push(...inventory(root,p));else{need(e.isFile(),'PRODUCER_REGULAR_FILE');a.push(p);}}return a.sort();
}
export function verifyProducer(root,expected){
 need(/^[a-f0-9]{64}$/.test(expected)&&expected!=='0'.repeat(64),'PRODUCER_EXTERNAL_PIN_REQUIRED');root=resolve(root);need(root===realpathSync(root),'PRODUCER_ROOT_LINK');
 const b=readFile(join(root,'producer-freeze.json'),1048576);need(hash(b)===expected,'PRODUCER_FREEZE_MISMATCH');const m=JSON.parse(b);
 need(Object.keys(m).sort().join(',')==='files,protocol,protocolFreezeSHA256'&&m.protocol==='pre54-candidate-producer-freeze-v1'&&m.protocolFreezeSHA256===PROTOCOL_FREEZE,'PRODUCER_MANIFEST');
 const pf=readFile(join(root,'protocol-bundle/observation-freeze.json'),1048576);need(hash(pf)===PROTOCOL_FREEZE,'PRODUCER_PROTOCOL_PIN');const f=JSON.parse(pf);
 const wanted=[...OWN.map(p=>'producer/'+p),...f.files.map(x=>'protocol-bundle/'+x.path),'protocol-bundle/observation-freeze.json'].sort();
 need(Array.isArray(m.files)&&m.files.length===wanted.length,'PRODUCER_FILE_SET');
 const fixedProtocol=new Map(f.files.map(e=>['protocol-bundle/'+e.path,e]));
 need(inventory(root).join('\n')===[...wanted,'producer-freeze.json'].sort().join('\n'),'PRODUCER_EXTRA_FILE');
 for(let i=0;i<wanted.length;i++){
  const e=m.files[i];need(Object.keys(e).sort().join(',')==='bytes,path,sha256'&&e.path===wanted[i]&&!e.path.split('/').includes('..'),'PRODUCER_MANIFEST_PATH');if(fixedProtocol.has(e.path)){const fixed=fixedProtocol.get(e.path);need(e.bytes===fixed.bytes&&e.sha256===fixed.sha256,'PRODUCER_PROTOCOL_PAYLOAD');}const b=readFile(join(root,e.path));need(b.length===e.bytes&&hash(b)===e.sha256,'PRODUCER_PAYLOAD_MISMATCH');
 }
 return {root,manifest:m,producerFreezeHash:expected,protocolRoot:join(root,'protocol-bundle')};
}
export function loaderPolicy(){need(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&process.execArgv.length===0,'PRODUCER_NODE_LOADER_POLICY');need(process.version==='v22.21.1','PRODUCER_NODE_VERSION');}
export function flags(args,keys){need(args.length===keys.length*2,'PRODUCER_ARGUMENTS');const out={};keys.forEach((k,i)=>{need(args[i*2]==='--'+k&&typeof args[i*2+1]==='string'&&args[i*2+1].length>0,'PRODUCER_ARGUMENTS');out[k]=args[i*2+1];});return out;}
