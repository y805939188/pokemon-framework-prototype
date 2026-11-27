'use strict';
// Standalone serial checks; intentionally not registered in B-owned test-headless.sh yet.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname, '../../..'),NODE=process.execPath;
const EXPECTED_NODE='v22.21.1';
if(process.version!==EXPECTED_NODE)throw Error('Use Node '+EXPECTED_NODE+' (found '+process.version+')');
const phase=process.argv[2];if(!phase||!/^[a-z0-9-]+$/.test(phase))throw Error('usage: node tests/regression/friendship/run-checks.cjs <fresh-phase>');
const dir=path.join(ROOT,'build/friendship-standard-domain-20261030',phase);fs.mkdirSync(dir); // refuse evidence overwrite
const temporary=path.join(dir,'tmp');fs.mkdirSync(temporary);
const env={...process.env,TMPDIR:temporary,PATH:[path.dirname(NODE),process.env.PATH].filter(Boolean).join(path.delimiter),PF_FRIENDSHIP_TEST_TMP:path.join(dir,'scratch')};
const commands=[];
for(const config of ['tsconfig.json','tsconfig.core.json','tsconfig.app.json'])commands.push({name:'types-'+config,args:['node_modules/typescript/bin/tsc','--noEmit','-p','framework/'+config],cwd:path.join(ROOT,'src')});
commands.push({name:'boundaries',args:['scripts/check-boundaries.cjs']});
for(const entry of ['runtime','custom-formats','core','content-cli'])commands.push({name:'build-'+entry,args:['node_modules/vite/bin/vite.js','build','-c','vite.engine.config.mts'],cwd:path.join(ROOT,'src'),env:{ENGINE_ENTRY:entry}});
commands.push({name:'sample-build',args:['js/engine/build/content-cli.cjs','build','--out='+path.join(dir,'content.json')]});
commands.push({name:'sample-check',args:['js/engine/build/content-cli.cjs','check','--out='+path.join(dir,'content.json')]});
const suites=[
 'tests/regression/friendship/test-author.cjs','tests/regression/friendship/test-pbs-cli.cjs','tests/regression/friendship/test-migration.cjs',
 'tests/regression/content/test-content-manifest.cjs','tests/regression/content/test-battle-author-content.cjs','tests/regression/content/test-member-identity-content.cjs','tests/regression/content/test-pbs-import-diagnostics.cjs','tests/regression/content/test-item-and-shop-catalog.cjs','tests/regression/content/test-form-and-evolution-content.cjs','tests/regression/content/test-pbs-evolution-and-dex-import.cjs','tests/regression/content/test-egg-move-content.cjs',
 'tests/regression/friendship/test-friendship.cjs','tests/regression/friendship/test-friendship-adapters.cjs','tests/regression/saves/test-save.cjs','tests/regression/saves/test-save-migration-v5.cjs','tests/regression/saves/test-migration-storage.cjs','tests/regression/saves/test-save-migration-v6.cjs','tests/regression/battle/test-engine-contract.cjs',
];
for(const suite of suites)commands.push({name:'test-'+suite.replaceAll('/','-'),args:['--test','--test-concurrency=1',suite]});
const git=args=>spawnSync('git',args,{cwd:ROOT,encoding:'utf8'}).stdout.trim();
const result={phase,at:new Date().toISOString(),node:process.version,execPath:process.execPath,platform:process.platform,arch:process.arch,head:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),statusBefore:git(['status','--porcelain']),commands:[]};
let failed=false;
for(const c of commands){const started=Date.now(),r=spawnSync(NODE,c.args,{cwd:c.cwd||ROOT,env:{...env,...c.env},encoding:'utf8',timeout:120000,maxBuffer:30*1024*1024});fs.writeFileSync(path.join(dir,c.name+'.stdout'),r.stdout||'');fs.writeFileSync(path.join(dir,c.name+'.stderr'),r.stderr||'');const text=(r.stdout||'')+(r.stderr||'');const counts={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const m=new RegExp('^# '+key+' (\\d+)$','m').exec(text);if(m)counts[key]=Number(m[1]);}const row={...c,executable:NODE,exit:r.status,signal:r.signal,error:r.error?.message,durationMs:Date.now()-started,counts};result.commands.push(row);console.log(c.name+': exit='+r.status+' '+JSON.stringify(counts));fs.writeFileSync(path.join(dir,'RESULT.json'),JSON.stringify(result,null,2)+'\n');if(r.status!==0||r.error||counts.fail||counts.cancelled||counts.skipped){failed=true;break;}}
result.statusAfter=git(['status','--porcelain']);result.exit=failed?1:0;fs.writeFileSync(path.join(dir,'RESULT.json'),JSON.stringify(result,null,2)+'\n');process.exitCode=result.exit;
