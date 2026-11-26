#!/usr/bin/env bash
# Publish only a known step name and an exit status. Child output is untrusted.
exec 2>&-
set +ex
set -u

if (( $# < 2 )); then
  printf '%s\n' '::error::Invalid CI wrapper invocation.'
  exit 64
fi
case "$1" in
  pnpm-setup|reactor-setup|pnpm-install|build-engine|build-showdown|headless-suites|python-version|d1-collector|d1-hardening|typecheck|plugin-build)
    label=$1 ;;
  *) label=command ;;
esac
shift

# The child does not publish Actions file commands. Drain both streams and keep
# the discard command's own errors out of the log as well.
{
  GITHUB_ENV=/dev/null GITHUB_OUTPUT=/dev/null GITHUB_PATH=/dev/null \
    GITHUB_STATE=/dev/null GITHUB_STEP_SUMMARY=/dev/null "$@"
} 2>&1 | command cat >/dev/null 2>&1
statuses=("${PIPESTATUS[@]}")
code=${statuses[0]}

# EX_IOERR (74) signals a reporting failure after an otherwise successful command.
if (( statuses[1] != 0 )); then
  (( code != 0 )) || code=74
  printf '::error::CI output unavailable for %s (exit %d).\n' "$label" "$code"
elif (( code != 0 )); then
  printf '::error::CI step %s exited %d.\n' "$label" "$code"
else
  printf 'CI step %s exited 0.\n' "$label" || exit 74
fi
exit "$code"
