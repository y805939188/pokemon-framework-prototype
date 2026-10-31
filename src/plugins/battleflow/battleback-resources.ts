/** Logical WP67-A battleback selection only. Resolution/loading and rendering belong to later adapters. */
export interface BattlebackContext {
  background: string;
  platform?: string;
  /** 1 = evening, 2 = night; other finite values select the unsuffixed names. */
  time: number;
}
export interface BattlebackResourcePlan {
  directory: 'Graphics/Battlebacks/';
  background: string;
  message: string;
  playerBase: string;
  foeBase: string;
  /** Only existence decisions needed to select names, not a claim that final requests will load. */
  probes: { logicalPath: string; found: boolean }[];
}

/** The query adapter answers whether a complete logical bitmap path can resolve; it does not load it. */
export function selectBattlebackResources(
  context: BattlebackContext,
  canResolve: (logicalPath: string) => boolean,
): BattlebackResourcePlan {
  const { background, platform, time } = context;
  if (typeof background !== 'string' || !background.length ||
      platform !== undefined && (typeof platform !== 'string' || !platform.length) ||
      !Number.isFinite(time) || typeof canResolve !== 'function') {
    throw new Error('invalid battleback resource context');
  }
  const directory = 'Graphics/Battlebacks/' as const;
  const suffix = time === 1 ? 'eve' : time === 2 ? 'night' : null;
  const probes: BattlebackResourcePlan['probes'] = [];
  const resolved = new Map<string, boolean>();
  const found = (name: string): boolean => {
    const logicalPath = directory + name;
    if (!resolved.has(logicalPath)) {
      const value = canResolve(logicalPath);
      if (typeof value !== 'boolean') throw new Error('invalid battleback resolution result');
      resolved.set(logicalPath, value); probes.push({ logicalPath, found: value });
    }
    return resolved.get(logicalPath)!;
  };
  const variant = (part: 'bg' | 'message'): string => {
    const timed = suffix ? `${background}_${suffix}_${part}` : null;
    return timed && found(timed) ? timed : `${background}_${part}`;
  };
  const selectedBackground = variant('bg'), message = variant('message');
  let prefix = platform === undefined ? background : `${background}_${platform}`;
  if (suffix && found(`${prefix}_${suffix}_base0`)) prefix += `_${suffix}`;
  if (platform !== undefined && !found(`${prefix}_base0`)) {
    prefix = platform;
    if (suffix && found(`${platform}_${suffix}_base0`)) prefix += `_${suffix}`;
  }
  return {
    directory, background: directory + selectedBackground, message: directory + message,
    playerBase: directory + `${prefix}_base0`, foeBase: directory + `${prefix}_base1`,
    probes: probes.map(probe => ({ ...probe })),
  };
}
