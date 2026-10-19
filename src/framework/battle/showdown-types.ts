/**
 * The ONLY place that names Showdown's object types. Showdown's internals are not typed for us (the staged build is
 * plain CommonJS), so the adapter layer treats them as `any`; nothing outside framework/battle/ may import this file
 * (enforced by the import-boundary check).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type ShowdownBattle = any;
export type ShowdownPokemon = any;
export type ShowdownSide = any;
export type ShowdownSim = any;
