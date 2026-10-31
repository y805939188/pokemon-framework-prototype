"""Explicit synthetic regressions for collector evidence gates. Never native/P-4 evidence."""
from pathlib import Path
import sys
sys.dont_write_bytecode=True
import importlib.util,json,os,shutil,subprocess,tempfile,unittest,plistlib,struct,signal,time
from unittest import mock
from types import SimpleNamespace
CANCEL_SIGNALS=(signal.SIGTERM,signal.SIGHUP,signal.SIGINT)
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('d1_existing',HERE/'d1-benchmark-runner.test.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)

class EvidenceGates(unittest.TestCase):
    def invoke(self,fault):
        with tempfile.TemporaryDirectory(prefix='pf-d1-hardening-')as folder:
            root=Path(folder);app=root/'fixture.app';nw=app/'Contents/Resources/app.nw';nw.mkdir(parents=True)
            source=dict(cases=[dict(id='F100-1',seed=[1,2,3,4],expected=dict(code=1))]);info=dict(gitHead='synthetic')
            report=base.make_report(source,info,count=1)
            if fault=='self-rss':report['d1']['memory'][0].update(appRssStatus='value',appRssBytes=123,processes=[dict(pid=1,parent=0,rssBytes=123,executable='/sbin/launchd')])
            if fault=='rejected-commit':report['d1']['rows'][0]['outcome']['commit']='rejected'
            if fault=='non-state':
                report['d1']['finalState']={'note':'not a game'};report['d1']['finalStateHash']=base.digest(report['d1']['finalState'])
            if fault=='ledger':
                report['d1']['finalState']['appliedBattles']={};report['d1']['finalStateHash']=base.digest(report['d1']['finalState'])
            if fault=='pair':report['d1']['finalState']['appliedBattles']['F100-1']['settlement']['pairHash']='forged';report['d1']['finalStateHash']=base.digest(report['d1']['finalState'])
            if fault=='row-hash':report['d1']['rows'][0]['afterStateHash']='forged'
            if fault=='driver-version':report['d1']['driverVersion']='old-v1'
            core=HERE.parent.parent/'js/engine/build/core.cjs';target=nw/'js/engine/build/core.cjs';target.parent.mkdir(parents=True);shutil.copyfile(core,target)
            exe=app/'Contents/MacOS/nwjs';exe.parent.mkdir(parents=True)
            body='#!/usr/bin/env python3\nimport json,sys,time,os\nfrom pathlib import Path\np=Path(next(x.split("=",1)[1]for x in sys.argv if x.startswith("--ps-flow-out=")))\nr=json.loads('+repr(json.dumps(report))+')\n'
            if fault in ['rss-valid','rss-corrupt']:
                body+='for row in r["d1"]["memory"]:\n Path(str(p)+".memory-request.json").write_text(json.dumps(dict(id=row["id"],rendererPid=os.getpid())))\n reply=Path(str(p)+".memory-reply.json")\n while not reply.exists()or json.loads(reply.read_text())["id"]!=row["id"]:time.sleep(.01)\n row.update(json.loads(reply.read_text()))\n'
                if fault=='rss-corrupt':body+='r["d1"]["memory"][0]["appRssBytes"]+=1\n'
            body+='p.write_text(json.dumps(r))\n'
            if fault in ['exit-fatal','exit-fatal-cleanup']:body+='Path(str(p)+".fatal.json").write_text("{\\"fatal\\":true}")\n'
            exe.write_text(body);exe.chmod(0o755)
            def sample(pid,app,request):return dict(id=request['id'],appRssBytes=321,appRssStatus='value',appRssReason=None,processes=[dict(pid=pid,parent=0,rssBytes=321,executable=str(exe))])
            def invoke():return base.SCOPE['run_group'](app,info,root/'out','control-natural1',1,False,source,synthetic=True)
            with mock.patch.dict(base.SCOPE,{'app_memory':sample}):
                if fault is None or fault=='rss-valid':return invoke()
                if fault=='exit-fatal-cleanup':
                    with mock.patch.object(base.SCOPE['os'],'killpg',side_effect=PermissionError('controlled EPERM')):
                        with self.assertRaisesRegex(RuntimeError,'fatal'):invoke()
                    receipt=json.loads((root/'out/EXECUTION.json').read_text());self.assertIn('fatal',receipt['failure']['message']);self.assertTrue(receipt['cleanupErrors']);self.assertEqual(receipt['exit'],0);self.assertIn('finishedUTC',receipt)
                else:
                    with self.assertRaises(RuntimeError,msg=fault):invoke()

    def test_exit_fatal(self):self.invoke('exit-fatal')
    def test_self_reported_rss(self):self.invoke('self-rss')
    def test_rejected_commit(self):self.invoke('rejected-commit')
    def test_non_state(self):self.invoke('non-state')
    def test_missing_ledger(self):self.invoke('ledger')
    def test_positive(self):self.invoke(None)
    def test_actual_handshake_rss_binding(self):self.invoke('rss-valid');self.invoke('rss-corrupt')
    def test_original_fatal_survives_cleanup_failure(self):self.invoke('exit-fatal-cleanup')
    def test_pair_row_and_driver_identity(self):
        for fault in ['pair','row-hash','driver-version']:
            with self.subTest(fault=fault):self.invoke(fault)

    def test_host_code_configuration_and_bounded_signature(self):
        host=base.SCOPE['_host']
        def fixture(root,name):
            app=root/(name+'.app');nw=app/'Contents/Resources/app.nw';nw.mkdir(parents=True)
            (nw/'package.json').write_text(json.dumps(dict(name=name,main='index.html',window=dict(width=816,height=624))))
            (app/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleName=name,CFBundleDisplayName=name,CFBundleIdentifier='same',Guard='unchanged')))
            exe=app/'Contents/MacOS/nwjs';exe.parent.mkdir();header=struct.pack('<IIIIIIII',0xfeedfacf,0x100000c,0,2,1,16,0,0)
            cd=struct.pack('>IIIIIIIII4BI',0xfade0c02,172,0x20001,2,140,44,3,1,128,32,2,0,12,0)+b'\0'*128
            exe.write_bytes(header+struct.pack('<IIII',0x1d,16,128,192)+b'\0'*80+struct.pack('>IIIII',0xfade0cc0,192,1,0,20)+cd)
            framework=app/'Contents/Frameworks/runtime';framework.parent.mkdir();framework.write_bytes(b'unchanged host')
            signature=app/'Contents/_CodeSignature/CodeResources';signature.parent.mkdir();signature.write_bytes(b'synthetic verified envelope '+name.encode());return app
        for fault in [None,'main-code','framework','plist','package','external-link','unbounded-signature','signing-policy','mode']:
            with self.subTest(fault=fault),tempfile.TemporaryDirectory(prefix='pf-d1-host-')as folder:
                root=Path(folder);a=fixture(root,'a');b=fixture(root,'b');exe=b/'Contents/MacOS/nwjs'
                raw=bytearray(exe.read_bytes());raw[128+20+140-32]=1;exe.write_bytes(raw) # Only signed Info.plist digest may differ.
                if fault=='main-code':raw[100]=1;exe.write_bytes(raw)
                if fault=='unbounded-signature':raw[44:48]=struct.pack('<I',8);exe.write_bytes(raw)
                if fault=='signing-policy':raw[128+20+15]=3;exe.write_bytes(raw)
                if fault=='framework':(b/'Contents/Frameworks/runtime').write_bytes(b'changed')
                if fault=='plist':
                    p=b/'Contents/Info.plist';d=plistlib.loads(p.read_bytes());d['Guard']='changed';p.write_bytes(plistlib.dumps(d))
                if fault=='package':
                    p=b/'Contents/Resources/app.nw/package.json';d=json.loads(p.read_text());d['window']['width']=900;p.write_text(json.dumps(d))
                if fault=='external-link':(b/'Contents/escape').symlink_to(root)
                if fault=='mode':exe.chmod(0o700)
                with mock.patch.object(host.subprocess,'run',return_value=SimpleNamespace(returncode=0,stderr='')):
                    if fault is None:host.require_pair(a,b)
                    else:
                        with self.assertRaises(RuntimeError,msg=fault):host.require_pair(a,b)

    def test_runtime_versions_are_required_and_equal(self):
        host=base.SCOPE['_host'];env=dict(nw='0.117.0',node='26.7.0',chromium='154.0',v8='15.4',platform='darwin',arch='arm64');initial=host.require_runtime(None,env)
        self.assertEqual(host.require_runtime(initial,dict(env)),initial)
        for field in host.RUNTIME_FIELDS:
            with self.subTest(field=field),self.assertRaises(RuntimeError):host.require_runtime(initial,{**env,field:'different'})
            with self.subTest(missing=field),self.assertRaises(RuntimeError):host.require_runtime(None,{k:v for k,v in env.items()if k!=field})

    def test_handled_signals_cleanup_only_owned_group(self):
        for sig in CANCEL_SIGNALS:
            with self.subTest(signal=sig),tempfile.TemporaryDirectory(prefix='pf-d1-signal-')as folder:
                root=Path(folder);apps=[]
                for role in ['control','candidate']:
                    app=root/(role+'.app');nw=app/'Contents/Resources/app.nw';nw.mkdir(parents=True);(nw/'package-info.json').write_text(json.dumps(dict(gitHead=role,withTests=True,workingTreeChanges=0)))
                    exe=app/'Contents/MacOS/nwjs';exe.parent.mkdir();exe.write_text('#!/usr/bin/env python3\nimport time\ntime.sleep(60)\n');exe.chmod(0o755);apps.append(app)
                env=dict(os.environ);env.pop('NODE_OPTIONS',None);env.pop('NODE_PATH',None)
                process=subprocess.Popen(['python3',str(base.SCRIPT),*map(str,apps),str(root/'out'),'--groups','control-natural1','--pilot-count','1','--synthetic-controls'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
                pid=None
                try:
                    receipt=root/'out/control-natural1/EXECUTION.json';deadline=time.monotonic()+10
                    while not receipt.exists()and time.monotonic()<deadline:
                        if process.poll()is not None:break
                        time.sleep(.02)
                    self.assertTrue(receipt.exists());pid=json.loads(receipt.read_text())['pid'];process.send_signal(sig);stdout,stderr=process.communicate(timeout=10);self.assertNotEqual(process.returncode,0)
                    summary=json.loads((root/'out/SUMMARY.json').read_text());self.assertEqual(summary['status'],'FAIL_STOP');self.assertIn('signal',summary['error']);row=json.loads(receipt.read_text());self.assertIn('exit',row);self.assertIn('finishedUTC',row)
                    self.assertEqual(summary['cancellationSignals'],[sig]);self.assertEqual(summary['groups'],[]);self.assertEqual(row['cancellationSignals'],[sig]);self.assertEqual(row['cleanupErrors'],[])
                    with self.assertRaises(ProcessLookupError):os.killpg(pid,0)
                finally:
                    if process.poll()is None:process.kill();process.communicate(timeout=5)
                    if pid:
                        try:os.killpg(pid,signal.SIGTERM)
                        except ProcessLookupError:pass

    def signal_window(self, window, sig):
        # Explicit synthetic child/command shims, never an RSS measurement or NW host.
        with tempfile.TemporaryDirectory(prefix='pf-d1-signal-window-') as folder:
            root=Path(folder);apps=[];source=json.loads((base.SCRIPT.parent.parent/'experiments/step5/4/d1/f100-v1.json').read_text());mark=root/'window-entered'
            for role in ['control','candidate']:
                app=root/(role+'.app');nw=app/'Contents/Resources/app.nw';nw.mkdir(parents=True);info=dict(gitHead=role,withTests=True,workingTreeChanges=0)
                (nw/'package-info.json').write_text(json.dumps(info));base.install_core(nw);report=base.make_report(source,info,count=1,role=role)
                body='#!/usr/bin/env python3\nimport json,sys,time,signal\nfrom pathlib import Path\np=Path(next(x.split("=",1)[1]for x in sys.argv if x.startswith("--ps-flow-out=")))\n'
                if window=='cleanup':
                    body+='signal.signal(signal.SIGTERM,lambda *_:Path('+repr(str(mark))+').write_text("cleanup"))\nPath(str(p)+".fatal.json").write_text("{}")\nwhile True:time.sleep(.05)\n'
                else:
                    body+='r=json.loads('+repr(json.dumps(report))+')\nfor row in r["d1"]["memory"]:\n Path(str(p)+".memory-request.json").write_text(json.dumps(dict(id=row["id"],rendererPid=__import__("os").getpid())))\n reply=Path(str(p)+".memory-reply.json")\n while not reply.exists() or json.loads(reply.read_text())["id"]!=row["id"]:time.sleep(.01)\n row.update(json.loads(reply.read_text()))\np.write_text(json.dumps(r))\n'
                exe=app/'Contents/MacOS/nwjs';exe.parent.mkdir();exe.write_text(body);exe.chmod(0o755);apps.append(app)
            env=dict(os.environ);env.pop('NODE_OPTIONS',None);env.pop('NODE_PATH',None)
            if window!='cleanup':
                shim=root/'shim';shim.mkdir()
                for tool in ['pgrep','ps']:
                    body='#!/usr/bin/env python3\nimport time\nfrom pathlib import Path\n'
                    if tool==window:body+='Path('+repr(str(mark))+').write_text("sampling")\ntime.sleep(.5)\n'
                    body+='raise SystemExit(1)\n';f=shim/tool;f.write_text(body);f.chmod(0o755)
                env['PATH']=str(shim)+os.pathsep+env['PATH']
            out=root/'out';proc=subprocess.Popen([sys.executable,str(base.SCRIPT),*map(str,apps),str(out),'--groups','control-natural1','--pilot-count','1','--synthetic-controls'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
            pid=None
            try:
                deadline=time.monotonic()+10;receipt=out/'control-natural1/EXECUTION.json'
                while not mark.exists() and proc.poll() is None and time.monotonic()<deadline:time.sleep(.01)
                self.assertTrue(mark.exists(),'controlled window entered');pid=json.loads(receipt.read_text())['pid']
                proc.send_signal(sig);time.sleep(.05);proc.send_signal(sig)
                stdout,stderr=proc.communicate(timeout=10);self.assertNotEqual(proc.returncode,0)
                summary=json.loads((out/'SUMMARY.json').read_text());row=json.loads(receipt.read_text());self.assertEqual(summary['status'],'FAIL_STOP');self.assertEqual(summary.get('groups'),[])
                self.assertEqual(summary['cancellationSignals'],[sig,sig]);self.assertEqual(row['cancellationSignals'],[sig,sig]);self.assertIn('finishedUTC',row);self.assertIn('exit',row);self.assertEqual(row['cleanupErrors'],[])
                self.assertIn('fatal' if window=='cleanup' else 'signal',summary['error']);self.assertIn('fatal' if window=='cleanup' else 'signal',row['failure']['message'])
                with self.assertRaises(ProcessLookupError):os.killpg(pid,0)
            finally:
                if proc.poll() is None:proc.kill();proc.communicate(timeout=5)
                if receipt.exists():pid=json.loads(receipt.read_text())['pid']
                if pid:
                    try:os.killpg(pid,signal.SIGKILL)
                    except ProcessLookupError:pass

    def test_cancel_during_each_sampling_command_is_never_unknown_or_accepted(self):
        for window in ['pgrep','ps']:
            for sig in CANCEL_SIGNALS:
                with self.subTest(window=window,signal=sig):self.signal_window(window,sig)

    def test_cancel_during_cleanup_preserves_fatal_and_finishes_owned_cleanup(self):
        for sig in CANCEL_SIGNALS:
            with self.subTest(signal=sig):self.signal_window('cleanup',sig)

    def test_real_sampling_unavailability_remains_explicit_unknown(self):
        cancel=base.SCOPE['Cancellation']()
        with mock.patch.object(base.SCOPE['subprocess'],'run',return_value=SimpleNamespace(returncode=2,stderr='controlled unavailable')):
            row=base.SCOPE['app_memory'](123,Path('/synthetic.app'),dict(id='initial-map',rendererPid=123),cancel)
        self.assertEqual(row['appRssStatus'],'UNKNOWN');self.assertIsNone(row['appRssBytes']);self.assertIn('unavailable',row['appRssReason'])

    def test_cancel_after_exit_during_verification_is_not_accepted(self):
        for sig in CANCEL_SIGNALS:
            with self.subTest(signal=sig),tempfile.TemporaryDirectory(prefix='pf-d1-late-cancel-') as folder:
                root=Path(folder);app=root/'fixture.app';nw=app/'Contents/Resources/app.nw';nw.mkdir(parents=True);base.install_core(nw)
                source=dict(cases=[dict(id='F100-1',seed=[1,2,3,4],expected=dict(code=1))]);info=dict(gitHead='synthetic');report=base.make_report(source,info,count=1)
                exe=app/'Contents/MacOS/nwjs';exe.parent.mkdir();exe.write_text('#!/usr/bin/env python3\nimport sys\nfrom pathlib import Path\nPath(next(x.split("=",1)[1]for x in sys.argv if x.startswith("--ps-flow-out="))).write_text('+repr(json.dumps(report))+')\n');exe.chmod(0o755)
                cancellation=base.SCOPE['Cancellation']();real=base.SCOPE['verify_report_hashes']
                def checked(*args):
                    value=real(*args);cancellation.request(sig,None);return value
                with mock.patch.dict(base.SCOPE,{'verify_report_hashes':checked}),self.assertRaises(base.SCOPE['BenchmarkCancelled']):base.SCOPE['run_group'](app,info,root/'out','control-natural1',1,False,source,synthetic=True,cancellation=cancellation)
                row=json.loads((root/'out/EXECUTION.json').read_text());self.assertEqual(row['cancellationSignals'],[sig]);self.assertIn('signal',row['failure']['message']);self.assertIn('finishedUTC',row)

    def test_cancel_at_summary_publication_rewrites_fail_stop_and_exits_nonzero(self):
        for sig in CANCEL_SIGNALS:
            with self.subTest(signal=sig),tempfile.TemporaryDirectory(prefix='pf-d1-summary-cancel-') as folder:
                root=Path(folder);apps=[]
                for name in ['control','candidate']:
                    app=root/(name+'.app');nw=app/'Contents/Resources/app.nw';nw.mkdir(parents=True);(nw/'package-info.json').write_text(json.dumps(dict(gitHead=name,withTests=True,workingTreeChanges=0)));apps.append(app)
                result=dict(initialStateHash='same',finalStateHash='same');write=base.SCOPE['write']
                def publishing(file,value):
                    if file.name=='SUMMARY.json' and value['status']=='SYNTHETIC_CONTROLS_EXECUTED':os.kill(os.getpid(),sig)
                    write(file,value)
                argv=[str(base.SCRIPT),*map(str,apps),str(root/'out'),'--groups','control-natural1','--pilot-count','1','--synthetic-controls']
                before={s:signal.getsignal(s)for s in CANCEL_SIGNALS}
                with mock.patch.dict(base.SCOPE,{'run_group':lambda *a,**k:result,'write':publishing}),mock.patch.object(sys,'argv',argv),self.assertRaises(base.SCOPE['BenchmarkCancelled']):base.SCOPE['main']()
                summary=json.loads((root/'out/SUMMARY.json').read_text());self.assertEqual(summary['status'],'FAIL_STOP');self.assertEqual(summary['cancellationSignals'],[sig]);self.assertIn('signal',summary['error'])
                self.assertEqual({s:signal.getsignal(s)for s in CANCEL_SIGNALS},before)

    def test_cleanup_permission_failure_is_explicit(self):
        process=SimpleNamespace(pid=12345,poll=lambda:0,wait=lambda timeout:0)
        with mock.patch.object(base.SCOPE['os'],'killpg',side_effect=PermissionError('controlled EPERM')):
            attempted,errors=base.SCOPE['cleanup_owned'](process)
        self.assertFalse(attempted);self.assertTrue(any('EPERM'in e for e in errors));self.assertIn('owned process group remains or cannot be verified',errors)

if __name__=='__main__':unittest.main()
