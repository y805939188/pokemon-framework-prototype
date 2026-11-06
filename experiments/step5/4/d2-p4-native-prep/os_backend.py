"""Dormant macOS backend. Default permit denies ALL OS operations.

No CLI, auto-installation, host scan, or alternative occupancy command exists.
The original authorized host gate and actual package-core verifier must be bound
by the central owner after their separate review. Unit tests use scripted Ops.
"""
from dataclasses import dataclass, asdict
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import time
from core_api import AdmissionDenied, OwnedProcess, HostAdmission, binding


def positive(value, name):
    if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
        raise ValueError("explicit finite bound required: " + name)
    return value


class ClosedPermit:
    def check(self, action, target):
        raise AdmissionDenied("native permit closed: " + action)


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    ppid: int
    pgid: int
    birth: str
    rss_bytes: int
    executable: str


def parse_identity(stdout, pid):
    lines = stdout.strip().splitlines()
    if len(lines) != 1:
        raise ValueError("one exact owned PID row required")
    parts = lines[0].split(None, 9)
    if len(parts) != 10 or any(not parts[i].isdigit() for i in (0,1,2,8)):
        raise ValueError("owned PID identity fields missing")
    row = ProcessIdentity(int(parts[0]), int(parts[1]), int(parts[2]),
                          " ".join(parts[3:8]), int(parts[8])*1024, parts[9])
    if row.pid != pid or row.pid <= 0 or row.pgid <= 0 or not row.executable:
        raise ValueError("wrong owned PID identity")
    return row


class SystemOps:
    """Real stdlib operations behind a default-closed permission port.

    The permit is a reviewed integration callback, never a JSON true flag.
    This module does not implement or grant that permission.
    """
    def __init__(self, permit=None):
        self.permit = permit or ClosedPermit()

    def run(self, argv, timeout, action):
        positive(timeout, "command timeout")
        self.permit.check(action, tuple(argv))
        return subprocess.run(argv, capture_output=True, text=True, timeout=timeout)

    def identity(self, pid, timeout):
        result = self.run(["/bin/ps", "-p", str(pid), "-o", "pid=,ppid=,pgid=,lstart=,rss=,comm="], timeout, "query_owned_pid")
        if result.returncode == 1 and not result.stdout.strip() and not result.stderr.strip():
            raise ProcessLookupError("owned PID absent")
        if result.returncode:
            raise RuntimeError("owned PID query failed: " + result.stderr.strip())
        return parse_identity(result.stdout, pid)

    def children(self, pid, timeout):
        result = self.run(["/usr/bin/pgrep", "-P", str(pid)], timeout, "query_owned_direct_children")
        if result.returncode == 1 and not result.stdout.strip() and not result.stderr.strip():
            return []
        if result.returncode or any(not x.isdigit() for x in result.stdout.split()):
            raise RuntimeError("direct-child query failed/denied")
        return [int(x) for x in result.stdout.split()]

    def spawn(self, argv, cwd, env, stdout, stderr):
        self.permit.check("launch_bound_nw", tuple(argv))
        return subprocess.Popen(argv, cwd=cwd, env=env, stdout=stdout, stderr=stderr,
                                start_new_session=True)

    def poll(self, child):
        self.permit.check("wait_owned_child", child.pid)
        return child.poll()

    def collector_pid(self):
        self.permit.check("own_collector_pid", ())
        return os.getpid()

    def group_absent(self, pgid):
        self.permit.check("probe_owned_group", pgid)
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return True
        # EPERM is UNKNOWN, never absence.
        return False

    def signal_group(self, pgid, number):
        self.permit.check("signal_owned_group", (pgid, number))
        os.killpg(pgid, number)

    @staticmethod
    def now():
        return time.monotonic()

    @staticmethod
    def sleep(seconds):
        time.sleep(min(positive(seconds, "poll interval"), .05))


