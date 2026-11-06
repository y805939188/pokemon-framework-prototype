#!/usr/bin/env python3
"""Static artifact binding only; never grants native admission or inspects processes."""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import sys


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inventory(root):
    """Full files/directories/modes/internal links; no link traversal or APP mutation."""
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError("regular root directory required")
    root = root.resolve()
    rows = {".": {"kind": "directory", "mode": stat.S_IMODE(root.stat().st_mode)}}

    def walk(directory):
        for path in sorted(directory.iterdir()):
            before = path.lstat()
            row = {"mode": stat.S_IMODE(before.st_mode)}
            if path.is_symlink():
                target = path.readlink()
                if target.is_absolute():
                    raise ValueError("absolute package link " + str(path))
                resolved = path.resolve(strict=True)
                if not resolved.is_relative_to(root):
                    raise ValueError("external package link " + str(path))
                row.update(kind="link", target=str(target))
            elif stat.S_ISREG(before.st_mode):
                row.update(kind="file", bytes=before.st_size, sha256=sha(path))
                after = path.lstat()
                if (before.st_ino, before.st_size, before.st_mtime_ns, before.st_mode) != (
                    after.st_ino, after.st_size, after.st_mtime_ns, after.st_mode):
                    raise ValueError("file changed while hashing " + str(path))
            elif stat.S_ISDIR(before.st_mode):
                row.update(kind="directory")
                walk(path)
            else:
                raise ValueError("unsupported package member " + str(path))
            rows[path.relative_to(root).as_posix()] = row
    walk(root)
    return dict(sorted(rows.items()))


def compare_inventory(root, expected):
    actual = inventory(root)
    if actual != expected:
        changed = sorted(k for k in set(actual) | set(expected) if actual.get(k) != expected.get(k))
        raise ValueError("package inventory drift: " + repr(changed))
    return {"status": "STATIC_BYTES_MATCH_NOT_SIGNATURE_OR_NATIVE_ACCEPTANCE", "members": len(actual)}


def verify_declared_diff(control, candidate, declared):
    changed = {p for p in set(control) | set(candidate) if control.get(p) != candidate.get(p)}
    if set(declared) != changed:
        raise ValueError("exact per-path declared differences required")
    for path in changed:
        row = declared[path]
        if row.get("control") != control.get(path) or row.get("candidate") != candidate.get(path) or not row.get("reason"):
            raise ValueError("both exact member identities and reason required: " + path)
    return sorted(changed)


def inspect_template(template):
    if template.get("version") != "D2-P4-runtime-binding-template-v1":
        raise ValueError("binding template version")
    if template.get("nativeEntry") != "NOT_IMPLEMENTED_NO_LAUNCH_CLI":
        raise ValueError("this candidate cannot enable native entry")
    missing = [key for key, value in template["required"].items() if value is None]
    if len(missing) != len(template["required"]):
        raise ValueError("do not mutate the frozen template to fabricate admission; create reviewed successor")
    return dict(kind="STATIC_BINDING_PREPARATION_NOT_NATIVE_NOT_P4", status="BLOCKED",
                missing=missing, actualBattles=0, hostQueries=0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("template", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(inspect_template(json.loads(args.template.read_text())), indent=2))
        sys.exit(2)
    except (ValueError, KeyError, OSError) as error:
        print(json.dumps(dict(status="FAIL", error=str(error))), file=sys.stderr)
        sys.exit(1)
