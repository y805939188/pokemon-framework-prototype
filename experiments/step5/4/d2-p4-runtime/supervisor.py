"""D2 supervisor core with explicit ports. No OS/native backend is shipped.

The core sequences actual calls and receipts when a backend is supplied; our
tests supply TOOL_FIXTURE ports only. Importing this module launches nothing.
"""
from dataclasses import dataclass, asdict
import math

GROUPS = [f"{side}-{mode}" for mode in
          ("natural1", "natural2", "natural3", "instrumentOff", "GC1")
          for side in ("control", "candidate")]


class AdmissionDenied(RuntimeError):
    pass


class Cancelled(BaseException):
    pass


@dataclass(frozen=True)
class HostAdmission:
    nonce: str
    group: str
    occupancy: str
    cleanup_capable: bool
    receipt_sha256: str

    def validate(self, nonce, group):
        if (self.nonce != nonce or self.group != group or
                self.occupancy != "VERIFIED_IDLE" or self.cleanup_capable is not True or
                type(self.receipt_sha256) is not str or len(self.receipt_sha256) != 64 or
                any(c not in "0123456789abcdef" for c in self.receipt_sha256)):
            raise AdmissionDenied("verified occupancy and owned cleanup receipt required")
        return self


@dataclass(frozen=True)
class OwnedProcess:
    pid: int
    pgid: int
    birth: str
    nonce: str
    group: str

    def validate(self, nonce, group):
        if (type(self.pid) is not int or self.pid <= 0 or
                type(self.pgid) is not int or self.pgid <= 0 or
                type(self.birth) is not str or not self.birth or
                type(self.nonce) is not str or self.nonce != nonce or self.group != group):
            raise ValueError("exact owned process identity required")
        return self


class Cancellation:
    """Deferred requests; no signal handlers are installed by this module."""
    def __init__(self):
        self.requests = []

    def request(self, label):
        self.requests.append(label)

    def check(self):
        if self.requests:
            raise Cancelled(str(self.requests[0]))


def _ids(report, expected):
    if (not expected or len(set(expected)) != len(expected) or
            report.get("caseIds") != expected or
            type(report.get("exit")) is not int or report.get("exit") != 0 or report.get("fatal") is not False or
            report.get("timeout") is not False):
        raise ValueError("raw report exit/fatal/timeout or exact ordered IDs invalid")


