/* eslint-disable @typescript-eslint/no-explicit-any */
/** Explicit isolated mode. Natural Scene updates, public battle events and actual owned MZ images. */
export async function runD2Pictures(p: any): Promise<void> {
  const { G, W, scenario, toMap, fresh, startEvent, inMode, battle, choose, frames, waitFor, game, clone, finishBattle, shot, report, assert, eq } = p;
  report.d2Pictures = { version: 'D2-basic-pictures-host-v1', preset: 'simple-default-pictures-v1', cases: [] };
  const record = (value: any) => { report.d2Pictures.cases.push(value); return value; };
  const sprites = (s: any) => s.children.filter((x: any) => x._psPictureRole);
  const body = (s: any, id: string) => sprites(s).find((x: any) => x._psPictureKey === 'p1:' + id && x._psPictureRole === 'body');
  const begin = async (ready = true) => { await toMap(); fresh(); await startEvent(2); if (ready) await inMode('main'); return battle(); };
  const abort = async () => { W.PSFlow.abort(Error('D2 pictures controlled cleanup')); await finishBattle(); };
  await scenario('D2-P01 natural send-out draws private body and shadow and repeats one update idempotently', async () => {
    const s = await begin(false), before = clone(game());
    await waitFor(() => sprites(s).some((x: any) => x._psPictureRole === 'body' && x.scale.x > .25 && x.scale.x < .8), 'natural send-out intermediate actual Sprite');
    const moving = sprites(s).find((x: any) => x._psPictureRole === 'body' && x.scale.x > .25 && x.scale.x < .8);
    const shadow = sprites(s).find((x: any) => x._psPictureKey === moving._psPictureKey && x._psPictureRole === 'shadow');
    assert(shadow, 'parallel owned shadow exists'); eq(shadow.scale.x, moving.scale.x, 'two parallel track progress values'); assert(!s.inputState().ready, 'animation blocks real input');
    const root = s._windowLayer, ordering = sprites(s).every((x: any) => s.children.indexOf(x) < s.children.indexOf(root)); assert(ordering, 'actual pictures below actual windows');
    let visible: any, hidden: any, rendered = false;
    try {
      visible = G.Bitmap.snap(s); moving.visible = false; hidden = G.Bitmap.snap(s);
      const x = Math.round(moving.x), y = Math.round(moving.y - 2);
      rendered = visible.getPixel(x,y) !== hidden.getPixel(x,y); assert(rendered, 'real composed Scene contains the animated portrait');
    } finally { moving.visible = true; visible?.destroy(); hidden?.destroy(); }
    let observations = 0; const update = s.update;
    s.update = function () {
      update.call(this);
      if (observations || !this.pictureState()?.runningGroups) return;
      const state = this.pictureState();
      if (!state.actors.length || !state.actors.every((x: any) => x.body === 1 && x.shadow === 1)) return;
      const ordinal = this._pictureUpdate, snapshot = clone(state);
      for (let i = 0; i < 4; i++) this.updateQueue();
      eq(this._pictureUpdate, ordinal, 'same actual update ordinal after repeated queue reads'); eq(this.pictureState(), snapshot, 'endpoint cannot aggregate-complete in the same update'); observations++;
    };
    try { await inMode('main'); assert(observations === 1, 'one natural all-track endpoint observed before the next actual update'); await shot('d2-pictures-send-out'); }
    finally { s.update = update; }
    eq(game(), before, 'natural picture playback never installs game state'); await abort();
    return record({ id: 'D2-P01', sameUpdateEndpointObservations: observations, compositorChanged: rendered, parallelTracks: 2 });
  });
  await scenario('D2-P02 actual switch recalls the old actor before growing the public replacement', async () => {
    const s = await begin(), before = clone(game()), original = s.presentationState().cards.find((x: any) => x.side === 'p1' && x.active).id;
    const old = body(s, original), bitmap = old.bitmap, rows: any[] = [], update = s.update;
    s.update = function () { update.call(this); rows.push({ ordinal: this._pictureUpdate, t: performance.now(), state: clone(this.pictureState()) }); };
    try {
      await choose(/^Pok/); await inMode('party'); await choose(/Blastoise/); await inMode('main');
      const active = s.presentationState().cards.find((x: any) => x.side === 'p1' && x.active).id;
      assert(active !== original, 'real Session changed the public active identity');
      const recall = rows.find((row: any) => row.state.actors.some((x: any) => x.id === original && x.body > 0 && x.body < 1));
      const grow = rows.find((row: any) => row.state.actors.some((x: any) => x.id === active && x.body > 0 && x.body < 1));
      assert(recall && grow && recall.ordinal < grow.ordinal, 'real intermediate recall precedes new growth');
      assert(old.destroyed && bitmap.baseTexture === null, 'old private Sprite and Bitmap released after the public replacement');
      eq(body(s, active).scale.x, 1, 'actual successor reaches full size'); eq(s._menu.index(), 0, 'new public actor keeps accepted cursor reset');
      eq(game(), before, 'working switch and pictures never install game'); await shot('d2-pictures-replacement'); await abort();
      return record({ id: 'D2-P02', original, active, recallOrdinal: recall.ordinal, growOrdinal: grow.ordinal, sampledUpdates: rows.length });
    } finally { s.update = update; }
  });
  await scenario('D2-P03 abort during natural picture work releases own images and late tasks cannot paint a successor', async () => {
    const old = await begin(false), before = clone(game());
    await waitFor(() => old.pictureState()?.runningGroups > 0, 'actual queued natural picture work');
    const tasks = old._controller.queue.filter((x: any) => typeof x !== 'string'), images = sprites(old), bitmaps = images.map((x: any) => x.bitmap);
    assert(images.length >= 2 && tasks.length, 'owns actual images and cancellable work');
    await abort(); assert(images.every((x: any) => x.destroyed), 'old owned sprites destroyed'); assert(bitmaps.every((x: any) => x.baseTexture === null), 'old owned Bitmap GPU resources released'); eq(old.pictureState().actors, [], 'retired consumer has no actor handles'); eq(game(), before, 'cancelled display never installs game');
    const next = await begin(), snapshot = clone(next.pictureState()), handles = sprites(next), nextGame = clone(game());
    for (const task of tasks) { assert(task.advance(performance.now() + 10000), 'old task remains terminal'); task.cancel(); }
    old.updateQueue(); old._pictures.dispose(); await frames(1);
    eq(next.pictureState(), snapshot, 'late old work cannot touch successor image state'); assert(handles.every((x: any) => !x.destroyed && x.bitmap), 'successor private resources remain owned and alive'); eq(game(), nextGame, 'late work cannot change successor game'); await abort();
    return record({ id: 'D2-P03', releasedImages: images.length, cancelledTasks: tasks.length, successorUntouched: true });
  });
}
