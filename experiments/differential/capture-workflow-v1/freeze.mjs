import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {file,readJSON,sha,need,inventory,noLinks,newOutput,writeNew,hashJSON,validate,S,HASH} from './safe.mjs';
import {freezeInputs} from './fixtures.mjs';
import {projectInitial} from './candidate.mjs';
import {PROFILE,PRODUCT,REFERENCE,RELEASE} from './constants.mjs';
import * as schemas from './schema.mjs';
export const OWN=Object.freeze(['constants.mjs','json.mjs','safe.mjs','schema.mjs','fixtures.mjs','candidate.mjs','bounded.mjs','freeze.mjs','admission.mjs','compare.mjs','worker.mjs','produce.mjs','cli.mjs','CONTRACT.zh.md','QUALIFICATION.json']);
const ManifestSchema=S.obj({schema:{const:'capture-freeze-v1'},profile:{const:PROFILE},product:{const:PRODUCT},reference:{const:REFERENCE},release:{const:RELEASE},authorCommit:S.str(40,'^[a-f0-9]{40}$'),productSrcTree:{const:'1a7f69d39e47a7262a2f7a131d21fbb9ee70bfd5'},nodeVersion:S.str(24,'^v[0-9]+\.[0-9]+\.[0-9]+$'),fixtureSHA256:HASH,producerSHA256:HASH,files:S.arr(S.obj({path:S.str(150,'^(?:tools/[A-Za-z0-9.-]+|runtime/[A-Za-z0-9.-]+|inputs.json|schemas.json)$'),bytes:S.int(0,67108864),sha256:HASH}),100,1)});
export function verifyFreeze(root,pin){root=noLinks(root);need(/^[a-f0-9]{64}$/.test(pin)&&!/^0+$/.test(pin),'FREEZE_EXTERNAL_PIN');const b=file(path.join(root,'capture-freeze.json'),1048576);need(sha(b)===pin,'FREEZE_PIN');const m=readJSON(path.join(root,'capture-freeze.json'));validate(m,ManifestSchema);
 const actual=inventory(root).filter(p=>p!=='capture-freeze.json');need(actual.length===m.files.length,'FREEZE_EXTRA_FILE');for(let i=0;i<actual.length;i++){const x=m.files[i];need(x.path===actual[i]&&!x.path.split('/').includes('..'),'FREEZE_PATH');const b=file(path.join(root,x.path));need(b.length===x.bytes&&sha(b)===x.sha256,'FREEZE_PAYLOAD');}
 need(OWN.every(p=>actual.includes('tools/'+p))&&m.fixtureSHA256===sha(file(path.join(root,'inputs.json')))&&m.producerSHA256===sha(file(path.join(root,'tools/produce.mjs'))),'FREEZE_BINDING');
 need(process.version===m.nodeVersion&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'RUNTIME_LOADER_POLICY');return m;
}
export function buildFreeze(repo,out){repo=noLinks(repo);out=newOutput(path.join(repo,'experiments/differential/capture-workflow-v1'),out);need(execFileSync('git',['rev-parse','HEAD:src'],{cwd:repo,encoding:'utf8'}).trim()==='1a7f69d39e47a7262a2f7a131d21fbb9ee70bfd5','PRODUCT_TREE');need(!execFileSync('git',['status','--porcelain','--','src'],{cwd:repo,encoding:'utf8'}).trim(),'PRODUCT_WIP');
 fs.mkdirSync(out);fs.mkdirSync(path.join(out,'tools'));fs.mkdirSync(path.join(out,'runtime'));
 const src=path.join(repo,'experiments/differential/capture-workflow-v1');for(const n of OWN)fs.writeFileSync(path.join(out,'tools',n),file(path.join(src,n)),{flag:'wx'});
 const seen=new Set();function collect(name){need(/^[A-Za-z0-9.-]+$/.test(name),'RUNTIME_MODULE_PATH');if(seen.has(name))return;seen.add(name);const b=file(path.join(repo,'js/engine/build',name));fs.writeFileSync(path.join(out,'runtime',name),b,{flag:'wx'});for(const x of b.toString('utf8').matchAll(/require\(["']\.\/([A-Za-z0-9.-]+)["']\)/g))collect(x[1]);}
 collect('production.cjs');
 const E=createRequire(import.meta.url)(path.join(out,'runtime/production.cjs'));const input=freezeInputs(E);input.cases.forEach(f=>{f.initialProjection=projectInitial(E,f);});writeNew(path.join(out,'inputs.json'),input);
 writeNew(path.join(out,'schemas.json'),Object.fromEntries(Object.entries(schemas).filter(([k])=>k.endsWith('Schema'))));
 const m={schema:'capture-freeze-v1',profile:PROFILE,product:PRODUCT,reference:REFERENCE,release:RELEASE,authorCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),productSrcTree:'1a7f69d39e47a7262a2f7a131d21fbb9ee70bfd5',nodeVersion:process.version,fixtureSHA256:sha(file(path.join(out,'inputs.json'))),producerSHA256:sha(file(path.join(out,'tools/produce.mjs'))),files:inventory(out).map(p=>{const b=file(path.join(out,p));return {path:p,bytes:b.length,sha256:sha(b)};})};
 writeNew(path.join(out,'capture-freeze.json'),m);const pin=sha(file(path.join(out,'capture-freeze.json')));verifyFreeze(out,pin);return {freezeSHA256:pin,fixtureSHA256:m.fixtureSHA256,producerSHA256:m.producerSHA256,payloadFiles:m.files.length,authorCommit:m.authorCommit};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{need(process.argv.length===4,'BUILD_ARGS');console.log(JSON.stringify(buildFreeze(path.resolve(process.argv[2]),path.resolve(process.argv[3]))));}catch(e){console.log(JSON.stringify({status:'REJECTED',code:e.code??'BUILD_FAILED'}));process.exitCode=2;}}
