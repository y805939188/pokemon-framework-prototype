/** Realm-neutral DTOs only. Native identities and operation/admission authority must never enter this copier. */
export function createFieldMoveDataMZ(nativeIsProxy: (value: unknown) => boolean, nodeRecordPrototype: object | null) {
  return function copy<T>(value: T): T {
    const visiting = new Set<object>();
    const walk = (input: unknown): unknown => {
      if (input === null || input === undefined || typeof input === 'string' || typeof input === 'boolean') return input;
      if (typeof input === 'number' && Number.isFinite(input)) return input;
      if (typeof input !== 'object' || nativeIsProxy(input)) throw Error('field-move-dto-unsafe-value');
      if (visiting.has(input)) throw Error('field-move-dto-cycle');
      const array = Array.isArray(input), prototype: unknown = Object.getPrototypeOf(input);
      if (!array && prototype !== null && prototype !== Object.prototype && prototype !== nodeRecordPrototype) throw Error('field-move-dto-non-record');
      const output: Record<string, unknown> | unknown[] = array ? [] : Object.create(null) as Record<string, unknown>;
      visiting.add(input);
      for (const key of Reflect.ownKeys(input)) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || (!descriptor.enumerable && !(array && key === 'length'))) throw Error('field-move-dto-own-data-required');
        if (array && key === 'length') { Object.defineProperty(output, 'length', { value: descriptor.value, writable: true }); continue; }
        Object.defineProperty(output, key, { value: walk(descriptor.value), enumerable: true, writable: true, configurable: true });
      }
      visiting.delete(input); return output;
    };
    return walk(value) as T;
  };
}
