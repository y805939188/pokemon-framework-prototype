/**
 * Legacy public entry of js/engine/build/engine.cjs. Keep every historical export, including testing facilities.
 * New consumers should choose production.cjs or testing.cjs explicitly; neither may depend on this legacy entry.
 */
export * as growth from "./rules/growth";
export * as rules from "./rules/rules";
export * as state from "./rules/state";
export * as digest from "./rules/sha256";
export * as store from "./tools/save-store";
export * as gateway from "./battle/public-gateway";
export * as heldFacts from "./rules/held-facts";
export * as heldDiagnostics from "./tools/held-diagnostics";
export * as moveRequests from "./battle/move-requests";
export * as describe from "./flow/describe";
export * as session from "./flow/session";
export * as fixtures from "./tools/fixtures/game";
export * as harness from "./tools/harness";
export * as matrix from "./tools/matrix";
export * as contentSchema from "./content/schema";
export * as contentCompile from "./content/compile";
export * as pbsImport from "./content/pbs-import";
export * as contentRuntime from "./flow/content-runtime";
export * as dex from "./battle/dex";
export * as i18n from "./i18n/index";
export * as log from "./flow/log";
export * as saveSchema from "./rules/save-schema";
export * as limits from "./rules/limits";
export * as memberFactory from "./rules/member-factory";
export * as grants from "./rules/grants";
export * as heal from "./rules/heal";
export * as items from "./rules/items";
export * as encounter from "./rules/encounter";
export * as defeat from "./rules/defeat";
export * as speciesKey from "./rules/species-key";
export * as stats from "./rules/stats";
export * as config from "./rules/config";
export * as app from "./app/index";
export * as composition from "./composition";
export * as fakes from "./tools/fakes";
export * as scripted from "./tools/scripted-driver";

export * as memberIdentity from "./rules/member-identity";
export * as creationForms from "./rules/creation-form";

export * as storage from "./rules/storage";

export * as storageOperations from "./rules/storage-operations";

export * as receiving from "./rules/receiving";

export * as inventory from "./rules/inventory";
export * as itemCatalog from "./rules/item-catalog";

export * as pbsItems from "./content/pbs-items";

export * as semantic from "./rules/semantic";
export * as memberMetadata from "./rules/member-metadata";

export * as economy from "./rules/economy";

export * as itemEffects from './rules/item-effects';
export * as shop from './rules/shop';

export * as dexState from "./rules/dex-state";
export * as evolutionReadiness from "./rules/evolution-readiness";

// Step5.3 accepted C/D pure modules; application installation remains an E responsibility.
export * as friendship from "./rules/friendship";
export * as learning from "./rules/learning";
export * as evolution from "./rules/evolution";
export * as evolutionSuccess from "./rules/evolution-success";
export * as evolutionCommit from "./rules/evolution-commit";
export * as learningActions from "./rules/learning-actions";
export * as pokedex from "./rules/pokedex";
export * as pokedexQuery from "./rules/pokedex-query";

export * as acquisitionDex from "./rules/acquisition-dex";
export * as trainerTeam from "./rules/trainer-team";
export * as trainerReward from "./rules/trainer-reward";
export * as obedience from "./rules/obedience";
