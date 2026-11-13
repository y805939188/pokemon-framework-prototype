'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
// Read a committed tree, never a mixture of concurrently edited files. No thresholds or global lint policy.
// Usage: node scripts/type-quality-audit.cjs [ref=HEAD] [output.json]
const root=path.resolve(__dirname,'..');
const ref=process.argv[2]??'HEAD';
const {parseAst}=require(require.resolve('vite',{paths:[path.join(root,'src')]}));
const sha=cp.execFileSync('git',['rev-parse',`${ref}^{commit}`],{cwd:root,encoding:'utf8'}).trim();
const files=cp.execFileSync('git',['ls-tree','-r','--name-only','-z',sha],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>/\.(?:ts|tsx|mts|cts)$/.test(f));
const uiFlow=new Set(['battle-effects.ts','battle-evidence.ts','battle-summary.ts','describe.ts','log.ts','presentation.ts','public-presentation.ts','request-view.ts']);
function classify(f){
 if(f.startsWith('experiments/')||f.startsWith('src/plugins/flowtest/')||/PS_Battle(?:FlowTest|Smoke)\.ts$/.test(f)||f==='src/framework/testing.ts'||/^src\/framework\/tools\/(?:fakes|harness|matrix|scripted-driver|held-diagnostics)\.ts$/.test(f)||f.startsWith('src/framework/tools/fixtures/'))return 'tests';
 if(f.startsWith('src/framework/rules/'))return 'domain-rules';
 if(f.startsWith('src/framework/app/'))return 'application';
 if(f.startsWith('src/framework/battle/'))return 'battle-adaptation';
 if(f.startsWith('src/framework/content/')||f==='src/framework/flow/content-runtime.ts')return 'content-pipeline';
 if(f.startsWith('src/framework/flow/'))return uiFlow.has(path.basename(f))?'ui':'session-flow';
 if(f.startsWith('src/framework/i18n/')||/^src\/plugins\/(battleflow|inventory|management|pokedex|progression)\//.test(f)&&!/-mz\.ts$|-host\.ts$/.test(f))return 'ui';
 if(f.startsWith('src/plugins/')||f.startsWith('src/types/')||f==='src/typecheck-runtime.ts')return 'mz-host';
 if(f.startsWith('src/framework/tools/')||f.endsWith('.mts')||f.startsWith('scripts/'))return 'tools';
 return 'entry-glue';
}
const categories={},locations=[],perFile=[],failures=[];
for(const file of files){
 const source=cp.execFileSync('git',['show',`${sha}:${file}`],{cwd:root,encoding:'utf8'}),category=classify(file),counts={files:1,explicitAny:0,assertions:0,doubleAssertions:0,assertToAny:0,assertFromUnknown:0,nonNull:0,definiteAssignment:0,typeSuppressions:0,computedAccess:0,dynamicComputedAccess:0,indexSignatures:0,jsonParse:0};
 let ast;try{ast=parseAst(source,{lang:file.endsWith('.d.ts')?'dts':file.endsWith('tsx')?'tsx':'ts'},file);}catch(error){failures.push({file,message:error.message});continue;}
 const row=offset=>{const before=source.slice(0,offset);return {line:before.split('\n').length,column:offset-(before.lastIndexOf('\n')+1)+1};};
 function note(kind,node,extra={}){counts[kind]++;locations.push({file,category,kind,...row(node.start),text:source.slice(node.start,node.end).replace(/\s+/g,' ').slice(0,240),...extra});}
 function walk(n,parent,key,ancestors){if(!n||typeof n!=='object')return;if(Array.isArray(n)){for(const v of n)walk(v,parent,key,ancestors);return;}
  const enclosing=[...ancestors].reverse().find(x=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','MethodDefinition','TSMethodSignature','TSInterfaceDeclaration','TSTypeAliasDeclaration'].includes(x.type));
  if(n.type==='TSAnyKeyword')note('explicitAny',n,{enclosing:enclosing?.id?.name??enclosing?.key?.name??null});
  if(['TSAsExpression','TSTypeAssertion'].includes(n.type)){note('assertions',n);if(['TSAsExpression','TSTypeAssertion'].includes(n.expression?.type))note('doubleAssertions',n);if(n.typeAnnotation?.type==='TSAnyKeyword')note('assertToAny',n);if(n.expression?.typeAnnotation?.type==='TSUnknownKeyword')note('assertFromUnknown',n);}
  if(n.type==='TSNonNullExpression')note('nonNull',n);
  if(n.definite===true)note('definiteAssignment',n);
  if(n.type==='TSIndexSignature')note('indexSignatures',n);
  if(n.type==='MemberExpression'&&n.computed){note('computedAccess',n);if(n.property?.type!=='Literal')note('dynamicComputedAccess',n);}
  if(n.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&n.callee.object?.name==='JSON'&&n.callee.property?.name==='parse')note('jsonParse',n);
  for(const k of Object.keys(n))if(k!=='type'&&n[k]&&typeof n[k]==='object')walk(n[k],n,k,[...ancestors,n]);
 }
 walk(ast,null,null,[]);
 // Candidate suppression directives: checked against their physical comment line; no regex counts of the `any` token.
 for(const m of source.matchAll(/^[ \t]*(?:\/\/|\*|\/\*)[^\n]*@ts-(ignore|expect-error|nocheck|check)\b[^\n]*/gm))note('typeSuppressions',{start:m.index,end:m.index+m[0].length});
 perFile.push({file,category,...counts});categories[category]??={};for(const [k,v]of Object.entries(counts))categories[category][k]=(categories[category][k]??0)+v;
}
const totals={};for(const category of Object.values(categories))for(const [key,value]of Object.entries(category))totals[key]=(totals[key]??0)+value;
const out={baseline:sha,method:'git ls-tree committed project-owned TS/TSX/MTS/CTS; Vite parseAst 8.3.1 / Rolldown 1.2.11 TS ESTree node counts; suppression comment-line candidates',fileCount:files.length,categories,totals,failures,perFile,locations};
const target=process.argv[3];
if(target)fs.writeFileSync(target,JSON.stringify(out)+'\n');
console.log(JSON.stringify(target?{baseline:sha,fileCount:files.length,categories,totals,failures,target}:out,null,2));
if(failures.length)process.exitCode=1;
