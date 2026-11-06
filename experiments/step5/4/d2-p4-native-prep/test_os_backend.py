import copy
import hashlib
import json
from pathlib import Path
import signal
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from core_api import AdmissionDenied,HostAdmission,OwnedProcess,binding,supervisor
from os_backend import SystemOps,MacOSBackend,ProcessIdentity,parse_identity

GROUP=supervisor.GROUPS[0]
NONCE="tool-fixture-not-native"


class FakeOps:
    def __init__(self,root):
        self.calls=[];self.time=0.;self.absent=False;self.absent_after=signal.SIGTERM
        self.child=SimpleNamespace(pid=101,status=None)
        self.rows={101:ProcessIdentity(101,500,101,"fixture-root-birth",4096,str(root/"Contents/MacOS/nwjs")),
                   102:ProcessIdentity(102,101,101,"fixture-renderer-birth",2048,str(root/"Contents/Frameworks/Helper"))}
    def run(self,argv,timeout,action):self.calls.append((action,argv));return SimpleNamespace(returncode=0)
    def spawn(self,*args):self.calls.append(("spawn",args[0]));return self.child
    def identity(self,pid,timeout):
        self.calls.append(("identity",pid))
        row=self.rows[pid]
        if isinstance(row,Exception):raise row
        return row
    def children(self,pid,timeout):self.calls.append(("children",pid));return [102] if pid==101 else []
    def collector_pid(self):return 500
    def poll(self,child):return child.status
    def group_absent(self,pgid):self.calls.append(("group_absent",pgid));return self.absent
    def signal_group(self,pgid,number):
        self.calls.append(("signal",number))
        if number==self.absent_after:self.absent=True
    def now(self):return self.time
    def sleep(self,seconds):self.time+=seconds


