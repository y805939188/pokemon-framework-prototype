import copy
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
from supervisor import GROUPS, OwnedProcess, HostAdmission, Supervisor, Cancellation, AdmissionDenied, Cancelled


def plan():
    return dict(groups=list(GROUPS), caseIds=[f"F100-{i+1:03d}" for i in range(100)],
                nonce="fixture-not-native", deadlineSeconds={g:30 for g in GROUPS})


class Backend:
    kind = "TOOL_FIXTURE_NOT_NATIVE"

    def __init__(self, failures=None):
        self.failures = failures or {}
        self.calls = []
        self.current_group = None
        self.raw = dict(caseIds=plan()["caseIds"], exit=0, fatal=False, timeout=False)
        self.cleanup = "ABSENT"
        self.reconcile = None
        self.admission_override = False
        self.cancel = None

    def check(self, stage, *args):
        self.calls.append((self.current_group, stage, args))
        failure = self.failures.get((self.current_group, stage), self.failures.get(stage))
        if failure: raise failure

    def preflight_identity(self, group, p):
        self.current_group = group
        self.check("preflight_identity", group)
        return "VERIFIED_UNCHANGED"

    def admit_host(self, group, p):
        self.check("admit_host", group)
        if self.admission_override is not False: return self.admission_override
        return HostAdmission(p["nonce"], group, "VERIFIED_IDLE", True, "a"*64)

    def launch(self, group, p):
        self.check("launch", group)
        return OwnedProcess(101, 101, "fixture-birth", p["nonce"], group)

    def wait_report(self, owned, deadline, cancellation):
        self.check("wait_report", owned, deadline)
        self.last_deadline = deadline
        return copy.deepcopy(self.raw)

    def verify_report(self, report, group, p):
        self.check("verify_report", group)

    def reconcile_launch(self, group, p):
        self.check("reconcile_launch", group)
        return self.reconcile

    def cleanup_owned(self, owned):
        self.check("cleanup_owned", owned)
        if self.cancel: self.cancel.request("SIGINT during cleanup")
        return self.cleanup

    def final_identity(self, group, p):
        self.check("final_identity", group)
        return "VERIFIED_UNCHANGED"

    def after_idle(self, group, p):
        self.check("after_idle", group)
        return "VERIFIED_IDLE"