class Supervisor:
    def __init__(self, backend, now, journal, cancellation=None):
        self.backend, self.now, self.journal = backend, now, journal
        self.cancel = cancellation or Cancellation()
        self.last_time = -1

    def monotonic(self):
        value = self.now()
        if (type(value) not in (int,float) or not math.isfinite(value) or
                value < self.last_time or value < 0):
            raise ValueError("finite monotonic clock required")
        self.last_time = value
        return value

    def run(self, plan):
        if plan.get("groups") != GROUPS or len(plan.get("caseIds", [])) != 100:
            raise ValueError("formal plan requires ten exact groups and hundred IDs")
        if (plan["caseIds"] != [f"F100-{i+1:03d}" for i in range(100)] or
                type(plan.get("nonce")) is not str or not plan["nonce"]):
            raise ValueError("unique exact IDs and new run nonce required")
        budgets = plan.get("deadlineSeconds", {})
        if set(budgets) != set(GROUPS) or any(type(v) not in (int, float) or
            not math.isfinite(v) or v <= 0 for v in budgets.values()):
            raise ValueError("all qualified finite deadlines required, no default")
        summary = dict(version="D2-supervisor-core-v1", sourceKind=self.backend.kind,
                       status="RUNNING", groups=[], acceptance="NOT_GRANTED",
                       nativeBattleClaims=0, cancellationRequests=self.cancel.requests)
        for group in GROUPS:
            row = dict(group=group, nonce=plan["nonce"], status="PENDING", calls=[],
                       primary=None, tailErrors=[], launchAttempted=False,
                       owned=None, cleanup="NOT_ATTEMPTED", uncertainty=False)
            summary["groups"].append(row)

            def remember(stage, error):
                problem = dict(stage=stage, type=type(error).__name__, message=str(error))
                if row["primary"] is None:
                    row["primary"] = problem
                else:
                    row["tailErrors"].append(problem)

            def call(stage, *args):
                row["calls"].append(stage)
                return getattr(self.backend, stage)(*args)

            owned = None
            stage = "journal-before"
            try:
                self.cancel.check()
                self.journal(dict(group=group, event="before", nonce=plan["nonce"]))
                stage = "preflight_identity"
                if call(stage, group, plan) != "VERIFIED_UNCHANGED":
                    raise ValueError("preflight identity receipt missing")
                self.cancel.check()
                stage = "admit_host"
                # Permission/occupancy receipt must be checked by the eventual
                # reviewed OS backend. Lease or a bool alone is not a receipt.
                admission = call(stage, group, plan)
                if not isinstance(admission, HostAdmission):
                    raise AdmissionDenied("typed host admission receipt required")
                admission.validate(plan["nonce"], group)
                self.cancel.check()
                stage = "launch"
                start = self.monotonic()
                deadline = start + budgets[group]
                row["launchAttempted"] = True
                launched = call(stage, group, plan)
                if not isinstance(launched, OwnedProcess):
                    raise ValueError("launcher did not return typed ownership")
                owned = launched.validate(plan["nonce"], group)
                row["owned"] = asdict(owned)
                stage = "wait_report"
                report = call(stage, owned, deadline, self.cancel)
                if self.monotonic() >= deadline:
                    raise TimeoutError("qualified process deadline exceeded")
                self.cancel.check()
                stage = "verify_report"
                _ids(report, plan["caseIds"])
                call(stage, report, group, plan)
                self.cancel.check()
            except BaseException as error:
                remember(stage, error)
            finally:
                if row["launchAttempted"]:
                    if owned is None:
                        try:
                            candidate = call("reconcile_launch", group, plan)
                            if not isinstance(candidate, OwnedProcess):
                                raise ValueError("uncertain launch ownership; no signals allowed")
                            owned = candidate.validate(plan["nonce"], group)
                            row["owned"] = asdict(owned)
                        except BaseException as error:
                            row["uncertainty"] = True
                            remember("reconcile_launch", error)
                    if owned is not None:
                        try:
                            receipt = call("cleanup_owned", owned)
                            if receipt != "ABSENT":
                                raise ValueError("owned group absence not established")
                            row["cleanup"] = "ABSENT"
                        except BaseException as error:
                            row["cleanup"] = "UNKNOWN"
                            remember("cleanup_owned", error)
                    # Identity is file-only. These are separate operations, each
                    # attempted once; a denied occupancy check is never retried.
                    for tail in ("final_identity", "after_idle"):
                        if tail == "after_idle" and row["uncertainty"]:
                            row["afterIdle"] = "NOT_ATTEMPTED_UNCERTAIN_LAUNCH"
                            continue
                        try:
                            receipt = call(tail, group, plan)
                            expected = "VERIFIED_UNCHANGED" if tail == "final_identity" else "VERIFIED_IDLE"
                            if receipt != expected:
                                raise ValueError("missing verified tail receipt")
                        except BaseException as error:
                            remember(tail, error)
                try:
                    self.cancel.check()
                except BaseException as error:
                    if row["primary"] is None:
                        remember("deferred_cancel", error)
                row["status"] = "CORE_GROUP_VERIFIED" if row["primary"] is None else "FAIL_STOP" if row["launchAttempted"] else "BLOCKED"
                try:
                    self.journal(dict(group=group, event="finished", receipt=row))
                except BaseException as error:
                    remember("journal-final", error)
                    row["status"] = "FAIL_STOP" if row["launchAttempted"] else "BLOCKED"
            if row["primary"] is not None:
                summary["status"] = row["status"]
                break
        else:
            summary["status"] = "CORE_COMPLETED_PENDING_REVIEW"
        return summary
