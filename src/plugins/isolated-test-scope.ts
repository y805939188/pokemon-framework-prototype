import { isolatedNativeAppName, MAC_NW_PROFILE_DEFAULT, NATIVE_PROFILE_FILE } from "./isolated-profile-contract";

/** The isolated build stamps one private run into its IIFEs. Flags alone never grant authority. */
declare const __PS_ISOLATED_TEST_STAGE__: Readonly<{ root: string; epoch: string; nativeProfile?: typeof MAC_NW_PROFILE_DEFAULT }> | null;

type PathPorts = { join(...paths: string[]): string; readonly sep: string };
export type TestStage = Readonly<{
  root: string; epoch: string; saveDirectory: string; storagePath: string; appDataPath: string; nativeProfile?: typeof MAC_NW_PROFILE_DEFAULT;
}>;

type TestHost = {
  readonly require?: any;
  readonly nw?: { readonly App?: { readonly argv?: readonly string[]; readonly fullArgv?: readonly string[];
    readonly dataPath?: string; readonly manifest?: { readonly name?: string } } };
  readonly process?: { readonly platform?: string; readonly arch?: string; readonly getuid?: () => number;
    readonly versions?: Readonly<Record<string, string>>; readonly env?: Readonly<Record<string, string>> };
  readonly location?: { readonly search?: string };
  readonly StorageManager?: { readonly fileDirectoryPath?: unknown };
};
type DirectoryMethod = (this: unknown) => unknown;
type StorageBinding = Readonly<{ stage: TestStage; method: DirectoryMethod }>;

const storageID = Symbol.for("pokemon-framework.isolated-test.storage-v1");
const battleFlowID = Symbol.for("pokemon-framework.isolated-test.battle-flow-v1");
const runtimeFixesID = Symbol.for("pokemon-framework.isolated-test.runtime-fixes-v1");
const sameStage = (left: TestStage | undefined, right: TestStage): boolean =>
  left?.root === right.root && left.epoch === right.epoch && left.storagePath === right.storagePath &&
  left.appDataPath === right.appDataPath && left.nativeProfile === right.nativeProfile;

function own(owner: object | undefined, key: symbol): unknown {
  return owner && Object.getOwnPropertyDescriptor(owner, key)?.value;
}

function literalSwitch(args: readonly string[], key: string, value: string): boolean {
  const matches = args.filter(arg => arg === key || arg.startsWith(key + "="));
  return matches.length === 1 && matches[0] === key + "=" + value;
}
const nativeTestOption = (part: string): boolean => /^(?:--)?(?:test|btest|etest)(?:=|$)/.test(part);
const unsafeNativeOption = (args: readonly string[]): boolean => args.some(arg => arg.split("&").some(nativeTestOption));

