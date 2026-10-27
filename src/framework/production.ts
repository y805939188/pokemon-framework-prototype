/**
 * Production engine API (built as js/engine/build/production.cjs).
 *
 * This entry deliberately excludes fixtures, scripted drivers, fakes and diagnostic harnesses. Production Node
 * adapters and content compilation remain here: living under tools/ does not make a production adapter a test fixture.
 * The legacy engine.cjs entry keeps the historical testing exports; production must never depend on that entry.
 */
export * as growth from "./rules/growth";
export * as rules from "./rules/rules";
export * as state from "./rules/state";
export * as digest from "./rules/sha256";
export * as store from "./tools/save-store";
export * as gateway from "./battle/gateway";
export * as moveRequests from "./battle/move-requests";
export * as describe from "./flow/describe";
export * as session from "./flow/session";
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
export * as itemEffects from "./rules/item-effects";
export * as shop from "./rules/shop";
export * as dexState from "./rules/dex-state";
export * as evolutionReadiness from "./rules/evolution-readiness";
export * as friendship from "./rules/friendship";
export * as learning from "./rules/learning";
export * as evolution from "./rules/evolution";
export * as evolutionSuccess from "./rules/evolution-success";
export * as evolutionCommit from "./rules/evolution-commit";
export * as learningActions from "./rules/learning-actions";
export * as pokedex from "./rules/pokedex";
export * as pokedexQuery from "./rules/pokedex-query";
export * as acquisitionDex from "./rules/acquisition-dex";