class BackendControls(unittest.TestCase):
    def setUp(self):
        # These are hard sentinels. A test accidentally escaping scripted Ops
        # fails, rather than inspecting/starting/signalling a real host process.
        for name in ("subprocess.run","subprocess.Popen","os.killpg"):
            mock=patch(name,side_effect=AssertionError("real OS boundary forbidden"));mock.start();self.addCleanup(mock.stop)
        def forbidden(*args):raise AssertionError("real backend OS boundary forbidden")
        mock=patch("os_backend.os",SimpleNamespace(killpg=forbidden,getpid=forbidden));mock.start();self.addCleanup(mock.stop)
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.work=Path(self.tmp.name).resolve();self.root=self.work/"Tool Fixture.app"
        (self.root/"Contents/MacOS").mkdir(parents=True)
        (self.root/"Contents/MacOS/nwjs").write_text("NOT AN EXECUTABLE; NEVER LAUNCHED")
        (self.root/"Contents/Resources/app.nw").mkdir(parents=True)
        receipt=self.work/"fixture-receipt";receipt.write_text("TOOL_FIXTURE_NOT_AUTHORIZATION")
        pin={"path":str(receipt),"sha256":binding.sha(receipt)}
        self.spec={"appRoot":str(self.root),"inventory":binding.inventory(self.root),
            "argv":[str(self.root/"Contents/MacOS/nwjs"),str(self.root/"Contents/Resources/app.nw")],
            "cwd":str(self.root/"Contents/Resources/app.nw"),"env":{},"executionRoot":str(self.work),"outputRoot":str(self.work/"new-run"),
            "commandTimeout":1,"cleanupGrace":.1,"cleanupKillWait":.1,"maxReportBytes":100000,"maxOwnedPids":8,
            "receipts":{k:pin for k in ("product","driverRouting","normalTrace","qualifiedDeadlines","ciBoundaryDisposition","nativeAuthorization","priorDenialResolution")}}
        self.ops=FakeOps(self.root);self.plan={"nonce":NONCE}
        self.backend=MacOSBackend({GROUP:self.spec},NONCE,self.ops,
            original_gate=lambda g,p:HostAdmission(NONCE,g,"VERIFIED_IDLE",True,"a"*64),
            after_gate=lambda g,p:"VERIFIED_IDLE",report_verifier=lambda *args:None)

    def launched(self):
        self.backend.preflight_identity(GROUP,self.plan);self.backend.admit_host(GROUP,self.plan)
        return self.backend.launch(GROUP,self.plan)

    def raw_report(self,version="D2-normal-F100-output-v1"):
        p=Path(self.spec["outputRoot"])/"report.json"
        p.write_text(json.dumps({"version":version,"runNonce":NONCE,"group":GROUP,"caseIds":[f"F100-{i+1:03d}" for i in range(100)]}))
        self.ops.child.status=0
        return p

    def test_default_system_ops_deny_before_any_real_OS_boundary(self):
        ops=SystemOps()
        for call in (lambda:ops.run(["/bin/ps"],1,"forbidden"),lambda:ops.identity(101,1),
                     lambda:ops.children(101,1),lambda:ops.spawn([],"",{},None,None),
                     lambda:ops.group_absent(101),lambda:ops.signal_group(101,15),
                     lambda:ops.poll(self.ops.child),lambda:ops.collector_pid()):
            with self.subTest(call=call):
                with self.assertRaises(AdmissionDenied):call()

    def test_owned_identity_parser_handles_spaces_and_converts_rss_bytes(self):
        row=parse_identity("101 500 101 Fri Nov 6 15:00:00 2026 2 /tmp/Tool Fixture.app/Contents/MacOS/nwjs",101)
        self.assertEqual(row.rss_bytes,2048);self.assertIn("Tool Fixture.app",row.executable)
        with self.assertRaises(ValueError):parse_identity("102 500 101 Fri Nov 6 15:00:00 2026 2 /tmp/tool",101)

    def test_system_identity_argv_is_exact_owned_pid_only_under_mock(self):
        class ToolPermit:
            def check(self,*args):pass
        result=SimpleNamespace(returncode=0,stdout="101 500 101 Fri Nov 6 15:00:00 2026 2 /tmp/tool",stderr="")
        with patch("subprocess.run",return_value=result) as fake:
            SystemOps(ToolPermit()).identity(101,1)
        self.assertEqual(fake.call_args.args[0],["/bin/ps","-p","101","-o","pid=,ppid=,pgid=,lstart=,rss=,comm="])

    def test_original_host_gate_missing_has_no_substitute_probe(self):
        self.backend.original_gate=None;self.backend.preflight_identity(GROUP,self.plan)
        with self.assertRaises(AdmissionDenied):self.backend.admit_host(GROUP,self.plan)
        self.assertEqual([x[0] for x in self.ops.calls],["verify_bound_signature"])

    def test_cannot_launch_without_gate_or_repeat_group(self):
        self.backend.preflight_identity(GROUP,self.plan)
        with self.assertRaises(AdmissionDenied):self.backend.launch(GROUP,self.plan)
        self.backend.admit_host(GROUP,self.plan);self.backend.launch(GROUP,self.plan)
        with self.assertRaises(AdmissionDenied):self.backend.launch(GROUP,self.plan)

    def test_incomplete_native_binding_and_receipt_drift_block_before_ops(self):
        original=self.backend.specs[GROUP];self.backend.specs[GROUP]=None
        with self.assertRaises(AdmissionDenied):self.backend.preflight_identity(GROUP,self.plan)
        self.backend.specs[GROUP]=original;original["receipts"]["product"]["sha256"]="0"*64
        with self.assertRaises(ValueError):self.backend.preflight_identity(GROUP,self.plan)
        self.assertEqual(self.ops.calls,[])

    def test_successful_launch_only_in_scripted_ops_retains_nonce_birth(self):
        owned=self.launched();self.assertEqual((owned.pid,owned.pgid,owned.nonce),(101,101,NONCE))
        self.assertEqual(owned.birth,"fixture-root-birth");self.assertEqual(len([x for x in self.ops.calls if x[0]=="spawn"]),1)

    def test_wrong_root_parent_or_executable_refuses_owned_receipt(self):
        self.backend.spec=self.spec
        for field,value in (("ppid",999),("executable","/outside/nwjs")):
            with self.subTest(field=field):
                self.ops.rows[101]=ProcessIdentity(101,999 if field=="ppid" else 500,101,"fixture-root-birth",4096,value if field=="executable" else str(self.root/"Contents/MacOS/nwjs"))
                with self.assertRaises(ValueError):self.backend._root_identity(self.ops.child)

    def test_uncertain_response_reconciles_only_recorded_child(self):
        owned=self.launched();self.assertEqual(self.backend.reconcile_launch(GROUP,self.plan),owned)
        self.backend.children_by_group.clear()
        with self.assertRaises(RuntimeError):self.backend.reconcile_launch(GROUP,self.plan)

    def test_raw_report_exit_fatal_identity_and_D1_rejection(self):
        owned=self.launched();p=self.raw_report("D1-F100-output-v2")
        with self.assertRaises(ValueError):self.backend.wait_report(owned,1,supervisor.Cancellation())
        self.raw_report();fatal=p.parent/"fatal.json";fatal.write_text("original fatal kept")
        with self.assertRaises(RuntimeError):self.backend.wait_report(owned,1,supervisor.Cancellation())
        self.assertEqual(fatal.read_text(),"original fatal kept")

    def test_real_wait_algorithm_deadline_and_cancellation_only_scripted(self):
        owned=self.launched()
        with self.assertRaises(TimeoutError):self.backend.wait_report(owned,.1,supervisor.Cancellation())
        token=supervisor.Cancellation();token.request("SIGINT fixture")
        with self.assertRaises(supervisor.Cancelled):self.backend.wait_report(owned,2,token)

    def test_verifier_void_or_raise_rejects_false_or_failed_dict(self):
        owned=self.launched();self.raw_report();report=self.backend.wait_report(owned,1,supervisor.Cancellation())
        for value in (False,{"ok":False}):
            self.backend.report_verifier=lambda *args,value=value:value
            with self.assertRaises(ValueError):self.backend.verify_report(report,GROUP,self.plan)
        self.backend.report_verifier=lambda *args:None;self.backend.verify_report(report,GROUP,self.plan)

    def test_raw_report_mutation_before_verifier_is_rejected(self):
        owned=self.launched();p=self.raw_report();report=self.backend.wait_report(owned,1,supervisor.Cancellation());p.write_text("changed")
        with self.assertRaises(ValueError):self.backend.verify_report(report,GROUP,self.plan)

    def test_cleanup_term_success_and_kill_escalation_bounded_under_mock(self):
        owned=self.launched();self.ops.absent_after=signal.SIGKILL
        self.assertEqual(self.backend.cleanup_owned(owned),"ABSENT")
        self.assertEqual([x[1] for x in self.ops.calls if x[0]=="signal"],[signal.SIGTERM,signal.SIGKILL])
        self.assertLessEqual(self.ops.now(),.25)

    def test_reused_pid_or_exited_leader_never_gets_signal(self):
        owned=self.launched();row=self.ops.rows[101]
        self.ops.rows[101]=ProcessIdentity(row.pid,row.ppid,row.pgid,"new birth",row.rss_bytes,row.executable)
        with self.assertRaises(ValueError):self.backend.cleanup_owned(owned)
        self.assertNotIn("signal",[x[0] for x in self.ops.calls])

    def test_forged_pgid_or_nonce_never_probes_signals_or_samples_foreign_group(self):
        owned=self.launched();before=list(self.ops.calls)
        for forged in (OwnedProcess(999,999,owned.birth,NONCE,GROUP),
                       OwnedProcess(101,999,owned.birth,NONCE,GROUP),
                       OwnedProcess(101,101,owned.birth,"other-nonce",GROUP)):
            with self.subTest(forged=forged):
                with self.assertRaises(ValueError):self.backend.cleanup_owned(forged)
                self.assertEqual(self.backend.sample_owned_rss(forged,102)["status"],"UNKNOWN")
                self.assertEqual(self.ops.calls,before)

    def test_preflight_snapshots_spec_and_launch_rechecks_package_bytes(self):
        self.backend.preflight_identity(GROUP,self.plan);self.backend.admit_host(GROUP,self.plan)
        self.spec["argv"][0]="/foreign/command"
        self.assertNotEqual(self.backend.spec["argv"][0],self.spec["argv"][0])
        (self.root/"changed-before-launch").write_text("changed")
        with self.assertRaises(ValueError):self.backend.launch(GROUP,self.plan)
        self.assertNotIn("spawn",[x[0] for x in self.ops.calls])

    def test_dead_leader_live_group_is_unknown_without_blind_helper_kill(self):
        owned=self.launched();self.ops.child.status=0
        with self.assertRaises(ValueError):self.backend.cleanup_owned(owned)
        self.assertNotIn("signal",[x[0] for x in self.ops.calls])

    def test_rss_owned_lineage_renderer_and_raw_identity_only(self):
        owned=self.launched();row=self.backend.sample_owned_rss(owned,102)
        self.assertEqual(row["bytes"],6144);self.assertEqual(row["pids"],[101,102]);self.assertEqual(len(row["processes"]),2)
        unknown=self.backend.sample_owned_rss(owned,999)
        self.assertEqual((unknown["status"],unknown["bytes"]),("UNKNOWN",None))

    def test_rss_denial_partial_lineage_and_reuse_are_unknown_not_zero(self):
        owned=self.launched();self.backend.sample_owned_rss(owned,102);row=self.ops.rows[102]
        self.ops.rows[102]=ProcessIdentity(102,101,101,"reused",row.rss_bytes,row.executable)
        self.assertEqual(self.backend.sample_owned_rss(owned,102)["status"],"UNKNOWN")
        self.ops.rows[102]=ProcessIdentity(102,999,101,row.birth,row.rss_bytes,row.executable)
        self.assertEqual(self.backend.sample_owned_rss(owned,102)["status"],"UNKNOWN")
        self.ops.rows[102]=PermissionError("EPERM")
        self.assertIsNone(self.backend.sample_owned_rss(owned,102)["bytes"])

    def test_final_inventory_change_and_missing_after_gate_fail_closed(self):
        self.launched();(self.root/"changed").write_text("changed")
        with self.assertRaises(ValueError):self.backend.final_identity(GROUP,self.plan)
        self.backend.after_gate=None
        with self.assertRaises(AdmissionDenied):self.backend.after_idle(GROUP,self.plan)

    def test_P4_NATIVE_ULTRA_02_internal_or_equal_APP_output_rejected_before_any_write(self):
        baseline=binding.inventory(self.root)
        self.spec['executionRoot']=str(self.root)
        for output in (self.root,self.root/'new-isolated-run',self.root/'Contents/Resources/app.nw/new-run'):
            with self.subTest(output=output):
                self.spec['outputRoot']=str(output)
                with self.assertRaisesRegex(ValueError,'outside frozen APP'):
                    self.backend.preflight_identity(GROUP,self.plan)
                self.assertEqual(binding.inventory(self.root),baseline)
                self.assertEqual(self.ops.calls,[],'reject even before mocked signature/spawn')

    def test_APP_alias_and_dotdot_output_rejected_without_new_members(self):
        baseline=binding.inventory(self.root);alias=self.work/'app-alias';alias.symlink_to(self.root,target_is_directory=True)
        prefix=self.work/'prefix';prefix.mkdir()
        for output in (alias/'new-isolated-run',prefix/'..'/self.root.name/'new-isolated-run'):
            with self.subTest(output=output):
                self.spec['outputRoot']=str(output)
                with self.assertRaisesRegex(ValueError,'outside frozen APP'):self.backend.preflight_identity(GROUP,self.plan)
                self.assertEqual(binding.inventory(self.root),baseline);self.assertEqual(self.ops.calls,[])

    def test_same_directory_case_alias_is_rejected_by_physical_identity(self):
        alias=self.root.with_name(self.root.name.swapcase())
        if not alias.exists():alias.symlink_to(self.root,target_is_directory=True)
        self.assertTrue(alias.samefile(self.root),'same physical directory on either filesystem kind')
        baseline=binding.inventory(self.root);self.spec['outputRoot']=str(alias/'new-case-alias-output')
        with self.assertRaisesRegex(ValueError,'outside frozen APP'):self.backend.preflight_identity(GROUP,self.plan)
        self.assertEqual(binding.inventory(self.root),baseline);self.assertEqual(self.ops.calls,[])

    def test_output_cannot_mutate_the_other_bound_APP_in_the_pair(self):
        other=self.work/'Other Bound.app';other.mkdir();(other/'fixture').write_text('other frozen bytes')
        self.backend.specs[supervisor.GROUPS[1]]={'appRoot':str(other)}
        self.spec['outputRoot']=str(other/'new-output')
        before=binding.inventory(other);current=binding.inventory(self.root)
        with self.assertRaisesRegex(ValueError,'outside frozen APP'):self.backend.preflight_identity(GROUP,self.plan)
        self.assertEqual(binding.inventory(other),before);self.assertEqual(binding.inventory(self.root),current)
        self.assertEqual(self.ops.calls,[])

    def test_alias_retarget_after_preflight_rejected_before_mkdir_open_or_spawn(self):
        baseline=binding.inventory(self.root);outside=self.work/'external-output';outside.mkdir()
        alias=self.work/'output-alias';alias.symlink_to(outside,target_is_directory=True)
        self.spec['outputRoot']=str(alias/'new-isolated-run')
        self.backend.preflight_identity(GROUP,self.plan);self.backend.admit_host(GROUP,self.plan)
        alias.unlink();alias.symlink_to(self.root,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'outside frozen APP'):self.backend.launch(GROUP,self.plan)
        self.assertEqual(binding.inventory(self.root),baseline)
        self.assertFalse((self.root/'new-isolated-run').exists());self.assertFalse((outside/'new-isolated-run').exists())
        self.assertNotIn('spawn',[x[0] for x in self.ops.calls])

    def test_normal_external_alias_remains_usable_and_report_path_is_canonical(self):
        baseline=binding.inventory(self.root);outside=self.work/'external-output';outside.mkdir()
        alias=self.work/'output-alias';alias.symlink_to(outside,target_is_directory=True)
        self.spec['outputRoot']=str(alias/'new-isolated-run');owned=self.launched()
        self.assertEqual(self.backend.output_root,outside/'new-isolated-run')
        self.assertTrue((outside/'new-isolated-run/stdout.log').is_file())
        self.raw_report();report=self.backend.wait_report(owned,1,supervisor.Cancellation())
        self.assertEqual(report['rawPath'],str(outside/'new-isolated-run/report.json'))
        self.backend.verify_report(report,GROUP,self.plan)
        self.assertEqual(binding.inventory(self.root),baseline)

    def test_existing_output_and_execution_root_bounds_are_not_relaxed(self):
        baseline=binding.inventory(self.root);existing=self.work/'already-exists';existing.mkdir()
        self.spec['outputRoot']=str(existing)
        with self.assertRaisesRegex(ValueError,'new output root'):self.backend.preflight_identity(GROUP,self.plan)
        bounded=self.work/'bounded';bounded.mkdir();self.spec['executionRoot']=str(bounded)
        self.spec['outputRoot']=str(self.work/'outside-execution')
        with self.assertRaisesRegex(ValueError,'within explicit execution root'):self.backend.preflight_identity(GROUP,self.plan)
        self.assertEqual(binding.inventory(self.root),baseline);self.assertEqual(self.ops.calls,[])


if __name__=="__main__":unittest.main(verbosity=2)
