#!/usr/bin/env bash
# Read CI results of a public repo WITHOUT credentials, from the public Actions pages (no API, no token).
# Usage: scripts/ci-status.sh [branch] [repo]   e.g. scripts/ci-status.sh step3/foundation
# Prints one line per recent run: status text, run id, and the commit message GitHub shows for it.
# The pages are HTML, so this is a best-effort reader: if GitHub changes its markup it prints nothing; then read the
# Actions page in a browser. Never treat "no output" as "passed".
set -euo pipefail
BRANCH="${1:-main}"
REPO="${2:-y805939188/pokemon-framework-prototype}"
ENC="$(printf '%s' "$BRANCH" | sed 's#/#%2F#g')"
curl -fsS "https://github.com/$REPO/actions?query=branch%3A$ENC" \
  | tr '\n' ' ' \
  | grep -oE 'aria-label="[^"]*(Run [0-9]+ of [a-z]+[^"]*)"|href="/'"$REPO"'/actions/runs/[0-9]+"' \
  | sed -E 's/^aria-label="//; s/"$//; s#^href="/'"$REPO"'/actions/runs/#run-id=#' \
  | head -${CI_STATUS_LINES:-20}
