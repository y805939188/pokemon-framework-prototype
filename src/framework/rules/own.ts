/**
 * Own-key access for the plain-object dictionaries of the content and the game state (species, speciesIds, grants,
 * claims, appliedBattles). Their keys come from authors, saves and callers: a legal key such as "constructor" must not
 * find the inherited Object.prototype member, and writing "__proto__" must create an ordinary entry (a plain assignment
 * would set the object's prototype instead and record nothing). JSON round trips and clone() produce ordinary objects
 * again, so both are applied at every access instead of relying on how a dictionary was created. JSON.stringify and
 * JSON.parse keep such an entry as an own property.
 */
export function own<T>(dict: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return dict !== undefined && Object.hasOwn(dict, key) ? dict[key] : undefined;
}

/** Store `value` under `key` as an own, enumerable, writable data property (whatever the key is). */
export function setOwn<T>(dict: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(dict, key, { value, enumerable: true, writable: true, configurable: true });
}
