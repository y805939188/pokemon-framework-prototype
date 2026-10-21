/**
 * Own-key lookup for the plain-object dictionaries of the content and the game state (species, speciesIds, grants,
 * claims, appliedBattles). Their keys come from authors, saves and callers, and a legal key such as "constructor" must
 * not find the inherited Object.prototype member. JSON round trips and clone() produce ordinary objects again, so this
 * is checked at every lookup instead of relying on how a dictionary was created.
 */
export function own<T>(dict: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return dict !== undefined && Object.hasOwn(dict, key) ? dict[key] : undefined;
}
