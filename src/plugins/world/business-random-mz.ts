/** Default world entropy belongs to Node, independently of renderer Weather/Math.
 * No stream, seed, counter or saved state is created here. Explicit RandomPorts stay caller-owned. */
type Fill = (this: object, target: Uint32Array) => unknown;
const object = (value: unknown): value is object => value !== null && (typeof value === 'object' || typeof value === 'function');
export function createBusinessRandomUnitMZ(isProxy: (value: unknown) => boolean): () => number {
  let receiver: object | null = null, fill: Fill | null = null;
  const own = (target: unknown, key: string): unknown => {
    if (!object(target) || isProxy(target)) throw Error('business-entropy-object-unavailable');
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error(`business-entropy-own-data-required:${key}`);
    return descriptor.value;
  };
  return () => {
    // Lazy: installing Flow, or using its explicit rng override, never needs entropy.
    if (!fill) {
      const load = own(globalThis, 'require');
      if (typeof load !== 'function' || isProxy(load)) throw Error('business-entropy-require-unavailable');
      const crypto: unknown = Reflect.apply(load, globalThis, ['node:crypto']);
      const method = own(crypto, 'randomFillSync');
      if (!object(crypto) || typeof method !== 'function' || isProxy(method)) throw Error('business-entropy-fill-unavailable');
      receiver = crypto; fill = method as Fill;
    }
    const words = new Uint32Array(2), returned: unknown = Reflect.apply(fill, receiver, [words]);
    if (returned !== words) throw Error('business-entropy-buffer-mismatch');
    const a = words[0], b = words[1];
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isInteger(a) || !Number.isInteger(b)
      || a < 0 || b < 0 || a > 0xffffffff || b > 0xffffffff) throw Error('business-entropy-words-invalid');
    const unit = ((a >>> 5) * 0x4000000 + (b >>> 6)) / 0x20000000000000;
    if (!Number.isFinite(unit) || unit < 0 || unit >= 1) throw Error('business-entropy-unit-invalid');
    return unit;
  };
}
