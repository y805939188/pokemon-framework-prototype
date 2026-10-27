/**
 * The core's public entry: game rules, state, save schema and the portable digest. Nothing here may depend on a host
 * (MZ, DOM, Node), on Showdown, or on any other layer; `tsconfig.core.json` compiles exactly this folder with no
 * ambient types, and scripts/check-boundaries.cjs enforces the dependency side. Consumers outside the framework use this
 * file (built as js/engine/build/core.cjs), not deep paths.
 */
export * as growth from "./growth";
export * as rules from "./rules";
export * as state from "./state";
export * as saveSchema from "./save-schema";
export * as limits from "./limits";
export * as memberFactory from "./member-factory";
export * as grants from "./grants";
export * as heal from "./heal";
export * as items from "./items";
export * as encounter from "./encounter";
export * as defeat from "./defeat";
export * as speciesKey from "./species-key";
export * as stats from "./stats";
export * as config from "./config";
export * as digest from "./sha256";
export type * from "./types";
// Named type contracts used by host adapters and public consumers; type-only exports do not change the core runtime keys.
export type { ItemDefinition } from "./item-catalog";
export type { MemberPosition } from "./storage";
export type { MemberReference } from "./storage-operations";
export type { ReceivingDecision, ReceivingProfile } from "./receiving";
export type { LearningAnswer, LearningPending } from "./learning";
export type { DexAppearance } from "./pokedex";

export * as memberIdentity from "./member-identity";
export * as creationForms from "./creation-form";

export * as storage from "./storage";

export * as storageOperations from "./storage-operations";

export * as receiving from "./receiving";

export * as inventory from "./inventory";
export * as itemCatalog from "./item-catalog";

export * as semantic from "./semantic";
export * as memberMetadata from "./member-metadata";

export * as economy from "./economy";

export * as itemEffects from './item-effects';
export * as shop from './shop';

export * as dexState from "./dex-state";
export * as evolutionReadiness from "./evolution-readiness";

// Step5.3 accepted C/D pure modules; application installation remains an E responsibility.
export * as friendship from "./friendship";
export * as learning from "./learning";
export * as evolution from "./evolution";
export * as evolutionSuccess from "./evolution-success";
export * as evolutionCommit from "./evolution-commit";
export * as learningActions from "./learning-actions";
export * as pokedex from "./pokedex";
export * as pokedexQuery from "./pokedex-query";

export * as acquisitionDex from "./acquisition-dex";
