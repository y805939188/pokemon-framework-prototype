/* eslint-disable @typescript-eslint/no-explicit-any */
/** Isolated default-presentation qualification. Natural KO and display-only
 * controls have different labels; no claim of Ruby or audible-output parity. */
export async function runD2Faint(p: any): Promise<void> {
  const { G, W, scenario, toMap, fresh, startEvent, inMode, battle, choose, frames, waitFor, game, clone, finishBattle, shot, report, assert, eq } = p;
  report.d2Faint = { version: 'D2-faint-host-v2', preset: 'simple-faint-feedback-v1', durationSource: 'mz-decoded-v1', cases: [] };
  const record = (row: any) => { report.d2Faint.cases.push(row); return row; };
  const images = (s: any) => s.children.filter((x: any) => x._psPictureRole);
  const begin = async () => { await toMap(); fresh(); await startEvent(2); await inMode('main'); return battle(); };
  const abort = async () => { W.PSFlow.abort(Error('D2 faint controlled cleanup')); await finishBattle(); };
  const cry = (s: any) => s.presentationState().faintAudio.find((r: any) => r.kind === 'faint-cry');
  const cue = (s: any) => s.presentationState().faintAudio.find((r: any) => r.kind === 'faint-effect');
  const naturalKO = async (s: any) => {
    for (let n = 0; n < 12; n++) {
      await choose(/^Fight/); await inMode('moves'); await choose(/flamethrower/i);
      await waitFor(() => cry(s) || s.inputState().ready, 'natural attack returns or begins faint');
      if (cry(s)) return n + 1;
      await inMode('main');
    }
    throw new Error('natural fixed battle produced no faint in twelve attacks');
  };
  await scenario('D2-F01 natural KO keeps the real HP0 portrait, decodes owned PCM and observes parallel endpoints', async () => {
    const s = await begin(), before = clone(game()), foe = s.presentationState().cards.find((x: any) => x.side === 'p2' && x.active);
    const body = images(s).find((x: any) => x._psPictureRole === 'body' && x._psPictureKey === 'p2:' + foe.id);
    const member = s._session.foeTeam.find((x: any) => x.id === foe.id);
    const contentKey = s._session.content.speciesKeys?.[member.species]?.species ?? member.species;
    const expectedCry = 'Cries/' + contentKey + '_faint';
    eq(expectedCry, 'Cries/pidgey_faint', 'frozen formal content id matches the author PCM identity');
    const shadow = images(s).find((x: any) => x._psPictureRole === 'shadow' && x._psPictureKey === 'p2:' + foe.id), initialY = body.y;
    const rows: any[] = [], update = s.update; let endpoint: number | null = null;
    s.update = function (...args: any[]) {
      const result = update.apply(this, args);
      if (cry(s)) {
        const row = { update: s._pictureUpdate, t: performance.now(), destroyed: !!body.destroyed, opacity: body.opacity, y: body.y,
          box: s.presentationState().cards.find((x: any) => x.side === 'p2' && x.id === foe.id)?.boxOpacity, shadow: shadow.opacity };
        if (rows.length < 2000) rows.push(row);
        if (!body.destroyed && body.opacity === 0 && cue(s) && endpoint === null) {
          endpoint = s._pictureUpdate;
          for (let i = 0; i < 3; i++) s.updateQueue();
          eq(s._pictureUpdate, endpoint, 'completion reads cannot mint a Scene update'); assert(!body.destroyed, 'same update still owns endpoint portrait');
        }
      }
      return result;
    };
    let attacks = 0;
    try {
      attacks = await naturalKO(s); const request = cry(s);
      eq(request.assetId, expectedCry, 'fixed Pidgey dedicated PCM selected'); eq(request.pitch, 100, 'dedicated pitch');
      await waitFor(() => rows.some(r => r.box === 0 && !r.destroyed && r.opacity === 255 && r.shadow === 255), 'box gone while body and shadow still wait for d');
      assert(!s.inputState().ready, 'faint owns input');
      await waitFor(() => rows.some(r => !r.destroyed && r.y > initialY && r.opacity > 0 && r.opacity < 255 && r.shadow === 0), 'actual body down/fade after independent cue');
      await shot('d2-faint-natural-mid-drop');
      await waitFor(() => body.destroyed, 'faint portrait released after next update observation');
      assert(endpoint !== null, 'real endpoint was observed before release'); assert(rows.some(r => r.destroyed && r.update > endpoint!), 'later actual update releases portrait');
      const start = s.presentationState().faintAudio.find((r: any) => r.kind === 'faint-audio-start' && r.assetId === expectedCry);
      assert(start && start.fileSeconds === 1 && start.pitch === 100, 'real AudioContext decoded one-second PCM and started its owned node');
      const delayMs = cue(s).t - request.t;
      assert(delayMs >= 1075 && delayMs < 1600, 'real 22-unit start offset within host update opportunity; no wall-clock exactness claim');
      await inMode('main'); eq(game(), before, 'working trainer battle has not installed a persistent result');
      record({ id: 'D2-F01', input: 'natural real Session KO, dedicated one-second author PCM', attacks, endpointUpdate: endpoint, actualCueDelayMs: delayMs, rows, audibleOutput: 'NOT_VERIFIED' });
    } finally { s.update = update; }
    await abort();
  });
  await scenario('D2-F02 labelled public faint with no cry still requests actual independent SE without changing domain state', async () => {
    const s = await begin(), before = clone(game()), engine = s._session.gw.snapshot(), card = s.presentationState().cards.find((x: any) => x.side === 'p1' && x.active);
    s.pushMessages([{ kind: 'events', events: [{ type: 'faint', args: ['p1a: ' + card.id] }] }]);
    await waitFor(() => cry(s), 'public faint requested'); eq(cry(s).status, 'missing', 'no player fixture cry');
    await waitFor(() => cue(s), 'independent faint cue requested despite no species cry');
    await waitFor(() => s.presentationState().faintAudio.some((r: any) => r.kind === 'faint-audio-start' && r.assetId === 'Pkmn faint'), 'owned independent SE node started');
    await inMode('main'); assert(s.presentationState().cards.find((x: any) => x.id === card.id && x.side === 'p1').portraitVisible === false, 'only this shown faint portrait hidden');
    eq(s._session.gw.snapshot(), engine, 'display control did not issue a battle command'); eq(game(), before, 'display control did not install state');
    await shot('d2-faint-missing-cry-control'); record({ id: 'D2-F02', input: 'display-only published faint; not natural battle equivalence', missingCry: true, independentOwnedSEStarted: true }); await abort();
  });
  await scenario('D2-F03 natural faint abort releases old media/images and late tasks cannot touch the successor', async () => {
    const old = await begin(), before = clone(game()); await naturalKO(old);
    assert(old.pictureState().faintAudio.some((x: any) => x.voices > 0), 'real owned cry node active before abort');
    const tasks = old._controller.queue.filter((x: any) => typeof x !== 'string'), sprites = images(old), bitmaps = sprites.map((x: any) => x.bitmap);
    await abort(); eq(old.pictureState().faintAudio, [], 'retired owner retained no media jobs'); assert(sprites.every((x: any) => x.destroyed), 'only old images released'); assert(bitmaps.every((x: any) => x.baseTexture === null), 'owned GPU resources released'); eq(game(), before, 'abort did not install');
    const next = await begin(), snapshot = clone(next.pictureState()), saved = clone(game()), owned = images(next);
    for (const task of tasks) { assert(task.advance(performance.now() + 10000), 'late old work terminal'); task.cancel(); }
    old.updateQueue(); old._pictures.dispose(); await frames(1);
    eq(next.pictureState(), snapshot, 'late old work cannot mutate successor'); eq(game(), saved, 'successor game unchanged'); assert(owned.every((x: any) => !x.destroyed && x.bitmap), 'successor handles alive');
    record({ id: 'D2-F03', input: 'natural faint with explicit owner abort', cancelledTasks: tasks.length, successorUntouched: true }); await abort();
  });
}
