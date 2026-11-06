import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from core_api import binding
from pair_binding import inspect_pair
from integration_check import inspect,permitted_tool_command,NODE,PREFIX


class StaticControls(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        p=self.root/"receipt";p.write_text("TOOL_FIXTURE_NOT_CI_SIGNATURE_OR_AUTHORITY")
        self.pin={"path":str(p),"sha256":binding.sha(p)}

    def pair(self):
        profile={"version":"D2-final-pair-profile-v1","declaredDiff":{},
            "comparabilityByMetric":{"totalMs":"COMPARABLE","old159ms":"NOT_COMPARABLE"}}
        for k in ("sameDriverInputConfigProof","resolvedTraceAndQualifiedDeadlines","nativeBackendReview","originalGateResolution"):profile[k]=copy.deepcopy(self.pin)
        for role,head in (("control","a"*40),("candidate","b"*40)):
            root=self.root/(role+".app");target=root/"Contents/Resources/app.nw";target.mkdir(parents=True)
            meta=target/"package-info.json";meta.write_text(json.dumps({"gitHead":head,"workingTreeChanges":0,"withTests":True}))
            profile[role]={"appRoot":str(root),"sourceHead":head,"sourceTree":"c"*40,"clean":True,
                "inventory":binding.inventory(root),"packageInfoSHA256":binding.sha(meta),
                "exactCI":{"head":head,"status":"success","forbiddenFrozenReplayNotRun":True},
                "artifactReceipts":{k:copy.deepcopy(self.pin) for k in ("build","strictSignature","runtime","exactCI","source")}}
        a=profile["control"]["inventory"];b=profile["candidate"]["inventory"]
        profile["declaredDiff"]={p:{"control":a.get(p),"candidate":b.get(p),"reason":"synthetic package metadata only"} for p in set(a)|set(b) if a.get(p)!=b.get(p)}
        return profile

    def test_unbound_pair_is_blocked_without_fabricating_product(self):
        p=Path(__file__).with_name("final-pair-template.json")
        x=inspect_pair(json.loads(p.read_text()));self.assertEqual(x["status"],"BLOCKED_FINAL_PAIR_BINDING");self.assertFalse(x["nativeAdmission"])

    def test_complete_fixture_pair_only_proves_static_bytes(self):
        row=inspect_pair(self.pair())
        self.assertEqual(row["status"],"STATIC_PAIR_BYTES_MATCH_PENDING_INDEPENDENT_REVIEW")
        self.assertEqual(row["signatureOrRuntimeAuthentication"],"NOT_PERFORMED");self.assertFalse(row["nativeAdmission"])

    def test_old_CI_with_frozen_replay_or_HOLD_cannot_be_reused(self):
        p=self.pair();p["candidate"]["exactCI"]["forbiddenFrozenReplayNotRun"]=False
        with self.assertRaises(ValueError):inspect_pair(p)
        p["candidate"]["exactCI"]["forbiddenFrozenReplayNotRun"]=True;p["candidate"]["exactCI"]["status"]="HOLD"
        with self.assertRaises(ValueError):inspect_pair(p)

    def test_wrong_ci_head_or_missing_signature_receipt_rejected(self):
        p=self.pair();p["candidate"]["exactCI"]["head"]="d"*40
        with self.assertRaises(ValueError):inspect_pair(p)
        p["candidate"]["exactCI"]["head"]=p["candidate"]["sourceHead"];del p["candidate"]["artifactReceipts"]["strictSignature"]
        with self.assertRaises(ValueError):inspect_pair(p)

    def test_pair_payload_or_metadata_drift_rejected(self):
        p=self.pair();root=Path(p["candidate"]["appRoot"]);(root/"unlisted").write_text("new")
        with self.assertRaises(ValueError):inspect_pair(p)

    def test_missing_diff_path_and_broad_waiver_rejected(self):
        p=self.pair();p["declaredDiff"]={"Contents":{}}
        with self.assertRaises(ValueError):inspect_pair(p)

    def test_static_inspector_reads_only_source_and_suite_names(self):
        files={"src/plugins/PS_BattleFlowTest.ts":"mode === \"d1-benchmark\"", "src/plugins/PS_BattleFlow.ts":"inputState",
            "scripts/test-headless.sh":"experiments/step3/test-growth-differential.cjs\nnode --test suite\n", ".github/workflows/ci.yml":"run: scripts/ci-run.sh\n"}
        for name,text in files.items():
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
        with patch("subprocess.run",side_effect=AssertionError("must not execute")),patch("subprocess.Popen",side_effect=AssertionError("must not execute")):
            x=inspect(self.root)
        self.assertTrue(x["oldFrozenReplayReachableFromGenericHeadless"])
        self.assertFalse(x["suiteBodiesOrFrozenDataRead"]);self.assertEqual(x["commandsExecuted"],0)
        self.assertFalse(x["newNormalRoutePresent"])

    def test_exact_new_tool_commands_only_no_generic_or_old_replay(self):
        self.assertTrue(permitted_tool_command([NODE,"--test",PREFIX+"/test-navigation.cjs"]))
        self.assertTrue(permitted_tool_command([sys.executable,"-B","-m","unittest","discover","-s",PREFIX,"-p","test_*.py","-v"]))
        for argv in (["scripts/test-headless.sh"],["scripts/test-quick.sh"],[NODE,"--test"],
                     [NODE,"--test","experiments/step3/test-growth-differential.cjs"],
                     [NODE,"--test",PREFIX+"/test-navigation.cjs","experiments/step3/test-growth-differential.cjs"]):
            with self.subTest(argv=argv):self.assertFalse(permitted_tool_command(argv))


if __name__=="__main__":unittest.main(verbosity=2)
