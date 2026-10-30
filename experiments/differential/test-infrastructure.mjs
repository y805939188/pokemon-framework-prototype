import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { executeArgv, attachRunnerResponse, writePrivateExecution, DEFAULT_LIMITS } from "./lib/process.mjs";
import { validateRawResponse, validateMapping, makeHandoff, GateError } from "./lib/protocol.mjs";
import { makeBehaviorPackage } from "./lib/normalize.mjs";
import { compareBehaviorPackages } from "./lib/compare.mjs";
import { parseJson, readJson, sha256File, sha256Json, strictStringify } from "./lib/json.mjs";
import { verifyKit } from "./lib/kit.mjs";
import { kit, testRoot, requestPath, fixturePath, candidateMetadata, syntheticReferenceMetadata, syntheticProducer } from "./test-helpers.mjs";

const clone = (value) => structuredClone(value);
// Ordinary fault controls must reach their fault before the end-to-end deadline.
// Keep timeout controls separate: their readiness/output assertions prevent startup-only false passes.
const fixtureLimits = { ...DEFAULT_LIMITS, timeoutMs: 5000 };
const timeoutLimits = { ...DEFAULT_LIMITS, timeoutMs: 1500 };
const shortTimeoutLimits = { timeoutMs: 150, maxStdoutBytes: 1024, maxStderrBytes: 1024 };
let processSequence = 0;
async function runFixture(mode, limits = fixtureLimits, marker = null, role = "candidate", startupDelayMs = 0) {
  const argv = [process.execPath, fixturePath, mode, requestPath, marker ?? "-", String(startupDelayMs)];
  const execution = await executeArgv({ argv, cwd: dirname(fixturePath), role, entryId: role === "reference" ? "reference-rules-v1" : "ts-core-v1" }, limits);
  attachRunnerResponse(execution, execution.stdout.toString("utf8"), (response) => validateRawResponse(response, kit.request));
  writePrivateExecution(execution, join(testRoot, `fixture-${String(processSequence++)}-${mode}`), limits);
  return execution;
}
const actualTs = await runFixture("success", DEFAULT_LIMITS, null, "candidate");
assert.equal(actualTs.status, "success");
const validFixtureText = actualTs.stdout.toString("utf8");
function assertFixtureRaw(execution, mode, limits) {
  let stdout = "";
  let stderr = "";
  if (["nonzero-valid-response", "stderr-valid-response", "timeout-valid-response", "stderr-limit"].includes(mode)) stdout = validFixtureText;
  else if (mode === "output-valid-response") stdout = (validFixtureText + "x".repeat(4 * 1024 * 1024)).slice(0, limits.maxStdoutBytes);
  else if (mode === "output-limit") stdout = "x".repeat(limits.maxStdoutBytes);
  else if (["valid-json-nonzero", "valid-json-signal", "stderr", "timeout", "timeout-tree"].includes(mode)) stdout = "{}\n";
  else if (mode === "invalid") stdout = "not-json\n";
  else if (mode === "multiple") stdout = "{}\n{}\n";
  else if (mode === "logging") stdout = "log\n{}\n";
  else if (["duplicate", "missing", "extra", "wrong-request", "schema-error"].includes(mode)) {
    const value = parseJson(validFixtureText);
    if (mode === "duplicate") value.cases[1] = value.cases[0];
    if (mode === "missing") value.cases.pop();
    if (mode === "extra") value.cases.push({ ...value.cases[0], caseId: "infrastructure-extra-case" });
    if (mode === "wrong-request") value.requestHash = "0".repeat(64);
    if (mode === "schema-error") value.cases[0].unexpected = true;
    stdout = strictStringify(value) + "\n";
  } else assert.ok(["crash", "uncaught", "empty"].includes(mode), `raw expectation missing for ${mode}`);
  if (mode === "stderr-valid-response") stderr = "infrastructure warning\n";
  if (mode === "stderr-limit") stderr = "x".repeat(limits.maxStderrBytes);
  if (mode === "stderr") stderr = "infrastructure stderr\n";
  assert.equal(execution.stdout.toString("utf8"), stdout, `${mode}: retained raw stdout`);
  if (mode === "uncaught") assert.match(execution.stderr.toString("utf8"), /Error: INFRASTRUCTURE_SELF_TEST_CRASH\n/);
  else assert.equal(execution.stderr.toString("utf8"), stderr, `${mode}: retained raw stderr`);
  assert.equal(execution.response, null, "failure must not expose a usable parsed response");
}
function assertTimeoutReady(execution, marker, state) {
  const ready = readJson(marker); // Missing readiness is a failure, even when status is TIMEOUT.
  assert.equal(ready.state, state);
  assert.ok(Number.isSafeInteger(ready.pid) && ready.pid > 0);
  assert.ok(ready.readyAtMs >= Date.parse(execution.startedAtUTC));
  assert.ok(Date.parse(execution.endedAtUTC) - ready.readyAtMs >= 20, "fixture must actually hang before timeout");
  assert.equal(execution.status, "timeout");
  assert.equal(execution.infrastructureCode, "TIMEOUT");
  assert.equal(execution.timedOut, true);
  assert.equal(execution.signal, "SIGKILL");
  assert.equal(execution.response, null);
  return ready;
}
function ownedProcessStates(pids) {
  const result = spawnSync("ps", ["-o", "pid=,ppid=,pgid=,stat=", "-p", pids.join(",")], { encoding: "utf8", shell: false, timeout: 1000 });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  assert.ok(result.status === 0 || (result.status === 1 && result.stdout.trim() === ""), `owned PID inspection failed: ${result.error ?? result.stderr}`);
  return result.stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [pid, ppid, pgid, state] = line.trim().split(/\s+/);
    return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), state };
  });
}
// Replace the fake response with an actual TS child for the base packages; the fake above is only an executor positive control.
const tsExecution = await executeArgv({ argv: [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"], cwd: kit.root, role: "candidate", entryId: "ts-core-v1" }, DEFAULT_LIMITS);
attachRunnerResponse(tsExecution, tsExecution.stdout.toString("utf8"), (response) => validateRawResponse(response, kit.request));
writePrivateExecution(tsExecution, join(testRoot, "infrastructure-actual-ts-private"), DEFAULT_LIMITS);
assert.equal(tsExecution.status, "success");
const candidatePackage = makeBehaviorPackage({ execution: tsExecution, request: kit.request, freezeHash: kit.freeze.hash, publicMetadata: candidateMetadata(), limits: DEFAULT_LIMITS, manifest: kit.manifest });
const syntheticReferenceExecution = { ...tsExecution, role: "reference", entryId: "reference-rules-v1" };
const referencePackage = makeBehaviorPackage({ execution: syntheticReferenceExecution, request: kit.request, freezeHash: kit.freeze.hash, publicMetadata: syntheticReferenceMetadata(), limits: DEFAULT_LIMITS, manifest: kit.manifest });
const compare = (reference = referencePackage, candidate = candidatePackage, mapping = kit.mapping, freeze = kit.freeze, handoff = null) => compareBehaviorPackages({ reference, candidate, request: kit.request, mapping, normalizer: kit.normalizer, freeze, manifest: kit.manifest, handoff });
const assertGate = (fn, code = null) => assert.throws(fn, (error) => error instanceof GateError && (code === null || error.code === code));
function writeSyntheticHandoff(directory, reference = referencePackage, candidate = candidatePackage) {
  mkdirSync(directory, { recursive: true });
  const referencePath = join(directory, "reference.json");
  const candidatePath = join(directory, "candidate.json");
  writeFileSync(referencePath, strictStringify(reference, true) + "\n");
  writeFileSync(candidatePath, strictStringify(candidate, true) + "\n");
  const handoff = makeHandoff({ request: kit.request, freezeHash: kit.freeze.hash, producer: syntheticProducer(), artifacts: [
    { role: "reference", entryId: "reference-rules-v1", sha256: sha256File(referencePath) },
    { role: "candidate", entryId: "ts-core-v1", sha256: sha256File(candidatePath) }
  ] });
  const handoffPath = join(directory, "handoff.json");
  writeFileSync(handoffPath, strictStringify(handoff, true) + "\n");
  return { directory, referencePath, candidatePath, handoffPath, handoffHash: sha256File(handoffPath), handoff };
}
function runCompareCli(handoff, name = "report.json") {
  const out = join(handoff.directory, name);
  const result = spawnSync(process.execPath, [join(kit.root, "compare.mjs"),
    "--kit", kit.root, "--expected-freeze", kit.freeze.hash,
    "--handoff", handoff.handoffPath, "--expected-handoff", handoff.handoffHash,
    "--reference", handoff.referencePath, "--candidate", handoff.candidatePath, "--out", out
  ], { encoding: "utf8", shell: false, timeout: 120000 });
  return { result, out };
}
function runDualSynthetic(name, referenceMode, timeoutMs = 1000) {
  const directory = join(testRoot, `dual-${name}`);
  mkdirSync(directory, { recursive: true });
  const actualTsArgv = [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"];
  const referenceArgv = referenceMode === "actual-ts" ? actualTsArgv : [process.execPath, fixturePath, referenceMode, requestPath];
  const config = {
    protocol: "ruby-ts-differential/runner-config-v1",
    request: requestPath,
    freezeHash: kit.freeze.hash,
    privateDirectory: "private",
    publicDirectory: "public",
    limits: { timeoutMs, maxStdoutBytes: DEFAULT_LIMITS.maxStdoutBytes, maxStderrBytes: DEFAULT_LIMITS.maxStderrBytes },
    runners: [
      { role: "reference", entryId: "reference-rules-v1", argv: referenceArgv, cwd: kit.root, publicMetadata: syntheticReferenceMetadata() },
      { role: "candidate", entryId: "ts-core-v1", argv: actualTsArgv, cwd: kit.root, publicMetadata: candidateMetadata() }
    ]
  };
  const configPath = join(directory, "config.json");
  writeFileSync(configPath, strictStringify(config, true) + "\n", { flag: "wx" });
  const result = spawnSync(process.execPath, [join(kit.root, "run-dual.mjs"), "--kit", kit.root, "--expected-freeze", kit.freeze.hash, "--config", configPath], { encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  return { directory, result, summary: result.stdout.trim() ? parseJson(result.stdout) : null, privateDirectory: join(directory, "private"), publicDirectory: join(directory, "public") };
}
function runDualPreflight(name, { privateDir = "private", publicDir = "public", candidateArgv = null, candidateCwd = kit.root, setup = null, referenceMarker = null } = {}) {
  const directory = join(testRoot, `preflight-${name}`);
  mkdirSync(directory, { recursive: true });
  if (setup) setup(directory);
  const actualTsArgv = [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"];
  const referenceArgv = referenceMarker === null ? actualTsArgv : [process.execPath, fixturePath, "marker-success", requestPath, referenceMarker];
  const config = {
    protocol: "ruby-ts-differential/runner-config-v1",
    request: requestPath,
    freezeHash: kit.freeze.hash,
    privateDirectory: privateDir,
    publicDirectory: publicDir,
    limits: { timeoutMs: 1000, maxStdoutBytes: DEFAULT_LIMITS.maxStdoutBytes, maxStderrBytes: DEFAULT_LIMITS.maxStderrBytes },
    runners: [
      { role: "reference", entryId: "reference-rules-v1", argv: referenceArgv, cwd: kit.root, publicMetadata: syntheticReferenceMetadata() },
      { role: "candidate", entryId: "ts-core-v1", argv: candidateArgv ?? actualTsArgv, cwd: candidateCwd, publicMetadata: candidateMetadata() }
    ]
  };
  const configPath = join(directory, "config.json");
  writeFileSync(configPath, strictStringify(config, true) + "\n", { flag: "wx" });
  const result = spawnSync(process.execPath, [join(kit.root, "run-dual.mjs"), "--kit", kit.root, "--expected-freeze", kit.freeze.hash, "--config", configPath], { encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  return { directory, result, summary: result.stdout.trim() ? parseJson(result.stdout) : null, privatePath: join(directory, privateDir), publicPath: join(directory, publicDir) };
}
function filesUnder(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}
function assertPreflightRejectedWithoutChild(run, code) {
  assert.equal(run.result.status, 2, run.result.stderr);
  assert.ok(run.result.stderr.includes(code), run.result.stderr);
  assert.equal(existsSync(join(run.privatePath, "reference")), false);
  assert.equal(existsSync(join(run.privatePath, "candidate")), false);
  assert.deepEqual(filesUnder(run.publicPath), []);
}

function dualHandoff(run) {
  const handoffPath = join(run.publicDirectory, "handoff.json");
  return {
    directory: run.directory,
    handoffPath,
    handoffHash: sha256File(handoffPath),
    referencePath: join(run.publicDirectory, "reference.json"),
    candidatePath: join(run.publicDirectory, "candidate.json")
  };
}

// This PASS compares a TS outcome with a synthetic copy solely to test the comparator; it is NOT Ruby execution or coverage.
test("infrastructure self-test: gated identical synthetic packages exercise PASS predicate, not Ruby", () => {
  const report = compare();
  assert.equal(report.status, "PASS");
  assert.equal(report.summary.comparedCaseCount, 5066);
  assert.equal(report.summary.differenceCount, 0);
});

test("infrastructure self-test: actual TS child versus intentionally different fake child is FAIL", async () => {
  const fake = await runFixture("success", DEFAULT_LIMITS, null, "reference");
  assert.equal(fake.status, "success");
  const fakeReference = makeBehaviorPackage({ execution: fake, request: kit.request, freezeHash: kit.freeze.hash, publicMetadata: syntheticReferenceMetadata(), limits: DEFAULT_LIMITS, manifest: kit.manifest });
  const report = compare(fakeReference, candidatePackage);
  assert.equal(report.status, "FAIL");
  assert.ok(report.summary.unapprovedDifferenceCount > 0);
  assert.notEqual(report.differences[0].referenceOutcomeHash, report.differences[0].candidateOutcomeHash);
});

test("strict JSON rejects lossy values instead of null coercion or field omission", () => {
  const cyclic = {}; cyclic.self = cyclic;
  const sparse = []; sparse.length = 1;
  const values = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined, 1n, cyclic, -0, Number.MAX_SAFE_INTEGER + 1, sparse, new Date(0), { omitted: undefined }, [undefined], { f: () => 1 }, { s: Symbol("x") }];
  for (const value of values) assert.throws(() => strictStringify(value), (error) => error.code?.startsWith("JSON_"));
  let invoked = false;
  assert.throws(() => strictStringify({ toJSON() { invoked = true; return null; } }), (error) => error.code === "JSON_FUNCTION");
  assert.equal(invoked, false);
  let getterCalls = 0;
  const getterArray = [1];
  Object.defineProperty(getterArray, "0", { enumerable: true, get() { getterCalls++; return getterCalls === 1 ? 1 : Number.NaN; } });
  assert.throws(() => strictStringify(getterArray), (error) => error.code === "JSON_NON_DATA_PROPERTY");
  assert.equal(getterCalls, 0, "array accessor must be rejected before invocation");
  const nonIndex = [1];
  nonIndex["4294967295"] = 42;
  assert.throws(() => strictStringify(nonIndex), (error) => error.code === "JSON_ARRAY_PROPERTY");
  assert.equal(strictStringify([1, 2, 3]), "[1,2,3]");
  for (const text of ["", " ", "{}\n{}", "log\n{}", "{\"a\":1,\"a\":2}", "1e400", "9007199254740992", "-0"]) assert.throws(() => parseJson(text), (error) => error.code?.startsWith("JSON_"));
  assert.deepEqual(parseJson(" {\"a\":[1,true,null]} \n"), { a: [1, true, null] });
});

test("infrastructure child: successful unique envelope is accepted", async () => {
  const execution = await runFixture("success");
  assert.equal(execution.status, "success");
  assert.equal(execution.response.cases.length, 5066);
  assert.equal(execution.stderrBytes, 0);
});

for (const [mode, expectedStatus, expectedCode] of [
  ["nonzero-valid-response", "process-error", "PROCESS_NONZERO_EXIT"],
  ["stderr-valid-response", "process-error", "STDERR_NONEMPTY"],
  ["timeout-valid-response", "timeout", "TIMEOUT"],
  ["output-valid-response", "process-error", "OUTPUT_LIMIT_STDOUT"],
  ["stderr-limit", "process-error", "OUTPUT_LIMIT_STDERR"],
  ["crash", "process-error", "PROCESS_NONZERO_EXIT"],
  ["uncaught", "process-error", "PROCESS_NONZERO_EXIT"],
  ["valid-json-nonzero", "process-error", "PROCESS_NONZERO_EXIT"],
  ["valid-json-signal", "process-error", "PROCESS_SIGNAL"],
  ["output-limit", "process-error", "OUTPUT_LIMIT_STDOUT"],
  ["stderr", "process-error", "STDERR_NONEMPTY"],
  ["empty", "protocol-error", "JSON_EMPTY"],
  ["invalid", "protocol-error", "JSON_VALUE_EXPECTED"],
  ["multiple", "protocol-error", "JSON_TRAILING_CONTENT"],
  ["logging", "protocol-error", "JSON_VALUE_EXPECTED"],
  ["duplicate", "protocol-error", "RUNNER_DUPLICATE_CASE_ID"],
  ["missing", "protocol-error", "RUNNER_MISSING_CASE_ID"],
  ["extra", "protocol-error", "RUNNER_EXTRA_CASE_ID"],
  ["wrong-request", "protocol-error", "RUNNER_REQUEST_HASH_MISMATCH"],
  ["schema-error", "protocol-error", "RUNNER_RESPONSE_SCHEMA_REJECTED"]
]) test(`infrastructure child rejection: ${mode}`, async () => {
  const limits = mode === "output-valid-response"
    ? { ...fixtureLimits, maxStdoutBytes: 2 * 1024 * 1024, maxStderrBytes: 1024 }
    : mode === "stderr-limit"
      ? { ...fixtureLimits, maxStderrBytes: 1024 }
      : mode === "output-limit" ? { ...fixtureLimits, maxStdoutBytes: 1024, maxStderrBytes: 1024 }
        : mode === "timeout-valid-response" ? timeoutLimits : fixtureLimits;
  const marker = mode === "timeout-valid-response" ? join(testRoot, "timeout-valid-response-ready.json") : null;
  const execution = await runFixture(mode, limits, marker);
  assert.equal(execution.status, expectedStatus);
  assert.equal(execution.infrastructureCode ?? execution.protocolCode, expectedCode);
  assertFixtureRaw(execution, mode, limits);
  assert.equal(execution.timedOut, mode === "timeout-valid-response");
  const outputLimited = ["output-valid-response", "stderr-limit", "output-limit"].includes(mode);
  assert.equal(execution.outputLimitExceeded, outputLimited);
  const expectedExit = ["nonzero-valid-response", "valid-json-nonzero"].includes(mode) ? 7
    : mode === "crash" ? 3 : mode === "uncaught" ? 1
      : outputLimited || ["valid-json-signal", "timeout-valid-response"].includes(mode) ? null : 0;
  assert.equal(execution.exitCode, expectedExit);
  assert.equal(execution.signal, mode === "valid-json-signal" ? "SIGTERM" : outputLimited || mode === "timeout-valid-response" ? "SIGKILL" : null);
  if (marker) {
    assertTimeoutReady(execution, marker, "hanging-after-response");
    assert.equal(validateRawResponse(parseJson(execution.stdout.toString("utf8")), kit.request).status, "success");
  }
});

for (const [mode, status, code] of [
  ["nonzero-valid-response", "process-error", "PROCESS_NONZERO_EXIT"],
  ["invalid", "protocol-error", "JSON_VALUE_EXPECTED"]
]) test(`infrastructure child: deterministic slow startup still detects ${mode}`, async () => {
  const oldBudget = await runFixture(mode, shortTimeoutLimits, null, "candidate", 350);
  assert.equal(oldBudget.status, "timeout");
  assert.equal(oldBudget.infrastructureCode, "TIMEOUT");
  assert.equal(oldBudget.stdoutBytes, 0);
  assert.equal(oldBudget.stderrBytes, 0);
  assert.equal(oldBudget.response, null);
  const execution = await runFixture(mode, fixtureLimits, null, "candidate", 350);
  assert.equal(execution.status, status);
  assert.equal(execution.infrastructureCode ?? execution.protocolCode, code);
  assert.equal(execution.exitCode, mode === "nonzero-valid-response" ? 7 : 0);
  assert.equal(execution.signal, null);
  assert.equal(execution.timedOut, false);
  assertFixtureRaw(execution, mode, fixtureLimits);
});

test("infrastructure child: short timeout reaches JSON and hang without loading the matrix", async () => {
  const marker = join(testRoot, "short-timeout-ready.json");
  const execution = await runFixture("timeout", shortTimeoutLimits, marker);
  assertTimeoutReady(execution, marker, "hanging-after-json");
  assertFixtureRaw(execution, "timeout", shortTimeoutLimits);
  assert.deepEqual(parseJson(execution.stdout.toString("utf8")), {});
});

test("infrastructure child: missing executable and missing core dependency are process failures", async () => {
  const missing = await executeArgv({ argv: [join(testRoot, "no-such-executable")], cwd: testRoot }, fixtureLimits);
  assert.equal(missing.status, "process-error");
  assert.equal(missing.infrastructureCode, "SPAWN_ENOENT");
  assert.equal(missing.stdoutBytes, 0);
  assert.equal(missing.response, null);
  writePrivateExecution(missing, join(testRoot, "missing-executable-private"), fixtureLimits);
  const missingCore = await executeArgv({ argv: [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/missing.cjs"], cwd: kit.root }, fixtureLimits);
  assert.equal(missingCore.status, "process-error");
  assert.equal(missingCore.infrastructureCode, "PROCESS_NONZERO_EXIT");
  assert.equal(missingCore.exitCode, 1);
  assert.equal(missingCore.stdoutBytes, 0);
  assert.ok(missingCore.stderr.toString("utf8").includes(`Cannot find module '${join(kit.root, "core/missing.cjs")}'`));
  assert.match(missingCore.stderr.toString("utf8"), /code: 'MODULE_NOT_FOUND'/);
  assert.equal(missingCore.response, null);
  writePrivateExecution(missingCore, join(testRoot, "missing-core-private"), fixtureLimits);
});

test("infrastructure child: timeout reclaims the complete owned process group", async () => {
  const marker = join(testRoot, "owned-tree-ready.json");
  const pending = runFixture("timeout-tree", timeoutLimits, marker);
  let completed = false;
  pending.then(() => { completed = true; }, () => { completed = true; });
  let pids = [];
  try {
    while (!existsSync(marker) && !completed) await delay(10);
    assert.ok(existsSync(marker), "runner and grandchild must become ready before timeout");
    const ready = readJson(marker);
    assert.ok(Number.isSafeInteger(ready.pid) && ready.pid > 0);
    assert.ok(Number.isSafeInteger(ready.grandchildPid) && ready.grandchildPid > 0 && ready.grandchildPid !== ready.pid);
    pids = [ready.pid, ready.grandchildPid];
    const before = ownedProcessStates(pids);
    writeFileSync(join(testRoot, "owned-tree-before.json"), strictStringify(before));
    assert.deepEqual(before.map((item) => item.pid).sort((a, b) => a - b), [...pids].sort((a, b) => a - b));
    assert.ok(before.every((item) => item.pgid === ready.pid && !item.state.startsWith("Z")), "both live processes must belong to the owned group");
    assert.equal(before.find((item) => item.pid === ready.grandchildPid).ppid, ready.pid);
    const execution = await pending;
    assertTimeoutReady(execution, marker, "tree-hanging");
    assertFixtureRaw(execution, "timeout-tree", timeoutLimits);
    let after = ownedProcessStates(pids);
    for (let attempt = 0; after.length && attempt < 50; attempt++) { await delay(20); after = ownedProcessStates(pids); }
    writeFileSync(join(testRoot, "owned-tree-after.json"), strictStringify(after));
    if (after.length === 0) pids = [];
    assert.deepEqual(after, [], "owned runner/grandchild remain after timeout; see PID/PPID/PGID/state evidence");
  } finally {
    await pending;
    // A survivor fails the assertion above; clean only these self-test PIDs, never conceal it.
    for (const pid of pids) {
      try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  }
});

for (const [mode, code] of [
  ["serialize-nan", "JSON_NON_FINITE"], ["serialize-infinity", "JSON_NON_FINITE"],
  ["serialize-undefined", "JSON_UNDEFINED"], ["serialize-bigint", "JSON_BIGINT"], ["serialize-cycle", "JSON_CYCLE"]
]) test(`infrastructure child serialization rejection: ${mode}`, async () => {
  const execution = await runFixture(mode);
  assert.equal(execution.status, "protocol-error");
  assert.equal(execution.protocolCode, code);
  const envelope = parseJson(execution.stdout.toString("utf8"));
  assert.equal(envelope.error.kind, "SERIALIZATION_ERROR");
  assert.equal(envelope.error.code, code);
  assert.equal(Object.hasOwn(envelope, "cases"), false);
});

test("public gate rejects extra/free-text/path/hash/case/provenance violations as a whole package", () => {
  const mutations = [
    ["extra field", (value) => { value.debug = "free text"; }],
    ["argv", (value) => { value.execution.argv = ["private"]; }],
    ["diagnostic", (value) => { value.cases[0].outcome.message = "stack/source"; }],
    ["source path", (value) => { value.source.files[0].path = "/private/original"; }],
    ["request hash", (value) => { value.requestHash = "0".repeat(64); }],
    ["freeze hash", (value) => { value.freezeHash = "0".repeat(64); }],
    ["case request hash", (value) => { value.cases[0].requestHash = "0".repeat(64); }],
    ["missing case", (value) => { value.cases.pop(); }],
    ["duplicate case", (value) => { value.cases[1] = value.cases[0]; }],
    ["extra case", (value) => { value.cases.push({ caseId: "infrastructure-extra", requestHash: "0".repeat(64), outcome: { kind: "value", value: 1 } }); }],
    ["false success", (value) => { value.execution.exitCode = 1; }],
    ["failed with behavior", (value) => { value.execution.status = "process-error"; value.execution.exitCode = 1; }],
    ["random consumption", (value) => { value.random.drawCount = 1; }],
    ["runtime free text", (value) => { value.runtime.version = "runtime /private/path"; }],
    ["unknown entry", (value) => { value.entryId = "unknown-entry"; }]
  ];
  for (const [name, mutate] of mutations) {
    const invalid = clone(candidatePackage);
    mutate(invalid);
    assertGate(() => compare(referencePackage, invalid), null);
  }
  const invalidClass = clone(candidatePackage);
  const errorCase = kit.request.cases.find((testCase) => testCase.additionalClass === "growth-invalid-level");
  invalidClass.cases.find((testCase) => testCase.caseId === errorCase.caseId).outcome.class = "Bad Class /private/path";
  assertGate(() => compare(referencePackage, invalidClass));
});

test("DIFF-C01: candidate provenance/artifact hashes and reference target are bound to the verified kit/run", () => {
  const candidateMutations = [
    ["core-bundle", "CANDIDATE_ARTIFACT_HASH_MISMATCH"],
    ["runner", "CANDIDATE_ARTIFACT_HASH_MISMATCH"],
    ["commit", "CANDIDATE_SOURCE_MISMATCH"],
    ["tree", "CANDIDATE_SOURCE_MISMATCH"],
    ["dirty", "CANDIDATE_SOURCE_MISMATCH"]
  ];
  for (const [field, code] of candidateMutations) {
    const invalid = clone(candidatePackage);
    if (field === "commit" || field === "tree") invalid.source[field] = "f".repeat(40);
    else if (field === "dirty") invalid.source.dirty = !kit.manifest.source.dirty;
    else invalid.source.files.find((file) => file.role === field).sha256 = "f".repeat(64);
    assertGate(() => compare(referencePackage, invalid), code);
  }
  const wrongReference = clone(referencePackage);
  wrongReference.source.commit = "f".repeat(40);
  assertGate(() => compare(wrongReference, candidatePackage), "REFERENCE_PROVENANCE_MISMATCH");
});

test("DIFF-C01: CLI verifies expected handoff and behavior bytes before parsing, then reports verified hashes", () => {
  const handoff = writeSyntheticHandoff(join(testRoot, "handoff-cli"));
  const passed = runCompareCli(handoff);
  assert.equal(passed.result.status, 0, passed.result.stderr);
  const passReport = readJson(passed.out);
  assert.equal(passReport.status, "PASS");
  assert.equal(passReport.handoffSHA256, handoff.handoffHash);
  assert.equal(passReport.behaviorArtifacts.length, 2);
  for (const artifact of passReport.behaviorArtifacts) {
    assert.equal(artifact.sha256, artifact.role === "reference" ? sha256File(handoff.referencePath) : sha256File(handoff.candidatePath));
  }
  const tampered = clone(candidatePackage);
  tampered.cases[0].outcome.value += 1;
  writeFileSync(handoff.candidatePath, strictStringify(tampered, true) + "\n");
  const rejected = runCompareCli(handoff, "tampered-report.json");
  assert.equal(rejected.result.status, 2);
  assert.equal(readJson(rejected.out).error.code, "HANDOFF_ARTIFACT_HASH_MISMATCH");
  const wrongExpected = runCompareCli({ ...handoff, handoffHash: "0".repeat(64) }, "wrong-expected-report.json");
  assert.equal(wrongExpected.result.status, 2);
  assert.equal(readJson(wrongExpected.out).error.code, "HANDOFF_EXTERNAL_HASH_MISMATCH");
});

test("clean CLI gate emits no behavior/source sentinel and no partial comparison", () => {
  const directory = join(testRoot, "gate-cli");
  const invalid = clone(candidatePackage);
  invalid.privateDiagnostic = "/private/original.rb PRIVATE-DIAGNOSTIC";
  invalid.cases[0].outcome.value = 987654321;
  const handoff = writeSyntheticHandoff(directory, referencePackage, invalid);
  const { result, out } = runCompareCli(handoff);
  assert.equal(result.status, 2);
  const publicOutput = result.stdout + result.stderr + readFileSync(out, "utf8");
  assert.ok(!publicOutput.includes("PRIVATE-DIAGNOSTIC"));
  assert.ok(!publicOutput.includes("/private/original.rb"));
  assert.ok(!publicOutput.includes("987654321"));
  const report = readJson(out);
  assert.equal(report.status, "GATE_FAILED");
  assert.equal(Object.hasOwn(report, "differences"), false);
  assert.equal(Object.hasOwn(report, "summary"), false);
});

test("comparison preserves real value and raw category differences", () => {
  const target = kit.request.cases.find((testCase) => testCase.operation === "growth.maximumExp");
  const reference = clone(referencePackage);
  const candidate = clone(candidatePackage);
  const ref = reference.cases.find((testCase) => testCase.caseId === target.caseId);
  const cand = candidate.cases.find((testCase) => testCase.caseId === target.caseId);
  ref.outcome.value = cand.outcome.value + 1;
  const valueReport = compare(reference, candidate);
  assert.equal(valueReport.status, "FAIL");
  assert.deepEqual(valueReport.differences[0].fields, ["value"]);
  assert.equal(valueReport.differences[0].reference.value, ref.outcome.value);
  assert.equal(valueReport.differences[0].candidate.value, cand.outcome.value);

  const invalidLevel = kit.request.cases.find((testCase) => testCase.additionalClass === "growth-invalid-level");
  const raised = clone(referencePackage);
  raised.cases.find((testCase) => testCase.caseId === invalidLevel.caseId).outcome = { kind: "raised", class: "ArgumentError" };
  const kindReport = compare(raised, candidatePackage);
  assert.equal(kindReport.status, "FAIL");
  assert.ok(kindReport.differences.some((difference) => difference.caseId === invalidLevel.caseId && difference.fields.includes("kind")));
  assert.ok(!kindReport.mappedEquivalences.some((entry) => entry.caseId === invalidLevel.caseId));
});

test("DIFF-C03: both value/raised directions and error-object/raised return FAIL with both outcomes", () => {
  const target = kit.request.cases[0];
  const valueOutcome = { kind: "value", value: 0 };
  const raisedOutcome = { kind: "raised", class: "RangeError" };
  const errorOutcome = { kind: "error-object", class: "ArgumentError", value: { code: "invalid-level" } };
  const combinations = [
    [valueOutcome, raisedOutcome],
    [raisedOutcome, valueOutcome],
    [errorOutcome, raisedOutcome],
    [raisedOutcome, errorOutcome]
  ];
  let cliPackages = null;
  for (const [referenceOutcome, candidateOutcome] of combinations) {
    const reference = clone(referencePackage);
    const candidate = clone(candidatePackage);
    reference.cases.find((testCase) => testCase.caseId === target.caseId).outcome = clone(referenceOutcome);
    candidate.cases.find((testCase) => testCase.caseId === target.caseId).outcome = clone(candidateOutcome);
    const report = compare(reference, candidate);
    assert.equal(report.status, "FAIL");
    const difference = report.differences.find((entry) => entry.caseId === target.caseId);
    assert.deepEqual(difference.fields, ["kind"]);
    assert.deepEqual(difference.reference, referenceOutcome);
    assert.deepEqual(difference.candidate, candidateOutcome);
    if (!cliPackages) cliPackages = { reference, candidate };
  }
  const handoff = writeSyntheticHandoff(join(testRoot, "category-difference-cli"), cliPackages.reference, cliPackages.candidate);
  const { result, out } = runCompareCli(handoff);
  assert.equal(result.status, 1);
  const report = readJson(out);
  assert.equal(report.status, "FAIL");
  assert.equal(report.differences[0].reference.kind, "value");
  assert.equal(report.differences[0].candidate.kind, "raised");
  assert.equal(report.differences[0].candidate.class, "RangeError");
});

test("frozen error-class mapping is operation/domain/kind specific and retains both raw classes", () => {
  const target = kit.request.cases.find((testCase) => testCase.additionalClass === "growth-invalid-level");
  const reference = clone(referencePackage);
  reference.cases.find((testCase) => testCase.caseId === target.caseId).outcome.class = "ArgumentError";
  const report = compare(reference, candidatePackage);
  assert.equal(report.status, "PASS");
  const mapped = report.mappedEquivalences.find((entry) => entry.caseId === target.caseId);
  assert.equal(mapped.mappingId, "growth-minimum-invalid-level-argument-error-v1");
  assert.equal(mapped.referenceClass, "ArgumentError");
  assert.equal(mapped.candidateClass, null);
  assert.equal(validateMapping(kit.mapping).approvedDifferences.length, 0);
  assert.throws(() => validateMapping({ ...kit.mapping, errorClassMappings: [{ mappingId: "bad-value-map", operation: "growth.maximumExp", additionalClass: "growth-invalid-exp", kind: "value", referenceClass: null, candidateClass: "Error" }] }), (error) => error.code === "MAPPING_CANNOT_TOUCH_VALUE");
});

test("expired/unknown/mismatched approvals cannot conceal differences", () => {
  const target = kit.request.cases.find((testCase) => testCase.operation === "growth.maximumExp");
  const reference = clone(referencePackage);
  const candidate = clone(candidatePackage);
  const ref = reference.cases.find((testCase) => testCase.caseId === target.caseId);
  const cand = candidate.cases.find((testCase) => testCase.caseId === target.caseId);
  ref.outcome.value = cand.outcome.value + 1;
  const approval = {
    caseId: target.caseId,
    requestHash: target.requestHash,
    referenceOutcomeHash: sha256Json(ref.outcome),
    candidateOutcomeHash: sha256Json(cand.outcome),
    expiresUTC: "2020-01-01T00:00:00Z",
    review: { decision: "INDEPENDENT_APPROVED_DIVERGENCE", reviewHash: "1".repeat(64) }
  };
  const expired = compare(reference, candidate, { ...kit.mapping, approvedDifferences: [approval] });
  assert.equal(expired.status, "FAIL");
  assert.equal(expired.approvalIssues[0].code, "APPROVAL_EXPIRED");
  assert.ok(expired.differences.some((difference) => difference.caseId === target.caseId && difference.classification === "unexplained"));
  assertGate(() => compare(reference, candidate, { ...kit.mapping, approvedDifferences: [{ ...approval, caseId: "unknown-case" }] }), "APPROVAL_UNKNOWN_CASE");
  const mismatched = compare(reference, candidate, { ...kit.mapping, approvedDifferences: [{ ...approval, referenceOutcomeHash: "2".repeat(64), expiresUTC: "2999-01-01T00:00:00Z" }] });
  assert.equal(mismatched.status, "FAIL");
  assert.ok(mismatched.approvalIssues.some((issue) => issue.code === "APPROVAL_WITHOUT_MATCHING_DIFFERENCE"));
});

test("changing the frozen mapping/hash invalidates old packages before comparison", () => {
  assertGate(() => compare(referencePackage, candidatePackage, kit.mapping, { value: kit.freeze.value, hash: "f".repeat(64) }), "BEHAVIOR_FREEZE_HASH_MISMATCH");
});

test("DIFF-C04: non-zero raw RNG blocks behavior publication instead of publishing zero", () => {
  const response = clone(tsExecution.response);
  response.random = { seed: null, drawCount: 1, draws: [{ order: 0, bound: 2, value: 1 }] };
  const execution = { ...tsExecution, response };
  assert.throws(() => makeBehaviorPackage({ execution, request: kit.request, freezeHash: kit.freeze.hash, publicMetadata: candidateMetadata(), limits: DEFAULT_LIMITS, manifest: kit.manifest }), (error) => error.code === "RANDOM_UNSUPPORTED");
});

test("DIFF-C04/C05: dual CLI preserves non-zero RNG privately and emits no public package/handoff for that side", () => {
  const run = runDualSynthetic("random-blocked", "random-success");
  assert.equal(run.result.status, 1, run.result.stderr);
  assert.equal(run.summary.status, "RUN_BLOCKED");
  assert.equal(run.summary.handoffSHA256, null);
  assert.equal(existsSync(join(run.publicDirectory, "reference.json")), false);
  assert.equal(existsSync(join(run.publicDirectory, "candidate.json")), true);
  assert.equal(existsSync(join(run.publicDirectory, "handoff.json")), false);
  const raw = readJson(join(run.privateDirectory, "reference/response.json"));
  assert.equal(raw.random.drawCount, 1);
  assert.deepEqual(raw.random.draws, [{ order: 0, bound: 2, value: 1 }]);
  assert.equal(readJson(join(run.privateDirectory, "reference/sanitize-error.json")).code, "RANDOM_UNSUPPORTED");
  assert.equal(readJson(join(run.privateDirectory, "run-summary.json")).publicationBlocked, true);
});

test("DIFF-C05: dual CLI completes two real children and emits complete structured/raw/handoff artifacts", () => {
  const run = runDualSynthetic("normal", "actual-ts");
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.summary.status, "RUNNERS_COMPLETE");
  assert.match(run.summary.handoffSHA256, /^[0-9a-f]{64}$/);
  for (const role of ["reference", "candidate"]) {
    const receipt = readJson(join(run.privateDirectory, `${role}/receipt.json`));
    assert.equal(receipt.execution.status, "success");
    assert.equal(receipt.execution.exitCode, 0);
    assert.equal(receipt.execution.stderrBytes, 0);
    assert.equal(readJson(join(run.privateDirectory, `${role}/response.json`)).cases.length, 5066);
    assert.ok(readFileSync(join(run.privateDirectory, `${role}/stdout.bin`), "utf8").length > 1000);
  }
  const compared = runCompareCli(dualHandoff(run));
  assert.equal(compared.result.status, 0, compared.result.stderr);
  const report = readJson(compared.out);
  assert.equal(report.status, "PASS"); // Synthetic CLI calibration only; no reference runtime or Ruby coverage.
  assert.equal(report.summary.comparedCaseCount, 5066);
  assert.equal(report.behaviorArtifacts.length, 2);
});

test("DIFF-C05: dual CLI preserves a real value difference through handoff/compare", () => {
  const run = runDualSynthetic("different-value", "success-two");
  assert.equal(run.result.status, 0, run.result.stderr);
  const compared = runCompareCli(dualHandoff(run));
  assert.equal(compared.result.status, 1);
  const report = readJson(compared.out);
  assert.equal(report.status, "FAIL");
  assert.ok(report.summary.unapprovedDifferenceCount > 0);
  assert.equal(report.differences[0].reference.kind, "value");
  assert.equal(report.differences[0].candidate.kind, "value");
});

test("DIFF-C05: dual CLI non-zero child with valid JSON remains RUN_FAILED and retains raw stdout", () => {
  const run = runDualSynthetic("nonzero-valid-json", "nonzero-valid-response");
  assert.equal(run.result.status, 1);
  assert.equal(run.summary.status, "RUN_FAILED");
  const receipt = readJson(join(run.privateDirectory, "reference/receipt.json"));
  assert.equal(receipt.execution.status, "process-error");
  assert.equal(receipt.execution.exitCode, 7);
  const raw = parseJson(readFileSync(join(run.privateDirectory, "reference/stdout.bin"), "utf8"));
  assert.equal(raw.cases.length, 5066);
  const compared = runCompareCli(dualHandoff(run));
  assert.equal(compared.result.status, 1);
  assert.equal(readJson(compared.out).status, "RUN_FAILED");
});

test("DIFF-C05: dual CLI timeout with valid JSON remains RUN_FAILED and retains raw stdout", () => {
  const run = runDualSynthetic("timeout-valid-json", "timeout-valid-response", 500);
  assert.equal(run.result.status, 1);
  assert.equal(run.summary.status, "RUN_FAILED");
  const receipt = readJson(join(run.privateDirectory, "reference/receipt.json"));
  assert.equal(receipt.execution.status, "timeout");
  assert.equal(receipt.execution.timedOut, true);
  const raw = parseJson(readFileSync(join(run.privateDirectory, "reference/stdout.bin"), "utf8"));
  assert.equal(raw.cases.length, 5066);
  const compared = runCompareCli(dualHandoff(run));
  assert.equal(compared.result.status, 1);
  assert.equal(readJson(compared.out).status, "RUN_FAILED");
});

const kitMutations = [
  ["product TS source", (root) => { mkdirSync(join(root, "src/framework/rules"), { recursive: true }); writeFileSync(join(root, "src/framework/rules/growth.ts"), "export {}\n"); }, "KIT_UNSAFE_OR_SOURCE_PATH"],
  ["external map file", (root) => { writeFileSync(join(root, "core/core.cjs.map"), "{}\n"); }, "KIT_UNSAFE_OR_SOURCE_PATH"],
  ["external map reference", (root) => { writeFileSync(join(root, "core/core.cjs"), `\n//# sourceMappingURL=core.cjs.map\n`, { flag: "a" }); }, "KIT_SOURCE_MAP_REJECTED"],
  ["inline map", (root) => { writeFileSync(join(root, "runners/ts-runner.mjs"), `\n//# sourceMappingURL=data:application/json;base64,AAAA\n`, { flag: "a" }); }, "KIT_SOURCE_MAP_REJECTED"],
  ["unknown extra", (root) => { writeFileSync(join(root, "extra.json"), "{}\n"); }, "KIT_FILE_SET_MISMATCH"],
  ["artifact tamper", (root) => { writeFileSync(join(root, "core/core.cjs"), "\n// infrastructure tamper\n", { flag: "a" }); }, "KIT_ARTIFACT_SIZE_MISMATCH"],
  ["manifest tamper", (root) => { const path = join(root, "artifacts.manifest.json"); const value = readJson(path); value.files[0].sha256 = "0".repeat(64); writeFileSync(path, strictStringify(value, true)); }, "KIT_ARTIFACT_HASH_MISMATCH"]
];
for (const [name, mutate, code] of kitMutations) test(`kit rejection: ${name}`, () => {
  const destination = join(testRoot, `kit-negative-${name.replaceAll(" ", "-")}`);
  cpSync(kit.root, destination, { recursive: true, force: false, errorOnExist: true });
  mutate(destination);
  assertGate(() => verifyKit(destination), code);
});
test("kit rejection: externally supplied freeze hash is authoritative", () => {
  assertGate(() => verifyKit(kit.root, { expectedFreezeHash: "0".repeat(64) }), "KIT_EXTERNAL_FREEZE_HASH_MISMATCH");
});

test("DIFF-C06: synthetic approvals accept valid future UTC, reject expiry, and fail closed on invalid dates", () => {
  const target = kit.request.cases.find((testCase) => testCase.operation === "growth.maximumExp");
  const reference = clone(referencePackage);
  const candidate = clone(candidatePackage);
  const ref = reference.cases.find((testCase) => testCase.caseId === target.caseId);
  const cand = candidate.cases.find((testCase) => testCase.caseId === target.caseId);
  ref.outcome.value = cand.outcome.value + 1;
  const approval = {
    caseId: target.caseId,
    requestHash: target.requestHash,
    referenceOutcomeHash: sha256Json(ref.outcome),
    candidateOutcomeHash: sha256Json(cand.outcome),
    expiresUTC: "2999-01-01T00:00:00Z",
    review: { decision: "INDEPENDENT_APPROVED_DIVERGENCE", reviewHash: "1".repeat(64) }
  };
  const withExpiry = (expiresUTC) => ({ ...kit.mapping, approvedDifferences: [{ ...approval, expiresUTC }] });
  const futureMapping = withExpiry("2999-01-01T00:00:00Z");
  assert.equal(validateMapping(futureMapping), futureMapping);
  const future = compare(reference, candidate, futureMapping);
  assert.equal(future.status, "PASS_WITH_APPROVED_DIVERGENCE"); // Synthetic marker only; no real approval.
  assert.deepEqual(future.approvalIssues, []);
  assert.equal(validateMapping(withExpiry("2028-02-29T23:59:59.999Z")).approvedDifferences[0].expiresUTC, "2028-02-29T23:59:59.999Z");
  const expired = compare(reference, candidate, withExpiry("2020-01-01T00:00:00Z"));
  assert.equal(expired.status, "FAIL");
  assert.equal(expired.approvalIssues[0].code, "APPROVAL_EXPIRED");
  for (const expiresUTC of ["2026-99-99T00:00:00Z", "2026-02-30T00:00:00Z", "2025-02-29T00:00:00Z", "2026-01-01T24:00:00Z"]) {
    const invalid = withExpiry(expiresUTC);
    assertGate(() => validateMapping(invalid), "APPROVAL_EXPIRY_INVALID_UTC");
    assertGate(() => compare(reference, candidate, invalid), "APPROVAL_EXPIRY_INVALID_UTC");
  }
});

test("DIFF-C07: inherited array toJSON is rejected before invocation and ordinary arrays remain lossless", () => {
  let hookCalls = 0;
  class Hooked extends Array {
    toJSON() { hookCalls++; return 0; }
  }
  const hooked = new Hooked(1, 2);
  assert.throws(() => strictStringify(hooked), (error) => error.code === "JSON_ARRAY_PROTOTYPE");
  assert.equal(hookCalls, 0);
  assert.equal(strictStringify([1, 2]), "[1,2]");
  assert.deepEqual(parseJson("[1,2]"), [1, 2]);
});

test("RDIFF-ULTRA-01: identical/relative/nested/symlink output aliases reject before any child or public raw", () => {
  const symlinkSetup = (directory) => {
    mkdirSync(join(directory, "actual"));
    symlinkSync("actual", join(directory, "alias"), "dir");
  };
  const variants = [
    ["identical", "same", "same", null],
    ["private-ancestor", "tree/private", "tree/private/public", null],
    ["public-ancestor", "tree/private/deep", "tree/private", null],
    ["relative-alias", "actual/nested", "actual/./nested/../nested", null],
    ["symlink-alias", "alias", "actual", symlinkSetup],
    ["symlink-missing-leaf", "alias/missing", "actual/missing", symlinkSetup]
  ];
  for (const [name, privateDir, publicDir, setup] of variants) {
    const run = runDualPreflight(`overlap-${name}`, { privateDir, publicDir, setup });
    assertPreflightRejectedWithoutChild(run, "OUTPUT_DIRECTORIES_OVERLAP");
  }
});

test("RDIFF-ULTRA-01/02: separated adjacent paths and the formal kit candidate remain valid with a closed public file set", () => {
  const run = runDualPreflight("separated-adjacent", { privateDir: "output/private", publicDir: "output/private-public" });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.summary.status, "RUNNERS_COMPLETE");
  assert.deepEqual(readdirSync(run.publicPath).sort(), ["candidate.json", "handoff.json", "reference.json"]);
  assert.ok(filesUnder(run.privatePath).some((path) => path.endsWith("stdout.bin")));
  const candidate = readJson(join(run.publicPath, "candidate.json"));
  assert.equal(candidate.source.commit, kit.manifest.source.commit);
  assert.equal(candidate.source.tree, kit.manifest.source.tree);
  assert.deepEqual(candidate.source.files, [
    { role: "core-bundle", sha256: kit.hashes.get("core/core.cjs") },
    { role: "runner", sha256: kit.hashes.get("runners/ts-runner.mjs") }
  ]);
  const compared = runCompareCli({ directory: run.directory, handoffPath: join(run.publicPath, "handoff.json"), handoffHash: sha256File(join(run.publicPath, "handoff.json")), referencePath: join(run.publicPath, "reference.json"), candidatePath: join(run.publicPath, "candidate.json") });
  assert.equal(compared.result.status, 0, compared.result.stderr);
  assert.equal(readJson(compared.out).status, "PASS"); // Synthetic reference calibration only; no Ruby coverage.
});

test("RDIFF-ULTRA-02: external fixture and wrong cwd/runner/core/request/Node reject before either runner", () => {
  const actual = [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"];
  const variants = [
    ["external-fixture", [process.execPath, fixturePath, "success", requestPath], kit.root, "CANDIDATE_COMMAND_MISMATCH"],
    ["wrong-cwd", actual, testRoot, "CANDIDATE_CWD_MISMATCH"],
    ["wrong-runner", [process.execPath, "runners/other.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"], kit.root, "CANDIDATE_COMMAND_MISMATCH"],
    ["wrong-core", [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/other.cjs"], kit.root, "CANDIDATE_COMMAND_MISMATCH"],
    ["wrong-request", [process.execPath, "runners/ts-runner.mjs", "--request", "requests/other.json", "--core", "core/core.cjs"], kit.root, "CANDIDATE_COMMAND_MISMATCH"],
    ["wrong-node", ["/bin/false", "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"], kit.root, "CANDIDATE_COMMAND_MISMATCH"]
  ];
  for (const [name, candidateArgv, candidateCwd, code] of variants) {
    const run = runDualPreflight(`candidate-${name}`, { candidateArgv, candidateCwd });
    assertPreflightRejectedWithoutChild(run, code);
  }
});

test("RDIFF-ULTRA-03: JSON numeric tokens reject underflow/precision loss and keep supported numeric forms", () => {
  for (const token of ["1e-400", "1.0000000000000001", "9007199254740991.1", "0.10000000000000001"]) {
    assert.throws(() => parseJson(token), (error) => error.code === "JSON_NUMERIC_PRECISION_LOSS");
  }
  for (const [token, expected] of [["0", 0], ["1", 1], ["1.0", 1], ["1e0", 1], ["1.5", 1.5], ["-1.5", -1.5], ["9007199254740991.0", 9007199254740991]]) {
    assert.equal(parseJson(token), expected, token);
  }
});

test("RDIFF-ULTRA-03: real child/raw/publication/compare can no longer turn raw 1e-400 into a PASS", async () => {
  const directory = join(testRoot, "numeric-loss-e2e");
  mkdirSync(directory);
  const original = tsExecution.stdout.toString("utf8");
  const altered = original.replace('"raw":0', '"raw":1e-400');
  assert.notEqual(altered, original);
  const payload = join(directory, "synthetic-reference-response.json");
  writeFileSync(payload, altered, { flag: "wx" });
  const execution = await runFixture("relay-file", DEFAULT_LIMITS, payload, "reference");
  assert.equal(execution.status, "protocol-error");
  assert.equal(execution.protocolCode, "JSON_NUMERIC_PRECISION_LOSS");
  assert.equal(execution.response, null);
  assert.ok(execution.stdout.toString("utf8").includes('"raw":1e-400'));
  const failedReference = makeBehaviorPackage({ execution, request: kit.request, freezeHash: kit.freeze.hash, publicMetadata: syntheticReferenceMetadata(), limits: DEFAULT_LIMITS, manifest: kit.manifest });
  const handoff = writeSyntheticHandoff(directory, failedReference, candidatePackage);
  const compared = runCompareCli(handoff);
  assert.equal(compared.result.status, 1);
  const report = readJson(compared.out);
  assert.equal(report.status, "RUN_FAILED");
  assert.notEqual(report.status, "PASS");
});

test("RDIFF-ULTRA-01: case aliases use physical identity, with zero-child markers or legal sensitive-volume separation", () => {
  const probe = join(testRoot, "case-volume-probe");
  mkdirSync(join(probe, "CaseDir"), { recursive: true });
  mkdirSync(join(probe, "casedir"), { recursive: true });
  const mixed = statSync(join(probe, "CaseDir"), { bigint: true });
  const lower = statSync(join(probe, "casedir"), { bigint: true });
  const sameInode = mixed.dev === lower.dev && mixed.ino === lower.ino;
  if (sameInode) {
    for (const [name, privateDir, publicDir] of [
      ["same", "CaseDir", "casedir"],
      ["private-ancestor", "CaseDir", "casedir/nested"],
      ["public-ancestor", "CaseDir/nested", "casedir"]
    ]) {
      const referenceMarker = join(testRoot, `preflight-case-${name}/reference-started.txt`);
      const run = runDualPreflight(`case-${name}`, { privateDir, publicDir, referenceMarker });
      assertPreflightRejectedWithoutChild(run, "OUTPUT_DIRECTORIES_OVERLAP");
      assert.equal(existsSync(referenceMarker), false, `${name}: reference actually started`);
    }
    writeFileSync(join(testRoot, "case-alias-result.json"), strictStringify({ sameInode, outcome: "THREE_CONFIGS_REJECTED_ZERO_CHILD_ZERO_PUBLIC_RAW" }));
  } else {
    const run = runDualPreflight("case-sensitive-independent", { privateDir: "CaseDir", publicDir: "casedir" });
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.deepEqual(readdirSync(run.publicPath).sort(), ["candidate.json", "handoff.json", "reference.json"]);
    writeFileSync(join(testRoot, "case-alias-result.json"), strictStringify({ sameInode, outcome: "INDEPENDENT_CASE_SENSITIVE_DIRECTORIES_ALLOWED" }));
  }
});

test("RDIFF-ULTRA-02: schema-valid template placeholders support the formal candidate while metadata derives from kit", () => {
  const directory = join(testRoot, "template-formal-candidate");
  mkdirSync(directory);
  const config = readJson(join(kit.root, "config/runners.template.json"));
  const reference = config.runners.find((runner) => runner.role === "reference");
  const candidate = config.runners.find((runner) => runner.role === "candidate");
  assert.equal(candidate.publicMetadata.source.commit.length, 40);
  assert.equal(candidate.publicMetadata.source.tree.length, 40);
  config.request = requestPath;
  config.freezeHash = kit.freeze.hash;
  config.privateDirectory = "private";
  config.publicDirectory = "public";
  const actualTsArgv = [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"];
  reference.argv = actualTsArgv;
  reference.cwd = kit.root;
  reference.publicMetadata = syntheticReferenceMetadata();
  candidate.argv[0] = process.execPath;
  candidate.cwd = kit.root;
  // Candidate commit/tree/schema placeholders are deliberately left untouched; runtime derives their real values.
  const configPath = join(directory, "config.json");
  writeFileSync(configPath, strictStringify(config, true) + "\n", { flag: "wx" });
  const result = spawnSync(process.execPath, [join(kit.root, "run-dual.mjs"), "--kit", kit.root, "--expected-freeze", kit.freeze.hash, "--config", configPath], { encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const published = readJson(join(directory, "public/candidate.json"));
  assert.equal(published.source.commit, kit.manifest.source.commit);
  assert.equal(published.source.tree, kit.manifest.source.tree);
  assert.notEqual(published.source.commit, "0".repeat(40));
  assert.deepEqual(published.source.files, [
    { role: "core-bundle", sha256: kit.hashes.get("core/core.cjs") },
    { role: "runner", sha256: kit.hashes.get("runners/ts-runner.mjs") }
  ]);
  const compared = runCompareCli({ directory, handoffPath: join(directory, "public/handoff.json"), handoffHash: sha256File(join(directory, "public/handoff.json")), referencePath: join(directory, "public/reference.json"), candidatePath: join(directory, "public/candidate.json") });
  assert.equal(compared.result.status, 0, compared.result.stderr);
  assert.equal(readJson(compared.out).status, "PASS"); // Synthetic reference calibration only; no Ruby coverage.
});
