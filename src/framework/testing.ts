/**
 * Explicit testing/diagnostic API (built as js/engine/build/testing.cjs).
 *
 * These modules are not exported by production.cjs. The runtime build uses shared chunks with production.cjs and
 * legacy engine.cjs, so mixing these entries in one installation never constructs a second production implementation.
 */
export * as fixtures from "./tools/fixtures/game.ts";
export * as harness from "./tools/harness.ts";
export * as matrix from "./tools/matrix.ts";
export * as fakes from "./tools/fakes.ts";
export * as scripted from "./tools/scripted-driver.ts";
