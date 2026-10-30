/** Public gateway surface. Private settlement readers remain available only to flow and explicit testing. */
export { BattleGateway, GatewayCheckpoint, showdownDriverFactory, PROTOCOL_VERSION } from "./gateway";
export type { GatewayMessage, GatewayOptions, MemberState, PlayerSpec, SlotSpec, StateRecord } from "./driver";
