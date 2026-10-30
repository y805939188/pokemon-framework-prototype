'use strict';
// Standalone serial checks; intentionally not registered in B-owned test-headless.sh yet.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),NODE='/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node';
if(process.execPath!==NODE)throw Error('Use the explicitly pinned Node executable: '+NODE);
const phase=process.argv[2];if(!phase||!/^[a-z0-9-]+$/.test(phase))throw Error('usage: node experiments/friendship-standard-domain/run-checks.cjs <fresh-phase>');
const dir=path.join(ROOT,'build/friendship-standard-domain-20261030',phase);fs.mkdirSync(dir); // refuse evidence overwrite
const temporary=path.join(dir,'tmp');fs.mkdirSync(temporary);
const env={...process.env,TMPDIR:temporary,PATH:path.dirname(NODE)+':'+process.env.PATH,PF_FRIENDSHIP_TEST_TMP:path.join(dir,'scratch')};
const commands=[];
for(const config of ['tsconfig.json','tsconfig.core.json','tsconfig.app.json'])commands.push({name:'types-'+config,args:['node_modules/typescript/bin/tsc','--noEmit','-p','framework/'+config],cwd:path.join(ROOT,'src')});
commands.push({name:'boundaries',args:['scripts/check-boundaries.cjs']});
for(const entry of ['runtime','custom-formats','core','content-cli'])commands.push({name:'build-'+entry,args:['node_modules/vite/bin/vite.js','build','-c','vite.engine.config.mts'],cwd:path.join(ROOT,'src'),env:{ENGINE_ENTRY:entry}});
commands.push({name:'sample-build',args:['js/engine/build/content-cli.cjs','build','--out='+path.join(dir,'content.json')]});
commands.push({name:'sample-check',args:['js/engine/build/content-cli.cjs','check','--out='+path.join(dir,'content.json')]});
const suites=[
 'experiments/friendship-standard-domain/test-author.cjs','experiments/friendship-standard-domain/test-pbs-cli.cjs','experiments/friendship-standard-domain/test-migration.cjs',
 'experiments/step3/test-content.cjs','experiments/step4/test-content4.cjs','experiments/step5/test-content5.cjs','experiments/step5/test-pbs-review5.cjs','experiments/step5/2/test-content6.cjs','experiments/step5/3/test-content7.cjs','experiments/step5/3/test-pbs7.cjs','experiments/step5/3/test-egg-move-content.cjs',
 'experiments/step5/3/test-friendship.cjs','experiments/step5/3/test-friendship-adapters.cjs','experiments/step3/test-save.cjs','experiments/step5/test-migration5.cjs','experiments/step5/1/test-migration-storage.cjs','experiments/step5/2/test-migration6.cjs','experiments/step2/s5/test-engine-contract.cjs',
];
for(const suite of suites)commands.push({name:'test-'+suite.replaceAll('/','-'),args:['--test','--test-concurrency=1',suite]});
const git=args=>spawnSync('git',args,{cwd:ROOT,encoding:'utf8'}).stdout.trim();
const result={phase,at:new Date().toISOString(),node:process.version,execPath:process.execPath,platform:process.platform,arch:process.arch,head:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),statusBefore:git(['status','--porcelain']),commands:[]};
let failed=false;
for(const c of commands){const started=Date.now(),r=spawnSync(NODE,c.args,{cwd:c.cwd||ROOT,env:{...env,...c.env},encoding:'utf8',timeout:120000,maxBuffer:30*1024*1024});fs.writeFileSync(path.join(dir,c.name+'.stdout'),r.stdout||'');fs.writeFileSync(path.join(dir,c.name+'.stderr'),r.stderr||'');const text=(r.stdout||'')+(r.stderr||'');const counts={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const m=new RegExp('^# '+key+' (\\d+)$','m').exec(text);if(m)counts[key]=Number(m[1]);}const row={...c,executable:NODE,exit:r.status,signal:r.signal,error:r.error?.message,durationMs:Date.now()-started,counts};result.commands.push(row);console.log(c.name+': exit='+r.status+' '+JSON.stringify(counts));fs.writeFileSync(path.join(dir,'RESULT.json'),JSON.stringify(result,null,2)+'\n');if(r.status!==0||r.error||counts.fail||counts.cancelled||counts.skipped){failed=true;break;}}
result.statusAfter=git(['status','--porcelain']);result.exit=failed?1:0;fs.writeFileSync(path.join(dir,'RESULT.json'),JSON.stringify(result,null,2)+'\n');process.exitCode=result.exit;
