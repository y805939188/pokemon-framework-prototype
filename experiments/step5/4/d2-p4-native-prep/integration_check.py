#!/usr/bin/env python3
"""Read source identities and suite NAMES only; never execute or import suites."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[4]
PREFIX="experiments/step5/4/d2-p4-native-prep"
NODE="/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node"


def permitted_tool_command(argv):
    node=[NODE,"--test",PREFIX+"/test-navigation.cjs"]
    python=[sys.executable,"-B","-m","unittest","discover","-s",PREFIX,"-p","test_*.py","-v"]
    return argv==node or argv==python


def inspect(root=ROOT):
    files={
        "plugin":"src/plugins/PS_BattleFlowTest.ts",
        "scene":"src/plugins/PS_BattleFlow.ts",
        "headless":"scripts/test-headless.sh",
        "ci":".github/workflows/ci.yml"
    }
    identities={};sources={}
    for key,relative in files.items():
        raw=(root/relative).read_bytes();sources[key]=raw.decode()
        identities[relative]={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
    forbidden="experiments/step3/test-growth-differential.cjs"
    suite_lines=[i+1 for i,line in enumerate(sources["headless"].splitlines()) if forbidden in line]
    return {"version":"D2-static-integration-readonly-v1","state":"CENTRAL_INTEGRATION_PENDING_NATIVE_BLOCKED",
        "files":identities,"newNormalRoutePresent":'mode === "d2-normal-f100"' in sources["plugin"],
        "oldFrozenReplayReachableFromGenericHeadless":bool(suite_lines),"forbiddenSuiteName":forbidden,
        "headlessLines":suite_lines,"genericQuickHeadlessCIAllowedByThisTask":False,
        "suiteBodiesOrFrozenDataRead":False,"commandsExecuted":0,"hostQueries":0,"NW":0,
        "pausedSharedTargets":[files["plugin"],files["headless"],files["ci"]],
        "required":["central normal-route registration/actual App fixture and packaging decision",
                    "frozen-replay exclusion independently checked before any generic entry/CI",
                    "final product/control pair and qualified full trace/deadlines",
                    "original denied host gate resolution and native permit"]}


if __name__=="__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    print(json.dumps(inspect(),ensure_ascii=False,indent=2))
