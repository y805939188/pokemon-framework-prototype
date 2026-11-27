#!/usr/bin/env bash
# Keep the historic command name as a fail-closed notice. Historical code
# remains in Git; no environment variable or argument can enable it here.
printf '%s\n' 'LEGACY_MAC_RUNNER_DISABLED: See docs/testing/isolated-launch.md.' >&2
exit 64
