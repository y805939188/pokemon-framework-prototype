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
export * as config from "./config.ts";
export * as digest from "./sha256.ts";
export type * from "./types.ts";

export * as memberIdentity from "./member-identity.ts";
export * as creationForms from "./creation-form.ts";

export * as storage from "./storage.ts";

export * as storageOperations from "./storage-operations.ts";

export * as receiving from "./receiving.ts";

export * as inventory from "./inventory.ts";
export * as itemCatalog from "./item-catalog.ts";

export * as semantic from "./semantic.ts";
export * as memberMetadata from "./member-metadata.ts";

export * as economy from "./economy.ts";

export * as itemEffects from './item-effects.ts';
export * as shop from './shop.ts';

export * as dexState from "./dex-state.ts";
export * as evolutionReadiness from "./evolution-readiness.ts";

// Step5.3 accepted C/D pure modules; application installation remains an E responsibility.
export * as friendship from "./friendship.ts";
export * as learning from "./learning.ts";
export * as evolution from "./evolution.ts";
export * as evolutionSuccess from "./evolution-success.ts";
export * as evolutionCommit from "./evolution-commit.ts";
export * as learningActions from "./learning-actions.ts";
export * as pokedex from "./pokedex.ts";
export * as pokedexQuery from "./pokedex-query.ts";
