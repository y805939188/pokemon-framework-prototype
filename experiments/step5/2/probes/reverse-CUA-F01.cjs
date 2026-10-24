'use strict';
// Author probes only: a fresh ordinary clone, never the author/reviewer worktree or a running game package.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),out=process.argv[2],file='src/plugins/PS_Inventory.ts',suite='experiments/step5/2/test-inventory-ui.cjs';
if(!fs.statSync(path.join(root,'.git')).isDirectory())throw Error('use a fresh ordinary clone, not a managed worktree');
if(!out||!path.isAbsolute(out)||fs.existsSync(out))throw Error('new absolute evidence directory required');
const run=(cmd,args)=>spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
const dirty=run('git',['status','--porcelain=v1']);if(dirty.status!==0||dirty.stdout)throw Error('probe clone must start clean');fs.mkdirSync(out,{recursive:true});
const cases=[
 ['cancel-return-ignored','this.restoredSortCursor=r.result.index','this.restoredSortCursor=null','cancel restores the live row'],
 ['bag-view-ignores-live-cursor','cursor:Math.min(this.restoredSortCursor??this.indices[this.pocket-1]!,this.bag.pockets[this.pocket-1].length)','cursor:this.indices[this.pocket-1]!','cancel restores the live row'],
 ['cancel-rolls-back-saved-index','this.restoredSortCursor=r.result.index;this.bagView();','this.restoredSortCursor=r.result.index;this.indices[this.pocket-1]=r.result.index;this.bagView();','cancel restores the live row'],
 ['pocket-switch-overwrites-saved-index','if(this.restoredSortCursor===null)this.indices[this.pocket-1]=v.cursor;this.visited.add','this.indices[this.pocket-1]=v.cursor;this.visited.add','pocket switches keep'],
 ['navigation-keeps-stale-live-cursor','this.restoredSortCursor=null;this.indices[this.pocket-1]=v.cursor;if(this.selection)','this.indices[this.pocket-1]=v.cursor;if(this.selection)','ordinary navigation replaces'],
 ['cancel-confirms-order','endInventorySort(this.token,true)','endInventorySort(this.token,false)','cancel restores the live row'],
 ['clamped-sort-still-moves','if(to===v.cursor)return;','','R1 clamped directions'],
].map(([id,before,after,target])=>({id,before,after,target:'CUA-F01 P52-11 '+target}));
const build=id=>{const r=run('pnpm',['--dir','src','build']);fs.writeFileSync(path.join(out,id+'.build.log'),(r.stdout||'')+(r.stderr||''));return {exit:r.status,signal:r.signal,error:r.error?.message};};
const declared=(fs.readFileSync(path.join(root,suite),'utf8').match(/^test\('CUA-F01 /gm)||[]).length;
function tap(id){
 const r=run(process.execPath,['--test','--test-reporter=tap','--test-name-pattern=CUA-F01',suite]),s=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(out,id+'.tap'),s);
 const n=k=>Number(s.match(new RegExp(`^# ${k} (\\d+)`,'m'))?.[1]),lines=s.split('\n'),failures={};
 for(let i=0;i<lines.length;i++){const m=lines[i].match(/^not ok \d+ - (.*)$/);if(!m)continue;let j=i+1;while(j<lines.length&&!/^(ok|not ok) \d+ - |^# Subtest: /.test(lines[j]))j++;failures[m[1]]=lines.slice(i,j).join('\n').includes("code: 'ERR_ASSERTION'")?'assertion':'other';}
 return {exit:r.status,signal:r.signal,error:r.error?.message,pass:n('pass'),fail:n('fail'),cancelled:n('cancelled'),skipped:n('skipped'),failures};
}
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),source=()=>Object.fromEntries(run('git',['ls-files','-z']).stdout.split('\0').filter(f=>f&&fs.statSync(path.join(root,f)).isFile()).map(f=>[f,digest(path.join(root,f))]));
const before=source(),baselineBuild=build('baseline');if(baselineBuild.exit!==0||baselineBuild.signal||baselineBuild.error)throw Error('baseline build failed');
const baseline={...tap('baseline'),declared};if(!declared||baseline.exit!==0||baseline.signal||baseline.error||baseline.pass!==declared||baseline.fail||baseline.cancelled||baseline.skipped)throw Error('baseline failed '+JSON.stringify(baseline));
const saved=fs.readFileSync(path.join(root,file)),results=[];
for(const c of cases){let row={id:c.id,target:c.target};try{
 const s=saved.toString(),matches=s.split(c.before).length-1;if(matches!==1)throw Error('anchor matches '+matches);fs.writeFileSync(path.join(root,file),s.replace(c.before,()=>c.after));
 const built=build(c.id);row.build=built;if(built.exit!==0||built.signal||built.error)row.verdict='BUILD-FAILED';else{
  const observed=tap(c.id),targets=Object.entries(observed.failures).filter(([name])=>name.startsWith(c.target));row.observed=observed;
  row.verdict=observed.exit!==null&&observed.exit!==0&&!observed.signal&&!observed.error&&observed.fail>0&&observed.cancelled===0&&observed.skipped===0&&targets.length===1&&targets.every(([,kind])=>kind==='assertion')?'caught':'MISSED-OR-WRONG-REASON';
 }
}catch(error){row={...row,verdict:'NOT-APPLIED',error:error.message};}finally{fs.writeFileSync(path.join(root,file),saved);if(!fs.readFileSync(path.join(root,file)).equals(saved))throw Error('source restore failed');}
 results.push(row);fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({baseline,results},null,2)+'\n');console.log(row.id+': '+row.verdict);
}
const restoredBuild=build('restored'),restored=tap('restored'),after=source(),bytesIdentical=JSON.stringify(before)===JSON.stringify(after);
const summary={cases:results.length,caught:results.filter(r=>r.verdict==='caught').length,other:results.filter(r=>r.verdict!=='caught')};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({head:run('git',['rev-parse','HEAD']).stdout.trim(),baselineBuild,baseline,summary,results,restored:{bytesIdentical,before,after,build:restoredBuild,test:restored}},null,2)+'\n');
console.log(JSON.stringify({summary,bytesIdentical,restoredBuild,restoredPass:restored.pass}));
process.exitCode=bytesIdentical&&summary.caught===summary.cases&&restoredBuild.exit===0&&!restoredBuild.signal&&!restoredBuild.error&&restored.exit===0&&!restored.signal&&!restored.error&&restored.pass===declared&&restored.fail===0&&restored.cancelled===0&&restored.skipped===0?0:1;
