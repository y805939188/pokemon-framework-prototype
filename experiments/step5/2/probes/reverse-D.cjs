'use strict';
// 5.2 D-01..D-05 and P-01 reverse probes. Run only in a fresh clone: node experiments/step5/2/probes/reverse-D.cjs <new abs dir>
// Each case puts one guarantee back to its pre-fix (or a plausible wrong) form, rebuilds, runs the targeted suites,
// restores the exact bytes. caught = a targeted suite failed with the build green; NOT-APPLIED/BUILD-FAILED never count.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),out=process.argv[2];if(!out||!path.isAbsolute(out)||fs.existsSync(out))throw Error('new absolute evidence directory required');fs.mkdirSync(out,{recursive:true});
const T='src/plugins/flowtest/timing.ts',V='src/plugins/flowtest/evidence.ts',D='src/plugins/PS_BattleFlowTest.ts',R='scripts/run-inventory-test-mac.sh',S='src/framework/rules/semantic.ts';
const SUITE='experiments/step5/2/test-D-remediation.cjs',UI='experiments/step5/2/test-inventory-ui.cjs';
const cases=[
 ['D-01-waits-count-ticks',[[T,'while (p.clock.game < target) {','while (p.clock.ticks < target) {']]],
 ['D-01-no-release-wait',[[T,"  await waitGameFrames(p, release, 'key release');\n",'']]],
 ['D-01-driver-counts-ticks',[[D,'G.SceneManager.updateMain = function (...a: any[]) { frame++; return baseUpdateMain.apply(this, a); };','G.SceneManager.updateMain = function (...a: any[]) { return baseUpdateMain.apply(this, a); };'],[D,'    ticks++;\n    if (sampling','    ticks++; frame++;\n    if (sampling']]],
 ['D-02-unsanitized-name',[[V,".replace(/[^A-Za-z0-9._-]+/g, '_')",'']]],
 ['D-02-no-timeout',[[V,'    timer = p.setTimer(() => finish({ ok: false, error: `screenshot callback did not return within ${timeoutMs} ms` }), timeoutMs);\n','']]],
 ['D-02-late-callback-writes',[[V,'        if (settled) return; // a callback after the timeout writes nothing\n','']]],
 ['D-02-screenshot-before-record',[[D,'      writeProgress(); // the failure is on disk before any screenshot is attempted\n','']]],
 ['D-03-no-hash-check',[[R,"  if sha(src/name)!=digest: refuse(f'expected-state file changed since it was produced: {src/name}')\n",'']]],
 ['D-03-implicit-expected-dir',[[R," extra=['--ps-flow-expected-dir='+str(src)]"," extra=[]"]]],
 ['P-01-strict-prototype',[[S,"    if (!Array.isArray(v) && !plainPrototype(Object.getPrototypeOf(v) as object|null)) throw new Error('nonplain-intent');","    if (!Array.isArray(v) && ![Object.prototype,null].includes(Object.getPrototypeOf(v) as object|null)) throw new Error('nonplain-intent');"]],[SUITE,UI]],
 ['D-04-battle-helper',[[D,'await startMapEvent(4);','await startEvent(4);']]],
 ['D-06-ordered-bag-view',[[D,'bagOf:(game:any):any=>{const bag=I6.rawBagOf(game);return bag&&Object.fromEntries(Object.keys(bag).sort().map(k=>[k,bag[k]]));},','bagOf:(game:any):any=>I6.rawBagOf(game),']]],
 ['D-07-schema6-fields-in-schema4',[[D,'raw.bag=I6.rawBagOf(healthy);delete raw.inventory;delete raw.badges;','']]],
 ['D-05-public-read',[[D,"eq([G.$gameVariables._data[3],G.$gameVariables.value(3)],['',0],'cancel writes the empty ID raw (D-05: MZ public read of an empty value is 0)')","eq(G.$gameVariables.value(3),'','cancel writes empty ID')"]]],
].map(([id,edits,suites=[SUITE]])=>({id,edits,suites}));
const run=(cmd,args)=>spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});
const build=id=>{const r=run('pnpm',['--dir','src','build']);fs.writeFileSync(path.join(out,id+'.build.log'),(r.stdout||'')+(r.stderr||''));return r.status;};
const tap=(id,suites)=>{const r=run(process.execPath,['--test','--test-reporter=tap',...suites]),s=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(out,id+'.tap'),s);const n=k=>Number(s.match(new RegExp(`^# ${k} (\\d+)`,'m'))?.[1]);
 return {exit:r.status,signal:r.signal,pass:n('pass'),fail:n('fail'),cancelled:n('cancelled'),skipped:n('skipped'),failing:[...s.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1])};};
const files=[...new Set(cases.flatMap(c=>c.edits.map(e=>e[0])))],digest=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),before=Object.fromEntries(files.map(f=>[f,digest(f)]));
if(build('baseline')!==0)throw Error('baseline build failed');const baseline=tap('baseline',[SUITE,UI]);if(baseline.exit||baseline.fail||baseline.cancelled||baseline.skipped||baseline.pass!==61)throw Error('baseline failed '+JSON.stringify(baseline));
const results=[];
for(const c of cases){const saved=new Map();const row={id:c.id,files:c.edits.map(e=>e[0])};try{
  for(const [file,from,to] of c.edits){const abs=path.join(root,file),s=saved.get(file)??fs.readFileSync(abs,'utf8');if(!saved.has(file))saved.set(file,s);const now=fs.readFileSync(abs,'utf8'),n=now.split(from).length-1;if(n!==1)throw Error(`anchor ${n} in ${file}`);fs.writeFileSync(abs,now.replace(from,()=>to));}
  row.build=build(c.id);if(row.build!==0)row.verdict='BUILD-FAILED';else{row.tests=tap(c.id,c.suites);row.verdict=row.tests.exit!==0&&row.tests.fail>0?'caught':'MISSED';}
 }catch(error){row.verdict='NOT-APPLIED';row.error=String(error.message||error);}
 finally{for(const [file,s] of saved)fs.writeFileSync(path.join(root,file),s);}
 results.push(row);fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(results,null,2));}
const after=Object.fromEntries(files.map(f=>[f,digest(f)])),restoredBuildExit=build('restored');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({baseline,results,restored:{bytesIdentical:JSON.stringify(before)===JSON.stringify(after),before,after,buildExit:restoredBuildExit}},null,2));
process.exitCode=restoredBuildExit===0&&JSON.stringify(before)===JSON.stringify(after)&&results.every(r=>r.verdict==='caught')?0:1;
