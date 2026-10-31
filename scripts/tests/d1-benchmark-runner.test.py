"""Synthetic runner failure controls only: no NW, MZ, game logic or performance claim."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT=Path(__file__).resolve().parent.parent/'run-d1-benchmark-mac.py'
SCOPE={'__name__':'synthetic_d1_runner_controls','__file__':str(SCRIPT)}
exec(compile(SCRIPT.read_text(),str(SCRIPT),'exec'),SCOPE)


def digest(value):
    # Independent Python oracle for the fixture's small canonical JSON values, not the production JS verifier.
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def make_report(source,info,count=100,money=0,role='control'):
    rows=[dict(id=c['id'],seed=c['seed'],resolvedSeed=','.join(map(str,c['seed'])),status='pass',outcome=dict(code=c['expected']['code']),focusStart=True,focusEnd=True,visibleStart='visible',visibleEnd='visible')for c in source['cases'][:count]]
    points=['initial-map']+['after'+str(n)for n in [4,50,100]if n<=count]+['after-idle120']
    memory=[dict(id=x,gcForced=False,appRssStatus='UNKNOWN',appRssBytes=None,appRssReason='synthetic-no-host')for x in points]
    initial=dict(fixture='synthetic entire object, not a game state',money=100,party=[])
    final=dict(fixture='synthetic entire object, not a game state',money=money,party=[])
    return dict(overall='pass',results=[dict(id='D1-F100 synthetic facility',status='pass')],env=dict(packageInfo=info,nw='SYNTHETIC_NOT_NATIVE'),d1=dict(status='pass',errors=[],rows=rows,input=source,inputHash=digest(source),initialState=initial,initialStateHash=digest(initial),finalState=final,finalStateHash=digest(final),kind='FORMAL_F100',presentationImplementation='legacy text-scene bridge'if role=='control'else'd1-controller-v1',instrumentation=dict(detailed=True),memory=memory,frameSamples=[dict(kind=x,dt=16.6,focus=True,visibility='visible')for x in ['updateMain','rAF']]))


class RunnerControls(unittest.TestCase):
    def check(self, fault, count=100):
        with tempfile.TemporaryDirectory(prefix='pf-d1-runner-control-') as directory:
            root=Path(directory);app=root/'SYNTHETIC.app';runtime=app/'Contents/Resources/app.nw';runtime.mkdir(parents=True)
            (runtime/'fixture.txt').write_text('synthetic tool control, not a native app')
            executable=app/'Contents/MacOS/nwjs';executable.parent.mkdir(parents=True)
            cases=[dict(id='F100-'+str(i+1),seed=[1,2,3,4+i],expected=dict(code=1)) for i in range(100)]
            source=dict(cases=cases);info=dict(gitHead='synthetic-only')
            report=make_report(source,info,count);b=report['d1'];rows=b['rows'];memory=b['memory'];frames=b['frameSamples']
            if fault=='empty':report['results']=[]
            if fault=='short':report['d1']['rows']=rows[:-1]
            if fault=='wrong-seed':rows[7]['resolvedSeed']='forged'
            if fault=='case-fail':rows[0]['status']='fail'
            if fault=='identity':report['env']['packageInfo']={'gitHead':'wrong'}
            if fault=='implementation':report['d1']['presentationImplementation']='wrong'
            if fault=='no-game-clock':report['d1']['frameSamples']=frames[1:]
            if fault=='bad-clock':frames[0]['dt']=-1
            if fault=='false-rss':memory[0].update(appRssStatus='value',appRssBytes=0,processes=[])
            if fault=='unknown-zero':memory[0]['appRssBytes']=0
            if fault=='unknown-reason':memory[0]['appRssReason']=None
            if fault=='memory-order':memory.reverse()
            if fault=='changed-final-old-hash':b['finalState']['money']=1
            if fault=='missing-final':del b['finalState']
            if fault=='empty-final':b['finalState']={};b['finalStateHash']=digest({})
            if fault=='array-final':b['finalState']=[];b['finalStateHash']=digest([])
            if fault=='wrong-final-hash':b['finalStateHash']='synthetic-only'
            if fault=='wrong-input-hash':b['inputHash']='0'*64
            if fault=='wrong-initial-hash':b['initialState']['money']=99
            if fault=='bool-input-alias':
                b['input']=json.loads(json.dumps(source));b['input']['cases'][0]['seed'][0]=True;b['inputHash']=digest(b['input'])
            if fault=='bool-seed-alias':rows[0]['seed']=[True,2,3,4]
            if fault=='bool-outcome-alias':rows[0]['outcome']['code']=True
            body='import sys,json\nfrom pathlib import Path\n'
            if fault=='exit':body+='raise SystemExit(9)\n'
            elif fault!='missing':body+='p=Path(next(x.split("=",1)[1]for x in sys.argv if x.startswith("--ps-flow-out=")))\np.write_text('+repr(json.dumps(report))+')\n'
            if fault=='payload':body+='Path('+repr(str(runtime/'fixture.txt'))+').write_text("changed")\n'
            executable.write_text('#!/usr/bin/env python3\n'+body);executable.chmod(0o755)
            invoke=lambda:SCOPE['run_group'](app,info,root/'evidence','control-natural1',count,True,source,synthetic=True)
            if fault is None:
                result=invoke();self.assertEqual(result['count'],count)
                self.assertTrue(result['stateHashesVerified']);self.assertEqual(result['evidenceKind'],'SYNTHETIC_TOOLING_NOT_NATIVE_NOT_P4')
            else:
                with self.assertRaises(RuntimeError,msg=fault):invoke()

    def test_positive_and_fail_closed_controls(self):
        for fault in [None,'empty','short','wrong-seed','case-fail','identity','implementation','no-game-clock','bad-clock','false-rss','unknown-zero','unknown-reason','memory-order','exit','missing','payload']:
            with self.subTest(fault=fault):self.check(fault)

    def test_partial_qualification_points_remain_strict(self):
        # Short pilots cannot supply samples for battles they never ran. Their actual points still must be ordered.
        for count in [1,4,49,50,99]:
            with self.subTest(count=count):
                self.check(None,count)
                self.check('memory-order',count)

    def test_complete_state_hash_refusals(self):
        for fault in ['changed-final-old-hash','missing-final','empty-final','array-final','wrong-final-hash','wrong-input-hash','wrong-initial-hash','bool-input-alias','bool-seed-alias','bool-outcome-alias']:
            with self.subTest(fault=fault):self.check(fault)

    def test_ecmascript_serialization_and_numeric_aliases(self):
        report=make_report(dict(cases=[]),dict(gitHead='synthetic-only'))
        report['d1']['finalState']={'10':'ten','2':'two','text':'宝可梦\u2028','money':0}
        canonical='{"2":"two","10":"ten","text":"宝可梦\u2028","money":0}'
        report['d1']['finalStateHash']=hashlib.sha256(canonical.encode()).hexdigest()
        self.assertEqual(SCOPE['verify_report_hashes'](json.dumps(report,ensure_ascii=False).encode())['finalStateHash'],report['d1']['finalStateHash'])
        raw=json.dumps(report,ensure_ascii=False,separators=(',',':'))
        for token in ['1e-400','-0','0.0','1e400','9007199254740993']:
            with self.subTest(token=token),self.assertRaisesRegex(RuntimeError,'noncanonical number'):
                SCOPE['verify_report_hashes'](raw.replace('"money":0','"money":'+token).encode())

    def test_verifier_unavailable_fails_closed(self):
        with mock.patch.object(SCOPE['subprocess'],'run',side_effect=FileNotFoundError('synthetic missing Node')):
            with self.assertRaisesRegex(RuntimeError,'verifier unavailable'):SCOPE['verify_report_hashes'](b'{}')

    def test_ten_group_state_comparison_and_synthetic_label(self):
        source=json.loads((SCRIPT.parent.parent/'experiments/step5/4/d1/f100-v1.json').read_text())
        for fault in [None,'different-valid-state','different-valid-initial','different-state-old-hash','missing-final','native-looking-script']:
            with self.subTest(fault=fault),tempfile.TemporaryDirectory(prefix='pf-d1-ten-synthetic-')as folder:
                root=Path(folder);apps=[]
                for role,head in [('control','1'*40),('candidate','2'*40)]:
                    app=root/(role+'.app');runtime=app/'Contents/Resources/app.nw';runtime.mkdir(parents=True)
                    info=dict(gitHead=head,withTests=True,workingTreeChanges=0)
                    (runtime/'package-info.json').write_text(json.dumps(info));(runtime/'fixture.txt').write_text('synthetic tooling only')
                    report=make_report(source,info,role=role)
                    if role=='candidate'and fault in ['different-valid-state','different-state-old-hash']:
                        report['d1']['finalState']['money']=1
                        if fault=='different-valid-state':report['d1']['finalStateHash']=digest(report['d1']['finalState'])
                    if role=='candidate'and fault=='different-valid-initial':
                        report['d1']['initialState']['money']=99
                        report['d1']['initialStateHash']=digest(report['d1']['initialState'])
                    if fault=='missing-final':del report['d1']['finalState']
                    if fault=='native-looking-script':report['env'].update(nw='0.117.0',platform='darwin',arch='arm64')
                    body='import sys,json\nfrom pathlib import Path\nr=json.loads('+repr(json.dumps(report))+')\n'
                    body+='off="--ps-d1-sensors=off" in sys.argv\ngc="--ps-d1-gc" in sys.argv\nr["d1"]["instrumentation"]["detailed"]=not off\n'
                    body+='if off:r["d1"]["memory"]=[];r["d1"]["frameSamples"]=[]\n'
                    body+='for row in r["d1"]["memory"]:row["gcForced"]=gc\n'
                    body+='Path(next(x.split("=",1)[1]for x in sys.argv if x.startswith("--ps-flow-out="))).write_text(json.dumps(r))\n'
                    executable=app/'Contents/MacOS/nwjs';executable.parent.mkdir(parents=True);executable.write_text('#!/usr/bin/env python3\n'+body);executable.chmod(0o755);apps.append(app)
                env=dict(os.environ);env.pop('NODE_OPTIONS',None);env.pop('NODE_PATH',None)
                argv=['python3',str(SCRIPT),*map(str,apps),str(root/'result')]
                if fault!='native-looking-script':argv.append('--synthetic-controls')
                process=subprocess.run(argv,capture_output=True,text=True,env=env,timeout=30)
                summary=json.loads((root/'result/SUMMARY.json').read_text())
                if fault is None:
                    self.assertEqual(process.returncode,0,process.stderr)
                    self.assertEqual(summary['kind'],'SYNTHETIC_TOOLING_NOT_NATIVE_NOT_P4')
                    self.assertEqual(summary['status'],'SYNTHETIC_CONTROLS_EXECUTED')
                    self.assertEqual(summary['totalBattles'],0);self.assertEqual(summary['syntheticCaseRecords'],1000)
                    self.assertTrue(all(r['stateHashesVerified']for r in summary['groups']))
                else:
                    self.assertNotEqual(process.returncode,0)
                    self.assertEqual(summary['status'],'FAIL_STOP')
                    if fault=='different-valid-state':self.assertIn('finalStateHash',summary['error'])
                    if fault=='different-valid-initial':self.assertIn('initialStateHash',summary['error'])
                    if fault=='different-state-old-hash':self.assertIn('hash mismatch: finalState',summary['error'])
                    if fault=='missing-final':self.assertIn('missing complete object: finalState',summary['error'])
                    if fault=='native-looking-script':self.assertIn('native Mach-O',summary['error'])


if __name__=='__main__':unittest.main()
