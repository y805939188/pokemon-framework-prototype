/**
 * Real-host test driver timing (5.2 D-01).
 *
 * Reactor's SceneManager.update runs once per display tick and calls updateMain 0..n times: game logic is a fixed
 * 60 Hz step with catch-up when a tick is slow, and MZ samples Input only inside updateMain. On a 120 Hz display half
 * of the ticks run no game update, so a driver that counts ticks can release a key and press it again between two
 * input samples; a product latch that requires an observed release (InputLatch) then rightly ignores the second
 * press. Every hold, release and frame-bounded wait here therefore counts updateMain calls, never display ticks.
 */
export interface DriverClock { readonly game: number; readonly ticks: number }
export interface WaitPorts { clock: DriverClock; sleep(ms: number): Promise<unknown>; now(): number }
export type KeyDispatch = (type: 'keydown' | 'keyup') => void;

const progress = (clock: DriverClock, from: { game: number; ticks: number }) =>
  `game frames ${from.game}->${clock.game}, display ticks ${from.ticks}->${clock.ticks}`;

/** Resolve after `n` more game updates; a stopped game loop fails within a bounded wall time with both counters. */
export async function waitGameFrames(p: WaitPorts, n: number, label = `${n} frames`): Promise<void> {
  const from = { game: p.clock.game, ticks: p.clock.ticks }, target = from.game + n, deadline = p.now() + 10000 + n * 40;
  while (p.clock.game < target) {
    if (p.now() > deadline) throw new Error(`scene loop stopped while waiting ${label} (${progress(p.clock, from)})`);
    await p.sleep(4);
  }
}

/** Poll `cond` until it holds, at most `max` game updates and the matching wall time plus a fixed margin. */
export async function waitUntil(p: WaitPorts, cond: () => boolean, describe: () => string, max = 2400): Promise<void> {
  const from = { game: p.clock.game, ticks: p.clock.ticks }, target = from.game + max, deadline = p.now() + Math.ceil(max * 1000 / 60) + 5000;
  while (!cond()) {
    if (p.clock.game > target || p.now() > deadline) throw new Error(`timeout waiting for ${describe()} (${progress(p.clock, from)})`);
    await p.sleep(4);
  }
}

/** Keep the key down for `hold` sampled game updates, then up for `release` sampled updates, so the next press can
 *  never share the update that has to observe this release. */
export async function pressKey(p: WaitPorts, dispatch: KeyDispatch, hold = 3, release = 2): Promise<void> {
  if (!Number.isInteger(hold) || hold < 1 || !Number.isInteger(release) || release < 1) throw new Error('a key press needs at least one held and one released game frame');
  dispatch('keydown');
  try { await waitGameFrames(p, hold, 'key hold'); }
  finally { dispatch('keyup'); } // a stalled loop must not leave the key held for the next scenario
  await waitGameFrames(p, release, 'key release');
}
