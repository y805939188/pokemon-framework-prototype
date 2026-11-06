"""Pure reference controls for a future D2 supervisor; does not operate a host.

Hooks used by tests are in-memory functions. This is deliberately not imported by
any product, native runner, or launch entrypoint.
"""


class GateDenied(RuntimeError):
    pass


class Cancelled(BaseException):
    pass


def exact_ids(actual, expected):
    if not expected or actual != expected or len(set(actual)) != len(actual):
        raise ValueError("missing, duplicate, empty, or reordered case IDs")


def supervise_model(hooks, expected_ids):
    """Model first-error retention and finally obligations with injected hooks.

    The return value always says PURE_CONTROL_NOT_NATIVE_NOT_P4. No return value
    grants host admission, proves cleanup, or accepts performance.
    """
    result = dict(kind="PURE_CONTROL_NOT_NATIVE_NOT_P4", totalBattles=0,
                  status="PENDING", primary=None, tailErrors=[], calls=[],
                  nativeStarted=False, stopNextRun=True)

    def call(name):
        result["calls"].append(name)
        return hooks[name]()

    def error(stage, exc):
        row = dict(stage=stage, type=type(exc).__name__, message=str(exc))
        if result["primary"] is None:
            result["primary"] = row
        else:
            result["tailErrors"].append(row)

    stage = "freeze"
    try:
        call(stage)
        stage = "host_admission"
        call(stage)
        # This boundary models a launch attempt, including an uncertain Popen
        # result. A real supervisor must retain exact ownership or UNKNOWN.
        stage = "native_run"
        result["nativeStarted"] = True
        actual = call(stage)
        stage = "semantic_verify"
        exact_ids(actual, expected_ids)
        call(stage)
    except BaseException as exc:
        error(stage, exc)
    finally:
        # A denied pre-launch gate must never cause a second occupancy query,
        # cleanup signal, or alternative launch. Pure file work remains possible.
        if result["nativeStarted"]:
            for stage in ("owned_cleanup", "final_identity", "after_idle"):
                try:
                    call(stage)
                except BaseException as exc:
                    error(stage, exc)
    result["status"] = ("CONTROL_PASS" if result["primary"] is None else
                        "BLOCKED" if not result["nativeStarted"] else "FAIL_STOP")
    return result
