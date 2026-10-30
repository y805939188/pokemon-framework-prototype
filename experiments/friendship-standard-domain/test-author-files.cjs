'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {workspace,ROOT}=require('./helpers.cjs');
const cli=path.join(ROOT,'js/engine/build/content-cli.cjs');
function fixture(value=256){const dir=workspace(),src=path.join(dir,'source');fs.cpSync(path.join(ROOT,'content/sample'),src,{recursive:true});const m=JSON.parse(fs.readFileSync(src+'/manifest.json'));m.schema=1;fs.writeFileSync(src+'/manifest.json',JSON.stringify(m,null,3)+'\n');const s=JSON.parse(fs.readFileSync(src+'/species.json'));s[0].happiness=value;fs.writeFileSync(src+'/species.json',JSON.stringify(s,null,3)+'\n');return {dir,src,out:path.join(dir,'standard')};}
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
const preview=w=>{const r=run('friendship-preview','--src='+w.src);assert.equal(r.status,0,r.stderr);assert.match(r.stderr,/legacy-author-schema/);return JSON.parse(r.stdout);};
test('CLI preview zero writes then explicit new-directory standard migration preserves raw originals/receipt and builds normally',()=>{
 const w=fixture(),p=preview(w),original=fs.readFileSync(w.src+'/species.json');assert.deepEqual(fs.readdirSync(w.dir),['source']);
 const r=run('friendship-migrate','--src='+w.src,'--out='+w.out,'--confirm='+p.previewHash);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(fs.readFileSync(w.out+'/manifest.json')).schema,2);
 assert.equal(JSON.parse(fs.readFileSync(w.out+'/species.json'))[0].happiness,255);assert.deepEqual(fs.readFileSync(w.src+'/species.json'),original);assert.deepEqual(fs.readFileSync(w.out+'/.friendship-original/species.json'),original);
 assert.equal(JSON.parse(fs.readFileSync(w.out+'/friendship-receipt.json')).pure.targets.length,1);assert.equal(run('build','--src='+w.out,'--out='+path.join(w.dir,'compiled.json')).status,0);
 assert.notEqual(run('friendship-migrate','--src='+w.src,'--out='+w.out,'--confirm='+p.previewHash).status,0);
});
for(const mode of ['no-confirm','wrong-confirm','stale','nested','alias','exists','out-of-scope'])test('author files reject '+mode+' without touching source',()=>{
 const w=fixture(mode==='out-of-scope'?257:256),p=preview(w);let out=w.out,confirm=p.previewHash;
 if(mode==='stale')fs.appendFileSync(w.src+'/species.json',' ');
 if(mode==='nested')out=path.join(w.src,'nested');
 if(mode==='alias'){fs.symlinkSync(w.src,path.join(w.dir,'alias'));w.src=path.join(w.dir,'alias');}
 if(mode==='exists')fs.mkdirSync(out);
 if(mode==='wrong-confirm')confirm='0'.repeat(64);
 const original=fs.readFileSync(w.src+'/species.json'),r=run('friendship-migrate','--src='+w.src,'--out='+out,...(mode==='no-confirm'?[]:['--confirm='+confirm]));assert.notEqual(r.status,0);assert.deepEqual(fs.readFileSync(w.src+'/species.json'),original);
 if(mode==='out-of-scope')assert.equal(fs.existsSync(out),false);
});
