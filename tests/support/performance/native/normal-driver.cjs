'use strict';
// Standalone normal input core. No plugin registration, battle, or OS side effects.
const finite = (n, label) => { if (!Number.isFinite(n) || n < 0) throw Error(label); return n; };
const fail = message => { throw Error(message); };
class InputFailure extends Error {
  constructor(primary, secondary) {
    super('normal input failed; release/timer errors retained', { cause:primary });
    this.primary = primary instanceof InputFailure ? primary.primary : primary;
    this.cleanupErrors = [...(primary instanceof InputFailure ? primary.cleanupErrors : []),secondary];
  }
}
const retainFailure = (primary,secondary) => new InputFailure(primary,secondary);

class NormalDriver {
  constructor(ports, owner) {
    if (!owner) fail('explicit owner required');
    this.p = ports; this.owner = owner; this.inputs = []; this.lastNow = -1;
    this.busy = false; this.retired = false; this.acknowledged = new Set();
  }
  inspect(deadline) {
    finite(deadline, 'qualified absolute monotonic deadline required');
    const now = finite(this.p.now(), 'invalid monotonic clock');
    if (now < this.lastNow) fail('clock moved backwards');
    this.lastNow = now;
    if (this.retired || now >= deadline) fail(this.retired ? 'driver retired' : 'normal input deadline');
    if (this.p.clockCurrent && !this.p.clockCurrent()) fail('game clock no longer current');
    const s = this.p.read();
    if (s.owner !== this.owner || s.current !== true) fail('stale input owner');
    if (s.fast !== false || s.effects !== true) fail('normal presentation policy changed');
    return s;
  }
  async exclusive(fn) {
    if (this.busy) fail('reentrant normal input');
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  async until(predicate, deadline) {
    for (;;) {
      const s = this.inspect(deadline);
      if (predicate(s)) return s;
      await this.p.nextGameUpdate(deadline);
    }
  }
  async pulse(key, deadline, before) {
    // afterOneGameUpdate must release synchronously in the first sampled game
    // update's finally, before another update can expose a successor message.
    const fresh = this.inspect(deadline);
    const fingerprint = s => JSON.stringify([s.phase, s.ready, s.menuToken, s.index, s.items,
      s.messageToken, s.message?.phase, s.logPaused, s.statsToken]);
    if (fingerprint(fresh) !== fingerprint(before)) fail('stale pulse');
    const record = { key, gameStart: before.gameTick, at: this.p.now(), status: 'attempted' };
    this.inputs.push(record);
    let failure = null;
    try {
      this.p.dispatch('keydown', key);
      await this.p.afterOneGameUpdate(() => this.p.dispatch('keyup', key), deadline);
      record.status = 'released';
    } catch (error) {
      failure = { error };
    } finally {
      // Idempotent key-up also covers timer/fatal/cancellation and never presses
      // a successor key. Release failures propagate; they cannot report success.
      try { this.p.dispatch('keyup', key); }
      catch (error) { failure = { error:failure ? retainFailure(failure.error,error) : error }; }
    }
    if (failure) throw failure.error;
    await this.p.nextGameUpdate(deadline);
    await this.p.nextGameUpdate(deadline);
    record.gameReleased = this.p.gameTick();
  }
  choose(phase, key, deadline) {
    return this.exclusive(async () => {
      let s = await this.until(s => s.ready === true && s.phase === phase, deadline);
      const token = s.menuToken, keys = s.items.map(i => i.key);
      const matches = s.items.map((item,index)=>({item,index})).filter(x=>x.item.key===key && x.item.enabled===true);
      if (matches.length !== 1) fail('missing/disabled/ambiguous exact menu key');
      const target = matches[0].index;
      if (!Number.isSafeInteger(s.columns) || s.columns < 1) fail('invalid menu columns');
      for (let guard = 0; s.index !== target; guard++) {
        if (guard >= s.items.length * 2 + 8) fail('navigation did not converge');
        const at = s.index, columns = s.columns;
        if (!Number.isSafeInteger(at) || at < 0 || at >= keys.length) fail('invalid cursor');
        const row = Math.floor(at / columns), targetRow = Math.floor(target / columns);
        const vertical = at + (row < targetRow ? columns : -columns);
        const direction = row !== targetRow && vertical >= 0 && vertical < keys.length
          ? row < targetRow ? 'down' : 'up' : at % columns < target % columns ? 'right' : 'left';
        await this.pulse(direction, deadline, s);
        s = this.inspect(deadline);
        if (!s.ready || s.phase !== phase || s.menuToken !== token || s.columns !== columns ||
            JSON.stringify(s.items.map(i => i.key)) !== JSON.stringify(keys)) fail('menu changed during navigation');
      }
      // Recheck enabled state/owner at the actual one-shot confirmation boundary.
      s = this.inspect(deadline);
      if (!s.ready || s.phase !== phase || s.menuToken !== token ||
          s.index !== target || s.items[target]?.key !== key || s.items[target]?.enabled !== true) fail('stale confirmation');
      await this.pulse('ok', deadline, s);
      return { phase, key, index: target, input: this.inputs.at(-1) };
    });
  }
  acknowledgePause(deadline) {
    return this.exclusive(async () => {
      const s = await this.until(s => s.message?.implementation === 'paused-message-v1' &&
        s.message.phase === 'full' && s.message.visible === s.message.total &&
        s.messageToken !== null && s.messageToken !== undefined && s.logPaused === true &&
        s.gameTick > s.messageFullGameTick, deadline);
      const token = s.messageToken;
      if (this.acknowledged.has(token)) fail('pause already acknowledged');
      this.acknowledged.add(token);
      await this.pulse('ok', deadline, s);
      return { messageToken: token, input: this.inputs.at(-1) };
    });
  }
  acknowledgeStats(level, phase, deadline) {
    if (!Number.isSafeInteger(level) || !['delta','total'].includes(phase)) fail('exact stat page required');
    return this.exclusive(async () => {
      const s = await this.until(s => s.stats?.level === level && s.stats.phase === phase &&
        s.statsToken != null && s.gameTick > s.statsShownGameTick, deadline);
      if (this.acknowledged.has(s.statsToken)) fail('stat page already acknowledged');
      this.acknowledged.add(s.statsToken);
      await this.pulse('ok', deadline, s);
      return { statsToken: s.statsToken, input: this.inputs.at(-1) };
    });
  }
  retire() { this.retired = true; }
}

/** Explicit installation only; mirrors the existing updateMain-based timing seam.
 * This code is tested against a controlled SceneManager, never installed on NW here.
 */
function installGameFrames(G, { now, setTimer, clearTimer }) {
  const original = G.SceneManager.updateMain, pending = new Set();
  let tick = 0, disposed = false;
  function schedule(callback, deadline) {
    finite(deadline, 'absolute deadline required');
    if (disposed || G.SceneManager.updateMain !== wrapper || now() >= deadline) return Promise.reject(Error('game frame unavailable/deadline'));
    return new Promise((resolve, reject) => {
      const item = { callback, resolve, reject, timer: null };
      item.timer = setTimer(() => { pending.delete(item); reject(Error('game update deadline')); }, deadline - now());
      pending.add(item);
    });
  }
  function wrapper(...args) {
    tick++;
    const due = [...pending]; for (const item of due) pending.delete(item);
    let failure;
    try { return original.apply(this, args); }
    catch (error) { failure = { error }; throw error; }
    finally {
      for (const item of due) {
        let problem = failure;
        try { clearTimer(item.timer); }
        catch (error) { problem = {error:problem ? retainFailure(problem.error,error) : error}; }
        try { item.callback(); }
        catch (error) { problem = {error:problem ? retainFailure(problem.error,error) : error}; }
        if (problem) item.reject(problem.error); else item.resolve();
      }
    }
  }
  G.SceneManager.updateMain = wrapper;
  return { gameTick: () => tick, clockCurrent:()=>!disposed && G.SceneManager.updateMain===wrapper,
    nextGameUpdate: deadline => schedule(() => {}, deadline),
    afterOneGameUpdate: schedule, dispose() {
      disposed = true;
      if (G.SceneManager.updateMain === wrapper) G.SceneManager.updateMain = original;
      for (const item of pending) { clearTimer(item.timer); item.reject(Error('game clock disposed')); }
      pending.clear();
    } };
}

/** BattleScene-only adapter. Receiving/Title/Map adapters and plugin routing are
 * intentionally unbound; no fallback to direct handler calls or a fabricated App.
 */
function bindBattleScene(G, W, clock, effectsEnabled) {
  const flow = W.PSFlow, scene = G.SceneManager._scene, op = flow?._op, app = flow?._app;
  if (!scene?._psBattle || !op || !app || scene._psOp !== op) fail('actual battle owner required');
  const generation = app.stateGeneration, owner = Object.freeze({ op, app, generation });
  const ids = new WeakMap(); let serial = 0, message = null, fullTick = -1, statsToken = null, statsTick = -1;
  const identity = object => { if (!object || typeof object !== 'object') return null; if (!ids.has(object)) ids.set(object, ++serial); return ids.get(object); };
  return { owner, read() {
    const current = G.SceneManager._scene === scene && flow._op === op && flow._app === app &&
      app.stateGeneration === generation && flow.running === true;
    const dto = scene.inputState(), text = scene.ordinaryMessageState?.() ?? null;
    if (message !== scene._ordinaryMessage || text?.phase !== 'full') { message = scene._ordinaryMessage; fullTick = -1; }
    if (text?.phase === 'full' && fullTick < 0) fullTick = clock.gameTick();
    const stats = scene.levelStatsState?.() ?? null;
    const nextStatsToken = stats ? `${identity(scene._levelStatsWindow)}/${stats.level}/${stats.phase}` : null;
    if (nextStatsToken !== statsToken) { statsToken = nextStatsToken; statsTick = clock.gameTick(); }
    return { owner, current, gameTick: clock.gameTick(), fast: flow.fast, effects: effectsEnabled(),
      phase: dto.phase, ready: dto.ready, items: dto.items.map(i => ({ key: i.key, enabled: i.enabled === true })),
      columns: dto.columns, index: scene._menu.index(), menuToken: identity(scene._menu._items),
      message: text, messageToken: identity(scene._ordinaryMessage), messageFullGameTick: fullTick,
      logPaused: scene._log.pause === true, stats, statsToken, statsShownGameTick: statsTick };
  } };
}

function domDispatch(document, KeyboardEvent) {
  const codes = { ok:13, cancel:27, left:37, up:38, right:39, down:40, pageup:33, pagedown:34 };
  return (type, key) => {
    if (!['keydown','keyup'].includes(type) || !Object.hasOwn(codes,key)) fail('unknown input');
    document.dispatchEvent(new KeyboardEvent(type, { keyCode:codes[key], which:codes[key], bubbles:true }));
  };
}
module.exports = { NormalDriver, installGameFrames, bindBattleScene, domDispatch };
