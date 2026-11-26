/** Reactor displays Error.message and logs Error.stack. Rebuild both from fixed public text. */
export function runtimeError(message: string): Error {
  const error = new Error(message);
  error.stack = 'Error: ' + message;
  return error;
}

/** Do not call String, inspect a getter, or accept a raw exception by shape. */
export function ownErrorMessage(error: unknown): unknown {
  if (error === null || typeof error !== 'object') return undefined;
  try { return Object.getOwnPropertyDescriptor(error, 'message')?.value; }
  catch { return undefined; }
}
