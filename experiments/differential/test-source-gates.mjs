// SYNTHETIC infrastructure controls only. No original Ruby/observer material is read.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { executeArgv, attachRunnerResponse, DEFAULT_LIMITS, writePrivateExecution } from "./lib/process.mjs";
import { makeHandoff, validateRawResponse } from "./lib/protocol.mjs";
import { parseJson, sha256File, strictStringify } from "./lib/json.mjs";
import { sanitizeOutcome } from "./lib/normalize.mjs";
import { kit, testRoot, candidateMetadata } from "./test-helpers.mjs";

const root = join(testRoot, "source-gate-controls");
mkdirSync(root);
const save = (path, value) => writeFileSync(path, typeof value === "string" ? value : strictStringify(value, true) + "\n", { flag: "wx" });
const cleanEnvironment = { ...process.env };
delete cleanEnvironment.NODE_OPTIONS;
delete cleanEnvironment.NODE_PATH;
const candidateArgv = [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"];
const baseline = await executeArgv({ argv: candidateArgv, cwd: kit.root }, DEFAULT_LIMITS);
attachRunnerResponse(baseline, baseline.stdout.toString("utf8"), (value) => validateRawResponse(value, kit.request));
assert.equal(baseline.status, "success");
writePrivateExecution(baseline, join(root, "ts-baseline-private"), DEFAULT_LIMITS);
const worker = join(root, "synthetic-reference.mjs");
save(worker, "import {appendFileSync,readFileSync} from 'node:fs';appendFileSync(process.argv[3],String(process.pid)+'\\n');process.stdout.write(readFileSync(process.argv[2],'utf8'));\n");
const referenceMetadata = () => ({
  source: {
    commit: "8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b", tree: null, tag: "v21.1", dirty: null,
    files: ["growth-rules", "friendship-rules", "adapter"].map((role) => ({ role, sha256: sha256File(worker) }))
  },
  runtime: { name: "reference", version: "SYNTHETIC-SOURCE-GATE-SELF-TEST", dependencies: [{ name: "reference-runtime", version: process.version }, { name: "adapter", version: "1" }] }
});
let sequence = 0;
function cli(directory, name, entry, args, env = cleanEnvironment, flags = []) {
  const argv = [...flags, entry, ...args];
  const result = spawnSync(process.execPath, argv, { cwd: kit.root, env, encoding: "utf8", shell: false, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  save(join(directory, `${name}.stdout`), result.stdout ?? "");
  save(join(directory, `${name}.stderr`), result.stderr ?? "");
  save(join(directory, `${name}.receipt.json`), { argv: [process.execPath, ...argv], status: result.status, signal: result.signal, environmentValuesRecorded: false });
  return result;
}
function run(name, { metadata = referenceMetadata(), response = baseline.stdout.toString("utf8"), entry = join(kit.root, "run-dual.mjs"), env = cleanEnvironment, flags = [], replayWithCat = false, kitRoot = kit.root } = {}) {
  const directory = join(root, `${sequence++}-${name}`);
  mkdirSync(directory);
  const payload = join(directory, "synthetic-response.json");
  const marker = join(directory, "reference-started");
  save(payload, response);
  const argv = [process.execPath, worker, payload, marker];
  const config = {
    protocol: "ruby-ts-differential/runner-config-v1", request: join(kitRoot, "requests/wp30-r2.json"), freezeHash: kit.freeze.hash,
    privateDirectory: "private", publicDirectory: "public", limits: DEFAULT_LIMITS,
    runners: [
      { role: "reference", entryId: "reference-rules-v1", argv: replayWithCat ? ["/bin/cat", payload] : argv, cwd: root, publicMetadata: metadata },
      { role: "candidate", entryId: "ts-core-v1", argv: candidateArgv, cwd: kitRoot, publicMetadata: candidateMetadata() }
    ]
  };
  const configPath = join(directory, "config.json");
  save(configPath, config);
  const result = cli(directory, "run-dual", entry, ["--kit", kitRoot, "--expected-freeze", kit.freeze.hash, "--config", configPath], env, flags);
  return { directory, marker, result, kitRoot, publicRoot: join(directory, "public"), privateRoot: join(directory, "private") };
}
function compare(run, name = "compare", { entry = join(run.kitRoot, "compare.mjs"), env = cleanEnvironment, flags = [] } = {}) {
  const output = join(run.directory, `${name}.json`);
  const result = cli(run.directory, name, entry, ["--kit", run.kitRoot, "--expected-freeze", kit.freeze.hash,
    "--handoff", join(run.publicRoot, "handoff.json"), "--expected-handoff", sha256File(join(run.publicRoot, "handoff.json")),
    "--reference", join(run.publicRoot, "reference.json"), "--candidate", join(run.publicRoot, "candidate.json"), "--out", output], env, flags);
  return { result, report: parseJson(readFileSync(output, "utf8")) };
}
function zeroChild(run, code) {
  assert.equal(run.result.status, 2, run.result.stderr);
  assert.ok(run.result.stderr.includes(code), run.result.stderr);
  assert.equal(existsSync(run.marker), false);
  assert.equal(existsSync(join(run.privateRoot, "reference/receipt.json")), false);
  assert.equal(existsSync(join(run.privateRoot, "candidate/receipt.json")), false);
  assert.equal(existsSync(run.publicRoot), false);
}
let normal = null;
let normalComparison = null;
function ensureNormal() {
  // Keep synchronous CLI calibration inside a test, so module setup cannot starve
  // the existing short-timeout executor tests while their event loop is active.
  if (normal === null) {
    normal = run("normal-synthetic");
    assert.equal(normal.result.status, 0, normal.result.stderr);
    normalComparison = compare(normal);
    assert.equal(normalComparison.result.status, 0);
  }
}

test("source gate S1: template reference/cat and sentinel versions refuse before either child", () => {
  const template = parseJson(readFileSync(join(kit.root, "config/runners.template.json"), "utf8")).runners.find((runner) => runner.role === "reference").publicMetadata;
  zeroChild(run("template-cat", { metadata: template, replayWithCat: true }), "REFERENCE_SOURCE_HASH_PLACEHOLDER");
  const cases = [
    [(value) => { value.source.files[0].sha256 = "0".repeat(64); }, "REFERENCE_SOURCE_HASH_PLACEHOLDER"],
    [(value) => { value.runtime.version = "UNVERIFIED"; }, "REFERENCE_VERSION_PLACEHOLDER"],
    [(value) => { value.runtime.dependencies[1].version = "UNVERIFIED"; }, "REFERENCE_VERSION_PLACEHOLDER"],
    [(value) => { value.runtime.dependencies.pop(); }, "REFERENCE_DEPENDENCY_VERSION_MISSING"],
    [(value) => { value.source.files.pop(); }, "REFERENCE_SOURCE_HASH_MISSING"]
  ];
  for (const [mutate, code] of cases) {
    const metadata = referenceMetadata(); mutate(metadata);
    zeroChild(run("bad-reference", { metadata }), code);
  }
});

test("source gate S1: clean comparator independently rejects rehashed placeholder behavior", () => {
  ensureNormal();
  for (const field of ["hash", "runtime"]) {
    const directory = join(root, `rehashed-placeholder-${field}`); mkdirSync(directory);
    const pub = join(directory, "public"); mkdirSync(pub);
    const reference = parseJson(readFileSync(join(normal.publicRoot, "reference.json"), "utf8"));
    if (field === "hash") reference.source.files[0].sha256 = "0".repeat(64);
    else reference.runtime.version = "UNVERIFIED";
    save(join(pub, "reference.json"), reference);
    save(join(pub, "candidate.json"), readFileSync(join(normal.publicRoot, "candidate.json"), "utf8"));
    const original = parseJson(readFileSync(join(normal.publicRoot, "handoff.json"), "utf8"));
    const handoff = makeHandoff({ request: kit.request, freezeHash: kit.freeze.hash, producer: original.producer, artifacts: [
      { role: "reference", entryId: "reference-rules-v1", sha256: sha256File(join(pub, "reference.json")) },
      { role: "candidate", entryId: "ts-core-v1", sha256: sha256File(join(pub, "candidate.json")) }
    ] });
    save(join(pub, "handoff.json"), handoff);
    const result = compare({ directory, publicRoot: pub, kitRoot: kit.root });
    assert.equal(result.result.status, 2);
    assert.equal(result.report.status, "GATE_FAILED");
    assert.equal(result.report.error.code, field === "hash" ? "REFERENCE_SOURCE_HASH_PLACEHOLDER" : "REFERENCE_VERSION_PLACEHOLDER");
    assert.equal(result.report.summary, undefined);
  }
});

test("source gate S2: report binds neutral participants, actual producer/comparator and policy", () => {
  ensureNormal();
  const report = normalComparison.report;
  assert.equal(report.status, "PASS"); // Synthetic calibration only, not original Ruby coverage.
  assert.equal(report.summary.comparedCaseCount, 5066);
  assert.deepEqual(report.participants[0].source, referenceMetadata().source);
  assert.equal(report.participants[0].runtime.version, "SYNTHETIC-SOURCE-GATE-SELF-TEST");
  assert.deepEqual(report.participants[1].source, candidateMetadata().source);
  assert.equal(report.harness.mode, "formal-kit-cli");
  for (const [identity, role, file] of [[report.harness.producer, "run-dual", "run-dual.mjs"], [report.harness.comparator, "compare", "compare.mjs"]]) {
    assert.equal(identity.entryRole, role);
    assert.equal(identity.entrySha256, sha256File(join(kit.root, file)));
    assert.equal(identity.manifestSha256, sha256File(join(kit.root, "artifacts.manifest.json")));
    assert.equal(identity.environmentPolicy, "node-loader-free-v1");
  }
  assert.equal(JSON.stringify(report).includes(root), false);
  const summary = parseJson(readFileSync(join(normal.privateRoot, "run-summary.json"), "utf8"));
  assert.deepEqual(summary.harness, report.harness.producer);
  assert.equal(summary.harnessEntryPath, join(kit.root, "run-dual.mjs"));
});

test("source gate: a rehashed producer identity mismatch is rejected before comparison", () => {
  ensureNormal();
  const directory = join(root, "wrong-producer"); mkdirSync(directory); const pub = join(directory, "public"); cpSync(normal.publicRoot, pub, { recursive: true });
  const handoff = parseJson(readFileSync(join(pub, "handoff.json"), "utf8"));
  handoff.producer.entrySha256 = sha256File(worker);
  writeFileSync(join(pub, "handoff.json"), strictStringify(handoff));
  const result = compare({ directory, publicRoot: pub, kitRoot: kit.root });
  assert.equal(result.result.status, 2);
  assert.equal(result.report.error.code, "HANDOFF_HARNESS_ENTRY_MISMATCH");
});

const precisionCheck = 'if (decimalIdentity(match[0]) !== decimalIdentity(String(value))) error("JSON_NUMERIC_PRECISION_LOSS");';
const lossyText = baseline.stdout.toString("utf8").replaceAll('"raw":0', '"raw":1e-400');
assert.equal((lossyText.match(/"raw":1e-400/g) ?? []).length, 90);

test("source gate H1/H3: external stale parser is zero-child; in-kit mutation fails byte seal", async () => {
  ensureNormal();
  const external = join(root, "EXTERNAL-UNBOUND-HARNESS"); cpSync(kit.root, external, { recursive: true });
  const parser = join(external, "lib/json.mjs"); const original = readFileSync(parser, "utf8"); assert.ok(original.includes(precisionCheck));
  writeFileSync(parser, original.replace(precisionCheck, "// Synthetic stale-parser mutation: intentionally omit decimal round-trip rejection."));
  const stale = await import(pathToFileURL(parser)); assert.equal(stale.parseJson("1e-400"), 0);
  zeroChild(run("external-stale-parser", { entry: join(external, "run-dual.mjs"), response: lossyText }), "HARNESS_KIT_ROOT_MISMATCH");
  const verify = cli(root, "external-verify", join(external, "verify-kit.mjs"), ["--kit", kit.root, "--expected-freeze", kit.freeze.hash]);
  assert.equal(verify.status, 2); assert.ok(verify.stderr.includes("HARNESS_KIT_ROOT_MISMATCH"));
  const badCompare = compare(normal, "external-compare", { entry: join(external, "compare.mjs") });
  assert.equal(badCompare.result.status, 2); assert.equal(badCompare.report.error.code, "HARNESS_KIT_ROOT_MISMATCH");
  const bootstrap = join(root, "outside-bootstrap.mjs");
  const bootstrapMarker = join(root, "outside-bootstrap-started");
  save(bootstrap, `import {verifyCliKit} from ${JSON.stringify(pathToFileURL(join(kit.root, "lib/kit.mjs")).href)};import {writeFileSync} from 'node:fs';try{verifyCliKit(${JSON.stringify(kit.root)},{expectedFreezeHash:${JSON.stringify(kit.freeze.hash)},entryURL:${JSON.stringify(pathToFileURL(join(kit.root, "run-dual.mjs")).href)},entryRole:'run-dual'});writeFileSync(${JSON.stringify(bootstrapMarker)},'started');}catch(error){console.error(error.code);process.exitCode=2;}\n`);
  const bootstrapResult = cli(root, "forged-entry-url", bootstrap, []);
  assert.equal(bootstrapResult.status, 2);
  assert.ok(bootstrapResult.stderr.includes("HARNESS_PROCESS_ENTRY_MISMATCH"));
  assert.equal(existsSync(bootstrapMarker), false);
  const inside = cli(root, "mutated-inside-verify", join(external, "verify-kit.mjs"), ["--kit", external, "--expected-freeze", kit.freeze.hash]);
  assert.equal(inside.status, 2); assert.match(inside.stderr, /KIT_ARTIFACT_(?:SIZE|HASH)_MISMATCH/);
});

test("source gate H2/H4: official parser rejects 90 underflows; a complete migrated kit works", () => {
  const bad = run("official-90-underflows", { response: lossyText });
  assert.equal(bad.result.status, 1);
  const receipt = parseJson(readFileSync(join(bad.privateRoot, "reference/receipt.json"), "utf8"));
  assert.equal(receipt.protocolCode, "JSON_NUMERIC_PRECISION_LOSS");
  assert.ok(readFileSync(join(bad.privateRoot, "reference/stdout.bin"), "utf8").includes('"raw":1e-400'));
  const failed = compare(bad); assert.equal(failed.result.status, 1); assert.equal(failed.report.status, "RUN_FAILED");
  const migrated = join(root, "MIGRATED-COMPLETE-KIT"); cpSync(kit.root, migrated, { recursive: true });
  const moved = run("migrated-kit", { kitRoot: migrated, entry: join(migrated, "run-dual.mjs") });
  assert.equal(moved.result.status, 0, moved.result.stderr);
  const result = compare(moved); assert.equal(result.result.status, 0); assert.equal(result.report.status, "PASS");
  assert.equal(result.report.harness.producer.entrySha256, kit.hashes.get("run-dual.mjs"));
  assert.equal(result.report.harness.comparator.manifestSha256, kit.freeze.value.artifactsManifestSha256);
});

function preload(name) {
  const file = join(root, `${name}.cjs`); const started = join(root, `${name}-loaded`); const changed = join(root, `${name}-changed`);
  save(file, `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(started)},String(process.pid)+'\\n');const M=require('node:module'),load=M._load;M._load=function(id,...args){const value=load.call(this,id,...args);if(String(id).endsWith('/core/core.cjs')&&process.argv[1].endsWith('runners/ts-runner.mjs')){const max=value.growth.maxExp;fs.appendFileSync(${JSON.stringify(changed)},'changed\\n');return {...value,growth:{...value.growth,maxExp:(...a)=>max(...a)+1}};}return value;};\n`);
  return { file, started, changed };
}

test("source gate E1/E2: real preload calibration changes semantics; formal env rejects before children", () => {
  const calibration = preload("unsafe-calibration");
  const env = { ...cleanEnvironment, NODE_OPTIONS: `--require ${calibration.file}` };
  const actual = spawnSync(candidateArgv[0], candidateArgv.slice(1), { cwd: kit.root, env, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  save(join(root, "unsupported-preload-calibration.stdout"), actual.stdout ?? "");
  assert.equal(actual.status, 0, actual.stderr); assert.ok(existsSync(calibration.changed));
  const changed = parseJson(actual.stdout);
  const original = new Map(baseline.response.cases.map((entry) => [entry.caseId, entry]));
  const requestById = new Map(kit.request.cases.map((entry) => [entry.caseId, entry]));
  // The raw raised diagnostics additionally contain the preload's stack frame. Compare
  // the frozen public projection, retaining kind/class/value rather than private stacks.
  const differences = changed.cases.filter((entry) => {
    const input = requestById.get(entry.caseId);
    return strictStringify(sanitizeOutcome(entry.outcome, input)) !== strictStringify(sanitizeOutcome(original.get(entry.caseId).outcome, input));
  });
  assert.equal(differences.length, 18); // Unsupported direct-run calibration, never a formal PASS/artifact claim.
  assert.ok(differences.every((entry) => requestById.get(entry.caseId).operation === "growth.maximumExp"));
  const guarded = preload("formal-preload");
  for (const response of [baseline.stdout.toString("utf8"), actual.stdout]) {
    zeroChild(run("preload-normal-or-matching-reference", { response, env: { ...cleanEnvironment, NODE_OPTIONS: `--require ${guarded.file}` } }), "NODE_LOADER_ENVIRONMENT_REJECTED");
  }
  assert.ok(existsSync(guarded.started)); assert.equal(existsSync(guarded.changed), false);
  zeroChild(run("node-path", { env: { ...cleanEnvironment, NODE_PATH: root } }), "NODE_LOADER_ENVIRONMENT_REJECTED");
});

test("source gate E: all three formal entries reject loader env and Node execArgv", () => {
  ensureNormal();
  const hook = preload("flags-preload");
  const loader = join(root, "passthrough-loader.mjs");
  save(loader, "export const resolve=(specifier,context,next)=>next(specifier,context);\n");
  for (const flags of [["--require", hook.file], ["-r", hook.file], ["--import", pathToFileURL(hook.file).href], ["--loader", loader]]) {
    zeroChild(run("loader-exec-arg", { flags }), "NODE_EXEC_ARGV_REJECTED");
  }
  const verify = cli(root, "verify-loader-env", join(kit.root, "verify-kit.mjs"), ["--kit", kit.root, "--expected-freeze", kit.freeze.hash], { ...cleanEnvironment, NODE_PATH: root });
  assert.equal(verify.status, 2); assert.ok(verify.stderr.includes("NODE_LOADER_ENVIRONMENT_REJECTED"));
  const rejected = compare(normal, "compare-loader-env", { env: { ...cleanEnvironment, NODE_OPTIONS: `--require ${hook.file}` } });
  assert.equal(rejected.result.status, 2); assert.equal(rejected.report.error.code, "NODE_LOADER_ENVIRONMENT_REJECTED");
});

test("source gate E3: child loader variables are absent, unrelated values are not disclosed", async () => {
  const hook = preload("controlled-child");
  const secret = "SYNTHETIC_PRIVATE_ENVIRONMENT_SENTINEL";
  const pids = [];
  for (const role of ["reference", "candidate"]) {
    const marker = join(root, `controlled-${role}-started`);
    const payload = join(root, `controlled-${role}-response.json`); save(payload, baseline.stdout.toString("utf8"));
    const execution = await executeArgv({ argv: [process.execPath, worker, payload, marker], cwd: root, role,
      env: { ...cleanEnvironment, NODE_OPTIONS: `--require ${hook.file}`, NODE_PATH: root, LANG: "C", SYNTHETIC_PRIVATE_VALUE: secret } }, DEFAULT_LIMITS);
    assert.equal(execution.status, "success");
    pids.push(readFileSync(marker, "utf8").trim());
    const receipt = writePrivateExecution(execution, join(root, `controlled-${role}-private`), DEFAULT_LIMITS);
    assert.equal(receipt.environment.policy, "node-loader-free-v1");
    assert.equal(receipt.environment.nodeOptions, "absent-in-child");
    assert.equal(receipt.environment.nodePath, "absent-in-child");
    assert.equal(JSON.stringify(receipt).includes(secret), false);
  }
  assert.notEqual(pids[0], pids[1]); assert.equal(existsSync(hook.started), false);
});
