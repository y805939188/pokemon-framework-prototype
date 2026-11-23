// A private test bundle: production App/rules plus the real native state-slot adapter.
export { GameApplication } from '../../../src/framework/app/game-application';
export { createMZAtomicStatePort } from '../../../src/plugins/world/atomic-state-mz';
export { createFieldMoveHost } from '../../../src/plugins/world/field-move-host';
export { createFieldFactsObservation } from '../../../src/plugins/world/field-facts-observation-mz';
export { createLegacyNoHeldSessionFactory } from '../../../src/framework/composition';
export * as state from '../../../src/framework/rules/state';
export * as itemCatalog from '../../../src/framework/rules/item-catalog';
export { createWorldTravelMZ } from '../../../src/plugins/world/world-travel-mz';
