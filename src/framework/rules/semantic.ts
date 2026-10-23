/** Canonical plain-data intent identity. Dictionary keys sort, arrays retain order; no coercion or accessors. */
import { sha256Hex } from './sha256.ts';
export function semanticFingerprint(value: unknown): string {
  const active = new Set<object>();
  const canonical = (v: unknown): unknown => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('invalid-intent-number'); return v; }
    if (!v || typeof v !== 'object') throw new Error('invalid-intent-value');
    if (active.has(v)) throw new Error('cyclic-intent');
    if (!Array.isArray(v) && ![Object.prototype,null].includes(Object.getPrototypeOf(v) as object|null)) throw new Error('nonplain-intent');
    active.add(v);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(v))) if (descriptor.get || descriptor.set) throw new Error('intent-accessor');
    const result: unknown = Array.isArray(v) ? Array.from(v,canonical) : Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical((v as Record<string,unknown>)[key])]));
    active.delete(v);return result;
  };
  return sha256Hex(JSON.stringify(canonical(value)));
}
