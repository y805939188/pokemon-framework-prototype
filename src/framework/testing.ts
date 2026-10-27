/**
 * Explicit testing/diagnostic API (built as js/engine/build/testing.cjs).
 *
 * These modules are not exported by production.cjs. The runtime build uses shared chunks with production.cjs and
 * legacy engine.cjs, so mixing these entries in one installation never constructs a second production implementation.
 */
export * as fixtures from "./tools/fixtures/game";
export * as harness from "./tools/harness";
export * as matrix from "./tools/matrix";
export * as fakes from "./tools/fakes";
export * as scripted from "./tools/scripted-driver";
