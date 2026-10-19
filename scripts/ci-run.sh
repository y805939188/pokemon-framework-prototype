#!/usr/bin/env bash
# CI helper: run a command; if it fails, surface the tail of its output as a GitHub error ANNOTATION so the result can be
# read from the public run page without credentials (job logs themselves need a login).
# Usage: scripts/ci-run.sh <label> <command...>
set -uo pipefail
label="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
code="${PIPESTATUS[0]}"
if [[ "$code" -ne 0 ]]; then
  msg="$(tail -n 25 "$log" | sed 's/\r//g' | cut -c1-220 | sed ':a;N;$!ba;s/%/%25/g;s/\n/%0A/g')"
  echo "::error title=${label} failed (exit ${code})::${msg}"
fi
exit "$code"
