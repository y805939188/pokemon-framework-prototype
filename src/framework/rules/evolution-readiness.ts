/** Persistent readiness has two fields. Clearing a proven condition clears its uncertainty as well. */
import type { Member } from "./types";
import { clone } from "./value";

export function clearEvolutionReadiness<T extends Member>(member: T): T {
  return { ...clone(member), readyToEvolve: false, evolutionReadiness: "known" };
}
