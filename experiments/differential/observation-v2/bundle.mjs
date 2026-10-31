import {constants,closeSync,copyFileSync,fstatSync,lstatSync,mkdirSync,openSync,readSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256Text,parseJson,strictStringify} from '../lib/json.mjs';
import {verifyKit} from '../lib/kit.mjs';
import {KIT_PAYLOAD,KIT_METADATA} from '../lib/kit-policy.mjs';
import {shape,requireV2} from './protocol.mjs';
export const LEGACY_FREEZE='ebda61d9abdbc43cb7d3b27857b9b9a0deb5da6877068db105959b41c151555d';
export const REQUEST_BYTES='d8ed3fc97db87148b29ed4a743c7417d182151f1dd4cdecce4c84a5fde9a1df2';
export const REQUEST_HASH='19c09762f7166fef2a7b540c159ded9bd76cbde25903c44a5c3171338a90c133';
export const NEW_FILES=Object.freeze(['bundle.mjs','build.mjs','receive.mjs','compare.mjs','protocol.mjs','schema.json','normalizer.json','CONTRACT.zh.md'].sort());
const deps=KIT_PAYLOAD.filter(p=>p.startsWith('lib/')||p.startsWith('schema/')||p==='profiles/pre54-batch2.mjs');
export const PAYLOAD=Object.freeze([...KIT_PAYLOAD,...KIT_METADATA].map(p=>'legacy-kit/'+p).concat(deps.map(p=>'tools/'+p),NEW_FILES.map(p=>'tools/observation-v2/'+p)).sort());
export const PUBLIC_FILES=Object.freeze(['candidate-observations.json','execution-audit.json','reference-observations.json']);
const digest=b=>sha256Text(b.toString('utf8'));
// Bytes are JSON/JS/MD UTF-8. Reject a lossy decode before hashing so neither binary nor
// replacement-character aliases can enter a frozen tool or an approved public file.
export function readRegular(path,max=32*1024*1024){
 const p=resolve(path);requireV2(realpathSync(p)===p,'LINK_PATH');
 const st=lstatSync(p);requireV2(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<=max,'REGULAR_FILE');
 const fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW);let data;
 try{const a=fstatSync(fd);requireV2(a.ino===st.ino&&a.dev===st.dev&&a.size===st.size,'FILE_CHANGED');const b=Buffer.alloc(st.size+1),n=readSync(fd,b,0,b.length,0),z=fstatSync(fd);requireV2(n===st.size&&z.size===st.size&&z.mtimeMs===st.mtimeMs,'FILE_CHANGED');data=b.subarray(0,n);}finally{closeSync(fd);}
 requireV2(Buffer.from(data.toString('utf8'),'utf8').equals(data),'UTF8');return data;
}
function list(root,rel=''){
 const found=[];for(const e of readdirSync(join(root,rel),{withFileTypes:true})){
  const p=rel?rel+'/'+e.name:e.name;requireV2(!e.isSymbolicLink(),'SYMLINK');
  if(e.isDirectory())found.push(...list(root,p));else{requireV2(e.isFile(),'NONREGULAR');found.push(p);}
 }return found.sort();
}
function baseKit(kit){
 requireV2(kit.freeze.hash===LEGACY_FREEZE&&kit.request.requestHash===REQUEST_HASH&&kit.request.cases.length===354,'LEGACY_IDENTITY');
 requireV2(digest(readRegular(join(kit.root,'requests/wp30-r2.json')))===REQUEST_BYTES,'INPUT_BYTES');
 requireV2(kit.manifest.source.commit==='8c9951c16cad74a595dfd30ac63aa307a5d13eae','FIXED_KIT_SOURCE');
 return kit;
}
export function buildBundle(legacyRoot,out){
 const kit=baseKit(verifyKit(legacyRoot,{expectedFreezeHash:LEGACY_FREEZE}));
 mkdirSync(out); // Exclusive new root. Never refresh or rewrite an old freeze/bundle.
 const src=dirname(fileURLToPath(import.meta.url));
 for(const p of PAYLOAD){
  const from=p.startsWith('legacy-kit/')?join(kit.root,p.slice(11)):p.startsWith('tools/observation-v2/')?join(src,p.slice(21)):join(kit.root,p.slice(6));
  const to=join(out,p);mkdirSync(dirname(to),{recursive:true});const data=readRegular(from);writeFileSync(to,data,{flag:'wx'});
 }
 const files=PAYLOAD.map(p=>{const b=readRegular(join(out,p));return {path:p,bytes:b.length,sha256:digest(b)};});
 const f={protocol:'pre54-observation-freeze-v2',version:'pre54-observation-v2.0.0',legacyFreezeSHA256:LEGACY_FREEZE,legacyRequestBytesSHA256:REQUEST_BYTES,requestHash:REQUEST_HASH,totalCaseCount:354,referenceCommit:'8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b',releaseTag:'v21.1',releaseTagCommit:'ea7b5d56d2436591160983c4e641a2ceee2d875a',files};
 shape('freeze',f);writeFileSync(join(out,'observation-freeze.json'),strictStringify(f,true)+'\n',{flag:'wx'});
 return verifyBundle(out,digest(readRegular(join(out,'observation-freeze.json'))));
}
export function verifyBundle(rootArg,expected){
 const root=resolve(rootArg);requireV2(realpathSync(root)===root,'ROOT_LINK');
 requireV2(/^[0-9a-f]{64}$/.test(expected)&&expected!=='0'.repeat(64),'EXTERNAL_FREEZE_REQUIRED');
 const fb=readRegular(join(root,'observation-freeze.json'),1024*1024);requireV2(digest(fb)===expected,'FREEZE_HASH');
 const freeze=shape('freeze',parseJson(fb.toString('utf8')));
 const wanted=[...PAYLOAD,'observation-freeze.json'].sort(),actual=list(root);
 requireV2(actual.length===wanted.length&&actual.every((p,i)=>p===wanted[i]),'BUNDLE_FILE_SET');
 requireV2(freeze.files.length===PAYLOAD.length,'MANIFEST_FILE_SET');
 for(let i=0;i<PAYLOAD.length;i++){
  const f=freeze.files[i];requireV2(f.path===PAYLOAD[i],'MANIFEST_PATH');const b=readRegular(join(root,f.path));
  requireV2(f.bytes===b.length&&f.sha256===digest(b),'PAYLOAD_HASH');
 }
 requireV2(freeze.legacyFreezeSHA256===LEGACY_FREEZE&&freeze.legacyRequestBytesSHA256===REQUEST_BYTES&&freeze.requestHash===REQUEST_HASH,'FREEZE_LEGACY_BINDING');
 const kit=baseKit(verifyKit(join(root,'legacy-kit'),{expectedFreezeHash:LEGACY_FREEZE}));
 shape('normalizer',parseJson(readRegular(join(root,'tools/observation-v2/normalizer.json')).toString('utf8')));
 return {root,kit,freeze,freezeHash:expected};
}
export function formalContext(root,hash,entryURL,name){
 requireV2(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&process.execArgv.length===0,'NODE_LOADER_POLICY');
 const entry=resolve(fileURLToPath(entryURL));
 requireV2(entry===join(resolve(root),'tools/observation-v2',name)&&realpathSync(entry)===entry,'FORMAL_ENTRY');
 requireV2(process.argv[1]&&realpathSync(resolve(process.argv[1]))===entry,'PROCESS_ENTRY');
 return verifyBundle(root,hash);
}
export function publicFiles(root){
 const p=resolve(root);requireV2(basename(p)==='public-observation-v2-0001'&&realpathSync(p)===p,'PUBLIC_ROOT');
 const found=readdirSync(p).sort();requireV2(found.length===PUBLIC_FILES.length&&found.every((s,i)=>s===PUBLIC_FILES[i]),'PUBLIC_FILE_SET');
 return Object.fromEntries(PUBLIC_FILES.map(n=>[n,readRegular(join(p,n),16*1024*1024)]));
}
export const byteHash=digest;
