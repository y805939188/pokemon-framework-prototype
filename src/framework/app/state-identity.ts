import type { GameState } from "../rules/state";

/** Canonical comparison of complete states. Every call deliberately serializes afresh; no cache or write authority. */
export function stateIdentity(value: GameState): string {
  return JSON.stringify(value, (_key, data: unknown) => data && typeof data === "object" && !Array.isArray(data)
    ? Object.fromEntries(Object.keys(data).sort().map(key => [key, (data as Record<string, unknown>)[key]])) : data);
}
