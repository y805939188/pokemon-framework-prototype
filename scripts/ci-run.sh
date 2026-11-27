#!/usr/bin/env bash
# Publish only known step names, exit statuses and bounded headless diagnostics.
# Child stdout and stderr are untrusted and never published.
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

# A private side channel exists only for the regular registry entry point.
# Failure to create or consume it must not affect the checks' exit status.
unset PF_CI_HEADLESS_DIAGNOSTIC
diagnostic_dir=
if [[ "$label" == headless-suites && $# == 2 && "$1" == ./scripts/test-headless.sh && "$2" == --scope=regular ]]; then
  if diagnostic_dir=$(mktemp -d "${TMPDIR:-/tmp}/pf-ci-headless.XXXXXXXXXX" 2>/dev/null); then
    export PF_CI_HEADLESS_DIAGNOSTIC="$diagnostic_dir/failure"
    trap 'command rm -f -- "$diagnostic_dir/failure" >/dev/null 2>&1; command rmdir -- "$diagnostic_dir" >/dev/null 2>&1 || :' EXIT
  fi
fi

# Decode the complete receipt, never a subset of a malformed payload. The size
# check also rejects NULs (which Bash read can discard) and trailing bytes/lines.
report_headless_failure() {
  [[ -n "$diagnostic_dir" ]] || return 0
  local LC_ALL=C file="$diagnostic_dir/failure" size record phase indexes c_indexes
  [[ -f "$file" && ! -L "$file" ]] || return 0
  size=$(command wc -c < "$file") || return 0
  [[ "$size" =~ ^[[:blank:]]*[1-9][0-9]{0,3}$ ]] || return 0
  (( size <= 8192 )) || return 0
  IFS= read -r record < "$file" || return 0
  (( size == ${#record} + 1 )) || return 0
  [[ "$record" =~ ^([a-z-]+)[[:blank:]](-|[1-9][0-9]{0,2}(,[1-9][0-9]{0,2})*)[[:blank:]](-|[1-9][0-9]{0,2}(,[1-9][0-9]{0,2})*)$ ]] || return 0
  phase=${BASH_REMATCH[1]}
  indexes=${BASH_REMATCH[2]}
  c_indexes=${BASH_REMATCH[4]}
  case "$phase" in
    registry|input-policy|showdown-stage|prepare-types|typecheck|boundary-check|binding-begin|distribution-build|plugin-build|binding-finish|binding-publish)
      [[ "$indexes" == - && "$c_indexes" == - ]] || return 0 ;;
    suite-run|suite-results) [[ "$indexes" != - || "$c_indexes" != - ]] || return 0 ;;
    binding-verify) ;;
    *) return 0 ;;
  esac
  printf 'CI diagnostic for headless-suites: phase=%s suite_indexes=%s c_preparation_indexes=%s.\n' "$phase" "$indexes" "$c_indexes"
}

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
  report_headless_failure
else
  printf 'CI step %s exited 0.\n' "$label" || exit 74
fi
exit "$code"
