import {parseJson,canonicalStringify,assertJsonValue} from './json.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const need=(x,code)=>{if(!x)throw Object.assign(new Error(code),{code});};
export const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export const canonical=canonicalStringify;
export const parse=parseJson;
export const clone=x=>JSON.parse(JSON.stringify(x));
export const hashJSON=x=>sha(canonical(x));
export function file(p,max=67108864,utf8=true){p=path.resolve(p);noLinks(p);const s=fs.lstatSync(p);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=max,'FILE_BOUNDARY');const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let b;try{const f=fs.fstatSync(fd);need(f.ino===s.ino&&f.dev===s.dev&&f.size===s.size,'FILE_CHANGED');b=Buffer.alloc(s.size+1);const n=fs.readSync(fd,b,0,b.length,0),z=fs.fstatSync(fd);need(n===s.size&&z.size===s.size&&z.mtimeMs===s.mtimeMs,'FILE_CHANGED');b=b.subarray(0,n);}finally{fs.closeSync(fd);}if(utf8)need(Buffer.from(b.toString('utf8'),'utf8').equals(b),'UTF8');return b;}
export function readJSON(p,max){return parse(file(p,max).toString('utf8'));}
export function writeNew(p,x){assertJsonValue(x);fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});}
export function noLinks(p){p=path.resolve(p);for(let q=p;;q=path.dirname(q)){need(!fs.lstatSync(q).isSymbolicLink(),'PATH_LINK');if(path.dirname(q)===q)break;}return p;}
export function inventory(root){const out=[];function walk(p){for(const n of fs.readdirSync(p).sort()){const q=path.join(p,n),s=fs.lstatSync(q);need(!s.isSymbolicLink(),'PAYLOAD_LINK');if(s.isDirectory())walk(q);else{need(s.isFile(),'PAYLOAD_TYPE');out.push(path.relative(root,q).split(path.sep).join('/'));}}}walk(root);return out;}
export function outside(a,b){const r=path.relative(a,b);return r!==''&&(r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r));}
export function newOutput(root,out){root=noLinks(root);out=path.resolve(out);need(!fs.existsSync(out),'OUTPUT_EXISTS');noLinks(path.dirname(out));need(outside(root,out)&&outside(out,root),'OUTPUT_OVERLAP');return out;}
// Small closed JSON-schema subset, shared by executable validation and the published schemas.
export function validate(v,s){
 if(s.const!==undefined){need(canonical(v)===canonical(s.const),'SCHEMA_CONST');return;}
 if(s.enum){need(s.enum.some(x=>canonical(x)===canonical(v)),'SCHEMA_ENUM');return;}
 if(s.anyOf){let ok=false;for(const a of s.anyOf)try{validate(v,a);ok=true;break;}catch{}need(ok,'SCHEMA_UNION');return;}
 if(s.type==='null'){need(v===null,'SCHEMA_NULL');return;}
 if(s.type==='boolean'){need(typeof v==='boolean','SCHEMA_BOOLEAN');return;}
 if(s.type==='integer'){need(Number.isSafeInteger(v)&&v>=s.minimum&&v<=s.maximum,'SCHEMA_INTEGER');return;}
 if(s.type==='string'){need(typeof v==='string'&&v.length>=s.minLength&&v.length<=s.maxLength&&(!s.pattern||new RegExp(s.pattern).test(v)),'SCHEMA_STRING');return;}
 if(s.type==='array'){need(Array.isArray(v)&&v.length>=s.minItems&&v.length<=s.maxItems&&Object.keys(v).length===v.length,'SCHEMA_ARRAY');for(const x of v)validate(x,s.items);if(s.uniqueItems)need(new Set(v.map(canonical)).size===v.length,'SCHEMA_UNIQUE');return;}
 need(s.type==='object'&&v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),'SCHEMA_OBJECT');
 const descriptors=Object.getOwnPropertyDescriptors(v);for(const k of Object.keys(descriptors))need('value'in descriptors[k]&&descriptors[k].enumerable,'SCHEMA_DATA_ONLY');
 need(Reflect.ownKeys(v).length===Object.keys(v).length,'SCHEMA_KEYS');
 for(const k of s.required??[])need(Object.hasOwn(v,k),'SCHEMA_REQUIRED');
 for(const k of Object.keys(v)){need(!['__proto__','constructor','prototype'].includes(k),'SCHEMA_PRIVATE_KEY');const sub=s.properties?.[k]??(s.additionalProperties===false?null:s.additionalProperties);need(sub,'SCHEMA_EXTRA_FIELD');if(!Object.hasOwn(s.properties??{},k)&&s.propertyNames)validate(k,s.propertyNames);validate(v[k],sub);}
 need(Object.keys(v).length<=(s.maxProperties??10000),'SCHEMA_PROPERTIES');
}
export const S={str:(max=64,pattern)=>({type:'string',minLength:0,maxLength:max,...(pattern?{pattern}:{})}),int:(min=0,max=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:min,maximum:max}),bool:{type:'boolean'},nil:{type:'null'},en:(...xs)=>({enum:xs}),arr:(items,max,min=0)=>({type:'array',items,minItems:min,maxItems:max}),obj:properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),dict:(items,names,max=1300)=>({type:'object',properties:{},additionalProperties:items,propertyNames:names,maxProperties:max}),nullable:s=>({anyOf:[{type:'null'},s]})};
export const HASH=S.str(64,'^[a-f0-9]{64}$'), COMMIT=S.str(40,'^[a-f0-9]{40}$');
export const nonzero=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)&&!/^0+$/.test(x);
