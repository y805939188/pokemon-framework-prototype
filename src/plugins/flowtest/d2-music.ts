/* eslint-disable @typescript-eslint/no-explicit-any */
/** Test-only real MZ audio qualification. No substitute AudioBuffer/AudioContext.
 * Explicit fault controls delay publication of genuinely decoded native buffers.
 * Root decisions are programmatic public APIs, not a full receiving/evolution UI test.
 */
import PLAN from '../../../experiments/step5/4/music-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';

export async function runD2Music(p: any, continuing: boolean): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, choose, fightUntilEnd, finishBattle, press, toMapId, settledSave } = p;
  const E = api(), flow = W.PSFlow, audio = G.AudioManager, crypto = p.nodeRequire('crypto');
  const hash = (bytes: any) => crypto.createHash('sha256').update(bytes).digest('hex');
  const fileHash = (file: string) => hash(fs.readFileSync(file));
  const stable = (v: any): string => E.contentCompile.canonicalJson(v);
  const stateHash = () => hash(stable(flow.game()));
  const inputFile = arg('ps-music-input');
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
  const expectedIDs = PLAN.groups.flatMap(group => group.ids).filter(id => continuing ? id === 'M17' : id !== 'M17');
  assert(expectedIDs.length === (continuing ? 1 : 16), 'nonempty fixed scenario denominator');

  const details: any = report.musicNative = { version: PLAN.version, chain: input.chain, inputSHA256: hash(inputBytes), productCommit: PLAN.productCommit, productPluginSHA256: PLAN.productPluginSHA256, driverPluginSHA256: input.driverPluginSHA256, packageHead: input.packageHead, expectedIDs, physicalHearing: 'NOT_VERIFIED', native: true, controlled: ['synthetic author content and DOM keys', 'native-ready publication delay', 'public continuation decisions', 'one known-zero state setter fault in M09'], events: [], cases: {} };
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
  const originals: any = { createBuffer: audio.createBuffer, parameters: G.PluginManager.parameters, bgmVolume: audio.bgmVolume };
  const stopCounts = { stopMe: 0, stopBgs: 0, stopSe: 0 };
  for (const key of Object.keys(stopCounts)) { originals[key] = audio[key]; audio[key] = function (this: any, ...args: any[]) { (stopCounts as any)[key]++; mark(key); return originals[key].apply(this, args); }; }
  G.PluginManager.parameters = function (this: any, name: string) { const raw = originals.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...raw, battleMusic: JSON.stringify(settings) } : raw; };
  audio.createBuffer = function (this: any, folder: string, name: string) {
    const buffer = originals.createBuffer.call(this, folder, name), ready = buffer.isReady, listener = buffer.addLoadListener, play = buffer.play, destroy = buffer.destroy;
    const row: any = { id: objects.length + 1, folder, name, buffer, ready, plays: [], destroyed: 0 }; objects.push(row);
    const gate = holds.find(g => !g.assigned && g.name === name); if (gate) { gate.assigned = true; gate.row = row; }
    buffer.isReady = function () { return !(gate?.held) && ready.call(this); };
    buffer.addLoadListener = function (cb: any) { if (gate) (gate.registered ??= []).push(cb); return listener.call(this, () => { if (gate?.held) gate.callbacks.push(cb); else cb(); }); };
    buffer.play = function (this: any, loop: boolean, position: number) { row.plays.push({ loop, position, frame: G.Graphics.frameCount, at: G.performance.now() }); mark('native-play', { bufferId: row.id, folder, name, loop, position }); return play.call(this, loop, position); };
    buffer.destroy = function (this: any) { row.destroyed++; mark('native-destroy', { bufferId: row.id, folder, name }); return destroy.call(this); };
    mark('native-create', { bufferId: row.id, folder, name }); return buffer;
  };
  audio.bgmVolume = PLAN.musicVolume;
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
  const clearMessages = () => { G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); };
  const reset = async (kind: 'normal' | 'receiving' | 'evolution' = 'normal', options: any = {}) => {
    assert(!flow._app?.saveBlocked, 'preceding scenario left no root owner');
    flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {}; flow.seed = [...PLAN.seed]; randomState = PLAN.worldSeed >>> 0; draws = 0; flow.rng = random; flow.fast = true; flow.receiveOptions = { mode: kind === 'receiving' ? 2 : 1, naming: 1 };
    G.$gameSystem._psGame = musicNativeState(E, content, kind); settings = options; clearMessages(); await toMapId(PLAN.mapId, 8, 9); await press('shift'); return flow.app(); // normal MZ key/gesture resume route, no autoplay-policy or security flag changes
  };
  const world = async (none = false) => { audio.playBgm(track(none ? '' : named('world')), 0.25); if (none) { eq(audio._bgmBuffer, null, 'real host None buffer'); eq(audio._currentBgm.name, '', 'real host leaves empty registration'); } else await active(named('world')); };
  const open = async (trainer = false, presentation?: any) => {
    const request: any = { kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: PLAN.version + '/' + currentCase + '#' + (++ordinal), seq: ordinal, canLose: true };
    flow.openBattle(request, presentation); await inMode('main'); assert(battle()?._session, 'real Scene/App/Session'); return { scene: battle(), session: battle()._session, app: flow.app(), request, op: flow._op };
  };
  const abortScene = async () => { flow.abort(Error('native qualification explicit cancellation')); G.SceneManager.goto(G.Scene_Map); await waitFor(() => scene() instanceof G.Scene_Map && !G.SceneManager.isSceneChanging(), 'leave cancelled Scene'); clearMessages(); };
  const win = async () => { await fightUntilEnd(/tackle/i, 12); await inMode('end'); assert(battle()._session.finished, 'actual terminal Showdown result'); return battle()._session.result(); };
  const finish = async () => { const raw = await win(), old = battle(); await finishBattle(); assert(flow.lastOutcome.commit === 'applied', 'actual root installation'); return { raw, old }; };
  const drainDex = () => { let n = 0; while (flow.app().pendingPokedex && n++ < 12) { const view = flow.app().pendingPokedex; assert(view.phase !== 'failed', 'no unsolicited Pokedex recovery'); const result = flow.resolvePokedex(view.token, view.revision, { kind: view.phase === 'entry' ? 'close-entry' : 'message-complete' }); assert(result.status !== 'refused', 'public Pokedex decision accepted'); } assert(!flow.app().pendingPokedex, 'finite actual Pokedex completion'); };
  const run = async (id: string, fn: () => Promise<any>) => {
    currentCase = id; const start = G.performance.now(), eventStart = events.length;
    try { const detail = await fn(); details.cases[id] = { detail, music: flow.musicState(), stateSHA256: stateHash(), worldDraws: draws, eventStart, eventEnd: events.length }; results.push({ id, status: 'pass', ms: G.performance.now() - start, detail: details.cases[id] }); writeProgress(); }
    catch (error) { results.push({ id, status: 'fail', error: String((error as any)?.stack ?? error), music: flow.musicState(), native: objects.map(readNative), eventStart, eventEnd: events.length }); writeProgress(); throw error; }
  };

  try {
    if (continuing) {
      await run('M17', async () => {
        const producerPath = arg('ps-music-producer-report'), expectedPath = arg('ps-music-expected');
        assert(producerPath && expectedPath && arg('ps-music-producer-sha') && arg('ps-music-expected-sha'), 'explicit same-run producer chain');
        eq(fileHash(producerPath), arg('ps-music-producer-sha'), 'producer report hash'); eq(fileHash(expectedPath), arg('ps-music-expected-sha'), 'producer expected hash');
        const produced = JSON.parse(fs.readFileSync(producerPath)), saved = JSON.parse(fs.readFileSync(expectedPath));
        eq(produced.overall, 'pass', 'producer actually completed'); eq(produced.results.map((r: any) => [r.id, r.status]), PLAN.groups.flatMap(g => g.ids).filter(id => id !== 'M17').map(id => [id, 'pass']), 'all 16 producer cases, no filter or replay');
        eq(produced.musicNative.inputSHA256, hash(inputBytes), 'same frozen input'); eq(produced.musicNative.chain, input.chain, 'same run chain'); eq(produced.env.packageInfo.gitHead, input.packageHead, 'same actual producer package'); eq(produced.musicNative.driverPluginSHA256, input.driverPluginSHA256, 'same driver bytes'); eq(produced.musicNative.producer.expectedSHA256, fileHash(expectedPath), 'producer emitted this expected file');
        eq(saved.version, PLAN.version, 'expected protocol'); eq(saved.chain, input.chain, 'saved chain'); eq(saved.packageHead, input.packageHead, 'expected producer code'); eq(saved.fixtureSHA256, hash(stable(content)), 'recompiled source fixture rather than expected content oracle');
        flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {}; flow.seed = [...PLAN.seed]; flow.rng = random; flow.receiveOptions = { mode: 1, naming: 1 };
        const file = G.StorageManager.filePath(G.DataManager.makeSavename(PLAN.slot)); eq(fileHash(file), saved.saveSHA256, 'actual same-run compressed save bytes');
        G.SceneManager.goto(G.Scene_Title);
        await waitFor(() => scene() instanceof G.Scene_Title && scene().isStarted() && scene()._commandWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), 'fresh normal Title');
        scene()._commandWindow.selectSymbol('continue'); assert(scene()._commandWindow.isCurrentItemEnabled(), 'normal Continue enabled'); await press('ok');
        await waitFor(() => scene() instanceof G.Scene_Load && scene().isStarted() && scene()._listWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), 'fresh normal load list');
        const load = scene(); load._listWindow.selectSavefile(PLAN.slot); eq(load._listWindow.savefileId(), PLAN.slot, 'actual selected producer slot'); await press('ok');
        await waitFor(() => scene() instanceof G.Scene_Map && scene().isStarted() && !G.SceneManager.isSceneChanging(), 'fresh loaded map'); assert(load._loadSuccess, 'actual load succeeded'); eq(flow.game(), saved.state, 'whole saved business state');
        eq(G.$gameSystem._bgmOnSave, saved.bgmOnSave, 'serialized host BGM record'); await active(named('world')); await frames(8); eq(flow.game(), saved.state, 'no duplicate installs');
        const before = clone(flow.game()); eq(flow.commit(saved.result), 'already-applied', 'exact replay after fresh Continue'); eq(flow.game(), before, 'no repeated reward/receipt');
        assert(!flow.running && !flow.app().saveBlocked && !flow.operationPending(), 'no persisted root owner'); assert(!flow.musicState()?.current, 'no prior music timeline'); assert(!G.$gameMap._interpreter._waitMode, 'no stale event wait'); eq(fileHash(file), saved.saveSHA256, 'Continue did not rewrite producer slot');
        return { saveSHA256: saved.saveSHA256, nativeBgm: readNative(activeRow()), note: 'MZ onAfterLoad resumes its registered song; no claim that MZ preserves seek offset across process restart' };
      });
    } else {
      await run('M01', async () => {
        await reset(); await world(true); const a = await open(); await active('Battle wild'); eq(player().logical.name, 'Battle wild', 'wild default'); eq(last().state, 'requested', 'real None publishes'); assert(objects.filter(o => o.name === 'Battle wild').at(-1).plays.length === 1, 'once'); await abortScene();
        await reset(); await world(); const b = await open(true); await active(named('trainer')); eq(player().logical.name, named('trainer'), 'public trainer projection'); await abortScene(); return { wild: a.request, trainer: b.request };
      });
      await run('M02', async () => {
        const app = await reset(); await world(); const source = { music: { presets: { battle: named('preset') + ':70:120' } } }; let publish: any;
        const start = app.startBattle; app.startBattle = async function (request: any) { const real = await start.call(this, request); return new Promise(resolve => { publish = () => resolve(real); }); };
        try {
          flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 3 }], seq: ++ordinal, battleId: PLAN.version + '/M02#' + ordinal, canLose: true }, source);
          await waitFor(() => !!publish, 'real session waiting only for controlled publication'); source.music.presets.battle = named('next'); publish(); await inMode('main');
          const before = stateHash(), randomBefore = draws; await active(named('preset'), PLAN.musicVolume * 70 / 10000, 1.2); eq(player().logical.name, named('preset'), 'async frozen preset'); eq(stateHash(), before, 'audio makes no business write'); eq(draws, randomBefore, 'audio consumes no world RNG');
          audio.bgmVolume = 60; assert(Math.abs(activeRow().buffer.volume - 0.42) < 0.005, 'real option setter scales current buffer'); audio.bgmVolume = PLAN.musicVolume;
        } finally { app.startBattle = start; }
        await abortScene(); return { controlled: 'actual startBattle result publication delayed; real session/decoder retained' };
      });
      await run('M03', async () => {
        await reset(); await world(); const gate = holdNext(named('intro')), interpreter = G.$gameMap._interpreter; let marker: any = null;
        G.__psMusicNativeMark = () => { marker = { frame: G.Graphics.frameCount, music: flow.musicState() }; };
        interpreter.setup([{ code: 357, indent: 0, parameters: ['PS_BattleFlow', 'PlayTrainerIntro', 'intro', { trainerId: 'music-normal', version: '1' }] }, { code: 355, indent: 0, parameters: ['globalThis.__psMusicNativeMark();'] }, { code: 357, indent: 0, parameters: ['PS_BattleFlow', 'StartTrainerBattle', 'battle', { trainerId: 'music-normal', version: '1', battleId: PLAN.version + '/M03', canLose: 'true' }] }, { code: 0, indent: 0, parameters: [] }], 0);
        await waitFor(() => gate.assigned && interpreter._waitMode === 'psBattleIntro', 'real interpreter holds intro'); await nativeReady(gate.row); assert(interpreter.updateWaitMode() && !flow.running, 'load wait prevents open');
        release(gate); const settled = flow.musicState().settledFrame; eq(settled, G.Graphics.frameCount, 'settled current Graphics frame'); assert(interpreter.updateWaitMode(), 'same frame still waits');
        let refused = false; try { flow.openBattle({ kind: 'trainer', trainer: { id: 'music-normal', version: 1 }, battleId: 'M03-forbidden', seq: ++ordinal }); } catch (error) { refused = String(error).includes('trainer-intro-not-ready'); } assert(refused, 'same-frame direct open refuses');
        await inMode('main'); await active(named('trainer')); assert(marker && marker.frame > settled, 'actual event advances only on later frame'); eq(player().memo.track.name, named('world'), 'world memo survives intro');
        const introPlay = gate.row.plays[0], battlePlay = activeRow().plays[0]; assert(battlePlay.frame > introPlay.frame, 'intro and battle have distinct actual starts'); await abortScene(); delete G.__psMusicNativeMark; return { marker, settled, introPlay, battlePlay };
      });
      await run('M04', async () => {
        await reset(); await world(); const before = flow.musicState(), buffer = audio._bgmBuffer, record = audio._currentBgm;
        for (const id of ['nil', 'empty']) { const i = new G.Game_Interpreter(); G.PluginManager.callCommand(i, 'PS_BattleFlow', 'PlayTrainerIntro', { trainerId: 'music-' + id, version: '1' }); assert(!i._waitMode, 'empty intro has no wait'); eq(flow.musicState(), before, 'empty intro leaves memo unchanged'); assert(audio._bgmBuffer === buffer && audio._currentBgm === record, 'empty intro leaves channel identity'); }
        return { nativeWorld: readNative(activeRow()) };
      });
      await run('M05', async () => {
        for (const kind of ['missing', 'corrupt', 'timeout']) {
          await reset(); await world(); const gate = kind === 'timeout' ? holdNext(named('intro')) : null, i = new G.Game_Interpreter();
          G.PluginManager.callCommand(i, 'PS_BattleFlow', 'PlayTrainerIntro', { trainerId: 'music-' + (kind === 'timeout' ? 'normal' : kind), version: '1' });
          if (gate) { await waitFor(() => gate.assigned, 'controlled timeout buffer created'); await nativeReady(gate.row); }
          await waitFor(() => last()?.state === (kind === 'corrupt' ? 'failed' : kind), 'finite ' + kind + ' diagnostic');
          const observed = clone(last()); if (kind !== 'missing') assert(observed.detail, 'failure reason retained'); await frames(1); assert(!i.updateWaitMode(), 'failure settles event wait');
          if (gate) { release(gate); eq(gate.row.plays.length, 0, 'late genuine decode cannot play after deadline'); }
          eq(audio._currentBgm.name, named('world'), 'failure preserves prior output'); mark('expected-media-failure', { fixture: kind, observation: observed });
        }
        return { deadline: 'real unchanged five seconds; only native-ready publication is held' };
      });
      await run('M06', async () => {
        await reset(); await world(); const gate = holdNext(named('intro')), a = new G.Game_Interpreter(), b = new G.Game_Interpreter();
        G.PluginManager.callCommand(a, 'PS_BattleFlow', 'PlayTrainerIntro', { trainerId: 'music-normal', version: '1' }); await waitFor(() => gate.assigned, 'old intro created'); await nativeReady(gate.row); const memo = clone(player().memo), oldToken = a._psMusicIntro;
        G.PluginManager.callCommand(b, 'PS_BattleFlow', 'PlayTrainerIntro', { trainerId: 'music-normal', version: '1' }); assert(b._psMusicIntro !== oldToken && !a.updateWaitMode(), 'only old token expires'); assert(b.updateWaitMode(), 'new intro owns wait'); await active(named('intro')); eq(player().memo, memo, 'original world memo retained'); release(gate); eq(gate.row.plays.length, 0, 'old retained callback cannot play'); await frames(1); assert(!b.updateWaitMode(), 'new token settles after frame'); flow.stateReplaced(); return { memo, oldToken, newToken: b._psMusicIntro ?? null };
      });
      await run('M07', async () => {
        await reset(); await world(); await open(); await active('Battle wild'); const memo = clone(player().memo), { raw, old } = await finish(); await active(named('world')); const returned = activeRow();
        eq(returned.plays[0].position, memo.position, 'actual return play uses exact saved offset'); const before = stateHash(); old.onEnd(); old.terminate(); assert(audio._bgmBuffer === returned.buffer && !returned.destroyed, 'duplicate old teardown does not stop handoff'); eq(stateHash(), before, 'no duplicate install'); return { result: raw.battleId, memo, nativeReturn: readNative(returned) };
      });
      await run('M08', async () => {
        await reset('receiving'); await world(); const h = await open(); await active('Battle wild'); await choose(/^Bag/); await inMode('bag'); await choose(/master ball/i); await inMode('end');
        const outcome = flow.finish(h.session, h.op); assert(outcome.pending && h.app.pendingReceiving, 'actual capture requires full-party reception'); eq(audio._currentBgm.name, 'Battle wild', 'receiving retains BGM'); assert(h.app.saveBlocked && flow.running, 'same root barrier');
        const pending = h.app.pendingReceiving, caught = pending.members[0].id, oldId = flow.game().party[0].id;
        flow.resolveReceiving(pending.token, { [caught]: { nickname: { kind: 'keep' }, placement: { kind: 'replace', target: { id: oldId, position: { kind: 'party', index: 0 } } } } });
        assert(h.app.pendingPokedex && flow.running && h.app.saveBlocked, 'actual new entry continues root'); eq(audio._currentBgm.name, 'Battle wild', 'Pokedex retains BGM'); drainDex();
        assert(!flow.running && !h.app.saveBlocked, 'final public decision releases root'); h.scene.onEnd(); await waitFor(() => !battle(), 'completed receiving Scene leaves'); clearMessages(); await active(named('world')); return { capturedId: caught, input: 'real capture/root, programmatic stable-ID reception and Pokedex decisions; not full GUI' };
      });
      await run('M09', async () => {
        await reset('evolution'); await world(); const h = await open(); await active('Battle wild'); await win(); const out = flow.finish(h.session, h.op); assert(out.pending && h.app.pendingEvolution, 'real level18 evolution continuation');
        const system = G.$gameSystem, descriptor = Object.getOwnPropertyDescriptor(system, '_psGame'), before = clone(flow.game()); let value = system._psGame, injected = 0;
        assert(!descriptor || 'value' in descriptor, 'M09 only controls the ordinary data-property state port');
        Object.defineProperty(system, '_psGame', { configurable: true, enumerable: true, get: () => value, set(next) { if (!injected && next.party?.[0]?.species === 'pidgeotto') { injected++; throw Error('M09 controlled known-zero state write'); } value = next; } });
        try { const view = h.app.pendingEvolution; flow.resolveEvolution(view.token, view.revision, { kind: 'complete' }); assert(injected === 1 && h.app.pendingEvolution?.phase === 'failed', 'actual known-zero recovery is visible'); eq(flow.game(), before, 'failed write preserved business state'); eq(audio._currentBgm.name, 'Battle wild', 'recovery retains music'); assert(h.app.saveBlocked, 'recovery keeps save lock'); }
        finally { Object.defineProperty(system, '_psGame', { ...(descriptor ?? { configurable: true, enumerable: true, writable: true }), value }); }
        let view = h.app.pendingEvolution; flow.resolveEvolution(view.token, view.revision, { kind: 'retry' });
        for (let n = 0; h.app.pendingEvolution && n < 12; n++) { view = h.app.pendingEvolution; assert(view.phase !== 'failed', 'one explicit retry only'); const decision = view.phase === 'learning' ? { kind: 'learn', answer: { kind: 'decline', giveUp: true } } : { kind: view.phase === 'after-evolution' ? 'continue-learning' : 'complete' }; flow.resolveEvolution(view.token, view.revision, decision); }
        assert(!h.app.pendingEvolution && !h.app.saveBlocked && !flow.running, 'actual evolution root completes'); eq(flow.game().party[0].species, 'pidgeotto', 'actual selected Gen8 target'); eq(flow.game().stats.evolution_count, 1, 'one evolved install'); h.scene.onEnd(); await waitFor(() => !battle(), 'evolution end Scene leaves'); clearMessages(); await active(named('world')); return { injected, input: 'real level-up evolution + one known-zero host setter failure; explicit public decisions' };
      });
      await run('M10', async () => {
        for (const phase of ['battle', 'return']) {
          await reset(); await world(); const gate = holdNext(phase === 'battle' ? 'Battle wild' : named('world')); await open();
          if (phase === 'return') { await active('Battle wild'); await finish(); }
          await waitFor(() => gate.assigned, 'pending owned ' + phase); await nativeReady(gate.row); const before = stateHash(); await abortScene(); release(gate); await frames(3); eq(gate.row.plays.length, 0, 'abort suppresses late start'); assert(gate.row.destroyed > 0, 'owned native buffer retired'); eq(stateHash(), before, 'abort never rolls back committed result');
        }
        return { phases: ['battle', 'return'] };
      });
      await run('M11', async () => {
        for (const action of ['load', 'newgame']) {
          await reset(); await world(); G.$gameSystem.onBeforeSave(); await settledSave(PLAN.loadControlSlot); const gate = holdNext(named('next')); flow.setNextBattleMusic({ battle: named('next') }); await open(); await waitFor(() => gate.assigned, 'old timeline buffer'); await nativeReady(gate.row);
          if (action === 'load') assert(await G.DataManager.loadGame(PLAN.loadControlSlot), 'real load control slot'); else { G.DataManager.setupNewGame(); G.$gameSystem._psGame = musicNativeState(E, content); }
          assert(gate.row.destroyed > 0 && !flow.running, 'replacement retired old owner'); G.SceneManager.goto(G.Scene_Map); await toMapId(PLAN.mapId, 8, 9); clearMessages(); await world(); await open(); await active('Battle wild'); release(gate); await frames(2); eq(audio._currentBgm.name, 'Battle wild', 'old preset/timeline cannot replace new default'); eq(gate.row.plays.length, 0, 'late old timeline never plays'); await abortScene();
        }
        return { load: 'actual DataManager.loadGame/extract', newgame: 'actual setupNewGame; explicit valid test-party installation without an extra stateReplaced call' };
      });
      await run('M12', async () => {
        await reset(); await world(); await open(); await active('Battle wild'); let gate = holdNext(named('world')); await finish(); await waitFor(() => gate.assigned, 'old return'); await nativeReady(gate.row); audio.playBgm(track(named('next'))); await active(named('next')); const foreign = audio._bgmBuffer; release(gate); await frames(3); assert(audio._bgmBuffer === foreign && !unwrap(foreign).destroyed, 'external successor survives'); eq(gate.row.plays.length, 0, 'old return cannot overwrite foreign track');
        await reset(); await world(); await open(); await active('Battle wild'); const memo = clone(player().memo); gate = holdNext(named('world')); await finish(); await waitFor(() => gate.assigned, 'old pending return'); await nativeReady(gate.row); await open(true); await active(named('trainer')); release(gate); eq(player().memo, memo, 'new battle inherits original pending-return world target'); await finish(); await active(named('world')); eq(activeRow().plays[0].position, memo.position, 'successor restores original target offset'); return { memo };
      });
      await run('M13', async () => {
        await reset(); await world(); flow.setNextBattleMusic({ battle: named('preset') }); await open(); await active(named('preset')); flow.setNextBattleMusic({ battle: named('next') }); await finish(); await active(named('world')); await open(); await active(named('next')); await abortScene();
        await world(); // M13 re-establish world explicitly without clearing the preserved preset.
        await open(); await active(named('next')); await finish(); await active(named('world')); await open(); await active('Battle wild'); await abortScene(); return { futureSurvived: true, abortPreserved: true, normalConsumed: true };
      });
      await run('M14', async () => {
        await reset('normal', { defaultBgm: named('default') }); await world(true); await open(); await active(named('default')); const b = activeRow(); await finish(); assert(audio._bgmBuffer === b.buffer && !b.destroyed, 'real None/default handoff survives Scene exit'); eq(last().state, 'requested', 'silent return completes under override'); await frames(2); assert(!b.destroyed, 'late Scene cleanup preserves handed-off default'); return readNative(b);
      });
      await run('M15', async () => {
        for (const override of [false, true]) {
          await reset('normal', override ? { defaultBgm: named('default') } : {}); await world(override); audio.playMe(track(named('signal'))); const me = unwrap(audio._meBuffer); await nativeReady(me); await waitFor(() => me.buffer._sourceNodes?.length > 0, 'actual ME source starts');
          const counters = clone(stopCounts); await open(); const name = override ? named('default') : 'Battle wild'; await waitFor(() => audio._currentBgm?.name === name, 'BGM registered under real ME'); const bgm = activeRow(); await nativeReady(bgm); assert(audio._meBuffer === me.buffer, 'real ME still owns delay window'); eq(bgm.plays.length, 0, 'BGM not started while ME active'); eq(stopCounts, counters, 'no global SE/BGS/ME stop during publication');
          if (override) { const h = battle()._session; for (let n = 0; n < 12 && !h.finished; n++) assert((await h.chooseMove(1)).ok, 'actual engine turn for default handoff'); assert(h.finished, 'real result before default handoff'); flow.finish(h, flow._op); battle().onEnd(); await waitFor(() => !battle(), 'default handoff Scene leaves'); assert(audio._bgmBuffer === bgm.buffer && !bgm.destroyed, 'default leased to world while ME pending'); }
          await waitFor(() => !audio._meBuffer, 'actual natural ME completion'); await active(name); assert(audio._bgmBuffer === bgm.buffer && bgm.plays.length === 1, 'same deferred native BGM starts once'); eq(stopCounts.stopBgs, counters.stopBgs, 'no BGS stop'); eq(stopCounts.stopSe, counters.stopSe, 'no SE stop');
          if (!override) { await finish(); await active(named('world')); }
        }
        return { ME: 'native non-looping clip completes naturally; default case drives real session programmatically to finish before ME completion' };
      });
      await run('M16', async () => {
        await reset(); await world(); await open(); await active('Battle wild'); const { raw } = await finish(); await active(named('world')); const before = clone(flow.game()); eq(flow.commit(raw), 'already-applied', 'same exact result not installed twice'); eq(flow.game(), before, 'receipt/reward unchanged');
        const writes: Promise<any>[] = [], saveObject = G.StorageManager.saveObject;
        G.StorageManager.saveObject = function (this: any, ...args: any[]) { const promise = saveObject.apply(this, args); writes.push(Promise.resolve(promise)); return promise; };
        try { G.SceneManager.push(G.Scene_Save); await waitFor(() => scene() instanceof G.Scene_Save && scene().isStarted() && scene()._listWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), 'normal Save scene'); const saveScene = scene(); saveScene._listWindow.selectSavefile(PLAN.slot); eq(saveScene._listWindow.savefileId(), PLAN.slot, 'new producer slot'); await press('ok'); await waitFor(() => scene() instanceof G.Scene_Map && !G.SceneManager.isSceneChanging(), 'Save scene returns normally'); await Promise.all(writes); assert(writes.length >= 2, 'actual slot/global storage promises observed'); } finally { G.StorageManager.saveObject = saveObject; }
        const file = G.StorageManager.filePath(G.DataManager.makeSavename(PLAN.slot)), expectedFile = path.join(path.dirname(OUT), 'music-native-expected.v2.json');
        const saved = { version: PLAN.version, chain: input.chain, fixtureSHA256: hash(stable(content)), productCommit: PLAN.productCommit, packageHead: input.packageHead, slot: PLAN.slot, saveSHA256: fileHash(file), state: clone(flow.game()), result: raw, bgmOnSave: clone(G.$gameSystem._bgmOnSave), hostRegistration: clone(audio._currentBgm) };
        assert(saved.state.appliedBattles[raw.battleId], 'real producer settlement receipt'); eq(saved.bgmOnSave.name, named('world'), 'ordinary onBeforeSave captured world BGM'); fs.writeFileSync(expectedFile, JSON.stringify(saved, null, 2) + '\n', { flag: 'wx' }); details.producer = { expectedFile, expectedSHA256: fileHash(expectedFile), saveSHA256: saved.saveSHA256, slot: PLAN.slot }; return details.producer;
      });
    }
    eq(results.map((row: any) => [row.id, row.status]), expectedIDs.map(id => [id, 'pass']), 'exact nonempty native denominator; no recovery/retry');
  } finally {
    audio.createBuffer = originals.createBuffer; G.PluginManager.parameters = originals.parameters; audio.bgmVolume = originals.bgmVolume;
    for (const key of Object.keys(stopCounts)) audio[key] = originals[key];
    delete G.__psMusicNativeMark;
    details.nativeBuffers = objects.map(row => { try { return readNative(row); } catch (error) { return { id: row.id, name: row.name, diagnosticError: String(error) }; } }); details.stopCounts = stopCounts; details.finishedFrame = G.Graphics.frameCount;
  }
}
