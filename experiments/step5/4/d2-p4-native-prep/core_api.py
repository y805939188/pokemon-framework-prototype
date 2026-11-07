"""Load definitions from reviewed 93314ee modules, never a test/SDK/replay entry."""
import importlib.util
from pathlib import Path
import sys


def _load(name, filename):
    if name not in sys.modules:
        path = Path(__file__).resolve().parent.parent / "d2-p4-runtime" / filename
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name]


supervisor = _load("d2_reviewed_supervisor_93314ee", "supervisor.py")
binding = _load("d2_reviewed_binding_93314ee", "binding.py")
AdmissionDenied = supervisor.AdmissionDenied
OwnedProcess = supervisor.OwnedProcess
HostAdmission = supervisor.HostAdmission
