/* eslint-disable @typescript-eslint/no-explicit-any */
/** Explicit isolated mode. Natural damage and labelled display-only projection controls stay separate. */
export async function runD2Damage(p: any): Promise<void> {
  const { G, W, scenario, toMap, fresh, startEvent, inMode, battle, choose, frames, waitFor, game, clone, finishBattle, shot, report, assert, eq } = p;
  report.d2Damage = { version: 'D2-damage-host-v1', preset: 'simple-damage-feedback-v1', cases: [] };
  const record = (value: any) => { report.d2Damage.cases.push(value); return value; };
  const sprites = (s: any) => s.children.filter((x: any) => x._psPictureRole);
  const begin = async () => { await toMap(); fresh(); await startEvent(2); await inMode('main'); const s = battle(); eq(s.pictureState().version, 'd2-basic-picture-consumer-v2', 'actual new consumer'); return s; };
  const abort = async () => { W.PSFlow.abort(Error('D2 damage controlled cleanup')); await finishBattle(); };
  const attack = async () => { await choose(/^Fight/); await inMode('moves'); await choose(/flamethrower/i); };
  await scenario('D2-D01 natural Session damage blinks actual composed pixels while HP retains input ownership', async () => {
    const s = await begin(), before = clone(game()), foe = s.presentationState().cards.find((x: any) => x.side === 'p2' && x.active);
    const sprite = sprites(s).find((x: any) => x._psPictureRole === 'body' && x._psPictureKey === 'p2:' + foe.id);
    await attack();
    const intermediate = () => { const card = s.presentationState().cards.find((x: any) => x.id === foe.id && x.side === 'p2'); return card.hp > 0 && card.hp < card.maxhp; };
    await waitFor(() => s.pictureState().runningGroups > 0 && intermediate() && sprite.opacity === 0, 'natural damage hidden phase');
    assert(!s.inputState().ready, 'hidden phase owns real input');
    let image: any; const pixel = () => { try { image = G.Bitmap.snap(s); return image.getPixel(Math.round(sprite.x), Math.round(sprite.y - 2)); } finally { image?.destroy(); image = null; } };
    const hidden = pixel();
    await waitFor(() => s.pictureState().runningGroups > 0 && intermediate() && sprite.opacity === 255, 'natural damage visible phase');
    const visible = pixel(); assert(hidden !== visible, 'natural off/on changes actual composed Scene pixels');
    const gateway = s._session.gw, read = gateway.readState; let polls = 0;
    gateway.readState = function (...args: any[]) { polls++; return read.apply(this, args); };
    try { await frames(3); eq(polls, 0, 'damage display never polls live engine'); } finally { gateway.readState = read; }
    await waitFor(() => s.pictureState().runningGroups === 0 && intermediate(), 'blink finished before the full HP second');
    assert(!s.inputState().ready, 'HP still blocks after shorter blink ends'); await shot('d2-damage-natural-hp-wait');
    await inMode('main'); eq(game(), before, 'actual working battle and display did not install persistent state'); await abort();
    return record({ id: 'D2-D01', input: 'natural real Session Flamethrower', hidden, visible, livePolls: polls, HPStillBusyAfterBlink: true });
  });
  await scenario('D2-D02 labelled two-target public projection blinks in parallel without domain commands', async () => {
    const s = await begin(), before = clone(game()), engine = s._session.gw.snapshot(), cards = s.presentationState().cards.filter((x: any) => x.active);
    const args = cards.flatMap((x: any) => [x.side + 'a: ' + x.id, Math.max(1, Math.floor(x.hp / 2)) + '/' + x.maxhp]);
    // Presentation-only public input: no claim that this fixed battle naturally emitted Pain Split.
    s.pushMessages([{ kind: 'events', events: [{ type: '-sethp', args }] }]);
    await waitFor(() => s.pictureState().runningGroups === 2 && sprites(s).filter((x: any) => x._psPictureRole === 'body').every((x: any) => x.opacity === 0), 'same-update dual hidden phase');
    assert(sprites(s).filter((x: any) => x._psPictureRole === 'shadow').every((x: any) => x.opacity === 255), 'shadows steady');
    const ordinal = s._pictureUpdate, snapshot = clone(s.pictureState());
    for (let i = 0; i < 4; i++) s.updateQueue();
    eq(s._pictureUpdate, ordinal, 'same actual update ordinal'); eq(s.pictureState(), snapshot, 'repeated consumer reads are idempotent'); assert(!s.inputState().ready, 'both targets own wait');
    await inMode('main'); eq(s._session.gw.snapshot(), engine, 'public display control issued no engine command'); eq(game(), before, 'public display control wrote no persistent state'); await shot('d2-damage-two-target-control'); await abort();
    return record({ id: 'D2-D02', input: 'explicit display-only two-target public sethp, not natural battle equivalence', parallelGroups: 2, sameUpdate: ordinal });
  });
  await scenario('D2-D03 abort during natural damage cancels the composite without touching a successor', async () => {
    const old = await begin(), before = clone(game()), foe = old.presentationState().cards.find((x: any) => x.side === 'p2' && x.active); await attack();
    await waitFor(() => {
      const shown = old.presentationState().cards.find((x: any) => x.side === 'p2' && x.id === foe.id);
      return old.pictureState().runningGroups > 0 && shown.hp > 0 && shown.hp < shown.maxhp;
    }, 'natural damage group and its intermediate HP started');
    const tasks = old._controller.queue.filter((x: any) => typeof x !== 'string'), images = sprites(old), bitmaps = images.map((x: any) => x.bitmap);
    await abort(); assert(images.every((x: any) => x.destroyed), 'own sprites destroyed'); assert(bitmaps.every((x: any) => x.baseTexture === null), 'own GPU bitmaps released'); eq(old.pictureState().runningGroups, 0, 'no retained cancelled group'); eq(game(), before, 'abort did not install');
    const next = await begin(), snapshot = clone(next.pictureState()), nextGame = clone(game()), owned = sprites(next);
    for (const task of tasks) { assert(task.advance(performance.now() + 10000), 'late composite terminal'); task.cancel(); }
    old.updateQueue(); old._pictures.dispose(); await frames(1);
    eq(next.pictureState(), snapshot, 'late composite cannot repaint successor'); assert(owned.every((x: any) => !x.destroyed && x.bitmap), 'successor handles preserved'); eq(game(), nextGame, 'successor game unchanged'); await abort();
    return record({ id: 'D2-D03', input: 'natural damage with explicit owner abort control', cancelledTasks: tasks.length, releasedImages: images.length, successorUntouched: true });
  });
}