/** Only SaveLocation may use stage admission to install the scoped storage. It is not execution authority. */
export function isolatedTestStage(host: object): TestStage | null {
  // Also disabled when source is loaded without the Vite build, e.g. a plain TS unit test.
  const stage = typeof __PS_ISOLATED_TEST_STAGE__ === "object" ? __PS_ISOLATED_TEST_STAGE__ : null;
  if (!stage) return null;
  const root = host as TestHost, app = root.nw?.App, argv = app?.argv;
  if (!Array.isArray(argv) || argv.filter(arg => arg === "--ps-isolated-test").length !== 1) return null;
  try {
    const require = root.require, path: PathPorts = require("node:path"), fs = require("node:fs");
    const realDirectory = (dir: string): string | null => {
      const stat = fs.lstatSync(dir);
      return stat.isDirectory() && (stat.mode & 0o077) === 0 ? fs.realpathSync(dir) : null;
    };
    const game = path.join(stage.root, "game"), profile = path.join(stage.root, "profile"), saves = path.join(stage.root, "saves");
    if (realDirectory(stage.root) !== stage.root || realDirectory(game) !== game || realDirectory(profile) !== profile || realDirectory(saves) !== saves) return null;
    const stamp = path.join(stage.root, ".pf-isolated-stage"), stampStat = fs.lstatSync(stamp);
    if (!stampStat.isFile() || (stampStat.mode & 0o077) !== 0 || fs.readFileSync(stamp, "utf8") !== stage.epoch + "\n") return null;
    const argument = (name: string): string | null => {
      const matches = argv.filter(arg => arg.startsWith(name + "="));
      return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
    };
    const profileArgument = argument("--user-data-dir"), saveArgument = argument("--ps-save-dir");
    const nativeMarker = path.join(stage.root, NATIVE_PROFILE_FILE);
    const nativeStat = fs.lstatSync(nativeMarker, { throwIfNoEntry: false });
    let appDataPath = profile;
    if (stage.nativeProfile === MAC_NW_PROFILE_DEFAULT) {
      const process = root.process, fullArgv = app?.fullArgv;
      if (process?.platform !== "darwin" || process.arch !== "arm64" || process.versions?.nw !== "0.117.0" ||
          process.versions.chromium !== "154.0.8037.58" || typeof process.getuid !== "function" ||
          !Array.isArray(fullArgv) || unsafeNativeOption(argv) || unsafeNativeOption(fullArgv) ||
          (root.location?.search ?? "").slice(1).split("&").some(nativeTestOption)) return null;
      const uid = process.getuid(), home = path.join(stage.root, "home"), tmp = path.join(stage.root, "tmp");
      if (!nativeStat?.isFile() || (nativeStat.mode & 0o077) !== 0 || nativeStat.uid !== uid || nativeStat.nlink !== 1 ||
          stampStat.uid !== uid || stampStat.nlink !== 1 ||
          fs.readFileSync(nativeMarker, "utf8") !== MAC_NW_PROFILE_DEFAULT + "\n" ||
          app?.manifest?.name !== isolatedNativeAppName(stage.epoch) ||
          process.env?.HOME !== home || process.env?.CFFIXED_USER_HOME !== home || process.env?.TMPDIR !== tmp) return null;
      // This stamped dialect is only for the measured launcher canary, not the legacy scenario catalog.
      const report = path.join(stage.root, "evidence", "report.json");
      const relevant = (args: readonly string[]) => args.filter(arg => /^--(?:ps-|user-data-dir(?:=|$))/.test(arg));
      const scene = argv.includes("--ps-fix=scene");
      const expected = [
        "--ps-isolated-test", "--user-data-dir=" + profile, "--ps-save-dir=" + saves,
        "--ps-flow-test=launcher-canary", "--ps-flow-out=" + report, "--ps-flow-quit", ...(scene ? ["--ps-fix=scene"] : []),
      ];
      for (const args of [argv, fullArgv]) {
        const switches = relevant(args);
        if (!literalSwitch(args, "--user-data-dir", profile) || switches.length !== expected.length ||
            !expected.every(arg => switches.includes(arg))) return null;
      }
      appDataPath = path.join(profile, "Default");
      if (app?.dataPath !== appDataPath || ![stage.root, game, profile, appDataPath, saves, home, tmp].every(dir =>
          realDirectory(dir) === dir && fs.lstatSync(dir).uid === uid)) return null;
    } else {
      // A root-mode IIFE cannot borrow the native install, or vice versa.
      if (nativeStat || !profileArgument || realDirectory(profileArgument) !== profile ||
          !saveArgument || realDirectory(saveArgument) !== saves ||
          !app?.dataPath || fs.realpathSync(app.dataPath) !== profile) return null;
    }
    const plugins = require.resolve("./js/plugins.js");
    if (fs.realpathSync(plugins) !== path.join(game, "js", "plugins.js")) return null;
    return Object.freeze({ root: stage.root, epoch: stage.epoch, saveDirectory: saves, storagePath: saves + path.sep, appDataPath,
      ...(stage.nativeProfile ? { nativeProfile: stage.nativeProfile } : {}) });
  } catch {
    return null;
  }
}

function storageMatches(storage: TestHost["StorageManager"], stage: TestStage, method: DirectoryMethod): boolean {
  if (storage?.fileDirectoryPath !== method) return false;
  try { return Reflect.apply(method, storage, []) === stage.storagePath; }
  catch { return false; }
}

export function bindIsolatedTestStorage(host: object, stage: TestStage, method: DirectoryMethod): void {
  const storage = (host as TestHost).StorageManager;
  if (storage && storageMatches(storage, stage, method)) {
    Object.defineProperty(storage, storageID, { value: Object.freeze({ stage, method }) });
  }
}

/** Check that SaveLocation actually installed this run's adapter and it still owns the storage port. */
export function testStorageStillBound(host: object, stage: TestStage | null): boolean {
  if (!stage || (stage.nativeProfile && !sameStage(isolatedTestStage(host) ?? undefined, stage))) return false;
  const storage = (host as TestHost).StorageManager;
  const binding = own(storage, storageID) as StorageBinding | undefined;
  return !!binding && sameStage(binding.stage, stage) && storageMatches(storage, stage, binding.method);
}

export function isolatedTestScope(host: object): TestStage | null {
  const stage = isolatedTestStage(host);
  return testStorageStillBound(host, stage) ? stage : null;
}

export function bindIsolatedTestBattleFlow(host: object, flow: object, stage: TestStage | null): void {
  if (stage && testStorageStillBound(host, stage)) Object.defineProperty(flow, battleFlowID, { value: stage });
}

export function testBattleFlowMatches(flow: object | undefined, stage: TestStage): boolean {
  return sameStage(own(flow, battleFlowID) as TestStage | undefined, stage);
}

/** A native canary requires RuntimeFixes to have observed active storage at its own install time. */
export function bindIsolatedRuntimeFixes(host: object, fixes: object, stage: TestStage | null): void {
  if (stage && testStorageStillBound(host, stage)) Object.defineProperty(fixes, runtimeFixesID, { value: stage });
}

export function testRuntimeFixesMatches(fixes: object | undefined, stage: TestStage): boolean {
  return sameStage(own(fixes, runtimeFixesID) as TestStage | undefined, stage);
}

export function testScopeRefused(code: 'TEST-RESET-DISABLED' | 'TEST-CONTENT-DISABLED'): Error {
  const error = new Error(`This command or content source is only available in an isolated test. [${code}]`);
  error.stack = `${error.name}: ${error.message}`;
  return error;
}
