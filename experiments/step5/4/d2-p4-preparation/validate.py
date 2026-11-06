#!/usr/bin/env python3
"""Offline preparation check only. No host query, spawn, network or native mode."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
KINDS = ["wild-win", "wild-capture", "trainer-win", "trainer-loss-D3"]
GROUPS = [f"{side}-{mode}" for mode in
          ("natural1", "natural2", "natural3", "instrumentOff", "GC1")
          for side in ("control", "candidate")]


def load(path):
    # Reject duplicate JSON keys and nonfinite values, also in pure controls.
    def pairs(rows):
        obj = {}
        for key, value in rows:
            if key in obj:
                raise ValueError("duplicate JSON key: " + key)
            obj[key] = value
        return obj
    def bad_constant(value):
        raise ValueError("nonfinite JSON: " + value)
    def finite_float(value):
        result = float(value)
        if not math.isfinite(result):
            raise ValueError("nonfinite JSON number: " + value)
        return result
    return json.loads(path.read_text(), object_pairs_hook=pairs,
                      parse_constant=bad_constant, parse_float=finite_float)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def validate(contract, workload, pins, donor, budget):
    require(contract["version"] == "D2-P4-preparation-contract-v1", "contract version")
    require(contract["state"] == "PROPOSAL_PENDING_INDEPENDENT_REVIEW", "proposal state")
    require(contract["executionEnabled"] is False, "preparation cannot enable execution")
    require(workload["version"] == "D2-normal-F100-proposal-v1", "workload version")
    # Python equality considers True == 1: canonical JSON comparison retains type.
    require(json.dumps(workload["business"], sort_keys=True) ==
            json.dumps(donor, sort_keys=True), "all donor business fields/types retained")
    cases = workload["business"]["cases"]
    require(type(workload["business"]["count"]) is int and
            workload["business"]["count"] == 100 and len(cases) == 100,
            "exact hundred cases")
    require([c["id"] for c in cases] == [f"F100-{i+1:03d}" for i in range(100)],
            "exact ordered nonempty unique case IDs")
    for i, case in enumerate(cases):
        require(type(case["ordinal"]) is int and case["ordinal"] == i,
                "ordinal type/order")
        require(case["kind"] == KINDS[i % 4], "25 rounds x four kinds")
        require(case["round"] == i // 4 + 1, "round order")
        require(case["seed"] == [1, 2, 3, 4+i] and
                all(type(x) is int for x in case["seed"]), "exact integer seed")
        require(case["request"]["battleId"] == case["id"], "battle identity")
    policy = workload["presentation"]
    require(policy["fast"] is False and policy["battleEffects"] is True,
            "normal presentation cannot be fast or effects-off")
    require(policy["inputPolicy"] == "ONE_SHOT_AFTER_SEMANTIC_READY_NO_FAST_FORWARD",
            "input policy")
    require(set(workload["semanticSteps"]) ==
            {step for case in cases for step in case["steps"]},
            "every donor semantic step has one normal adapter specification")
    require(policy["normalTraceResolved"] is False,
            "unimplemented normal trace must not be promoted")
    require(contract["runs"]["groups"] == GROUPS, "ten exact alternating groups")
    require(contract["runs"]["battlesPerProcess"] == 100 and
            contract["runs"]["formalProcesses"] == 10 and
            contract["runs"]["formalBattles"] == 1000, "formal totals")
    require(contract["runs"]["naturalMedianModes"] ==
            ["natural1", "natural2", "natural3"], "natural only medians")
    require(contract["runs"]["retry"] == "NONE_STOP_ON_FIRST_FAILURE",
            "no retry to green")
    require(contract["host"]["admission"] == "BLOCKED_PRIOR_OCCUPANCY_DENIAL",
            "existing host denial preserved")
    require(contract["host"]["launchInThisCandidate"] is False,
            "no launch in preparation")
    require(contract["thresholds"]["factor"] == budget["factor"] == 1.2,
            "original warning factor")
    require(contract["thresholds"]["historicalMemory100"] == budget["memory100"],
            "original memory definition and units unchanged")
    require(contract["thresholds"]["severity"] == "WARN_ONLY", "warning severity")
    require(contract["thresholds"]["newHardPerfThreshold"] is None,
            "no invented hard performance limit")
    require(contract["deadlines"]["processSeconds"] is None and
            contract["deadlines"]["qualificationInputs"] is None,
            "no fabricated qualified timeout")
    require(pins["state"] == "PREPARATION_ONLY_NATIVE_NOT_ADMITTED", "pin state")
    require(pins["finalProduct"] is None and pins["comparableControl"] is None,
            "preparation anchor must not become final product/control")
    require(pins["nativeExecutionGranted"] is False, "no native authorization claim")
    require(pins["required"] and all(v is None for v in pins["required"].values()),
            "unresolved real execution pins remain explicit")
    return dict(kind="PREPARATION_VALID_NOT_NATIVE_NOT_P4", status="PASS",
                businessCases=100, formalGroupsPlanned=10,
                actualNativeProcesses=0, actualBattles=0,
                performanceResult="NOT_RUN", independentReview="PENDING")


def check_locks(lock):
    for relative, expected in lock["files"].items():
        path = REPO / relative
        require(path.is_file() and not path.is_symlink(), "missing/linked input " + relative)
        require(sha(path) == expected["sha256"] and path.stat().st_size == expected["bytes"],
                "input drift " + relative)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "admission"])
    args = parser.parse_args()
    check_locks(load(ROOT / "input-lock.json"))
    result = validate(load(ROOT / "contract.json"), load(ROOT / "workload-proposal.json"),
                      load(ROOT / "execution-pins.json"),
                      load(REPO / "experiments/step5/4/d1/f100-v1.json"),
                      load(REPO / "docs/step5/perf-budget.json"))
    if args.command == "admission":
        result.update(status="BLOCKED", kind="NATIVE_NOT_ADMITTED",
                      blockers=load(ROOT / "execution-pins.json")["required"],
                      host="Prior occupancy denial unresolved; no query or launch attempted")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, TypeError) as error:
        print(json.dumps(dict(kind="PREPARATION_INVALID_NOT_NATIVE_NOT_P4",
                              status="FAIL", error=str(error))), file=sys.stderr)
        sys.exit(1)
