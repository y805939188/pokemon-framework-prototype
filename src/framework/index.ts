/** Public entry of the engine bundle (js/engine/build/engine.cjs). Namespaces mirror the module responsibilities. */
export * as growth from "./rules/growth.ts";
export * as rules from "./rules/rules.ts";
export * as state from "./rules/state.ts";
export * as store from "./tools/save-store.ts";
export * as gateway from "./battle/gateway.ts";
export * as describe from "./flow/describe.ts";
export * as session from "./flow/session.ts";
export * as fixtures from "./tools/fixtures/game.ts";
export * as harness from "./tools/harness.ts";
export * as matrix from "./tools/matrix.ts";
