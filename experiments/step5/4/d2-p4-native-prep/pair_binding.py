"""Static final-pair binding interface; never builds/signs/runs packages."""
import json
from pathlib import Path
from core_api import binding


def _hex(value, length):
    return type(value) is str and len(value)==length and all(c in "0123456789abcdef" for c in value)


def _artifact(pin):
    if not isinstance(pin,dict) or not _hex(pin.get("sha256"),64):
        raise ValueError("hash-bound artifact receipt required")
    p=Path(pin["path"])
    if p.is_symlink() or not p.is_file() or binding.sha(p)!=pin["sha256"]:
        raise ValueError("bound artifact receipt missing/drift")


def inspect_pair(profile):
    if profile.get("version")!="D2-final-pair-profile-v1":
        raise ValueError("pair profile version")
    required=("control","candidate","declaredDiff","sameDriverInputConfigProof", "comparabilityByMetric",
              "resolvedTraceAndQualifiedDeadlines","nativeBackendReview","originalGateResolution")
    missing=[k for k in required if profile.get(k) is None]
    if missing:
        return {"status":"BLOCKED_FINAL_PAIR_BINDING","missing":missing,"nativeAdmission":False}
    for key in ("sameDriverInputConfigProof","resolvedTraceAndQualifiedDeadlines","nativeBackendReview","originalGateResolution"):
        _artifact(profile[key])
    rows=profile["comparabilityByMetric"]
    if not isinstance(rows,dict) or not rows or any(v not in ("COMPARABLE","NOT_COMPARABLE") for v in rows.values()):
        raise ValueError("explicit per-metric comparability required")
    inventories={}
    for role in ("control","candidate"):
        item=profile[role]
        if not _hex(item.get("sourceHead"),40) or not _hex(item.get("sourceTree"),40) or item.get("clean") is not True:
            raise ValueError("exact clean source identity required")
        root=Path(item["appRoot"])
        binding.compare_inventory(root,item["inventory"])
        meta_path=root/"Contents/Resources/app.nw/package-info.json"
        if meta_path.is_symlink() or binding.sha(meta_path)!=item["packageInfoSHA256"]:
            raise ValueError("package metadata bytes drift")
        meta=json.loads(meta_path.read_text())
        if meta.get("gitHead")!=item["sourceHead"] or type(meta.get("workingTreeChanges")) is not int or meta["workingTreeChanges"]!=0 or meta.get("withTests") is not True:
            raise ValueError("actual package metadata source/dirty/test mismatch")
        ci=item["exactCI"]
        if (ci.get("head")!=item["sourceHead"] or ci.get("status")!="success" or
                ci.get("forbiddenFrozenReplayNotRun") is not True):
            raise ValueError("exact CI with frozen replay excluded not established; HOLD is not acceptance")
        if set(item["artifactReceipts"])!={"build","strictSignature","runtime","exactCI","source"}:
            raise ValueError("build/signature/runtime/exactCI/source receipt set required")
        for pin in item["artifactReceipts"].values():_artifact(pin)
        inventories[role]=item["inventory"]
    if profile["control"]["sourceHead"]==profile["candidate"]["sourceHead"]:
        raise ValueError("distinct normal bridge and candidate source identities required")
    differences=binding.verify_declared_diff(inventories["control"],inventories["candidate"],profile["declaredDiff"])
    return {"status":"STATIC_PAIR_BYTES_MATCH_PENDING_INDEPENDENT_REVIEW", "differences":differences,
            "nativeAdmission":False,"signatureOrRuntimeAuthentication":"NOT_PERFORMED"}
