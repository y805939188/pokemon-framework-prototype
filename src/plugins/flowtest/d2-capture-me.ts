/* eslint-disable @typescript-eslint/no-explicit-any */
/** Test-only real MZ audio qualification. No substitute AudioBuffer/AudioContext.
 * Explicit fault controls delay publication of genuinely decoded native buffers.
 * Root decisions are programmatic public APIs, not a full receiving/evolution UI test.
 */
import PLAN from '../../../experiments/step5/4/capture-me-native-plan.json';
import { musicNativeContent } from './music-native-fixture';

export async function runD2CaptureME(p: any, continuing: boolean): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, choose, fightUntilEnd, finishBattle, press, toMapId, settledSave } = p;
  const E = api(), flow = W.PSFlow, audio = G.AudioManager, crypto = p.nodeRequire('crypto');
  const hash = (bytes: any) => crypto.createHash('sha256').update(bytes).digest('hex');
  const fileHash = (file: string) => hash(fs.readFileSync(file));
  const stable = (v: any): string => E.contentCompile.canonicalJson(v);
  const stateHash = () => hash(stable(flow.game()));
  const inputFile = arg('ps-capture-me-input');
  assert(inputFile && OUT && !arg('ps-flow-only'), 'whole frozen native mode, input and output required');
  assert(argv.includes('--ps-sound'), 'real AudioManager methods must not be suppressed');
  const inputBytes = fs.readFileSync(inputFile), input = JSON.parse(inputBytes);
  eq(input.version, PLAN.version, 'versioned native input');
  eq(input.productCommit, PLAN.productCommit, 'fixed repaired product');
  eq(input.productPluginSHA256, PLAN.productPluginSHA256, 'fixed product byte identity');
  eq(input.planSHA256, hash(stable(PLAN)), 'bundled plan equals frozen external input');
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlow.js')), PLAN.productPluginSHA256, 'actual executed product payload');
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual driver bundle');
  const packageInfo = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json'), 'utf8'));
  eq(packageInfo.gitHead, input.packageHead, 'test-only successor head');
  eq(packageInfo.workingTreeChanges, 0, 'package built from a fixed clean head');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'explicit isolated save location');
  eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage location');
  assert(path.relative(gameDir, input.saveRoot).startsWith('..'), 'saves outside APP');
  assert(typeof input.chain === 'string' && input.chain.length > 15, 'unique producer/consumer chain');
  if (!continuing) eq(fs.readdirSync(input.saveRoot), [], 'producer never consumes old saves');
  eq(audio.audioFileExt(), PLAN.nativeExtension, 'actual MZ media extension');
  for (const row of input.assets) eq(fileHash(path.join(gameDir, row.path)), row.sha256, 'actual frozen sound ' + row.path);
  assert(!fs.existsSync(path.join(gameDir, PLAN.intentionalMissingAsset)), 'missing negative must really be missing');
  const expectedIDs = PLAN.groups.flatMap(group => group.ids).filter(id => continuing ? id === 'ME15' : id !== 'ME15');
  assert(expectedIDs.length === (continuing ? 1 : 14), 'nonempty fixed scenario denominator');

  const details: any = report.captureMENative = { version: PLAN.version, chain: input.chain, inputSHA256: hash(inputBytes), productCommit: PLAN.productCommit, productPluginSHA256: PLAN.productPluginSHA256, driverPluginSHA256: input.driverPluginSHA256, packageHead: input.packageHead, expectedIDs, physicalHearing: 'NOT_VERIFIED', executionQualification: 'REQUIRES_EXTERNAL_NATIVE_PROCESS_RECEIPTS', nativeClaim: 'NOT_SELF_QUALIFIED', controlled: ['synthetic author content and DOM keys', 'native-ready publication delay', 'public continuation decisions', 'one pre-destroy exception in ME14'], events: [], cases: {} };
  report.hostDriverVersion = PLAN.version;
  const events = details.events, objects: any[] = [], holds: any[] = [];
  let ordinal = 0, currentCase = '', settings: any = {}, draws = 0, randomState = PLAN.worldSeed >>> 0;
  const random = (n: number) => { draws++; randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return Math.floor(randomState / 4294967296 * n); };
  const mark = (kind: string, data: any = {}) => { assert(events.length < 3000, 'bounded native trace'); events.push({ id: currentCase, kind, frame: G.Graphics.frameCount, at: G.performance.now(), ...data }); };
  const unwrap = (buffer: any) => objects.find(row => row.buffer === buffer);
  const readNative = (row: any) => {
    const b = row.buffer, buffers = b._buffers ?? [], nodes = b._sourceNodes ?? [];
    return { id: row.id, name: row.name, ready: row.ready.call(b), error: b.isError(), destroyed: row.destroyed, plays: clone(row.plays), decoded: buffers.map((v: any) => ({ tag: Object.prototype.toString.call(v), duration: v.duration, sampleRate: v.sampleRate, channels: v.numberOfChannels, length: v.length })), sources: nodes.map((v: any) => ({ tag: Object.prototype.toString.call(v), hasBuffer: !!v.buffer, duration: v.buffer?.duration, rate: v.playbackRate?.value })), context: { state: G.WebAudio?._context?.state, currentTime: G.WebAudio?._context?.currentTime }, volume: b.volume, pitch: b.pitch, gain: b._gainNode?.gain?.value, seek: row.destroyed || !row.ready.call(b) ? null : b.seek() };
  };
  const nativeReady = async (row: any) => {
    assert(row, 'real buffer was created');
    await waitFor(() => row.ready.call(row.buffer) || row.buffer.isError(), 'native audio decode ' + row.name);
    const value = readNative(row); assert(!value.error && value.ready, 'native decoder ready rather than an existence-only resource');
    assert(value.decoded.length && value.decoded.every((b: any) => b.tag === '[object AudioBuffer]' && b.duration > 0 && b.sampleRate > 0), 'actual native AudioBuffers');
    const asset = input.assets.find((a: any) => a.logicalName === row.name && a.kind === row.folder.slice(0, -1));
    assert(asset, 'decoded clip in frozen asset manifest'); assert(value.decoded.every((b: any) => b.channels === asset.expectedNativeChannels), 'actual native channel count');
    const duration = value.decoded.reduce((n: number, b: any) => n + b.duration, 0);
    assert(duration >= asset.nativeDurationRangeSeconds[0] && duration <= asset.nativeDurationRangeSeconds[1], 'native duration fits frozen decoded/container sample interval');
    mark('native-decoded', value); return value;
  };
  const holdNext = (name: string) => { const gate: any = { name, held: true, row: null, callbacks: [], assigned: false }; holds.push(gate); return gate; };
  const release = (gate: any) => { gate.held = false; mark('release-controlled-publication', { bufferId: gate.row?.id }); const callbacks = gate.callbacks.splice(0); for (const cb of callbacks.length ? callbacks : gate.registered ?? []) cb(); };
  const originals: any = { createBuffer: audio.createBuffer, parameters: G.PluginManager.parameters, bgmVolume: audio.bgmVolume, meVolume: audio.meVolume };
  const stopCounts = { stopMe: 0, stopBgs: 0, stopSe: 0 };
  for (const key of Object.keys(stopCounts)) { originals[key] = audio[key]; audio[key] = function (this: any, ...args: any[]) { (stopCounts as any)[key]++; mark(key); return originals[key].apply(this, args); }; }
  G.PluginManager.parameters = function (this: any, name: string) { const raw = originals.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...raw, battleMusic: JSON.stringify(settings) } : raw; };
  audio.createBuffer = function (this: any, folder: string, name: string) {
    const buffer = originals.createBuffer.call(this, folder, name), ready = buffer.isReady, listener = buffer.addLoadListener, play = buffer.play, destroy = buffer.destroy;
    const row: any = { id: objects.length + 1, folder, name, buffer, ready, plays: [], destroyed: 0, destroyAttempts: 0, failDestroy: 0 }; objects.push(row);
    const gate = holds.find(g => !g.assigned && g.name === name); if (gate) { gate.assigned = true; gate.row = row; }
    buffer.isReady = function () { return !(gate?.held) && ready.call(this); };
    buffer.addLoadListener = function (cb: any) { if (gate) (gate.registered ??= []).push(cb); return listener.call(this, () => { if (gate?.held) gate.callbacks.push(cb); else cb(); }); };
    buffer.play = function (this: any, loop: boolean, position: number) { row.plays.push({ loop, position, frame: G.Graphics.frameCount, at: G.performance.now() }); mark('native-play', { bufferId: row.id, folder, name, loop, position }); return play.call(this, loop, position); };
    buffer.destroy = function (this: any) { row.destroyAttempts++; if (row.failDestroy > 0) { row.failDestroy--; mark('controlled-destroy-failure', { bufferId: row.id }); throw Error('ME14 controlled pre-destroy failure'); } row.destroyed++; mark('native-destroy', { bufferId: row.id, folder, name }); return destroy.call(this); };
    mark('native-create', { bufferId: row.id, folder, name }); return buffer;
  };
  audio.bgmVolume = PLAN.musicVolume; audio.meVolume = PLAN.musicVolume;
  const content = musicNativeContent(E, assert), track = (name: string, extra: any = {}) => ({ name, volume: 100, pitch: 100, pan: 0, ...extra }), named = (name: string) => PLAN.prefix + name;
  details.contentIdentity = content.meta; details.fixtureSHA256 = hash(stable(content));
  const player = () => flow.musicState()?.player, last = () => player()?.requests.at(-1);
  const activeRow = () => unwrap(audio._bgmBuffer);
  const active = async (name: string, volume = PLAN.musicVolume / 100, pitch = 1) => {
    await waitFor(() => audio._currentBgm?.name === name && !!audio._bgmBuffer, 'registered native BGM ' + name);
    const row = activeRow(), value = await nativeReady(row);
    await waitFor(() => row.buffer._sourceNodes?.length > 0 && row.buffer.isPlaying() && G.WebAudio?._context?.state === 'running', 'active native BGM source/context ' + name);
    const contextTime = G.WebAudio._context.currentTime; await frames(2); assert(G.WebAudio._context.currentTime > contextTime, 'native audio context actually advances');
    const playing = readNative(row);
    assert(playing.sources.some((node: any) => node.tag === '[object AudioBufferSourceNode]' && node.hasBuffer), 'real active native source');
    assert(Math.abs(playing.volume - volume) < 0.005 && Math.abs(playing.pitch - pitch) < 0.005, 'actual music option/preset parameters');
    assert(playing.sources.every((node: any) => Math.abs(node.rate - pitch) < 0.005), 'native source playbackRate');
    mark('active-qualified', { ...value, ...playing }); return row;
  };
  const mapReady = () => captureHostReady(G, scene(), 'map');
  const titleReady = () => captureHostReady(G, scene(), 'title');
  const clearMessages = () => { G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); };
  const makeState = () => captureMENativeState(E, content);
  let firstReset = true;
  const install = () => {
    flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {};
    flow.seed = [...PLAN.seed]; randomState = PLAN.worldSeed >>> 0; draws = 0; flow.rng = random; flow.fast = true; flow.receiveOptions = { mode: 1, naming: 1 };
  };
  const reset = async (capture = 'long') => {
    await waitFor(() => mapReady() || (firstReset && titleReady()), 'initial started Title or subsequent started Map'); firstReset = false;
    assert(!flow._app?.saveBlocked, 'previous scenario released root'); install(); G.$gameSystem._psGame = makeState();
    settings = { presets: { battle: named('battle'), capture: named(capture) + ':70:120' } };
    clearMessages(); await toMapId(PLAN.mapId, 8, 9); await waitFor(mapReady, 'actual Map.start/windows/spriteset'); await press('shift'); return flow.app();
  };
  const world = async () => { audio.playBgm(track(named('world')), 0.25); return active(named('world')); };
  const abortScene = async () => { flow.abort(Error('explicit capture ME test cancellation')); G.SceneManager.goto(G.Scene_Map); await waitFor(mapReady, 'cancelled Scene fully left'); clearMessages(); };
  const open = async (kind = 'wild', species = 'Pidgey', level = 3) => {
    const request: any = { kind, ...(kind === 'trainer' ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species, level }] }), battleId: PLAN.version + '/' + currentCase + '#' + (++ordinal), seq: ordinal, canLose: true };
    flow.openBattle(request); await inMode('main'); await active(named('battle'));
    const h: any = { scene: battle(), app: flow.app(), op: flow._op, request, before: clone(flow.game()), logs: [], growth: [], session: battle()._session };
    assert(h.session, 'actual Scene/App/Session');
    const add = h.scene._log.add; h.scene._log.add = function (this: any, line: string) { h.logs.push({ line, at: G.performance.now(), frame: G.Graphics.frameCount }); return add.call(this, line); };
    const exp = h.scene._display.experience; h.scene._display.experience = function (this: any, ...args: any[]) {
      const step = exp.apply(this, args); if (step) { const advance = step.advance; step.advance = function (this: any, ...a: any[]) { h.growth.push({ at: G.performance.now(), frame: G.Graphics.frameCount, capture: h.scene.captureMelodyState() }); return advance.apply(this, a); }; } return step;
    };
    return h;
  };
  const phase = (h: any) => h.scene.captureMelodyState();
  const throwBall = async (h: any, ball = 'masterball') => {
    let action: any; h.scene.act(async () => { action = await h.session.throwBall(ball); return action; }, 'ball');
    await waitFor(() => !!action, 'real Session ball action returned'); h.action = action; return action;
  };
  const caught = async (h: any) => {
    const action = await throwBall(h); assert(action.ok && h.session.finished && action.messages.some((m: any) => m.kind === 'end' && m.reason === 'caught'), 'actual successful capture');
    await waitFor(() => phase(h)?.started || !!h.scene._failure, 'capture presentation starts'); assert(!h.scene._failure && phase(h)?.started, 'capture starts without Scene failure');
    const view = phase(h), caughtEvent = action.messages.flatMap((m: any) => m.kind === 'events' ? m.events : []).find((e: any) => e.type === 'rpg' && e.args[0] === 'ball' && e.args[4] === 'caught');
    assert(caughtEvent, 'semantic caught event from real Session');
    const text = h.scene._D.event(caughtEvent).filter((x: any) => typeof x === 'string');
    assert(text.length && text.every((line: string) => h.logs.some((x: any) => x.line === line && x.at <= view.lease.phaseStartedAt)), 'actual Gotcha log append precedes phase/audio');
    eq(flow.game(), h.before, 'presentation did not install business result'); assert(h.app.saveBlocked && flow.running && !G.$gameSystem.isSaveEnabled(), 'existing root owns save barrier');
    assert(h.growth.length === 0, 'growth presentation has not advanced'); h.start = view.lease.phaseStartedAt; h.captureRow = [...objects].reverse().find(row => row.folder === 'me/' && row.name === view.track.name); return view;
  };
  const completeWait = async (h: any) => {
    while (!phase(h).completed) {
      const v = phase(h); assert(!h.scene._failure && !v.error && !v.cancelled, 'ordinary media path remains normal');
      if (G.performance.now() - h.start < PLAN.waitMs) { assert(!v.completed && h.growth.length === 0 && h.app.saveBlocked, 'no early growth/commit before3500ms'); eq(flow.game(), h.before, 'no business install during wait'); }
      await frames(1);
      assert(G.performance.now() - h.start < PLAN.waitMs + 10000, 'finite phase; no unbounded wait');
    }
    const v = phase(h); assert(G.performance.now() - h.start >= PLAN.waitMs, 'full logical3500ms'); assert(v.lease.stopConfirmed && !v.lease.fault, 'actual own stop ACK before complete');
    await inMode('end'); assert(h.growth.length > 0 && h.growth.every((g: any) => g.capture?.completed && g.at >= h.start + PLAN.waitMs), 'actual growth advances only after completed stop'); return clone(v);
  };
  const finish = async (h: any) => { const result = h.session.result(); await finishBattle(); assert(flow.lastOutcome.commit === 'applied' && !h.app.saveBlocked, 'normal root commit once'); return result; };
  const expectedFile = path.join(path.dirname(OUT), 'capture-me-expected.v1.json');
  const saveProducer = async (raw: any) => {
    G.$gameSystem.onBeforeSave(); await settledSave(PLAN.slot);
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(PLAN.slot));
    const saved = { version: PLAN.version, chain: input.chain, fixtureSHA256: hash(stable(content)), productCommit: PLAN.productCommit, packageHead: input.packageHead, slot: PLAN.slot, saveSHA256: fileHash(file), state: clone(flow.game()), result: raw, bgmOnSave: clone(G.$gameSystem._bgmOnSave) };
    assert(saved.state.appliedBattles[raw.battleId], 'real saved capture receipt'); eq(saved.bgmOnSave.name, named('world'), 'onBeforeSave real return BGM');
    fs.writeFileSync(expectedFile, JSON.stringify(saved, null, 2) + '\n', { flag: 'wx' }); details.producer = { expectedFile, expectedSHA256: fileHash(expectedFile), saveSHA256: saved.saveSHA256, slot: PLAN.slot };
  };
  const run = async (id: string, fn: () => Promise<any>) => {
    currentCase = id; const start = G.performance.now(), eventStart = events.length;
    try { const detail = await fn(); details.cases[id] = { detail, stateSHA256: stateHash(), worldDraws: draws, eventStart, eventEnd: events.length }; results.push({ id, status: 'pass', ms: G.performance.now() - start, detail: details.cases[id] }); writeProgress(); }
    catch (error) { results.push({ id, status: 'fail', error: String((error as any)?.stack ?? error), eventStart, eventEnd: events.length }); writeProgress(); throw error; }
  };
  let primary: unknown = null, hadPrimary = false;
  try {
    if (continuing) {
      await run('ME15', async () => {
        const producerPath = arg('ps-capture-me-producer-report'), savedPath = arg('ps-capture-me-expected');
        eq(fileHash(producerPath), arg('ps-capture-me-producer-sha'), 'this run producer report'); eq(fileHash(savedPath), arg('ps-capture-me-expected-sha'), 'this run expected file');
        const produced = JSON.parse(fs.readFileSync(producerPath)), saved = JSON.parse(fs.readFileSync(savedPath));
        eq(produced.overall, 'pass', 'producer succeeded'); eq(produced.results.map((r: any) => [r.id, r.status]), PLAN.groups.flatMap(g => g.ids).filter(id => id !== 'ME15').map(id => [id, 'pass']), 'all14 real producer cases');
        eq(produced.captureMENative.inputSHA256, hash(inputBytes), 'same frozen input'); eq(produced.captureMENative.chain, input.chain, 'same chain'); eq(produced.captureMENative.driverPluginSHA256, input.driverPluginSHA256, 'same actual driver'); eq(produced.env.packageInfo.gitHead, input.packageHead, 'same package');
        eq(produced.captureMENative.producer.expectedSHA256, fileHash(savedPath), 'producer emitted exact expected bytes');
        eq(saved.version, PLAN.version, 'saved protocol'); eq(saved.chain, input.chain, 'saved chain'); eq(saved.fixtureSHA256, hash(stable(content)), 'source fixture independently assembled'); eq(saved.packageHead, input.packageHead, 'saved actual code'); eq(saved.productCommit, PLAN.productCommit, 'saved product'); eq(saved.slot, PLAN.slot, 'saved slot');
        install(); const file = G.StorageManager.filePath(G.DataManager.makeSavename(PLAN.slot)); eq(fileHash(file), saved.saveSHA256, 'actual same-run compressed save');
        G.SceneManager.goto(G.Scene_Title); await waitFor(titleReady, 'fresh Title fully started'); scene()._commandWindow.selectSymbol('continue'); assert(scene()._commandWindow.isCurrentItemEnabled(), 'normal Continue enabled'); await press('ok');
        await waitFor(() => scene() instanceof G.Scene_Load && scene().isStarted() && scene()._listWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), 'normal load list');
        const load = scene(); load._listWindow.selectSavefile(PLAN.slot); eq(load._listWindow.savefileId(), PLAN.slot, 'this producer slot'); await press('ok'); await waitFor(mapReady, 'loaded Map actually started'); assert(load._loadSuccess, 'actual load succeeded');
        assert(!G.$gameSystem._psSaveError && G.$gameSystem._psSaveInfo, 'validated state'); eq(flow.game(), saved.state, 'whole saved capture state'); eq(G.$gameSystem._bgmOnSave, saved.bgmOnSave, 'host BGM serialized'); await active(named('world')); await frames(8); eq(flow.game(), saved.state, 'no repeated install');
        eq(flow.commit(saved.result), 'already-applied', 'actual result idempotence after fresh Continue'); eq(flow.game(), saved.state, 'no duplicate capture/reward');
        assert(!flow.running && !flow.app().saveBlocked && !flow.operationPending() && !flow.musicState()?.current && !audio._meBuffer && !G.$gameMap._interpreter._waitMode, 'no old transient owner, ME replay or wait'); eq(fileHash(file), saved.saveSHA256, 'load did not rewrite old save');
        return { saveSHA256: saved.saveSHA256, note: 'MZ registered return song restored; no cross-process seek-offset claim' };
      });
    } else {
      await run('ME01', async () => {
        await reset(); await world(); const h = await open(); await caught(h); const row = h.captureRow; await nativeReady(row); await waitFor(() => row.plays.length > 0, 'own ME actually starts');
        const value = readNative(row); assert(value.sources.some((n: any) => n.tag === '[object AudioBufferSourceNode]' && n.hasBuffer), 'actual native source'); assert(Math.abs(value.volume - 0.329) < 0.005 && Math.abs(value.pitch - 1.2) < 0.005, 'ME option and preset once');
        let refused = false; try { await G.DataManager.saveGame(PLAN.blockedSlot); } catch { refused = true; } assert(refused, 'real active-phase save rejected'); assert(!fs.existsSync(G.StorageManager.filePath(G.DataManager.makeSavename(PLAN.blockedSlot))), 'no denied save file');
        h.scene.onEnd(); assert(flow.running && h.app.saveBlocked, 'premature onEnd cannot bypass wait'); const done = await completeWait(h); const raw = await finish(h); await active(named('world')); assert(row.destroyed > 0 && row.plays.length === 1, 'own longME stopped once before natural end'); await saveProducer(raw); return { done, native: readNative(row), producer: details.producer };
      });
      await run('ME02', async () => { await reset('short'); await world(); const h = await open(); await caught(h); const row = h.captureRow; await nativeReady(row); await waitFor(() => phase(h).lease.status === 'ended', 'short actual ME ends naturally'); assert(G.performance.now() - h.start < PLAN.waitMs && !phase(h).completed, 'early end does not complete logical wait'); const done = await completeWait(h); await finish(h); await active(named('world')); return { done, native: readNative(row) }; });
      for (const [id, name, status] of [['ME03', 'missing', 'missing'], ['ME04', 'corrupt', 'failed']]) await run(id, async () => { await reset(name); await world(); const h = await open(); await caught(h); await waitFor(() => phase(h).lease.status === status, 'actual ' + status + ' media'); if (name === 'corrupt') assert(phase(h).lease.errors.length, 'decoder reason diagnostic'); const observed = clone(phase(h)); await completeWait(h); await finish(h); await active(named('world')); return observed; });
      await run('ME05', async () => { await reset(); await world(); const gate = holdNext(named('long')), h = await open(); await caught(h); await nativeReady(gate.row); assert(!gate.row.plays.length, 'real decode held unpublished'); const done = await completeWait(h); release(gate); await frames(3); eq(gate.row.plays.length, 0, 'late load callback cannot play'); await finish(h); await active(named('world')); return done; });
      await run('ME06', async () => { await reset(); await world(); const gate = holdNext(named('long')), h = await open(); await caught(h); await nativeReady(gate.row); await abortScene(); release(gate); await frames(3); assert(phase(h).cancelled && gate.row.destroyed > 0 && !gate.row.plays.length && !h.app.saveBlocked, 'abort revokes before late publication'); eq(flow.game(), h.before, 'no capture commit after abort'); return phase(h); });
      await run('ME07', async () => { await reset(); await world(); const h = await open(); await caught(h); await nativeReady(h.captureRow); await waitFor(() => h.captureRow.plays.length > 0, 'playing before Scene exit'); G.SceneManager.goto(G.Scene_Map); await waitFor(mapReady, 'actual terminated Scene'); assert(phase(h).cancelled && h.captureRow.destroyed > 0 && !flow.running && !h.app.saveBlocked, 'Scene termination cancels ownME/root'); eq(flow.game(), h.before, 'no aborted result install'); return phase(h); });
      await run('ME08', async () => { await reset(); await world(); const h = await open(); await caught(h); await nativeReady(h.captureRow); audio.playMe(track(named('foreign'))); const foreign = unwrap(audio._meBuffer); await nativeReady(foreign); const done = await completeWait(h); assert(audio._meBuffer === foreign.buffer && !foreign.destroyed, 'old deadline preserves foreign ME'); await finish(h); assert(audio._meBuffer === foreign.buffer && !foreign.destroyed, 'root return preserves foreign ME'); audio.stopMe(); await active(named('world')); return { done, foreign: readNative(foreign) }; });
      await run('ME09', async () => { await reset(); await world(); const h = await open(); await caught(h); await nativeReady(h.captureRow); audio.playBgm(track(named('world')), 0.75); const next = audio._bgmBuffer, record = audio._currentBgm; await nativeReady(unwrap(next)); const done = await completeWait(h); assert(audio._bgmBuffer === next && audio._currentBgm === record && !unwrap(next).destroyed, 'ownME release respects successorBGM'); await finish(h); await active(named('world')); assert(audio._bgmBuffer === next && audio._currentBgm === record, 'old normal root cannot overwrite successor'); return done; });
      for (const [id, kind] of [['ME10', 'load'], ['ME11', 'newgame']]) await run(id, async () => {
        await reset(); await world(); G.$gameSystem.onBeforeSave(); await settledSave(PLAN.loadControlSlot); const saved = clone(flow.game()), oldSystem = G.$gameSystem;
        const gate = holdNext(named('long')), h = await open(); await caught(h); await nativeReady(gate.row); const generation = h.app.stateGeneration;
        if (kind === 'load') { captureLoadSucceeded(await G.DataManager.loadGame(PLAN.loadControlSlot), G.$gameSystem, assert, eq); eq(flow.game(), saved, 'actual load restored full baseline'); }
        else { G.DataManager.setupNewGame(); assert(!G.$gameSystem._psInitError, 'real newgame success'); G.$gameSystem._psGame = makeState(); }
        assert(G.$gameSystem !== oldSystem && h.app.stateGeneration > generation && !h.app.saveBlocked && !flow.running && !flow.operationPending() && !flow.musicState()?.current, 'replacement invalidates all old owners');
        G.SceneManager.goto(G.Scene_Map); await waitFor(mapReady, 'replacement Map started'); await toMapId(PLAN.mapId, 8, 9); await waitFor(mapReady, 'transferred replacement Map started'); clearMessages(); await world(); release(gate); await frames(3); assert(!gate.row.plays.length && gate.row.destroyed > 0 && !audio._meBuffer, 'late replacement callback never plays'); return { phase: phase(h), kind };
      });
      await run('ME12', async () => { await reset(); await world(); const h = await open('trainer'), action = await throwBall(h); assert(!action.ok, 'trainer ball refused'); await inMode('main'); assert(!phase(h) && objects.filter(r => r.folder === 'me/').every(r => r.name !== named('long') || r.destroyed), 'no capture phase from refusal'); await abortScene(); return { reason: action.reason }; });
      await run('ME13', async () => { await reset(); await world(); const before = objects.length, h = await open('wild', 'Snorlax', 100), action = await throwBall(h, 'pokeball'); assert(action.ok && !h.session.finished, 'frozen real seed produces ball breakout'); await inMode('main'); assert(!phase(h) && !objects.slice(before).some(r => r.folder === 'me/'), 'failed ball never starts captureME'); await abortScene(); return { messages: action.messages }; });
      await run('ME14', async () => { await reset(); await world(); const h = await open(); await caught(h); await nativeReady(h.captureRow); await waitFor(() => h.captureRow.plays.length > 0, 'actual ME before stop fault'); h.captureRow.failDestroy = 1; await waitFor(() => !!h.scene._failure, 'unconfirmed stop enters failure'); const v = phase(h); assert(!v.completed && v.error && !flow.running && !h.app.saveBlocked, 'failure not normalACK/commit'); eq(flow.game(), h.before, 'stop failure preserves business state'); assert(h.captureRow.destroyAttempts >= 2 && h.captureRow.destroyed === 1, 'explicit lifecycle cleanup retries actual own destroy after injected zero-side-effect failure'); await abortScene(); return { phase: v, attempts: h.captureRow.destroyAttempts, destroyed: h.captureRow.destroyed }; });
    }
    eq(results.map((r: any) => [r.id, r.status]), expectedIDs.map(id => [id, 'pass']), 'exact ordered nonempty case denominator');
  } catch (error) { hadPrimary = true; primary = error; throw error; }
  finally {
    const errors = details.cleanupErrors ??= [];
    const clean = (kind: string, fn: () => void) => { try { fn(); } catch (error) { errors.push({ kind, error: String(error) }); } };
    // Revoke public root before releasing held callbacks; never touch unrelated ME/BGM.
    if (flow.running) clean('owned-root', () => flow.abort(Error('capture native driver cleanup')));
    for (const gate of holds) clean('late-owned-callback', () => release(gate));
    clean('owned-ME', () => { const row = unwrap(audio._meBuffer); if (row?.folder === 'me/' && row.name.startsWith(PLAN.prefix)) audio.stopMe(); });
    clean('owned-BGM', () => { const row = unwrap(audio._bgmBuffer); if (row?.folder === 'bgm/' && row.name.startsWith(PLAN.prefix)) audio.stopBgm(); });
    clean('restore-createBuffer', () => { audio.createBuffer = originals.createBuffer; }); clean('restore-parameters', () => { G.PluginManager.parameters = originals.parameters; });
    clean('restore-options', () => { audio.bgmVolume = originals.bgmVolume; audio.meVolume = originals.meVolume; });
    for (const key of Object.keys(stopCounts)) clean('restore-' + key, () => { audio[key] = originals[key]; });
    details.nativeBuffers = objects.map(row => { try { return readNative(row); } catch (error) { return { id: row.id, diagnosticError: String(error) }; } }); details.finishedFrame = G.Graphics.frameCount; details.primaryError = primary ? String(primary) : null;
    if (errors.length && !hadPrimary) throw Error('capture native cleanup failed: ' + JSON.stringify(errors));
  }
}

/** Shared by the production test driver and deterministic host-lifecycle controls. */
export function captureHostReady(G: any, value: any, kind: 'map' | 'title'): boolean {
  if (G.SceneManager.isSceneChanging()) return false;
  if (kind === 'map') return value instanceof G.Scene_Map && value.isStarted() && !!value._messageWindow && !!value._spriteset;
  return value instanceof G.Scene_Title && value.isStarted() && !!value._commandWindow && value._commandWindow.isOpenAndActive() && !value.isBusy();
}
export function captureLoadSucceeded(code: unknown, system: any, assert: any, eq: any): void {
  eq(code, 0, 'real DataManager.loadGame success code'); assert(!system._psSaveError && !!system._psSaveInfo, 'real loaded framework validated');
}

export function captureMENativeState(E: any, content: any): any {
  const state = E.state.newGame({ content, party: [], money: 1000, bag: { masterball: 2, pokeball: 1 } });
  state.party = [E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: 'CAPTURE-P1', species: 'Snorlax', level: 50 }, content, () => 0), content)];
  state.nextMemberOrdinal = '2'; state.badges.fill(true); return state;
}
