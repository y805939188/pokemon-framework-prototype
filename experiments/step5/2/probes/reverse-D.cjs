'use strict';
// 5.2 D-01..D-07, P-01 and review F-03..F-10 reverse probes. Run only in a fresh clone:
//   node experiments/step5/2/probes/reverse-D.cjs <new absolute evidence dir>
// Baseline: exit 0, no fail/cancel/skip, and pass === the tests statically declared in the targeted suites (no silent
// skip). A case is "caught" only when its build is green, the run ends without signal or cancellation, and every one of
// its named target tests fails with ERR_ASSERTION; any other failure is CAUGHT-WRONG-REASON, never caught. Each case
// restores the exact bytes it changed; the final check compares every touched file and rebuilds.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),out=process.argv[2];if(!out||!path.isAbsolute(out)||fs.existsSync(out))throw Error('new absolute evidence directory required');fs.mkdirSync(out,{recursive:true});
const T='src/plugins/flowtest/timing.ts',V='src/plugins/flowtest/evidence.ts',D='src/plugins/PS_BattleFlowTest.ts',R='scripts/run-inventory-test-mac.sh',S='src/framework/rules/semantic.ts';
const SUITE='experiments/step5/2/test-D-remediation.cjs',UI='experiments/step5/2/test-inventory-ui.cjs',SUITES=[SUITE,UI];
// [id, edits ([file, from, to] or [file, {deleteLineContaining}]), target test title prefixes]
const cases=[
 ['D-01-waits-count-ticks',[[T,'while (p.clock.game < target) {','while (p.clock.ticks < target) {']],['D-01 every press']],
 ['D-01-no-release-wait',[[T,"  await waitGameFrames(p, release, 'key release');\n",'']],['D-01 every press']],
 ['D-01-driver-counts-ticks',[[D,'G.SceneManager.updateMain = function (...a: any[]) { frame++; return baseUpdateMain.apply(this, a); };','G.SceneManager.updateMain = function (...a: any[]) { return baseUpdateMain.apply(this, a); };'],[D,'    ticks++;\n    if (sampling','    ticks++; frame++;\n    if (sampling']],['D-01 source wiring guard']],
 ['D-02-unsanitized-name',[[V,".replace(/[^A-Za-z0-9._-]+/g, '_')",'']],['D-02 screenshot names']],
 ['D-02-no-timeout',[[V,'    timer = p.setTimer(() => finish({ ok: false, error: `screenshot callback did not return within ${timeoutMs} ms` }), timeoutMs);\n','']],['D-02 capture outcomes']],
 ['D-02-late-callback-writes',[[V,'        if (settled) return; // a callback after the timeout writes nothing\n','']],['D-02 capture outcomes']],
 ['D-02-screenshot-before-record',[[D,'      writeProgress(); // the failure is on disk before any screenshot is attempted\n','']],['D-02 source wiring guard']],
 ['D-03-no-hash-check',[[R,{deleteLineContaining:"refuse(f'expected-state file changed since it was produced"}]],['D-03 missing source']],
 ['D-03-implicit-expected-dir',[[R," extra=['--ps-flow-expected-dir='+str(src)]"," extra=[]"]],['D-03 verify-save in its own directory']],
 ['P-01-strict-prototype',[[S,"    if (!Array.isArray(v) && !plainPrototype(Object.getPrototypeOf(v) as object|null)) throw new Error('nonplain-intent');","    if (!Array.isArray(v) && ![Object.prototype,null].includes(Object.getPrototypeOf(v) as object|null)) throw new Error('nonplain-intent');"]],['P-01 plain data from another realm','P-01 the application accepts']],
 ['D-04-battle-helper',[[D,'await startMapEvent(4);','await startEvent(4);']],['D-04/D-05 source wiring guard']],
 ['D-05-public-read',[[D,"eq([G.$gameVariables._data[3],G.$gameVariables.value(3)],['',0],'cancel writes the empty ID raw (D-05: MZ public read of an empty value is 0)')","eq(G.$gameVariables.value(3),'','cancel writes empty ID')"]],['D-04/D-05 source wiring guard']],
 ['D-06-ordered-bag-view',[[D,'bagOf:(game:any):any=>{const bag=I6.rawBagOf(game);return bag&&Object.fromEntries(Object.keys(bag).sort().map(k=>[k,bag[k]]));},','bagOf:(game:any):any=>I6.rawBagOf(game),']],['D-06/D-07 source wiring guard']],
 ['D-07-schema6-fields-in-schema4',[[D,'raw.bag=I6.rawBagOf(healthy);delete raw.inventory;delete raw.badges;','']],['D-06/D-07 source wiring guard']],
 ['F-03-clear-timer-before-resolve',[[V,'      settled = true; resolve(result);\n      try { p.clearTimer(timer); } catch { /* a stray timer only calls finish again, which is ignored */ }\n','      settled = true; p.clearTimer(timer); resolve(result);\n']],['F-03/F-04 hardening']],
 ['F-04-no-keyup-after-stall',[[T,"  try { await waitGameFrames(p, hold, 'key hold'); }\n  finally { dispatch('keyup'); } // a stalled loop must not leave the key held for the next scenario\n","  await waitGameFrames(p, hold, 'key hold');\n  dispatch('keyup');\n"]],['F-03/F-04 hardening']],
 ['F-05-names-not-validated',[[R,{deleteLineContaining:"refuse('recorded expected-state entries must be plain ps-flow-expected*.json names with a digest')"}]],['F-05/F-06 restart contract']],
 ['F-06-unrecorded-files-accepted',[[R,{deleteLineContaining:"if present!=set(produced): refuse("}]],['F-05/F-06 restart contract']],
 ['F-06-failed-producer-accepted',[[R,{deleteLineContaining:"refuse(f'the producing run did not pass"}]],['F-05/F-06 restart contract']],
 ['F-10-selftest-exit-from-overall',[[R,";passed=start['selftestControl']=='pass'",'']],['F-10 driver-selftest']],
].map(([id,edits,targets])=>({id,edits,targets}));
const run=(cmd,args)=>spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});
const build=id=>{const r=run('pnpm',['--dir','src','build']);fs.writeFileSync(path.join(out,id+'.build.log'),(r.stdout||'')+(r.stderr||''));return r.status;};
const declared=SUITES.reduce((n,f)=>n+(fs.readFileSync(path.join(root,f),'utf8').match(/^test\(/gm)||[]).length,0);
function tap(id){
 const r=run(process.execPath,['--test','--test-reporter=tap',...SUITES]),s=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(out,id+'.tap'),s);
 const n=k=>Number(s.match(new RegExp(`^# ${k} (\\d+)`,'m'))?.[1]),lines=s.split('\n'),failures={};
 for(let i=0;i<lines.length;i++){const m=lines[i].match(/^not ok \d+ - (.*)$/);if(!m)continue;let j=i+1;while(j<lines.length&&!/^(ok|not ok) \d+ - |^# Subtest: /.test(lines[j]))j++;failures[m[1]]=lines.slice(i,j).join('\n').includes("code: 'ERR_ASSERTION'")?'assertion':'other';}
 return {exit:r.status,signal:r.signal,pass:n('pass'),fail:n('fail'),cancelled:n('cancelled'),skipped:n('skipped'),failures};
}
function apply(file,edit,s){
 if(typeof edit[1]==='object'){const lines=s.split('\n'),hits=lines.filter(l=>l.includes(edit[1].deleteLineContaining));if(hits.length!==1)throw Error(`line anchor ${hits.length} in ${file}`);return lines.filter(l=>!l.includes(edit[1].deleteLineContaining)).join('\n');}
 const n=s.split(edit[1]).length-1;if(n!==1)throw Error(`anchor ${n} in ${file}`);return s.replace(edit[1],()=>edit[2]);
}
const files=[...new Set(cases.flatMap(c=>c.edits.map(e=>e[0])))],digest=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),before=Object.fromEntries(files.map(f=>[f,digest(f)]));
if(build('baseline')!==0)throw Error('baseline build failed');
const baseline={...tap('baseline'),declared};
if(baseline.exit!==0||baseline.signal||baseline.fail||baseline.cancelled||baseline.skipped||baseline.pass!==declared)throw Error('baseline failed '+JSON.stringify(baseline));
const results=[];
for(const c of cases){const saved=new Map(),row={id:c.id,files:[...new Set(c.edits.map(e=>e[0]))],targets:c.targets};try{
  for(const edit of c.edits){const abs=path.join(root,edit[0]);if(!saved.has(edit[0]))saved.set(edit[0],fs.readFileSync(abs,'utf8'));fs.writeFileSync(abs,apply(edit[0],edit,fs.readFileSync(abs,'utf8')));}
  row.build=build(c.id);
  if(row.build!==0)row.verdict='BUILD-FAILED';
  else{row.tests=tap(c.id);const t=row.tests,missing=c.targets.filter(p=>!Object.keys(t.failures).some(title=>title.startsWith(p)&&t.failures[title]==='assertion'));
   row.targetsMissing=missing;row.verdict=t.signal||t.cancelled?'CAUGHT-WRONG-REASON':t.exit===0||!t.fail?'MISSED':missing.length?'CAUGHT-WRONG-REASON':'caught';}
 }catch(error){row.verdict='NOT-APPLIED';row.error=String(error.message||error);}
 finally{for(const [file,s] of saved)fs.writeFileSync(path.join(root,file),s);}
 results.push(row);fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({baseline,results},null,2));}
const after=Object.fromEntries(files.map(f=>[f,digest(f)])),restoredBuildExit=build('restored');
const summary={cases:results.length,caught:results.filter(r=>r.verdict==='caught').length,other:results.filter(r=>r.verdict!=='caught').map(r=>[r.id,r.verdict])};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({baseline,summary,results,restored:{bytesIdentical:JSON.stringify(before)===JSON.stringify(after),before,after,buildExit:restoredBuildExit}},null,2));
console.log(JSON.stringify(summary));
process.exitCode=restoredBuildExit===0&&JSON.stringify(before)===JSON.stringify(after)&&summary.caught===cases.length?0:1;
