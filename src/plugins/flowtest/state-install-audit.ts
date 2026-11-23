/** Isolated test instrumentation. The framework slot remains writable own data. */
export function observeStateInstalls(root: object, application: object, system: object, reflection: object,
  isProxy: (value: unknown) => boolean, installed: (state: unknown) => void) {
  const object = (value: unknown): object => {
    if (!value || typeof value !== 'object' && typeof value !== 'function' || isProxy(value)) throw Error('state-audit-object-required');
    return value;
  };
  const data = (owner: object, key: string): PropertyDescriptor & { value: unknown } => {
    const d = Object.getOwnPropertyDescriptor(object(owner), key);
    if (!d || !('value' in d)) throw Error('state-audit-own-data-required:' + key);
    const value: unknown = d.value;
    return { ...d, value };
  };
  const slot = (): unknown => data(system, '_psGame').value;
  const originalSlot = data(system, '_psGame');
  if (!originalSlot.writable) throw Error('state-audit-writable-slot-required');
  const ports = [object(data(application, 'battleStatePort').value)];
  const applicationPorts = Object.getOwnPropertyDescriptor(object(application), 'ports');
  if (applicationPorts) {
    if (!('value' in applicationPorts)) throw Error('state-audit-own-data-required:ports');
    const state = object(data(object(applicationPorts.value), 'state').value);
    if (!ports.includes(state)) ports.push(state);
  }
  const defineDescriptor = data(reflection, 'defineProperty'), define = defineDescriptor.value;
  if (typeof define !== 'function' || isProxy(define)) throw Error('state-audit-function-required');
  const installable = (descriptor: PropertyDescriptor): void => {
    if (!descriptor.configurable && !descriptor.writable) throw Error('state-audit-hook-not-installable');
  };
  installable(defineDescriptor);
  // Admission is complete before the first hook changes. A malformed second
  // port must leave the earlier legitimate port completely untouched.
  const admissions = ports.map(port => {
    const descriptor = data(port, 'replace'), replace = descriptor.value;
    if (typeof replace !== 'function' || isProxy(replace)) throw Error('state-audit-function-required');
    installable(descriptor); return { port, descriptor, replace };
  });
  const errors: unknown[] = [], restorations: { port: object; descriptor: PropertyDescriptor; observed: (this: unknown, ...args: unknown[]) => unknown }[] = [];
  let active = true, atomicSerial = 0;
  const notify = (value: unknown): void => { if (active) { atomicSerial++; try { installed(value); } catch (error) { errors.push(error); } } };
  const dispose = (): void => {
    active = false;
    for (const row of [...restorations].reverse()) if (Object.getOwnPropertyDescriptor(row.port, 'replace')?.value === row.observed) Object.defineProperty(row.port, 'replace', row.descriptor);
    if (Object.getOwnPropertyDescriptor(reflection, 'defineProperty')?.value === defineObserved) Object.defineProperty(reflection, 'defineProperty', defineDescriptor);
  };
  const defineObserved = function(this: unknown, ...args: unknown[]): unknown {
    const result: unknown = Reflect.apply(define, this, args);
    try {
      if (result === true && args[0] === system && args[1] === '_psGame' && data(root, '$gameSystem').value === system) { notify(slot()); }
    } catch (error) { errors.push(error); }
    return result;
  };
  try {
  for (const { port, descriptor: replaceDescriptor, replace } of admissions) {
    const replaceObserved = function(this: unknown, ...args: unknown[]): unknown {
      const before = slot(), serial = atomicSerial; let returned = false;
      try { const result: unknown = Reflect.apply(replace, this, args); returned = true; return result; }
      finally {
        try {
          if (active && this === port && data(root, '$gameSystem').value === system) {
            const after = slot(); if (atomicSerial === serial && after === args[0] && (returned || after !== before)) notify(after);
          }
        } catch (error) { errors.push(error); }
      }
    };
    restorations.push({ port, descriptor: replaceDescriptor, observed: replaceObserved });
    Object.defineProperty(port, 'replace', { ...replaceDescriptor, value: replaceObserved });
  }
  Object.defineProperty(reflection, 'defineProperty', { ...defineDescriptor, value: defineObserved });
  } catch (error) { dispose(); throw error; }
  return { errors, dispose };
}
