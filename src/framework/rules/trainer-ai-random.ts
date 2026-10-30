import { sha256Hex } from './sha256';

/** Versioned SHA-256 counter stream. It never calls a host, engine or world random source. */
export interface TrainerRandomState {
  version: 'sha256-counter53-v1'; root: string; counter: number; draws: number;
}
export function deriveTrainerRandom(seed: readonly number[] | string): TrainerRandomState {
  if (!(typeof seed === 'string' ? seed.length > 0 : Array.isArray(seed) && seed.length > 0 && seed.every(n => Number.isSafeInteger(n) && n >= 0))) throw new Error('invalid resolved battle seed');
  // UTF-8 JSON array, including seed type and the stable p2 side ordinal. No correlation nonce is a seed input.
  const root = sha256Hex(JSON.stringify(['pokemon-framework/trainer-ai/gen8/c-basic-v1', typeof seed === 'string' ? 'string' : 'array', seed, 2]));
  return { version: 'sha256-counter53-v1', root, counter: 0, draws: 0 };
}
export function trainerRandomN(state: TrainerRandomState, n: number): number {
  if (!Number.isSafeInteger(n) || n < 1 || state.version !== 'sha256-counter53-v1' || !/^[a-f0-9]{64}$/.test(state.root) || !Number.isSafeInteger(state.counter) || state.counter < 0 || !Number.isSafeInteger(state.draws) || state.draws < 0) throw new Error('invalid AI random state or bound');
  const bound = BigInt(n), range = 1n << 53n, limit = range - range % bound;
  for (;;) {
    if (state.counter >= Number.MAX_SAFE_INTEGER || state.draws >= Number.MAX_SAFE_INTEGER) throw new Error('AI random stream exhausted');
    const digest = sha256Hex(JSON.stringify([state.version, state.root, state.counter++]));
    const value = BigInt('0x' + digest.slice(0, 16)) >> 11n;
    if (value < limit) { state.draws++; return Number(value % bound); }
  }
}
