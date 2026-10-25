/** Persistent readiness has two fields. Clearing a proven condition clears its uncertainty as well. */
import type { Member } from "./types.ts";
import { clone } from "./value.ts";

export function clearEvolutionReadiness<T extends Member>(member: T): T {
  return { ...clone(member), readyToEvolve: false, evolutionReadiness: "known" };
}
