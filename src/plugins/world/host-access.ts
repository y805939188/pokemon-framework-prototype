/** Checked MZ property/method access. Independent of framework application types. */
function isHostRecord(value: unknown): value is Record<string, unknown> { return value !== null && (typeof value === 'object' || typeof value === 'function'); }
export function hostRecord(value: unknown): Record<string, unknown> | null { return isHostRecord(value) ? value : null; }
export function invoke(owner: unknown, key: string, args: readonly unknown[] = []): unknown {
  const record = hostRecord(owner), method = record?.[key];
  if (typeof method !== 'function') throw new Error(`world-host-method-unavailable:${key}`);
  return Reflect.apply(method, owner, args);
}
