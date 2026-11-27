# Deterministic encounter lifecycle harness
This optional driver checks encounter accumulation, transfers, repel, version changes, battle settlement and surf transitions through real application interfaces using a synthetic session and controlled host. Literal action vectors are checked against an independent oracle. It does not run statistics, NW.js, real input or audio.

The historical replay in this directory is intentionally restricted to the exact source tree and twelve module hashes in `application-lifecycle-source-map.json`. A different tree must be rejected, not silently accepted with new baselines. `--prepare` binds the harness, original evidence, runtime and compiled modules. `--exercise` rechecks them before and after the action chain. A missing host capability is not a pass.

For the current supported regression suite use `bash scripts/test-headless.sh --scope=regular`. The field-call and statistical contracts are described in [world operations](../../../docs/contracts/world-operations.md) and [encounter statistics](../../../docs/testing/encounter-statistics.md).