class SupervisorControls(unittest.TestCase):
    def run_core(self, backend=None, p=None, cancellation=None, journal=None):
        b = backend or Backend()
        records = []
        with patch("subprocess.Popen", side_effect=AssertionError("no OS process")), \
             patch("os.kill", side_effect=AssertionError("no OS signal")), \
             patch("socket.socket", side_effect=AssertionError("no network")):
            out = Supervisor(b, lambda:10, journal or records.append, cancellation).run(p or plan())
        return out, b, records

    def test_full_ten_fake_groups_never_claim_native_or_acceptance(self):
        out, b, records = self.run_core()
        self.assertEqual([r["group"] for r in out["groups"]], GROUPS)
        self.assertEqual(out["status"], "CORE_COMPLETED_PENDING_REVIEW")
        self.assertEqual((out["nativeBattleClaims"], out["acceptance"]), (0,"NOT_GRANTED"))
        self.assertEqual(len(records),20)
        self.assertEqual(b.last_deadline,40)
        self.assertTrue(all(r["cleanup"]=="ABSENT" for r in out["groups"]))

    def test_denied_gate_never_launches_or_queries_again(self):
        out,b,_=self.run_core(Backend({"admit_host":AdmissionDenied("original denied")}))
        self.assertEqual(out["status"],"BLOCKED")
        self.assertEqual([x[1] for x in b.calls],["preflight_identity","admit_host"])

    def test_none_bool_or_wrong_nonce_not_host_receipt(self):
        for receipt in (None,True,HostAdmission("old",GROUPS[0],"VERIFIED_IDLE",True,"a"*64)):
            with self.subTest(receipt=receipt):
                b=Backend();b.admission_override=receipt
                out,b,_=self.run_core(b)
                self.assertEqual(out["status"],"BLOCKED")
                self.assertNotIn("launch",[x[1] for x in b.calls])

    def test_unqualified_deadlines_and_reordered_ids_rejected_before_backend(self):
        for field,value in (("deadlineSeconds",{}),("deadlineSeconds",{g:True for g in GROUPS}),
                            ("deadlineSeconds",{g:float('inf') for g in GROUPS}),
                            ("caseIds",list(reversed(plan()["caseIds"]))),
                            ("groups",GROUPS[:-1]),("nonce",True)):
            with self.subTest(field=field,value=str(value)[:30]):
                p=plan();p[field]=value;b=Backend()
                with self.assertRaises(ValueError):self.run_core(b,p)
                self.assertEqual(b.calls,[])

    def test_exit_fatal_timeout_and_ids_checked_before_semantic_backend(self):
        for key,value in (("exit",1),("exit",False),("fatal",True),("timeout",True),("caseIds",[])):
            with self.subTest(key=key):
                b=Backend();b.raw[key]=value;out,b,_=self.run_core(b)
                self.assertEqual(out["status"],"FAIL_STOP")
                self.assertNotIn("verify_report",[x[1] for x in b.calls])
                self.assertEqual([x[1] for x in b.calls][-3:],["cleanup_owned","final_identity","after_idle"])

    def test_business_failure_survives_multiple_tail_failures(self):
        out,_,_=self.run_core(Backend({"verify_report":ValueError("state mismatch"),
            "cleanup_owned":PermissionError("EPERM"),"final_identity":ValueError("mutated"),
            "after_idle":AdmissionDenied("denied")}))
        row=out["groups"][0]
        self.assertEqual(row["primary"]["message"],"state mismatch")
        self.assertEqual([x["stage"] for x in row["tailErrors"]],["cleanup_owned","final_identity","after_idle"])
        self.assertEqual(len(out["groups"]),1)

    def test_uncertain_launch_reconciled_before_any_cleanup(self):
        b=Backend({"launch":RuntimeError("lost Popen response")})
        b.reconcile=OwnedProcess(102,102,"fixture-birth","fixture-not-native",GROUPS[0])
        out,b,_=self.run_core(b)
        calls=[x[1] for x in b.calls]
        self.assertLess(calls.index("reconcile_launch"),calls.index("cleanup_owned"))
        self.assertFalse(out["groups"][0]["uncertainty"])
        self.assertEqual(out["groups"][0]["cleanup"],"ABSENT")

    def test_unproven_launch_identity_gets_no_cleanup_signal_or_idle_query(self):
        out,b,_=self.run_core(Backend({"launch":RuntimeError("uncertain")}))
        self.assertTrue(out["groups"][0]["uncertainty"])
        self.assertNotIn("cleanup_owned",[x[1] for x in b.calls])
        self.assertNotIn("after_idle",[x[1] for x in b.calls])
        self.assertIn("final_identity",[x[1] for x in b.calls])

    def test_foreign_reconciliation_receipt_never_cleanup(self):
        for receipt in (OwnedProcess(103,103,"old birth","wrong nonce",GROUPS[0]),
                        OwnedProcess(103,103,True,"fixture-not-native",GROUPS[0])):
            with self.subTest(receipt=receipt):
                b=Backend({"launch":RuntimeError("uncertain")});b.reconcile=receipt
                _,b,_=self.run_core(b)
                self.assertNotIn("cleanup_owned",[x[1] for x in b.calls])

    def test_owned_helpers_unknown_stops_next_group(self):
        b=Backend();b.cleanup="UNKNOWN";out,b,_=self.run_core(b)
        self.assertEqual((out["status"],len(out["groups"])),("FAIL_STOP",1))

    def test_cancellation_before_launch_is_zero_attempts(self):
        token=Cancellation();token.request("SIGTERM")
        out,b,_=self.run_core(cancellation=token)
        self.assertEqual(b.calls,[])
        self.assertFalse(out["groups"][0]["launchAttempted"])

    def test_cancellation_during_cleanup_deferred_until_all_tails(self):
        token=Cancellation();b=Backend();b.cancel=token
        out,b,_=self.run_core(b,cancellation=token)
        self.assertEqual(out["status"],"FAIL_STOP")
        self.assertEqual([x[1] for x in b.calls][-3:],["cleanup_owned","final_identity","after_idle"])
        self.assertEqual(out["groups"][0]["primary"]["stage"],"deferred_cancel")

    def test_wait_cancellation_has_one_cleanup_and_first_signal(self):
        for name in ("SIGINT","SIGTERM","SIGHUP"):
            with self.subTest(name=name):
                out,b,_=self.run_core(Backend({"wait_report":Cancelled(name)}))
                self.assertEqual(out["groups"][0]["primary"]["message"],name)
                self.assertEqual([x[1] for x in b.calls].count("cleanup_owned"),1)

    def test_later_group_failure_retains_prior_groups_and_no_retry(self):
        out,b,_=self.run_core(Backend({(GROUPS[2],"verify_report"):ValueError("third")}))
        self.assertEqual(len(out["groups"]),3)
        self.assertEqual([r["status"] for r in out["groups"]],
                         ["CORE_GROUP_VERIFIED","CORE_GROUP_VERIFIED","FAIL_STOP"])

    def test_receipt_io_failure_before_launch_prevents_native(self):
        def broken(_):raise OSError("disk full")
        out,b,_=self.run_core(journal=broken)
        self.assertEqual(b.calls,[])
        self.assertEqual(out["status"],"BLOCKED")

    def test_final_receipt_failure_after_success_is_fail_stop(self):
        def journal(row):
            if row["event"]=="finished":raise OSError("final write failure")
        out,b,_=self.run_core(journal=journal)
        self.assertEqual(out["status"],"FAIL_STOP")
        self.assertEqual(out["groups"][0]["primary"]["stage"],"journal-final")

    def test_backend_returning_after_deadline_or_clock_reversal_cannot_pass(self):
        for end in (41,9):
            with self.subTest(end=end):
                b=Backend();times=iter([10,end])
                out=Supervisor(b,lambda:next(times),lambda row:None).run(plan())
                self.assertEqual(out["status"],"FAIL_STOP")
                self.assertEqual([x[1] for x in b.calls][-3:],["cleanup_owned","final_identity","after_idle"])


if __name__ == "__main__":unittest.main(verbosity=2)
