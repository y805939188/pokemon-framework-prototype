/** WP65-C order and WP17-A milliseconds per visible character. */
export const TEXT_SPEED = 'psTextSpeed';
export const TEXT_SPEED_DELAYS = [50, 25, 12.5, 0] as const;
export const DEFAULT_TEXT_SPEED = 1;
export const MESSAGE_SPEED_UNIT_MS = 12.5;

function textSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TEXT_SPEED_DELAYS.length
    ? value : DEFAULT_TEXT_SPEED;
}

export function playerTextSpeed(host: { ConfigManager?: { psTextSpeed?: unknown } }): number {
  return textSpeed(host.ConfigManager?.psTextSpeed);
}

export function messageDelay(host: Parameters<typeof playerTextSpeed>[0]): number {
  return TEXT_SPEED_DELAYS[playerTextSpeed(host)];
}

const installed = new WeakSet<object>();

/** Extend the device configuration, without participating in any game save. */
export function installMessageSpeedConfig(host: any): boolean {
  const config = host.ConfigManager;
  if (typeof config?.makeData !== 'function' || typeof config.applyData !== 'function') return false;
  if (installed.has(config)) return true;
  installed.add(config);
  config[TEXT_SPEED] = playerTextSpeed(host);
  const make = config.makeData, apply = config.applyData;
  config.makeData = function (...args: any[]) {
    return { ...make.apply(this, args), [TEXT_SPEED]: textSpeed(this[TEXT_SPEED]) };
  };
  config.applyData = function (data: any, ...args: any[]) {
    const result = apply.call(this, data, ...args);
    this[TEXT_SPEED] = textSpeed(data && Object.hasOwn(data, TEXT_SPEED) ? data[TEXT_SPEED] : undefined);
    return result;
  };
  return true;
}
