/* eslint-disable @typescript-eslint/no-explicit-any */
/** Test-only R8 qualification. No synthetic AudioBuffer is installed here.
 * Programmatic battle controls and formal evolution Scene inputs; R806 is an
 * explicit synchronous native lifecycle fault control. An external supervisor,
 * not this report, qualifies actual native execution.
 */
import PLAN from '../../../experiments/step5/4/r8-music-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const r8MusicNativePlan = PLAN;
export function r8SeekError(actual: number, expected: number, duration: number): number {
  if (![actual, expected, duration].every(Number.isFinite) || duration <= 0) throw Error('invalid native seek sample');
  return Math.abs(((actual - expected) % duration + duration * 1.5) % duration - duration / 2);
}

export async function runD2R8Music(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, fightUntilEnd, press, toMapId } = p;
  const E = api(), flow = W.PSFlow, audio = G.AudioManager, hash = (b: any) => p.nodeRequire('crypto').createHash('sha256').update(b).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  const inputFile = arg('ps-r8-music-input');
  assert(inputFile && OUT && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole frozen R8 mode with real audio required');
  assert(typeof W.PSEvolution?.current === 'function', 'formal evolution plugin actually loaded');
  const inputBytes = fs.readFileSync(inputFile), input = JSON.parse(inputBytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'R8 input version'); eq(input.productCommit, PLAN.productCommit, 'R8 product'); eq(input.productPlugins, PLAN.productPlugins, 'all three product plugin identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'bundled R8 plan');
  for (const [name, value] of Object.entries(PLAN.productPlugins)) eq(fileHash(path.join(gameDir, 'js/plugins', name + '.js')), value, 'actual ' + name);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual R8 driver');
  eq(info.gitHead, input.packageHead, 'clean fixed package head'); eq(info.workingTreeChanges, 0, 'clean package');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'explicit isolated storage'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage path');
  const storageRelative = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot));
  assert(storageRelative === '..' || storageRelative.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'no existing saves');
  eq(audio.audioFileExt(), PLAN.nativeExtension, 'native extension');
  for (const row of input.assets) eq(fileHash(path.join(gameDir, row.path)), row.sha256, 'frozen media ' + row.path);
  assert(!fs.existsSync(path.join(gameDir, PLAN.intentionalMissingBgm)), 'missing BGM negative is really absent');
  const expectedIDs = PLAN.groups.flatMap(g => g.ids); eq(expectedIDs, ['R801', 'R802', 'R803', 'R804', 'R805', 'R806'], 'six exact cases');
  const details: any = report.r8MusicNative = { version: PLAN.version, inputSHA256: hash(inputBytes), productCommit: PLAN.productCommit, productPlugins: PLAN.productPlugins, driverPluginSHA256: input.driverPluginSHA256, packageHead: input.packageHead, expectedIDs, nativeClaim: 'NOT_SELF_QUALIFIED', physicalHearing: 'NOT_VERIFIED', sequenceScope: PLAN.nativeSequenceScope, sequenceNativeNotRun: PLAN.nativeSequenceNotRun, events: [], cases: {}, notRunIDs: [...expectedIDs], controlled: ['synthetic author fixture', 'programmatic battle UI and real formal evolution Scene inputs', 'R806 second-stop successor installation'] };
  report.hostDriverVersion = PLAN.version;
  const objects: any[] = [], sourceClocks: any[] = [], cleanupErrors: any[] = details.cleanupErrors = [];
  let monitoredContext: any = null, originalSourceFactory: any, sourceFactory: any;
  let currentCase = '', settings: any = {}, randomState = PLAN.worldSeed >>> 0, draws = 0, ordinal = 0, activeRoot: any = null, output: any = null, hold: any = null, violation: string | null = null;
  const named = (s: string) => PLAN.prefix + s;
  const track = (name: string, more: any = {}) => ({ name, volume: 100, pitch: 100, pan: 0, ...more });
  const mark = (kind: string, data: any = {}) => { assert(details.events.length < 3000, 'bounded R8 trace'); details.events.push({ case: currentCase, kind, frame: G.Graphics.frameCount, at: G.performance.now(), ...data }); };
  const channel = () => ({ buffer: audio._bgmBuffer, record: audio._currentBgm, sequence: audio._bgmSequence, pending: audio._pendingBgmSequence });
  const same = (a: any, b: any) => !!a && a.buffer === b.buffer && a.record === b.record && a.sequence === b.sequence && a.pending === b.pending;
  const observeOutput = () => { output = channel(); };
  const rowFor = (b: any) => objects.find(r => r.buffer === b);
  const native = (row: any) => {
    const b = row.buffer;
    return { id: row.id, name: row.name, ready: row.ready.call(b), error: b.isError(), destroyed: row.destroyed, decoded: (b._buffers ?? []).map((x: any) => ({ tag: Object.prototype.toString.call(x), duration: x.duration, sampleRate: x.sampleRate, channels: x.numberOfChannels })), sources: (b._sourceNodes ?? []).map((n: any) => ({ tag: Object.prototype.toString.call(n), hasBuffer: !!n.buffer, rate: n.playbackRate?.value })), context: { state: G.WebAudio?._context?.state, time: G.WebAudio?._context?.currentTime }, position: row.destroyed || !row.ready.call(b) ? null : b.seek(), pitch: b.pitch, loopStart: b._loopStartTime, loopLength: b._loopLengthTime };
  };
  const sourceClock = () => {
    const ctx = G.WebAudio._context; assert(ctx && typeof ctx.createBufferSource === 'function', 'actual native source factory');
    if (monitoredContext) { assert(monitoredContext === ctx, 'native audio context identity retained'); return; }
    monitoredContext = ctx; originalSourceFactory = ctx.createBufferSource;
    sourceFactory = function (this: any, ...args: any[]) {
      const node = originalSourceFactory.apply(this, args), start = node.start;
      const r: any = { node, original: start, started: false };
      r.wrapper = function (this: any, ...values: any[]) {
        const at = ctx.currentTime, when = values[0] ?? 0, offset = values[1] ?? 0;
        const value = start.apply(this, values);
        if (this === node) { r.started = true; r.at = Math.max(at, when); r.offset = offset; r.duration = values[2]; mark('native-source-start', { at: r.at, offset, duration: r.duration }); }
        return value;
      };
      node.start = r.wrapper; sourceClocks.push(r); return node;
    };
    ctx.createBufferSource = sourceFactory;
  };
  const healthy = () => { if (violation) throw Error(violation); if (scene()?._failure) throw Error('formal Scene failure: ' + scene()._failure); if (W.PSEvolution.current()?.error) throw Error('formal evolution recovery: ' + W.PSEvolution.current().error); };
  const wait = (cond: () => boolean, label: string) => waitFor(() => { healthy(); return cond(); }, label);
  const originals = { createBuffer: audio.createBuffer, parameters: G.PluginManager.parameters, updateScene: G.SceneManager.updateScene, volume: audio.bgmVolume, sequences: G.$dataSystem.reactorMusicSequences };
  const parameters = function (this: any, name: string) { const value = originals.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...value, battleMusic: JSON.stringify(settings) } : value; };
  const create = function (this: any, folder: string, name: string) {
    const buffer = originals.createBuffer.call(this, folder, name), play = buffer.play, destroy = buffer.destroy;
    const row: any = { id: objects.length + 1, name, folder, buffer, ready: buffer.isReady, plays: [], destroyed: 0, owned: folder === 'bgm/' && [named('world'), named('battle')].includes(name) }; objects.push(row);
    row.originalPlay = play; row.originalDestroy = destroy;
    row.playWrapper = function (this: any, loop: boolean, position: number) { row.plays.push({ loop, position: position ?? 0, contextTime: G.WebAudio?._context?.currentTime }); mark('source-play', { id: row.id, name, loop, position }); return play.call(this, loop, position); };
    row.destroyWrapper = function (this: any) { row.destroyed++; return destroy.call(this); };
    buffer.play = row.playWrapper; buffer.destroy = row.destroyWrapper; return buffer;
  };
  const update = function (this: any, ...args: any[]) {
    const value = originals.updateScene.apply(this, args);
    if (hold && flow.running && flow._op === hold.op) {
      hold.samples++; if (flow._app !== hold.app || hold.app.stateGeneration !== hold.generation || audio._bgmBuffer !== hold.buffer || audio._currentBgm?.name !== named('battle')) violation ??= 'battle music changed while the formal root was pending';
    }
    return value;
  };
  let content: any, libraryLease: any = null, libraryValue = '';
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const clearMessages = () => { G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); };
  let first = true;
  const reset = async (evolution: boolean, missing = false) => {
    await wait(() => mapReady() || (first && titleReady()), 'initial started Title or subsequent started Map');
    const initialTitle = first && titleReady(); first = false;
    assert(!flow._app?.saveBlocked && !flow.running && !W.PSEvolution.current(), 'previous root actually finished');
    // A normal cold Title owns its configured song before this test starts.
    // Adopt only that exact initial channel once, not later case successors.
    const titleOutput = channel(), title = G.$dataSystem.titleBgm;
    if (initialTitle && !output && titleOutput.buffer && !titleOutput.sequence && !titleOutput.pending) {
      for (const key of ['name', 'volume', 'pitch', 'pan']) eq(titleOutput.record?.[key], title?.[key], 'configured initial Title song ' + key);
      output = titleOutput; mark('initial-title-handoff', { title: clone(title) });
    }
    assert(same(output, channel()) || (!audio._bgmBuffer && !audio._bgmSequence && !audio._pendingBgmSequence), 'case boundary cannot discard an unknown successor');
    if (same(output, channel())) audio.stopBgm(); output = null;
    flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {}; flow.seed = [...PLAN.seed]; randomState = PLAN.worldSeed >>> 0; draws = 0;
    flow.rng = (n: number) => { draws++; randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return Math.floor(randomState / 4294967296 * n); };
    flow.fast = true; flow.receiveOptions = { mode: 1, naming: 1 }; G.$gameSystem._psGame = musicNativeState(E, content, evolution ? 'evolution' : 'normal');
    settings = { presets: { battle: named(missing ? 'missing' : 'battle') } }; clearMessages();
    await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'actual Map.start/windows/spriteset'); await press('shift'); activeRoot = null; hold = null; violation = null; return flow.app();
  };
  const active = async (buffer: any, name: string) => {
    const row = rowFor(buffer); assert(row, 'tracked real audio allocation');
    await wait(() => row.ready.call(buffer) || buffer.isError(), 'actual native decoder');
    const v = native(row), asset = input.assets.find((a: any) => a.logicalName === name && a.kind === 'bgm');
    assert(asset && !v.error && v.ready && v.decoded.length > 0, 'native decoded frozen clip');
    const duration = v.decoded.reduce((s: number, a: any) => s + a.duration, 0);
    assert(v.decoded.every((a: any) => a.tag === '[object AudioBuffer]' && a.channels === asset.expectedNativeChannels && a.sampleRate > 0), 'actual AudioBuffer/channel/rate');
    assert(duration >= asset.nativeDurationRangeSeconds[0] && duration <= asset.nativeDurationRangeSeconds[1], 'unchanged frozen media duration interval');
    await wait(() => buffer.isPlaying() && buffer._sourceNodes?.length > 0 && G.WebAudio?._context?.state === 'running', 'native source/context');
    const before = G.WebAudio._context.currentTime; await frames(2); assert(G.WebAudio._context.currentTime > before, 'native context advances');
    assert(native(row).sources.some((s: any) => s.tag === '[object AudioBufferSourceNode]' && s.hasBuffer), 'real BufferSourceNode'); mark('native-qualified', native(row)); return { row, duration };
  };
  const world = async () => { sourceClock(); audio.playBgm(track(named('world')), PLAN.initialPosition); observeOutput(); await active(audio._bgmBuffer, named('world')); };
  const sequence = async (none: boolean) => {
    sourceClock(); if (none) { audio.playBgm(track('')); assert(!audio._bgmBuffer && audio._currentBgm?.name === '', 'native None registration'); }
    libraryLease = [null, { id: 1, sequence: clone(PLAN.sequence) }]; libraryValue = stable(libraryLease); G.$dataSystem.reactorMusicSequences = libraryLease;
    audio.playBgm(track(named('world'), { ...PLAN.sequenceFallback, sequence: PLAN.sequenceKey })); observeOutput(); eq(audio.saveBgm().sequence, PLAN.sequenceKey, 'native sequence before battle');
    await active(audio._bgmSequence.buffers[0], named('world'));
  };
  const open = async (missing = false) => {
    const request = { kind: 'wild', foes: [{ species: 'Pidgey', level: 3 }], seq: ++ordinal, battleId: PLAN.version + '/' + currentCase + '#' + ordinal, canLose: true };
    // Scene readiness can legitimately take frames while the world song keeps
    // advancing. Independently sample around its actual synchronous remember
    // boundary, not around the earlier openBattle request.
    let prior: any = null, preparedAt = 0;
    const startMusic = flow._startBattleMusic;
    const boundary = function (this: any, ...args: any[]) {
      if (!prior && args[0] === flow._op) {
        prior = { host: clone(audio.saveBgm()), buffer: audio._bgmBuffer, position: audio._bgmBuffer?.seek(), pitch: audio._bgmBuffer?.pitch, loopLength: audio._bgmBuffer?._loopLengthTime, at: G.WebAudio._context.currentTime };
        try { return startMusic.apply(this, args); } finally { preparedAt = G.WebAudio._context.currentTime; }
      }
      return startMusic.apply(this, args);
    };
    flow._startBattleMusic = boundary;
    try { flow.openBattle(request); await inMode('main'); healthy(); }
    finally { if (flow._startBattleMusic === boundary) flow._startBattleMusic = startMusic; }
    assert(prior, 'actual synchronous music memory boundary observed');
    const s = battle(), op = flow._op, app = flow.app();
    assert(s?._session && op?.session === s._session, 'actual Scene/App/Gen8 Session');
    activeRoot = { op, app, generation: app.stateGeneration }; if (!missing) { await active(audio._bgmBuffer, named('battle')); observeOutput(); }
    else eq(flow.musicState().player.requests.at(-1).state, 'missing', 'real missing battle BGM');
    const memo = clone(flow.musicState().player.memo);
    if (prior.host.sequence !== undefined) { assert(memo.track?.sequence === prior.host.sequence, 'memo matches independently saved native sequence'); for (const k of ['volume', 'pitch', 'pan']) eq(memo.track[k], prior.host[k], 'sequence fallback ' + k); }
    else if (prior.host.name === named('world')) {
      assert(memo.track?.name === prior.host.name, 'memo matches actual host song'); const elapsed = preparedAt - prior.at;
      assert(r8SeekError(memo.position, prior.position + elapsed * prior.pitch / 2, prior.loopLength) <= PLAN.seekToleranceFrames / 60 + PLAN.seekToleranceSamples / PLAN.sampleRate + elapsed * prior.pitch / 2, 'memo seek matches independent prebattle host sample');
    }
    mark('independent-prebattle-memo', { host: prior.host, position: prior.position, contextAt: prior.at, preparedAt, memo });
    return { scene: s, op, app, generation: app.stateGeneration, memo, buffer: audio._bgmBuffer, samples: 0 };
  };
  const win = async (h: any) => { await fightUntilEnd(/tackle/i, 12); await inMode('end'); assert(h.scene._session.finished && h.scene._session.result().outcome.kind === 'win', 'real terminal win'); };
  const closed = async (h: any) => { await wait(() => mapReady() && !flow.running && !h.app.saveBlocked && !W.PSEvolution.current(), 'real root and formal Scene closed'); activeRoot = null; hold = null; };
  const returnWorld = async (h: any) => {
    await wait(() => audio._currentBgm?.name === named('world') && !!audio._bgmBuffer, 'world actually registered'); const value = await active(audio._bgmBuffer, named('world'));
    const measured = native(value.row), b = value.row.buffer;
    assert(measured.loopLength > 0 && measured.loopStart >= 0 && measured.loopStart + measured.loopLength <= value.duration + 2 / PLAN.sampleRate, 'actual frozen clip loop interval');
    const played = sourceClocks.filter(r => r.started && b._sourceNodes.includes(r.node) && r.at <= measured.context.time && (r.node.loop || measured.context.time < r.at + (r.duration ?? r.node.buffer.duration - r.offset) / r.node.playbackRate.value)).sort((a, b) => b.at - a.at)[0];
    assert(played && Number.isFinite(played.at), 'currently playing real BufferSourceNode.start clock');
    const index = b._buffers.indexOf(played.node.buffer); assert(index >= 0, 'source buffer belongs to decoded clip');
    const chunkStart = b._buffers.slice(0, index).reduce((n: number, x: any) => n + x.duration, 0), expected = chunkStart + played.offset + (measured.context.time - played.at) * played.node.playbackRate.value;
    assert(r8SeekError(measured.position, expected, measured.loopLength) <= PLAN.seekToleranceFrames / 60 + PLAN.seekToleranceSamples / PLAN.sampleRate, 'world seek agrees with actual SourceNode start and native elapsed');
    assert(r8SeekError(chunkStart + played.offset, h.memo.position + (played.at - value.row.plays.at(-1).contextTime) * measured.pitch, measured.loopLength) <= PLAN.seekToleranceFrames / 60 + PLAN.seekToleranceSamples / PLAN.sampleRate, 'actual return starts at original world memo position');
    eq(flow.musicState().player.requests.filter((r: any) => r.kind === 'return').length, 1, 'one root return'); observeOutput();
  };
  const nextMemo = async (sequenceKey?: string) => {
    const next = await open(); if (sequenceKey) eq(next.memo.track.sequence, sequenceKey, 'next battle remembers world sequence'); else eq(next.memo.track.name, named('world'), 'next battle remembers world not battle song');
    hold = null; flow.abort(Error('owned next-battle qualification cleanup'), next.op); G.SceneManager.goto(G.Scene_Map); await wait(mapReady, 'next battle fully left'); activeRoot = null;
  };
  const formal = async (kind: 'complete' | 'cancel' | 'technical') => {
    await reset(true); await world(); const h = await open(); hold = h; await win(h);
    h.scene.onEnd(); // real Scene end/transfer, never direct domain resolve
    await wait(() => scene()?._controller?.request?.battleOp === h.op && scene().isStarted() && W.PSEvolution.current()?.ready, 'actual battle-bound formal evolution Scene');
    const ui = () => W.PSEvolution.current(); eq(ui().timeline.phase, 'what', 'real initial evolution presentation'); assert(h.app.pendingEvolution?.selection?.cancellable && flow.running && h.app.saveBlocked, 'real selected cancellable locked root');
    await press('ok'); await wait(() => ui()?.ready && ui().timeline?.phase === 'animation', 'real animation after intro');
    if (kind === 'technical') G.SceneManager.goto(G.Scene_Map);
    else if (kind === 'cancel') { await press('cancel'); await wait(() => ui()?.ready && ui().timeline?.phase === 'cancelled', 'real cancel decision/flash'); await press('ok'); }
    else { await wait(() => ui()?.ready && ui().timeline?.successReady, 'real animation and success dwell'); await press('ok'); }
    await closed(h); healthy(); assert(h.samples > 0, 'pending root observed on actual Scene updates'); eq(flow.game().party[0].species, kind === 'complete' ? 'pidgeotto' : 'pidgey', 'real evolution outcome');
    await returnWorld(h); await nextMemo(); return { rootFrames: h.samples, decision: kind, memo: h.memo };
  };
  const run = async (id: string, fn: () => Promise<any>) => {
    currentCase = id; const start = G.performance.now(); mark('case-start');
    try { const value = await fn(); healthy(); details.cases[id] = { value, stateSHA256: hash(stable(flow.game())), worldDraws: draws }; results.push({ id, status: 'pass', ms: G.performance.now() - start }); }
    catch (error) { results.push({ id, status: 'fail', error: String(error) }); throw error; }
    finally { details.notRunIDs = expectedIDs.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try {
    G.PluginManager.parameters = parameters; audio.createBuffer = create; G.SceneManager.updateScene = update; audio.bgmVolume = PLAN.musicVolume;
    content = musicNativeContent(E, assert); details.fixtureSHA256 = hash(stable(content));
    await run('R801', () => formal('complete')); await run('R802', () => formal('cancel')); await run('R803', () => formal('technical'));
    await run('R804', async () => { await reset(false); await sequence(false); const h = await open(); eq(h.memo.track.sequence, PLAN.sequenceKey, 'world sequence memo'); await win(h); h.scene.onEnd(); await closed(h); await wait(() => audio._bgmSequence?.key === PLAN.sequenceKey, 'real sequence return'); for (const k of ['volume', 'pitch', 'pan'] as const) eq(audio.saveBgm()[k], PLAN.sequenceFallback[k], 'native restored fallback ' + k); await active(audio._bgmSequence.buffers[0], named('world')); observeOutput(); await nextMemo(PLAN.sequenceKey); });
    await run('R805', async () => { await reset(false, true); await sequence(true); const prior = audio._currentBgm, h = await open(true); assert(prior === audio._currentBgm, 'missing battle did not take old None'); await win(h); h.scene.onEnd(); await closed(h); eq(audio.saveBgm().sequence, PLAN.sequenceKey, 'same None permits sequence return'); eq(flow.musicState().player.requests.at(-1).state, 'requested', 'return did not falsely supersede'); await active(audio._bgmSequence.buffers[0], named('world')); observeOutput(); });
    await run('R806', async () => {
      await reset(false, true); await sequence(true); const prior = audio._currentBgm, h = await open(true); await win(h);
      const stop = audio.stopBgm; let calls = 0, next: any = null; const sequenceSources = objects.filter(r => r.name === named('world')).length;
      const controlled = function (this: any, ...args: any[]) { const value = stop.apply(this, args); if (++calls === 2) { audio.playBgm(track('')); next = audio._currentBgm; mark('controlled-new-None'); } return value; };
      audio.stopBgm = controlled;
      try { h.scene.onEnd(); await closed(h); assert(next && next !== prior && audio._currentBgm === next, 'genuine new None survives'); assert(!audio._bgmBuffer && !audio._bgmSequence && !audio._pendingBgmSequence, 'old return never publishes over successor'); eq(flow.musicState().player.requests.at(-1).state, 'superseded', 'new None is a real successor'); eq(objects.filter(r => r.name === named('world')).length, sequenceSources, 'no old world source allocated'); return { stopCalls: calls, hitSecondStop: true, genuineNewIdentity: true }; }
      finally { if (audio.stopBgm === controlled) audio.stopBgm = stop; }
    });
    eq(results.map((r: any) => [r.id, r.status]), expectedIDs.map(id => [id, 'pass']), 'all six cases, no filter/replay');
  } catch (error) { failed = true; primary = error; throw error; }
  finally {
    hold = null; details.primaryError = failed ? String(primary) : null;
    const clean = (name: string, fn: () => void) => { try { fn(); } catch (error) { cleanupErrors.push({ name, error: String(error) }); } };
    // Unknown/partial formal roots are never ACKed or forcibly completed for cleanup.
    if (activeRoot && flow._op === activeRoot.op && flow._app === activeRoot.app && activeRoot.app.stateGeneration === activeRoot.generation) {
      if (activeRoot.app.pendingEvolution || activeRoot.app.pendingReceiving || activeRoot.app.pendingPokedex) details.cleanupRoot = 'pending-domain-left-locked';
      else clean('owned active root', () => flow.abort(Error('R8 owned failure cleanup'), activeRoot.op));
    }
    if (same(output, channel())) clean('owned output', () => audio.stopBgm());
    for (const r of objects) if (r.owned && !r.destroyed && r.buffer !== audio._bgmBuffer && r.buffer !== audio._meBuffer && !audio._bgmSequence?.buffers?.includes(r.buffer) && !audio._bgmSequence?.retiring?.some((v: any) => v.buffer === r.buffer)) clean('orphan own buffer ' + r.id, () => r.buffer.destroy());
    for (const r of objects) clean('restore buffer observers ' + r.id, () => { if (r.buffer.play === r.playWrapper) r.buffer.play = r.originalPlay; if (r.buffer.destroy === r.destroyWrapper) r.buffer.destroy = r.originalDestroy; });
    clean('restore createBuffer', () => { if (audio.createBuffer === create) audio.createBuffer = originals.createBuffer; });
    clean('restore parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = originals.parameters; });
    clean('restore Scene observer', () => { if (G.SceneManager.updateScene === update) G.SceneManager.updateScene = originals.updateScene; });
    for (const r of sourceClocks) clean('restore source start', () => { if (r.node.start === r.wrapper) r.node.start = r.original; });
    clean('restore source factory', () => { if (monitoredContext && monitoredContext.createBufferSource === sourceFactory) monitoredContext.createBufferSource = originalSourceFactory; });
    clean('restore volume', () => { if (!audio._bgmBuffer && !audio._bgmSequence && !audio._pendingBgmSequence) audio.bgmVolume = originals.volume; else details.volumeRestore = 'retained-for-active-successor'; });
    clean('restore sequence fixture', () => { if (libraryLease && G.$dataSystem.reactorMusicSequences === libraryLease && stable(libraryLease) === libraryValue) G.$dataSystem.reactorMusicSequences = originals.sequences; });
    details.remainingRootLocked = !!flow._app?.saveBlocked; details.cleanupComplete = cleanupErrors.length === 0; writeProgress();
    if (!failed && cleanupErrors.length) throw Error('R8 cleanup failed: ' + JSON.stringify(cleanupErrors));
  }
}
