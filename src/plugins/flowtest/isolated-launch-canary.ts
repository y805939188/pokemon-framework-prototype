import { testBattleFlowMatches, testRuntimeFixesMatches, testStorageStillBound, type TestStage } from "../isolated-test-scope";

export const LAUNCHER_CANARY_ARG = "--ps-flow-test=launcher-canary";

/** One observational native boot after the stage's authentic storage, fixes, and Flow are installed. */
export function installIsolatedLaunchCanary(host: any, stage: TestStage, argv: readonly string[]): void {
  type Options = { scene: boolean; report: string; privateOutput(): boolean; bound(): boolean };
  let options: Options;
  try {
    const path = host.require("node:path"), fs = host.require("node:fs");
    const profile = path.join(stage.root, "profile"), evidence = path.join(stage.root, "evidence");
    const report = path.join(evidence, "report.json");
    const relevant = argv.filter(arg => /^--(?:ps-|user-data-dir(?:=|$))/.test(arg));
    const scene = relevant.includes("--ps-fix=scene");
    const expected = [
      "--ps-isolated-test", "--user-data-dir=" + profile, "--ps-save-dir=" + stage.saveDirectory,
      LAUNCHER_CANARY_ARG, "--ps-flow-out=" + report, "--ps-flow-quit", ...(scene ? ["--ps-fix=scene"] : []),
    ];
    if (relevant.length !== expected.length || !expected.every(arg => relevant.includes(arg)) ||
        argv.some(arg => /^(?:--)?(?:test|btest|etest)(?:=|$)/.test(arg)) ||
        ["test", "btest", "etest"].some(option => host.Utils.isOptionValid(option))) return;
    const privateOutput = (): boolean => {
      const info = fs.lstatSync(evidence);
      return info.isDirectory() && (info.mode & 0o077) === 0 && fs.realpathSync(evidence) === evidence &&
        fs.readdirSync(evidence).length === 0;
    };
    const bound = (): boolean => testStorageStillBound(host, stage) && testBattleFlowMatches(host.PSFlow, stage) &&
      testRuntimeFixesMatches(host.__psRuntimeFixes, stage) &&
      host.nw.App.dataPath === stage.appDataPath && fs.realpathSync(stage.appDataPath) === stage.appDataPath &&
      fs.lstatSync(stage.appDataPath).isDirectory() &&
      fs.realpathSync(host.StorageManager.fileDirectoryPath()) === stage.saveDirectory;
    if (!privateOutput() || !bound() || host.PluginManager.parameters("PS_BattleFlow").contentSource === "fixture") return;
    options = { scene, report, privateOutput, bound };
  } catch { return; } // No ordinary hooks, failure output, or broad driver fallback.
  const boot = host.Scene_Boot?.prototype, start = boot?.start;
  if (typeof start !== "function") return;
  boot.start = function (this: unknown, ...args: unknown[]): unknown {
    boot.start = start; // no repeated observation or wrapping of another boot
    const result = Reflect.apply(start, this, args);
    try {
      if (!options.privateOutput() || !options.bound()) return result;
      const fixes = host.__psRuntimeFixes;
      const observations = {
        profileBound: true, storageBound: true, flowBound: true, fixesBound: true,
        ordinaryState: Array.isArray(host.$gameSystem?._psGame?.party) && host.$gameSystem._psGame.party.length === 0 &&
          !host.$gameSystem._psInitError,
        texture: fixes.textureFix === true, batcher: fixes.batcherFix === true, scene: fixes.sceneFix === true,
      };
      const pass = observations.ordinaryState && observations.texture && observations.batcher && observations.scene === options.scene;
      host.require("node:fs").writeFileSync(options.report, JSON.stringify({
        schema: 1, mode: "launcher-canary", overall: pass ? "pass" : "fail", requestedScene: options.scene, observations,
      }) + "\n", { flag: "wx", mode: 0o600 });
      host.nw.App.quit();
    } catch { /* The supervisor sees no valid record or a failure, never fabricated success. */ }
    return result;
  };
}
