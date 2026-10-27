import production = require("@pokemon-framework/engine/production");
import core = require("@pokemon-framework/engine/core");

export const schema: number = core.state.GAME_SCHEMA;
export type ConsumerPorts = production.app.GameApplicationPorts<production.app.BattleHandle>;
export function usePorts(ports: ConsumerPorts): ConsumerPorts { return ports; }
