/** Canonical plain-data intent identity. Dictionary keys sort, arrays retain order; no coercion or accessors. */
import { sha256Hex } from './sha256.ts';
/** Null or the Object.prototype of ANY realm. Under NW.js the required engine runs in Node's context while plugins
 *  build their requests in the window's, so a plain literal there has a different Object.prototype (5.2 P-01).
 *  Read through descriptors only: a class instance, Map, Date or forged prototype still does not qualify. */
function plainPrototype(proto: object | null): boolean {
  if (proto === null) return true;
  if (Object.getPrototypeOf(proto) !== null) return false;
  const ctor: unknown = Object.getOwnPropertyDescriptor(proto, 'constructor')?.value;
  return typeof ctor === 'function' && Object.getOwnPropertyDescriptor(ctor, 'prototype')?.value === proto && Object.getOwnPropertyDescriptor(ctor, 'name')?.value === 'Object';
}
export function semanticFingerprint(value: unknown): string {
  const active = new Set<object>();
  const canonical = (v: unknown): unknown => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('invalid-intent-number'); return v; }
    if (!v || typeof v !== 'object') throw new Error('invalid-intent-value');
    if (active.has(v)) throw new Error('cyclic-intent');
    if (!Array.isArray(v) && !plainPrototype(Object.getPrototypeOf(v) as object|null)) throw new Error('nonplain-intent');
    active.add(v);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(v))) if (descriptor.get || descriptor.set) throw new Error('intent-accessor');
    const result: unknown = Array.isArray(v) ? Array.from(v,canonical) : Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical((v as Record<string,unknown>)[key])]));
    active.delete(v);return result;
  };
  return sha256Hex(JSON.stringify(canonical(value)));
}