class MacOSBackend:
    kind = "DORMANT_MACOS_BACKEND_NOT_ADMITTED"

    def __init__(self, specs, nonce, ops=None, original_gate=None, after_gate=None,
                 report_verifier=None):
        self.specs, self.nonce = specs, nonce
        self.ops = ops or SystemOps()
        self.original_gate, self.after_gate = original_gate, after_gate
        self.report_verifier = report_verifier
        self.children_by_group = {}
        self.owners = {}
        self.spec = None
        self.group = None
        self.preflighted = False
        self.admitted = None
        self.attempted_groups = set()
        self.observed_identities = {}
        self.output_root = None
        self.protected_app_roots = set()

    @staticmethod
    def _inside_app(physical, root):
        if physical==root or physical.is_relative_to(root):
            return True
        # resolve() may retain case aliases on a case-insensitive filesystem.
        # Compare existing output ancestors to the explicit APP identity too.
        for ancestor in (physical, *physical.parents):
            try:
                if ancestor.samefile(root):
                    return True
            except FileNotFoundError:
                continue
        return False

    def _validated_output_root(self):
        """Read-only boundary check, repeated before every collector file write."""
        output=Path(self.spec["outputRoot"])
        physical=output.resolve()
        app=Path(self.spec["appRoot"]).resolve(strict=True)
        execution=Path(self.spec["executionRoot"]).resolve()
        if not output.is_absolute() or not physical.is_relative_to(execution):
            raise ValueError("output must remain within explicit execution root")
        if any(self._inside_app(physical,root) for root in self.protected_app_roots|{app}):
            raise ValueError("output root must remain outside frozen APP")
        if output.exists() or output.is_symlink() or physical.exists():
            raise ValueError("new output root required; no retry/overwrite")
        return physical

    def preflight_identity(self, group, plan):
        self.group, self.spec = group, copy.deepcopy(self.specs[group])
        self.preflighted, self.admitted, self.output_root = False, None, None
        if plan["nonce"] != self.nonce:
            raise ValueError("wrong execution nonce")
        spec = self.spec
        fields = ("appRoot","inventory","argv","cwd","env","executionRoot","outputRoot","receipts",
                  "commandTimeout","cleanupGrace","cleanupKillWait","maxReportBytes","maxOwnedPids")
        if not isinstance(spec,dict) or any(spec.get(k) is None for k in fields):
            raise AdmissionDenied("final native group binding incomplete")
        for key in ("commandTimeout", "cleanupGrace", "cleanupKillWait", "maxReportBytes", "maxOwnedPids"):
            positive(spec[key], key)
        # Actual final products, integration and CI-boundary disposition are
        # absent now. Hash-bound receipts are necessary, never authority alone.
        required = {"product", "driverRouting", "normalTrace", "qualifiedDeadlines",
                    "ciBoundaryDisposition", "nativeAuthorization", "priorDenialResolution"}
        if set(spec["receipts"]) != required:
            raise AdmissionDenied("real product/integration/CI/authorization receipts missing")
        for pin in spec["receipts"].values():
            p = Path(pin["path"])
            if p.is_symlink() or not p.is_file() or binding.sha(p) != pin["sha256"]:
                raise ValueError("receipt missing or changed")
        if not callable(self.report_verifier):
            raise AdmissionDenied("actual Node/package-core verifier not bound")
        root = Path(spec["appRoot"]).resolve(strict=True)
        binding.compare_inventory(root, spec["inventory"])
        executable = root / "Contents/MacOS/nwjs"
        project = root / "Contents/Resources/app.nw"
        if (not isinstance(spec["argv"],list) or len(spec["argv"])<2 or
                not all(type(x) is str for x in spec["argv"]) or
                spec["argv"][:2] != [str(executable),str(project)] or
                spec["cwd"] != str(project) or not executable.is_file() or not project.is_dir()):
            raise ValueError("exact frozen NW executable required")
        self.protected_app_roots.add(root)
        self.protected_app_roots.update(Path(item["appRoot"]).resolve(strict=True)
            for item in self.specs.values() if isinstance(item,dict) and item.get("appRoot") is not None)
        output=self._validated_output_root()
        signed = self.ops.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(root)],
                              spec["commandTimeout"], "verify_bound_signature")
        if signed.returncode:
            raise ValueError("strict signature verification failed")
        self.preflighted = True
        self.output_root = output
        return "VERIFIED_UNCHANGED"

    def admit_host(self, group, plan):
        if not self.preflighted or group!=self.group or plan["nonce"]!=self.nonce:
            raise AdmissionDenied("group must be preflighted before original gate")
        if not callable(self.original_gate):
            raise AdmissionDenied("original denied occupancy gate unresolved; no substitute query")
        admission = self.original_gate(group, plan)
        if not isinstance(admission, HostAdmission):
            raise AdmissionDenied("original verified gate receipt required")
        self.admitted = admission.validate(self.nonce, group)
        return self.admitted

    def _root_identity(self, child, owned=None):
        row = self.ops.identity(child.pid, self.spec["commandTimeout"])
        expected = str(Path(self.spec["appRoot"]).resolve() / "Contents/MacOS/nwjs")
        if (self.ops.poll(child) is not None or row.pid != child.pid or row.pgid != child.pid or
                row.ppid != self.ops.collector_pid() or row.executable != expected):
            raise ValueError("owned root process/group/executable changed")
        if owned and (owned.pid!=child.pid or owned.pgid!=child.pid or row.birth != owned.birth):
            raise ValueError("PID reused; no signal allowed")
        return row

    def _require_owned(self, owned):
        owned.validate(self.nonce,self.group)
        child=self.children_by_group[self.group]
        if self.owners.get(self.group)!=owned or owned.pid!=child.pid or owned.pgid!=child.pid:
            raise ValueError("foreign/changed ownership receipt; no probe or signal")
        return child

    def launch(self, group, plan):
        if (not self.preflighted or self.admitted is None or group != self.group or
                plan["nonce"] != self.nonce or group in self.attempted_groups):
            raise AdmissionDenied("original verified host gate and one fresh group required")
        self.admitted.validate(self.nonce,group)
        output=self._validated_output_root()
        if output!=self.output_root:
            raise ValueError("output physical binding changed before launch")
        binding.compare_inventory(self.spec["appRoot"],self.spec["inventory"])
        self.attempted_groups.add(group)
        output.mkdir(parents=True, exist_ok=False)
        with (output/"stdout.log").open("xb") as out, (output/"stderr.log").open("xb") as err:
            child = self.ops.spawn(self.spec["argv"], self.spec["cwd"], self.spec["env"], out, err)
        self.children_by_group[group] = child
        row = self._root_identity(child)
        owned = OwnedProcess(row.pid, row.pgid, row.birth, self.nonce, group).validate(self.nonce,group)
        self.owners[group] = owned
        return owned

    def reconcile_launch(self, group, plan):
        # No search by package name/nonce and no whole-host scan.
        if group!=self.group or plan["nonce"]!=self.nonce:
            raise ValueError("wrong reconciliation group/nonce")
        child = self.children_by_group.get(group)
        if child is None:
            raise RuntimeError("launch outcome unknown; no known child to reconcile")
        row = self._root_identity(child, self.owners.get(group))
        owned = OwnedProcess(row.pid,row.pgid,row.birth,self.nonce,group).validate(self.nonce,group)
        self.owners[group] = owned
        return owned

    def wait_report(self, owned, deadline, cancellation):
        child=self._require_owned(owned)
        while self.ops.poll(child) is None:
            cancellation.check()
            remaining=deadline-self.ops.now()
            if remaining <= 0:
                raise TimeoutError("native wait deadline")
            self.ops.sleep(min(.05,remaining))
        cancellation.check()
        report_path = self.output_root/"report.json"
        fatal_path = self.output_root/"fatal.json"
        if fatal_path.exists():
            raise RuntimeError("raw native fatal retained: " + str(fatal_path))
        if self.ops.poll(child) != 0 or report_path.is_symlink() or not report_path.is_file():
            raise ValueError("native exit/report missing")
        if report_path.stat().st_size > self.spec["maxReportBytes"]:
            raise ValueError("bound report size exceeded")
        raw = report_path.read_bytes()
        report = json.loads(raw)
        if (report.get("version") != "D2-normal-F100-output-v1" or
                report.get("runNonce") != self.nonce or report.get("group") != self.group):
            raise ValueError("D2 normal report identity mismatch; D1 output rejected")
        return {"exit":0,"fatal":False,"timeout":False,"caseIds":report["caseIds"],
                "rawPath":str(report_path),"rawSHA256":hashlib.sha256(raw).hexdigest()}

    def verify_report(self, report, group, plan):
        # Explicit void-or-raise port convention from the 93314ee review.
        # The bound verifier must validate actual Node JSON.stringify state/core,
        # all100 seeds/events/ledger and exact product/driver/input identities.
        path=Path(report["rawPath"])
        if group!=self.group or plan["nonce"]!=self.nonce or path!=self.output_root/"report.json":
            raise ValueError("wrong verifier group/nonce/report path")
        if binding.sha(path)!=report["rawSHA256"]:
            raise ValueError("raw report changed before validation")
        if self.report_verifier(report, group, plan) is not None:
            raise ValueError("verifier must raise on failure and return None on success")
        if binding.sha(path)!=report["rawSHA256"]:
            raise ValueError("raw report changed during validation")

    def cleanup_owned(self, owned):
        child=self._require_owned(owned)
        if self.ops.group_absent(owned.pgid):
            return "ABSENT"
        self._root_identity(child,owned)
        self.ops.signal_group(owned.pgid,signal.SIGTERM)
        for number,budget in ((None,self.spec["cleanupGrace"]),(signal.SIGKILL,self.spec["cleanupKillWait"])):
            if number:
                self._root_identity(child,owned)  # absent/reused leader => UNKNOWN, no blind group kill
                self.ops.signal_group(owned.pgid,number)
            until = self.ops.now()+budget
            while self.ops.now()<until:
                if self.ops.group_absent(owned.pgid):
                    return "ABSENT"
                remaining=until-self.ops.now()
                if remaining>0:self.ops.sleep(min(.05,remaining))
        raise RuntimeError("owned group absence UNKNOWN; block next launch")

    def sample_owned_rss(self, owned, renderer_pid):
        try:
            child=self._require_owned(owned)
            self._root_identity(child,owned)
            pending=[owned.pid];rows={};children={}
            while pending:
                pid=pending.pop()
                if pid in rows:continue
                if len(rows)>=self.spec["maxOwnedPids"]:raise ValueError("owned tree bound")
                row=self.ops.identity(pid,self.spec["commandTimeout"])
                if pid!=owned.pid and row.ppid not in rows:raise ValueError("owned lineage changed")
                if not Path(row.executable).resolve().is_relative_to(Path(self.spec["appRoot"]).resolve()):raise ValueError("external process executable")
                previous=self.observed_identities.get((owned.group,pid))
                if previous and (previous.birth,previous.executable)!=(row.birth,row.executable):raise ValueError("sample PID reused")
                self.observed_identities[owned.group,pid]=row
                rows[pid]=row
                children[pid]=self.ops.children(pid,self.spec["commandTimeout"])
                pending.extend(children[pid])
            if renderer_pid not in rows:raise ValueError("renderer not in owned tree")
            for pid,seen in children.items():
                if set(self.ops.children(pid,self.spec["commandTimeout"]))!=set(seen):raise ValueError("owned tree changed during sample")
            self._root_identity(self.children_by_group[self.group],owned)
            return {"status":"value","bytes":sum(r.rss_bytes for r in rows.values()),"pids":sorted(rows),
                    "processes":[asdict(rows[p]) for p in sorted(rows)]}
        except (OSError,ValueError,RuntimeError) as error:
            return {"status":"UNKNOWN","bytes":None,"reason":str(error)}

    def final_identity(self, group, plan):
        if group!=self.group or plan["nonce"]!=self.nonce:raise ValueError("wrong final group/nonce")
        binding.compare_inventory(self.spec["appRoot"],self.spec["inventory"])
        signed=self.ops.run(["/usr/bin/codesign","--verify","--deep","--strict",str(self.spec["appRoot"])],self.spec["commandTimeout"],"verify_bound_signature")
        if signed.returncode:raise ValueError("final strict signature failed")
        return "VERIFIED_UNCHANGED"

    def after_idle(self, group, plan):
        if group!=self.group or plan["nonce"]!=self.nonce:raise ValueError("wrong after-idle group/nonce")
        if not callable(self.after_gate):
            raise AdmissionDenied("authorized original after-idle gate not bound")
        if self.after_gate(group,plan)!="VERIFIED_IDLE":
            raise AdmissionDenied("after-idle not established")
        return "VERIFIED_IDLE"
