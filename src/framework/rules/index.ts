/**
 * The core's public entry: game rules, state, save schema and the portable digest. Nothing here may depend on a host
 * (MZ, DOM, Node), on Showdown, or on any other layer; `tsconfig.core.json` compiles exactly this folder with no
 * ambient types, and scripts/check-boundaries.cjs enforces the dependency side. Consumers outside the framework use this
 * file (built as js/engine/build/core.cjs), not deep paths.
 */
export * as growth from "./growth.ts";
export * as rules from "./rules.ts";
export * as state from "./state.ts";
export * as saveSchema from "./save-schema.ts";
export * as limits from "./limits.ts";
export * as memberFactory from "./member-factory.ts";
export * as grants from "./grants.ts";
export * as heal from "./heal.ts";
export * as items from "./items.ts";
export * as encounter from "./encounter.ts";
export * as defeat from "./defeat.ts";
export * as speciesKey from "./species-key.ts";
export * as stats from "./stats.ts";
export * as digest from "./sha256.ts";
export type * from "./types.ts";
