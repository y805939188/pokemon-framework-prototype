/* eslint-disable @typescript-eslint/no-explicit-any */
/** Test-only normal end feedback. Observes actual production state writes and rendered windows.
 * Native execution is established by the external supervisor, never by this report. */
import PLAN from '../../../experiments/step5/4/result-feedback-native-plan.json';
import { musicNativeContent } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const resultFeedbackNativePlan = PLAN;

export async function runD2ResultFeedback(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, fightUntilEnd, press, toMapId } = p;
  const E = api(), flow = W.PSFlow, audio = G.AudioManager;
  const hash = (b: any) => p.nodeRequire('crypto').createHash('sha256').update(b).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-result-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated result mode required');
  const bytes = fs.readFileSync(arg('ps-result-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'result input'); eq(input.productCommit, PLAN.productCommit, 'fixed result product'); eq(input.productRuntime, PLAN.productRuntime, 'product runtime identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'frozen result plan'); eq(info.gitHead, input.packageHead, 'package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [name, value] of Object.entries(PLAN.productRuntime)) eq(fileHash(path.join(gameDir, name)), value, 'actual product ' + name);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual result driver');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage');
  const rel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(rel === '..' || rel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh test storage');
  eq(audio.audioFileExt(), PLAN.nativeExtension, 'native extension'); eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'qualified media set');
  for (const r of input.assets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'frozen media');
  const ids = PLAN.groups.flatMap(g => g.ids); eq(ids, ['F01', 'F02', 'F03'], 'three fixed normal cases');
  const d: any = report.resultFeedbackNative = { version: PLAN.version, inputSHA256: hash(bytes), productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime, driverPluginSHA256: input.driverPluginSHA256, packageHead: input.packageHead, nativeClaim: 'NOT_SELF_QUALIFIED', expectedIDs: ids, notRunIDs: [...ids], cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  let first = true, language = 'en', active: any = null, ordinal = 0, rng = PLAN.worldSeed;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, add: G.$gameMessage.add };
  const named = (name: string) => PLAN.prefix + name;
  const parameters = function (this: any, name: string) { const v = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...v, language, battleMusic: JSON.stringify({ presets: { battle: named('battle'), victory: named('victory') } }) } : v; };
  const messages: any[] = [], add = function (this: any, line: string) { messages.push({ line, frame: G.Graphics.frameCount }); return original.add.call(this, line); };
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const healthy = () => { if (active?.scene?._failure) throw Error('actual result Scene failure: ' + active.scene._failure); };
  const wait = (cond: () => boolean, label: string) => waitFor(() => { healthy(); return cond(); }, label);
  const retireObserver = (h: any) => {
    const desc = Object.getOwnPropertyDescriptor(h.system, '_psGame');
    if (desc?.get === h.get && desc?.set === h.set) Object.defineProperty(h.system, '_psGame', { ...h.descriptor, value: h.value });
  };
  const render = (h: any, id: string) => {
    const log = h.scene._log; assert(log.visible && log.contents && log.openness !== 0, 'terminal text window actually visible');
    let shown: any, hidden: any; const visible = log.visible;
    try {
      shown = G.Bitmap.snap(h.scene); log.visible = false; hidden = G.Bitmap.snap(h.scene);
      let different = 0;
      for (let y = 130; y < Math.min(shown.height, 410); y += 4) for (let x = 12; x < Math.min(shown.width, 800); x += 4) if (shown.getPixel(x, y) !== hidden.getPixel(x, y)) different++;
      assert(different > 0, 'actual result window pixels differ from hidden');
      const png = p.nodeRequire('buffer').Buffer.from(shown.canvas.toDataURL('image/png').split(',')[1], 'base64'), file = path.join(path.dirname(OUT), id + '-before-confirm.png');
      fs.writeFileSync(file, png, { flag: 'wx' });
      const row = { id, file: path.basename(file), sha256: hash(png), differentPixels: different, lines: [...log._lines], menu: clone(h.scene.inputState()), frame: G.Graphics.frameCount, at: G.performance.now(), language, installs: h.installs.length, stateSHA256: hash(stable(flow.game())) };
      d.renders.push(row); return row;
    } finally { log.visible = visible; shown?.destroy(); hidden?.destroy(); }
  };
  const run = async (c: any) => {
    const start = G.performance.now();
    try {
      await wait(() => mapReady() || (first && titleReady()), 'started cold Title or subsequent Map'); first = false;
      assert(!flow.running && !flow._app?.saveBlocked, 'prior root released');
      flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
      // Author content is fully configured before the App acquires its immutable content identity.
      const content = musicNativeContent(E, assert, { battle: named('battle'), victory: named('trainer-victory') });
      content.trainerTypes['music-type-normal'].baseMoney = c.baseMoney; content.trainerTypes['music-type-normal'].loseText = c.loseText;
      content.trainerTypes['music-type-normal'].winText = 'FACILITY_ONLY_NOT_ORDINARY_DEFEAT';
      const trainer = content.trainers['music-normal'][0]; trainer.version = c.trainerVersion; trainer.name = c.name; trainer.party[0].level = c.foeLevel;
      flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {}; flow.seed = [...PLAN.seed]; rng = PLAN.worldSeed;
      flow.rng = (n: number) => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * n); }; flow.fast = true;
      const state = E.state.newGame({ content, party: [], money: 1000 }); state.nextMemberOrdinal = '2'; state.badges.fill(true);
      const member = E.memberFactory.createMember({ id: 'RESULT-P1', species: c.playerHP ? 'Pidgey' : 'Snorlax', level: c.playerLevel }, content, () => 0);
      state.party = [E.speciesKey.toPersistentMember(member, content)]; if (c.playerHP) state.party[0].hp = c.playerHP;
      G.$gameSystem._psGame = state; G.$gameMessage.clear(); G.$gameMap._interpreter.clear();
      await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'actual Map.start/windows/spriteset'); await press('shift');
      audio.playBgm({ name: named('world'), volume: 80, pitch: 100, pan: 0 });
      const system = G.$gameSystem, descriptor: any = Object.getOwnPropertyDescriptor(system, '_psGame');
      assert(descriptor?.configurable && descriptor.writable && 'value' in descriptor, 'own plain state property can be observed');
      const h: any = active = { system, descriptor, value: descriptor.value, installs: [], before: clone(flow.game()), messagesAt: messages.length };
      h.get = () => h.value; h.set = (value: any) => { h.installs.push({ frame: G.Graphics.frameCount, at: G.performance.now(), beforeSHA256: hash(stable(h.value)), afterSHA256: hash(stable(value)), oldMoney: h.value.money, newMoney: value.money }); h.value = value; };
      Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get: h.get, set: h.set });
      flow.openBattle({ kind: 'trainer', trainer: { id: 'music-normal', version: c.trainerVersion }, battleId: PLAN.version + '/' + c.id, seq: ++ordinal, canLose: true });
      await inMode('main'); h.scene = battle(); h.op = flow._op; h.app = flow.app(); h.generation = h.app.stateGeneration;
      assert(h.scene._session === h.op.session && h.app.saveBlocked, 'real App Gen8 Session and root');
      eq(flow.translator().lang, c.language, 'actual configured translator'); await fightUntilEnd(/tackle/i, 12); await inMode('end');
      const tr = E.i18n.translatorFor(c.language), outcome = h.scene._session.result().outcome, losing = c.id === 'F03';
      eq(outcome.winner, losing ? 'Trainer' : 'Player', 'actual intended terminal outcome');
      const expected = losing ? [tr.t('ui.end.no_more')] : [tr.t('trainer.defeated', { name: c.name }), c.loseText];
      assert(expected.every((line: string) => h.scene._log._lines.includes(line)), 'real terminal text contains complete expected feedback');
      assert(!h.scene._log._lines.includes('FACILITY_ONLY_NOT_ORDINARY_DEFEAT') && (!losing || !h.scene._log._lines.includes(c.loseText)), 'ordinary defeat never consumes facility win or loser speech');
      eq(h.scene._menu._items.map((v: any) => v.name), [tr.t('ui.end.continue')], 'real localized Continue menu');
      eq(h.installs.length, 0, 'no actual state install before confirmation'); eq(flow.game(), h.before, 'whole state unchanged before confirmation'); assert(h.app.saveBlocked, 'confirmation still owns save lock');
      render(h, c.id); const count = h.scene._log._lines.length; h.scene.showEnd(false); eq(h.scene._log._lines.length, count, 'repeat view no duplicate feedback');
      h.scene.onMenuOk(); await frames(2); await wait(() => mapReady() && !flow.running && !h.app.saveBlocked, 'real Continue committed and Map started');
      eq(h.installs.length, 1, 'actual state port installed once'); eq(flow.lastOutcome.commit, 'applied', 'real result applied'); eq(flow.lastOutcome.code, losing ? 4 : 1, 'real outcome code');
      eq(flow.game().money, c.expectedMoney, 'actual money after one confirmation');
      if (losing) eq(flow.lastOutcome.defeat.moneyLost, c.expectedMoneyLost, 'existing D3 money loss receipt');
      const committedSHA = hash(stable(flow.game())), receipt = clone(flow.lastOutcome); h.scene.onMenuOk(); h.scene.onEnd(); await frames(3);
      eq(h.installs.length, 1, 'old repeated confirmation cannot reinstall'); eq(hash(stable(flow.game())), committedSHA, 'whole committed state unchanged after duplicate callbacks'); eq(flow.lastOutcome, receipt, 'receipt unchanged');
      const reward = tr.t('trainer.reward', { money: c.expectedReward ?? 0 }), rewardCount = messages.slice(h.messagesAt).filter(r => r.line === reward).length;
      eq(rewardCount, losing ? 0 : 1, 'reward message exactly once');
      d.cases[c.id] = { language: c.language, name: c.name, version: c.trainerVersion, expected, fixtureSHA256: hash(stable(content)), beforeSHA256: hash(stable(h.before)), afterSHA256: committedSHA, installs: h.installs, receipt, messages: messages.slice(h.messagesAt), rewardCount };
      retireObserver(h); active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - start });
    } catch (error) { results.push({ id: c.id, status: 'fail', error: String((error as any)?.stack ?? error) }); throw error; }
    finally { d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try { G.PluginManager.parameters = parameters; G.$gameMessage.add = add; for (const c of PLAN.cases) await run(c); eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'three-case whole pass'); }
  catch (error) { failed = true; primary = error; throw error; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, fn: () => void) => { try { fn(); } catch (e) { d.cleanupErrors.push({ name, error: String(e) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation) clean('own root', () => flow.abort(Error('result qualification failure cleanup'), active.op));
    if (active) clean('state observation', () => retireObserver(active));
    clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; });
    clean('message observer', () => { if (G.$gameMessage.add === add) G.$gameMessage.add = original.add; });
    clean('language', () => flow.setLanguage(original.language));
    d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress();
    if (!failed && d.cleanupErrors.length) throw Error('result driver cleanup failed');
  }
}
