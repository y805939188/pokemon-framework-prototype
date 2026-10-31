import type { TrainerAiTiming } from '../../framework/rules/trainer-ai-strategy';
/** D1 test composition only. Preserve the portable port's milliseconds/callback order. */
export function createD1Timing<Token>(
  clock: () => number,
  schedule: (milliseconds: number, callback: () => void) => Token,
  cancel: (token: Token) => void,
  observe: (value: number) => void = () => {},
): TrainerAiTiming {
  return {
    now() { const value = clock(); observe(value); return value; },
    after(milliseconds, callback) { const token = schedule(milliseconds, callback); return () => cancel(token); },
  };
}
