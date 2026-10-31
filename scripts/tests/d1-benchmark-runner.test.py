"""Synthetic runner failure controls only: no NW, MZ, game logic or performance claim."""
from pathlib import Path
import json
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parent.parent/'run-d1-benchmark-mac.py'
SCOPE={'__name__':'synthetic_d1_runner_controls','__file__':str(SCRIPT)}
exec(compile(SCRIPT.read_text(),str(SCRIPT),'exec'),SCOPE)


class RunnerControls(unittest.TestCase):
    def check(self, fault, count=100):
        with tempfile.TemporaryDirectory(prefix='pf-d1-runner-control-') as directory:
            root=Path(directory);app=root/'SYNTHETIC.app';runtime=app/'Contents/Resources/app.nw';runtime.mkdir(parents=True)
            (runtime/'fixture.txt').write_text('synthetic tool control, not a native app')
            executable=app/'Contents/MacOS/nwjs';executable.parent.mkdir(parents=True)
            cases=[dict(id='F100-'+str(i+1),seed=[1,2,3,4+i],expected=dict(code=1)) for i in range(100)]
            source=dict(cases=cases);info=dict(gitHead='synthetic-only')
            rows=[dict(id=c['id'],seed=c['seed'],resolvedSeed=','.join(map(str,c['seed'])),status='pass',outcome=dict(code=1),focusStart=True,focusEnd=True,visibleStart='visible',visibleEnd='visible') for c in cases[:count]]
            points=['initial-map']+['after'+str(n)for n in [4,50,100]if n<=count]+['after-idle120']
            memory=[dict(id=x,gcForced=False,appRssStatus='UNKNOWN',appRssBytes=None,appRssReason='synthetic-no-host') for x in points]
            frames=[dict(kind=x,dt=16.6,focus=True,visibility='visible') for x in ['updateMain','rAF']]
            report=dict(overall='pass',results=[dict(id='D1-F100 synthetic facility',status='pass')],env=dict(packageInfo=info,nw='SYNTHETIC_NOT_NATIVE'),d1=dict(status='pass',errors=[],rows=rows,input=source,kind='FORMAL_F100',presentationImplementation='legacy text-scene bridge',instrumentation=dict(detailed=True),memory=memory,frameSamples=frames,inputHash='synthetic-only',finalStateHash='synthetic-only'))
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
            body='import sys,json\nfrom pathlib import Path\n'
            if fault=='exit':body+='raise SystemExit(9)\n'
            elif fault!='missing':body+='p=Path(next(x.split("=",1)[1]for x in sys.argv if x.startswith("--ps-flow-out=")))\np.write_text('+repr(json.dumps(report))+')\n'
            if fault=='payload':body+='Path('+repr(str(runtime/'fixture.txt'))+').write_text("changed")\n'
            executable.write_text('#!/usr/bin/env python3\n'+body);executable.chmod(0o755)
            invoke=lambda:SCOPE['run_group'](app,info,root/'evidence','control-natural1',count,True,source)
            if fault is None:self.assertEqual(invoke()['count'],count)
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


if __name__=='__main__':unittest.main()
