#!/usr/bin/env python3
"""Offline positive/negative preparation and supervisor-reference controls."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
import validate as prep
from protocol_model import Cancelled, GateDenied, supervise_model


class PreparationControls(unittest.TestCase):
    def setUp(self):
        self.contract = prep.load(prep.ROOT / "contract.json")
        self.workload = prep.load(prep.ROOT / "workload-proposal.json")
        self.pins = prep.load(prep.ROOT / "execution-pins.json")
        self.donor = prep.load(prep.REPO / "experiments/step5/4/d1/f100-v1.json")
        self.budget = prep.load(prep.REPO / "docs/step5/perf-budget.json")

    def check(self):
        return prep.validate(self.contract, self.workload, self.pins, self.donor, self.budget)

    def test_positive_has_no_native_battles(self):
        result = self.check()
        self.assertEqual((result["actualNativeProcesses"], result["actualBattles"]), (0, 0))
        self.assertEqual(result["performanceResult"], "NOT_RUN")
        self.assertEqual(result["independentReview"], "PENDING")

    def test_seed_mutation_rejected(self):
        self.workload["business"]["cases"][73]["seed"][-1] += 1
        with self.assertRaises(ValueError): self.check()

    def test_boolean_numeric_alias_rejected(self):
        self.workload["business"]["cases"][0]["seed"][0] = True
        with self.assertRaises(ValueError): self.check()

    def test_case_missing_or_reordered_rejected(self):
        for mode in ("empty", "missing", "duplicate", "reordered"):
            with self.subTest(mode=mode):
                original = copy.deepcopy(self.workload)
                cases = self.workload["business"]["cases"]
                if mode == "empty": cases.clear()
                if mode == "missing": cases.pop()
                if mode == "duplicate": cases[1] = copy.deepcopy(cases[0])
                if mode == "reordered": cases[0], cases[1] = cases[1], cases[0]
                with self.assertRaises(ValueError): self.check()
                self.workload = original

    def test_donor_field_loss_rejected(self):
        del self.workload["business"]["cases"][2]["expected"]["heldConsumed"]
        with self.assertRaises(ValueError): self.check()

    def test_fast_or_effects_off_rejected(self):
        for key, value in (("fast", True), ("battleEffects", False)):
            with self.subTest(key=key):
                original = copy.deepcopy(self.workload)
                self.workload["presentation"][key] = value
                with self.assertRaises(ValueError): self.check()
                self.workload = original

    def test_group_loss_or_gc_pooled_into_natural_rejected(self):
        self.contract["runs"]["naturalMedianModes"].append("GC1")
        with self.assertRaises(ValueError): self.check()

    def test_group_reordering_rejected(self):
        self.contract["runs"]["groups"].reverse()
        with self.assertRaises(ValueError): self.check()

    def test_warning_budget_relaxation_rejected(self):
        self.contract["thresholds"]["factor"] = 1.3
        with self.assertRaises(ValueError): self.check()

    def test_legacy_memory_budget_mutation_rejected(self):
        self.contract["thresholds"]["historicalMemory100"]["warnAbove"] = 20
        with self.assertRaises(ValueError): self.check()

    def test_old_d1_timeout_cannot_be_promoted(self):
        self.contract["deadlines"]["processSeconds"] = 900
        with self.assertRaises(ValueError): self.check()

    def test_preparation_cannot_claim_host_or_final_product(self):
        for key, value in (("nativeExecutionGranted", True),
                           ("finalProduct", self.pins["preparationBase"]),
                           ("comparableControl", self.pins["preparationBase"])):
            with self.subTest(key=key):
                original = copy.deepcopy(self.pins)
                self.pins[key] = value
                with self.assertRaises(ValueError): self.check()
                self.pins = original

    def test_unreviewed_filled_pin_cannot_turn_this_into_executor(self):
        self.pins["required"]["namedExecutorAndExclusiveHostLease"] = "self-approved"
        with self.assertRaises(ValueError): self.check()

    def test_host_denial_cannot_be_erased(self):
        self.contract["host"]["admission"] = "IDLE_ASSUMED"
        with self.assertRaises(ValueError): self.check()

    def test_duplicate_keys_and_nonfinite_json_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "bad.json"
            for text in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}', '{"a":1e999}'):
                with self.subTest(text=text):
                    p.write_text(text)
                    with self.assertRaises(ValueError): prep.load(p)

    def test_actual_input_locks(self):
        prep.check_locks(prep.load(prep.ROOT / "input-lock.json"))

    def test_input_hash_drift_rejected(self):
        lock = prep.load(prep.ROOT / "input-lock.json")
        next(iter(lock["files"].values()))["sha256"] = "0" * 64
        with self.assertRaises(ValueError): prep.check_locks(lock)


class FinallyReferenceControls(unittest.TestCase):
    expected = ["A", "B"]

    def model(self, failures=None, actual=None):
        failures = failures or {}
        hooks = {}
        for stage in ("freeze", "host_admission", "native_run", "semantic_verify",
                      "owned_cleanup", "final_identity", "after_idle"):
            def hook(stage=stage):
                if stage in failures: raise failures[stage]
                return self.expected if actual is None else actual
            hooks[stage] = hook
        # Any accidental real native/process/network operation invalidates tests.
        with patch("subprocess.Popen", side_effect=AssertionError("no real process")), \
             patch("os.kill", side_effect=AssertionError("no real signal")), \
             patch("socket.socket", side_effect=AssertionError("no network")):
            return supervise_model(hooks, self.expected)

    def test_positive_pure_trace_never_counts_battles(self):
        result = self.model()
        self.assertEqual(result["status"], "CONTROL_PASS")
        self.assertEqual(result["totalBattles"], 0)
        self.assertEqual(result["kind"], "PURE_CONTROL_NOT_NATIVE_NOT_P4")
        self.assertTrue(result["stopNextRun"])

    def test_denied_host_gate_has_zero_launch_and_no_second_query(self):
        result = self.model({"host_admission": GateDenied("prior ps denial")})
        self.assertEqual(result["status"], "BLOCKED")
        self.assertFalse(result["nativeStarted"])
        self.assertEqual(result["calls"], ["freeze", "host_admission"])

    def test_identity_precheck_failure_never_queries_host(self):
        result = self.model({"freeze": ValueError("APP changed")})
        self.assertEqual(result["calls"], ["freeze"])

    def test_fatal_timeout_and_uncertain_launch_attempt_all_preserve_tail(self):
        for exc in (RuntimeError("fatal"), TimeoutError("deadline"),
                    RuntimeError("Popen outcome uncertain")):
            with self.subTest(error=str(exc)):
                result = self.model({"native_run": exc})
                self.assertEqual(result["status"], "FAIL_STOP")
                self.assertEqual(result["primary"]["stage"], "native_run")
                self.assertEqual(result["calls"][-3:],
                                 ["owned_cleanup", "final_identity", "after_idle"])

    def test_first_error_survives_cleanup_denial_and_final_failure(self):
        result = self.model({"native_run": RuntimeError("fatal first"),
                             "owned_cleanup": PermissionError("EPERM"),
                             "final_identity": ValueError("changed"),
                             "after_idle": GateDenied("denied")})
        self.assertEqual(result["primary"]["message"], "fatal first")
        self.assertEqual([x["stage"] for x in result["tailErrors"]],
                         ["owned_cleanup", "final_identity", "after_idle"])

    def test_cleanup_failure_is_fail_and_other_tails_still_attempted(self):
        result = self.model({"owned_cleanup": PermissionError("EPERM")})
        self.assertEqual(result["status"], "FAIL_STOP")
        self.assertEqual(result["primary"]["stage"], "owned_cleanup")
        self.assertEqual(result["calls"][-2:], ["final_identity", "after_idle"])

    def test_missing_empty_duplicate_reordered_ids_fail_before_success(self):
        for ids in ([], ["A"], ["A", "A"], ["B", "A"]):
            with self.subTest(ids=ids):
                result = self.model(actual=ids)
                self.assertEqual(result["status"], "FAIL_STOP")
                self.assertEqual(result["primary"]["stage"], "semantic_verify")
                self.assertEqual(result["calls"][-1], "after_idle")

    def test_tail_identity_or_idle_failure_never_passes(self):
        for stage in ("final_identity", "after_idle"):
            with self.subTest(stage=stage):
                result = self.model({stage: GateDenied("no permission")})
                self.assertEqual(result["status"], "FAIL_STOP")
                self.assertEqual(result["calls"].count(stage), 1)

    def test_int_term_hup_reference_cancellation_retains_cleanup(self):
        for signal in ("SIGINT", "SIGTERM", "SIGHUP"):
            with self.subTest(signal=signal):
                result = self.model({"native_run": Cancelled(signal)})
                self.assertEqual(result["primary"]["type"], "Cancelled")
                self.assertEqual(result["status"], "FAIL_STOP")
                self.assertEqual(result["calls"][-1], "after_idle")


if __name__ == "__main__":
    unittest.main(verbosity=2)
