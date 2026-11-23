import type { WorldWeatherIntent } from '../../framework/rules/world-data';
import type { WorldOperationOutcome } from '../../framework/app';

/** Command parameters are not save recovery: explicit rain/power=0 is strength six. */
export function commandWeatherIntent(params: readonly unknown[]): WorldWeatherIntent | null {
  const type = params[0], power = params[1], durationFrames = params[2];
  if (typeof power !== 'number' || !Number.isFinite(power) || power < 0 || power > 9 || typeof durationFrames !== 'number' || !Number.isSafeInteger(durationFrames) || durationFrames < 0) return null;
  if (type === 'none') return { type: 'None', strength: 0, durationFrames };
  const worldType = type === 'rain' ? 'Rain' : type === 'storm' ? 'Storm' : type === 'snow' ? 'Snow' : null;
  return worldType ? { type: worldType, strength: (power + 1) * 6, durationFrames } : null;
}
export interface WeatherCommandPort { inBattle(): boolean; changeBusiness(intent: WorldWeatherIntent): WorldOperationOutcome; diagnose(reason: string): void }
/** The original command retains changeWeather, duration/wait and its return value. */
export function runWeatherCommand<T>(port: WeatherCommandPort, params: readonly unknown[], original: () => T): T {
  const battle = port.inBattle();
  const result = original();
  if (!battle) {
    const intent = commandWeatherIntent(params);
    if (!intent) port.diagnose('weather-command-invalid');
    else { const outcome = port.changeBusiness(intent); if (outcome.status === 'refused') port.diagnose(outcome.reason); }
  }
  return result;
}

/** Native MZ has four displays. Other approved business types retain their identity. */
export function projectNativeWeather(intent: WorldWeatherIntent, change: (type: string, power: number, duration: number) => void, diagnose: (reason: string) => void): void {
  const native = intent.type === 'None' ? 'none' : intent.type === 'Rain' ? 'rain' : intent.type === 'Storm' ? 'storm' : intent.type === 'Snow' ? 'snow' : null;
  if (!native) { diagnose(`world-weather-visual-unavailable:${intent.type}`); change('none', 0, intent.durationFrames); return; }
  change(native, native === 'none' ? 0 : Math.max(0, Math.min(9, intent.strength / 6 - 1)), intent.durationFrames);
}
