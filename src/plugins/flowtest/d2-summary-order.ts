/* eslint-disable @typescript-eslint/no-explicit-any */
// Reusable finite Scene exercise. The outer package/Boot supervisor is a separate admission obligation.
import PLAN from '../../../experiments/step5/4/summary-order-native-plan.json';
export const summaryOrderNativePlan = PLAN;

/** Drive an already accepted real App/Gen8 Scene. Rendering is an explicit evidence port:
 * native callers must provide actual Bitmap snapshots, controlled callers must label their port.
 * This module never starts a process, changes product input, or claims native qualification. */
export async function exerciseBattleSummaryOrder(p: any, c: any): Promise<any> {
  const { G, W, assert, eq, clone, frames, press, inMode, waitFor, evidence } = p;
  const flow = W.PSFlow, scene = p.battle(), session = scene?._session, app = flow.app(), op = flow._op;
  const generation = app.stateGeneration, system = G.$gameSystem;
  assert(PLAN.cases.some(row => row.id === c.id && row.language === c.language), 'fixed summary case');
  assert(session && session === op?.session && scene._mode === 'main' && !scene._busy, 'accepted ready Scene');
  eq(flow.translator().lang, c.language, 'actual selected language');
  assert(flow.fast === false, 'normal presentation mode');
  assert(typeof evidence === 'function', 'explicit render evidence port');
  const stable = (v: any) => p.api().contentCompile.canonicalJson(v), before = clone(flow.game());
  const descriptor = Object.getOwnPropertyDescriptor(system, '_psGame');
  assert(descriptor && descriptor.configurable && descriptor.writable && 'value' in descriptor, 'own state observer');
  let value = descriptor.value, committed = false;
  const installs: any[] = [], renders: any[] = [], selected: any[] = [];
  const get = () => value, set = (next: any) => { installs.push(clone(next)); value = next; };
  Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get, set });
  const current = () => {
    assert(flow._op === op && flow._app === app && app.stateGeneration === generation, 'same active owner');
    assert(scene._session === session && !scene._failure, 'same healthy Scene');
  };
  const unchanged = () => { current(); eq(stable(flow.game()), stable(before), 'whole state unchanged before final confirmation'); eq(installs.length, 0, 'no early state installation'); };
  const command = async (key: any) => {
    unchanged(); const state = scene.inputState(); assert(state.ready, 'actual command ready');
    const i = scene._menu._items.findIndex((row: any) => row.ext === key);
    assert(i >= 0 && scene._menu._items[i].enabled !== false, 'stable enabled command identity');
    scene._menu.select(i); scene.onMenuOk(); await frames(1);
  };
  const management = () => W.PSManagement.current();
  const windowSet = () => {
    const rows: any[] = []; const walk = (node: any) => { if (!node) return; if (node.contents) rows.push(node); for (const child of node.children ?? []) walk(child); }; walk(scene); return rows;
  };
  let summaryWindow: any = null;
  const openSummary = async () => {
    const prior = new Set(windowSet()); await command('party'); await inMode('party');
    await command(session.party[0].id); await inMode('party-command'); await command('summary');
    await waitFor(() => management()?.ready && management().view.kind === 'summary', 'shared Summary ready');
    summaryWindow = windowSet().find(row => !prior.has(row)); assert(summaryWindow, 'new actual shared Summary window');
    for (let i = 0; i < 3; i++) await press('right'); await press('ok');
    eq(management().view.detail, 'moves', 'actual Summary moves page'); unchanged();
  };
  const shot = async (stage: string, moves: any[]) => {
    unchanged(); const state = management(); assert(state?.ready && state.view.detail === 'moves', 'visible moves view');
    const lines = state.text.filter((line: string) => line.includes(' PP'));
    assert(lines[0]?.includes(moves[0].pp + '/' + moves[0].maxpp + ' PP') && lines[1]?.includes(moves[1].pp + '/' + moves[1].maxpp + ' PP'), 'actual Summary PP rows');
    const row = await evidence({ id: c.id, language: c.language, stage, scene, window: summaryWindow, view: clone(state), moves: clone(moves), frame: G.Graphics.frameCount });
    assert(row && row.stage === stage && row.id === c.id, 'evidence matches exact case and stage'); renders.push(row);
  };
  const closeSummary = async () => {
    await press('cancel'); await press('cancel'); await inMode('party');
    scene.onMenuCancel(); await frames(1); await inMode('main'); assert(!management(), 'Summary released before action'); unchanged();
  };
  try {
    const original = clone(PLAN.moves), id = session.party[0].id;
    eq(session.party[0].moves, original, 'frozen full records'); const engineBefore = session.gw.snapshot();
    await openSummary(); await shot('before-sort', original);
    await press('ok'); eq(management().view.selected, 0, 'first USE selects source');
    eq(session.party[0].moves, original, 'selection alone does not swap'); await press('cancel');
    eq(management().view.selected, null, 'BACK cancels source only'); eq(session.party[0].moves, original, 'cancel has no action write');
    await press('ok'); await press('down'); await press('ok');
    await waitFor(() => management()?.ready && management().view.selected === null, 'owned async swap and redraw');
    const swapped = [original[1], original[0]]; eq(session.party[0].moves, swapped, 'complete records swap including PP Ups');
    eq(session.gw.snapshot(), engineBefore, 'temporary battle wrappers and RNG unchanged by Summary'); await shot('after-sort', swapped);
    await closeSummary(); await command('fight'); await inMode('moves');
    eq(scene._menu._items[0].ext, 1, 'original battle wrapper slot identity'); await command(1); await inMode('main');
    const used = [{ ...swapped[0] }, { ...swapped[1], pp: swapped[1].pp - 1 }];
    eq(session.party[0].moves, used, 'actual Gen8 PP follows move identity after sorting'); selected.push({ slot: 1, move: 'tackle', pp: used[1].pp });
    await openSummary(); await shot('after-use', used); await closeSummary();
    await command('run'); await inMode('end'); eq(session.ended.reason, 'run', 'normal escape ends this battle'); unchanged();
    await frames(1); scene.onMenuOk(); await frames(3);
    eq(flow.lastOutcome.commit, 'applied', 'real final App outcome'); eq(installs.length, 1, 'single final state installation'); committed = true;
    eq(flow.game().party.find((member: any) => member.id === id).moves, used, 'actual installed move order and PP Ups');
    const saved = stable(flow.game()); scene.onEnd(); eq(installs.length, 1, 'duplicate finish does not install again'); eq(stable(flow.game()), saved, 'repeat outcome preserves installed state');
    eq(renders.map(row => row.stage), PLAN.renderStages, 'all three stages in order');
    return { id: c.id, language: c.language, nativeClaim: 'NOT_SELF_QUALIFIED', before, after: clone(flow.game()), installs: installs.length, selected, renders, rootReleased: !app.saveBlocked };
  } finally {
    const desc = Object.getOwnPropertyDescriptor(system, '_psGame');
    if (desc?.get === get && desc?.set === set) Object.defineProperty(system, '_psGame', { ...descriptor, value });
    if (!committed && flow._op === op && flow._app === app && app.stateGeneration === generation && flow.running) flow.abort(Error('owned Summary exercise cleanup'), op);
  }
}
