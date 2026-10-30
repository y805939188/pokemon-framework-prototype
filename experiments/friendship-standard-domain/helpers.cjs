'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
require('../../scripts/tests/ts-source-loader.cjs');
const ROOT=path.resolve(__dirname,'../..');
const source=rel=>import(pathToFileURL(path.join(ROOT,'src/framework',rel+'.ts')).href);
const clone=structuredClone;
const inputs=(schema=2)=>{
 const read=file=>JSON.parse(fs.readFileSync(path.join(ROOT,'content/sample',file),'utf8'));
 return {manifest:{...read('manifest.json'),schema},sources:read('sources.json'),species:read('species.json'),overlays:read('overlays.json'),grants:read('grants.json')};
};
function frozen(v){if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;}
function workspace(){const root=process.env.PF_FRIENDSHIP_TEST_TMP||path.join(ROOT,'build/friendship-standard-domain-tests');fs.mkdirSync(root,{recursive:true});return fs.mkdtempSync(path.join(root,'case-'));}
const confirmation=plan=>({planHash:plan.planHash,targetPaths:plan.targets.map(t=>t.path)});
module.exports={ROOT,source,clone,inputs,frozen,workspace,confirmation};
