import production = require("@pokemon-framework/engine/production");
import core = require("@pokemon-framework/engine/core");

export const schema: number = core.state.GAME_SCHEMA;
export type ConsumerPorts = production.app.GameApplicationPorts<production.app.BattleHandle>;
export function usePorts(ports: ConsumerPorts): ConsumerPorts { return ports; }

export type StrategyRef = production.composition.TrainerAiStrategyReference;
export type StrategyPort = production.composition.TrainerAiStrategy;
export const strategyRef: StrategyRef = {id: "basic-gen8", version: "1", parameters: {}};
export const strategyRegistry: production.composition.TrainerAiStrategyRegistry = production.composition.createTrainerAiStrategyRegistry();
