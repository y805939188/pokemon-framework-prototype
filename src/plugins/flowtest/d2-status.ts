/* eslint-disable @typescript-eslint/no-explicit-any */
/** Actual MZ data-box/owner controls. Inert unless the existing test plugin selects d2-status. */
export async function runD2Status(p: any): Promise<void> {
  const { W, scenario, toMap, fresh, startEvent, inMode, battle, choose, frames, waitFor, game, clone, api, finishBattle, shot, report } = p;
  report.d2Status = { version: 'D2-status-host-v1', input: 'real Scene/menu/Session; isolated fixtures; explicit presentation-only late-clock control', cases: [] };
  const result = (value: any) => { report.d2Status.cases.push(value); return value; };
  const abort = async () => { W.PSFlow.abort(Error('D2 controlled test cleanup')); await finishBattle(); };
  const begin = async () => { await toMap(); fresh(); await startEvent(2); await inMode('main'); return battle(); };
  const tracePaint = (scene: any) => {
    const rows: any[] = [], window = scene._status, refresh = window.refresh;
    window.refresh = function () {
      const value = refresh.call(this);
      const state = scene.presentationState(), member = state.cards.find((card: any) => card.side === 'p1' && card.active);
      rows.push({ t: performance.now(), flash: member?.flash === true, ratio: member?.ratio,
        pixel: String(this.contents.getPixel(4, 74)).toLowerCase(), pending: state.pending });
      return value;
    };
    return { rows, restore: () => { window.refresh = refresh; } };
  };
  const flashDuration = (rows: any[]) => {
    const first = rows.findIndex(row => row.flash && row.pixel === '#ffffff');
    const end = rows.find((row, index) => index > first && !row.flash && row.pixel !== '#ffffff');
    p.assert(first >= 0 && end, 'actual Bitmap painted white flash then cleared it');
    const duration = end.t - rows[first].t; p.assert(duration >= 200, 'actual post-paint flash exposure >=200ms: ' + duration);
    return duration;
  };
  await scenario('D2-S01 real HP data box blocks input and never polls gateway during interpolation', async () => {
    const scene = await begin(), before = clone(game());
    p.assert(scene.inputState().implementation === 'd2-menu-grid-v1', 'actual D2 scene');
    await choose(/^Fight/); await inMode('moves'); await choose(/flamethrower/i);
    await waitFor(() => scene.presentationState().cards.some((card: any) => card.side === 'p2' && card.active && card.hp > 0 && card.hp < card.maxhp), 'actual intermediate published HP');
    const intermediate = scene.presentationState(); p.assert(!scene.inputState().ready && intermediate.pending > 0, 'visual wait keeps actual input gate closed');
    const gateway = scene._session.gw, read = gateway.readState; let polls = 0;
    gateway.readState = function (...args: any[]) { polls++; return read.apply(this, args); };
    try { await frames(6); p.eq(polls, 0, 'rendering never polls live engine'); } finally { gateway.readState = read; }
    p.eq(game(), before, 'UI/action working state did not install persistent game');
    await inMode('main'); await shot('d2-status-main'); await abort();
    return result({ id: 'D2-S01', intermediate, livePollsDuringRendering: polls });
  });
  await scenario('D2-S02 real KO growth publishes level segments and paints full flash for 200ms', async () => {
    await toMap(); fresh(); game().party[0].exp = api().growth.minExp('parabolic', 51) - 1;
    await startEvent(2); await inMode('main'); const scene = battle(), before = clone(game()), traced = tracePaint(scene);
    try {
      await choose(/^Fight/); await inMode('moves'); await choose(/flamethrower/i);
      await waitFor(() => scene.presentationState().cards.some((card: any) => card.flash), 'real awarded EXP flash');
      p.assert(!scene.inputState().ready, 'cannot choose during actual growth flash'); await shot('d2-status-growth-flash');
      await inMode('learn');
      p.assert(scene.presentationState().cards.find((card: any) => card.side === 'p1' && card.active).level === 51, 'display reflects published level before learning');
      const duration = flashDuration(traced.rows); p.eq(game(), before, 'growth presentation did not install working state');
      const audio = scene.presentationState().audio; p.eq(audio.map((row: any) => row.kind), ['exp-gain', 'exp-full', 'exp-gain'], 'each actual level segment owns its logical audio requests');
      await choose(/Don't learn|不学习/); await inMode('main'); await abort();
      return result({ id: 'D2-S02', duration, paints: traced.rows, audio });
    } finally { traced.restore(); }
  });
  await scenario('D2-S03 late real Scene update still paints 200ms flash rather than trusting done DTO', async () => {
    const scene = await begin(), before = clone(game()), traced = tracePaint(scene), member = scene.presentationState().cards.find((card: any) => card.side === 'p1' && card.active);
    const update = scene.updateQueue;
    try {
      scene._controller.enqueue([scene._display.experience(member.id, { level: member.level, from: 0, to: 1 })]); await frames(3);
      const since = performance.now(); scene.updateQueue = () => {};
      await waitFor(() => performance.now() - since >= 2100, 'controlled real presentation update gap', 600);
      scene.updateQueue = update;
      await waitFor(() => scene.presentationState().cards.some((card: any) => card.flash), 'late full cue actually rendered');
      p.assert(!scene.inputState().ready, 'late logical done does not release input'); await shot('d2-status-late-flash');
      await inMode('main'); const duration = flashDuration(traced.rows); p.eq(game(), before, 'presentation-only late control did not mutate game'); await abort();
      return result({ id: 'D2-S03', actualUpdateGapMs: performance.now() - since, duration, paints: traced.rows });
    } finally { scene.updateQueue = update; traced.restore(); }
  });
  await scenario('D2-S04 abort disposes visual work and late old steps cannot paint a successor', async () => {
    const old = await begin(), before = clone(game());
    await choose(/^Fight/); await inMode('moves'); await choose(/flamethrower/i);
    await waitFor(() => old.presentationState().pending > 0, 'real queued visuals');
    const tasks = old._controller.queue.filter((item: any) => typeof item !== 'string');
    await abort(); p.eq(game(), before, 'abort kept original persistent document');
    const next = await begin(), nextView = clone(next.presentationState()), nextGame = clone(game());
    for (const task of tasks) p.assert(task.advance(performance.now() + 10000), 'old cancelled task is terminal');
    old.updateQueue(); p.eq(next.presentationState(), nextView, 'old display never changes successor view/audio'); p.eq(game(), nextGame, 'old display never changes successor state');
    await abort(); return result({ id: 'D2-S04', cancelledTasks: tasks.length, successorUntouched: true });
  });
}
