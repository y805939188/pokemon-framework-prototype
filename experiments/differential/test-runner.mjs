import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { executeArgv, attachRunnerResponse, writePrivateExecution, DEFAULT_LIMITS } from "./lib/process.mjs";
import { validateRawResponse } from "./lib/protocol.mjs";
import { makeBehaviorPackage } from "./lib/normalize.mjs";
import { readJson, strictStringify } from "./lib/json.mjs";
import { kit, testRoot, candidateMetadata } from "./test-helpers.mjs";

const execution = await executeArgv({
  argv: [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"],
  cwd: kit.root,
  role: "candidate",
  entryId: "ts-core-v1"
}, DEFAULT_LIMITS);
attachRunnerResponse(execution, execution.stdout.toString("utf8"), (response) => validateRawResponse(response, kit.request));
writePrivateExecution(execution, join(testRoot, "actual-ts-private"), DEFAULT_LIMITS);
assert.equal(execution.status, "success", `${execution.infrastructureCode ?? execution.protocolCode ?? "TS runner failed"}`);
assert.equal(execution.stderrBytes, 0);
assert.equal(execution.response.cases.length, 5066);
const candidate = makeBehaviorPackage({ execution, request: kit.request, freezeHash: kit.freeze.hash, publicMetadata: candidateMetadata(), limits: DEFAULT_LIMITS, manifest: kit.manifest });
writeFileSync(join(testRoot, "actual-ts-public-selftest.json"), strictStringify(candidate, true) + "\n", { flag: "wx" });
const requestById = new Map(kit.request.cases.map((testCase) => [testCase.caseId, testCase]));
const rawById = new Map(execution.response.cases.map((testCase) => [testCase.caseId, testCase.outcome]));
const publicById = new Map(candidate.cases.map((testCase) => [testCase.caseId, testCase.outcome]));
const casesFor = (operation, predicate = () => true) => kit.request.cases.filter((testCase) => testCase.operation === operation && predicate(testCase));
const only = (operation, predicate) => {
  const matches = casesFor(operation, predicate);
  assert.equal(matches.length, 1, `${operation} selection must be unique`);
  return matches[0];
};
const raw = (testCase) => rawById.get(testCase.caseId);
const publicOutcome = (testCase) => publicById.get(testCase.caseId);
const rawValue = (testCase) => {
  assert.equal(raw(testCase).kind, "value", testCase.caseId);
  return raw(testCase).raw;
};

test("actual TS: fixed matrix has 5,066 complete cases with API/capability denominators", () => {
  const counts = Object.fromEntries([...new Set(kit.request.cases.map((testCase) => testCase.operation))].map((operation) => [operation, casesFor(operation).length]));
  assert.deepEqual(counts, {
    "growth.minimumExpForLevel": 858,
    "growth.maximumExp": 18,
    "growth.addExp": 198,
    "growth.addExpSequence": 36,
    "growth.levelFromExp": 960,
    "friendship.change": 2732,
    "friendship.changeSequence": 5,
    "friendship.affection": 259
  });
  assert.equal(kit.request.cases.length, 5066);
  assert.equal(casesFor("growth.minimumExpForLevel", (testCase) => testCase.domain === "common" && testCase.input.maxLevel === 100 && testCase.input.level >= 1 && testCase.input.level <= 100).length, 600);
  assert.equal(casesFor("friendship.change", (testCase) => testCase.domain === "common").length, 2704);
  assert.equal(casesFor("friendship.affection", (testCase) => testCase.domain === "common").length, 256);
  assert.equal(casesFor("friendship.changeSequence").length, 5);
  assert.equal(kit.request.cases.filter((testCase) => testCase.domain === "additional").length, 85);
  for (const method of ["walking", "levelup", "groom", "evberry", "vitamin", "wing", "machine", "battleitem", "faint", "faintbad", "powder", "energyroot", "revivalherb"]) {
    assert.equal(casesFor("friendship.change", (testCase) => testCase.domain === "common" && testCase.input.method === method).length, 13 * 16, method);
  }
});

test("selection coverage: every matrix row links complete caseIds without a functional percentage", () => {
  const coverage = readJson(join(kit.root, "requests/selection-coverage.json"));
  assert.equal(coverage.requestHash, kit.request.requestHash);
  assert.equal(coverage.growth.apiDenominator, 4);
  assert.equal(coverage.growth.apis[0].defaultTableCaseIds.length, 600);
  for (const method of coverage.friendship.methods) assert.equal(method.commonCaseIds.length, 208);
  assert.equal(coverage.friendship.affection.commonCaseIds.length, 256);
  assert.equal(coverage.friendship.sequences.length, 5);
  const linked = new Set([
    ...coverage.growth.apis.flatMap((api) => api.caseIds),
    ...coverage.friendship.methods.flatMap((method) => method.commonCaseIds),
    ...coverage.friendship.affection.commonCaseIds,
    ...coverage.friendship.sequences.map((sequence) => sequence.caseId),
    ...Object.values(coverage.additionalDomains).flat()
  ]);
  assert.equal(linked.size, 5066);
  for (const testCase of kit.request.cases) assert.ok(linked.has(testCase.caseId), testCase.caseId);
  assert.equal(coverage.atFreeze.actualDualRun, "NOT_RUN");
  assert.equal(coverage.historicalFrozenReplay.growth3504, "SEPARATE_NOT_ACTUAL_DUAL_RUN");
  assert.equal(coverage.percentage, "NOT_COMPUTED_CASE_COUNTS_ARE_NOT_FUNCTIONAL_COVERAGE");
});

test("actual TS: growth registered max-101 anchors and clamp, without global monotonic assumptions", () => {
  const minimum = (curve, maxLevel, level) => rawValue(only("growth.minimumExpForLevel", (testCase) => testCase.input.curve === curve && testCase.input.maxLevel === maxLevel && testCase.input.level === level && testCase.domain === "common"));
  assert.equal(minimum("erratic", 101, 101), 618474);
  assert.equal(minimum("fluctuating", 101, 100), 1640000);
  assert.equal(minimum("fluctuating", 101, 101), 20505);
  assert.ok(minimum("fluctuating", 101, 101) < minimum("fluctuating", 101, 100));
  assert.equal(minimum("fluctuating", 100, 101), 1640000);
  for (const curve of ["medium", "fast", "slow", "parabolic", "erratic", "fluctuating"]) assert.equal(minimum(curve, 100, 1), 0);
});

test("actual TS: every addExp result and ordered sequence step stays inside the selected actual maximum", () => {
  const maximum = (curve, maxLevel) => rawValue(only("growth.maximumExp", (testCase) => testCase.input.curve === curve && testCase.input.maxLevel === maxLevel));
  for (const testCase of [...casesFor("growth.addExp"), ...casesFor("growth.addExpSequence")]) {
    const max = maximum(testCase.input.curve, testCase.input.maxLevel);
    const result = rawValue(testCase);
    const values = typeof result === "number" ? [result] : [result.after, ...result.steps];
    for (const value of values) assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= max, testCase.caseId);
    if (typeof result !== "number") assert.equal(result.steps.at(-1), result.after);
  }
});

test("actual TS: targeted reverse-level anchors use first-threshold/max semantics", () => {
  const level = (curve, maxLevel, exp) => rawValue(only("growth.levelFromExp", (testCase) => testCase.input.curve === curve && testCase.input.maxLevel === maxLevel && testCase.input.exp === exp));
  assert.equal(level("medium", 100, 0), 1);
  assert.equal(level("medium", 100, 999999), 99);
  assert.equal(level("medium", 100, 1000000), 100);
  assert.equal(level("fluctuating", 101, 20505), 101);
});

test("actual TS: friendship modifier order, soft-cap exception, zero/negative delta and clamps", () => {
  const change = (method, friendship, config) => rawValue(only("friendship.change", (testCase) => testCase.input.method === method && testCase.input.friendship === friendship && Object.entries(config).every(([key, value]) => testCase.input[key] === value)));
  assert.equal(change("levelup", 99, { mapId: 1, ball: "luxuryball", item: "soothebell", AFFECTION_EFFECTS: false }).after, 109);
  assert.equal(change("walking", 178, { mapId: 2, ball: "pokeball", item: "", AFFECTION_EFFECTS: true }).after, 179);
  assert.equal(change("evberry", 178, { mapId: 2, ball: "pokeball", item: "", AFFECTION_EFFECTS: true }).after, 183);
  for (const method of ["machine", "battleitem"]) assert.equal(change(method, 200, { mapId: 1, ball: "luxuryball", item: "soothebell", AFFECTION_EFFECTS: false }).delta, 0);
  assert.equal(change("faint", 200, { mapId: 1, ball: "luxuryball", item: "soothebell", AFFECTION_EFFECTS: true }).after, 199);
  assert.equal(change("faint", 0, { mapId: 1, ball: "luxuryball", item: "soothebell", AFFECTION_EFFECTS: true }).after, 0);
  assert.equal(change("walking", 255, { mapId: 1, ball: "luxuryball", item: "soothebell", AFFECTION_EFFECTS: false }).after, 255);
});

test("actual TS: all 256 affection inputs and every threshold are projected independently", () => {
  const expected = new Map([[0, 0], [99, 0], [100, 1], [149, 1], [150, 2], [199, 2], [200, 3], [229, 3], [230, 4], [254, 4], [255, 5]]);
  for (const testCase of casesFor("friendship.affection", (testCase) => testCase.domain === "common")) {
    const result = rawValue(testCase);
    assert.equal(result.status, "ready");
    assert.ok(Number.isInteger(result.affection) && result.affection >= 0 && result.affection <= 5);
    if (expected.has(testCase.input.friendship)) assert.equal(result.affection, expected.get(testCase.input.friendship));
  }
});

test("actual TS: named friendship sequences retain every ordered before/after state", () => {
  const sequence = (name) => rawValue(only("friendship.changeSequence", (testCase) => testCase.input.name === name));
  assert.deepEqual(sequence("cross-99-100").steps.map((step) => step.after), [102, 105]);
  assert.deepEqual(sequence("soft-cap-178-179").steps.map((step) => step.after), [179, 185, 185]);
  assert.deepEqual(sequence("clamp-0-lower").steps.map((step) => step.after), [0, 3]);
  assert.equal(sequence("clamp-255-up-down").steps[0].after, 255);
  const crossing = sequence("cross-199-200");
  assert.ok(crossing.steps[0].after >= 200);
  assert.equal(crossing.steps[1].delta, 0);
  assert.equal(crossing.steps[2].delta, 0);
  for (const testCase of casesFor("friendship.changeSequence")) {
    const result = rawValue(testCase);
    let before = testCase.input.initial;
    result.steps.forEach((step, index) => {
      assert.equal(step.method, testCase.input.steps[index]);
      assert.equal(step.before, before);
      assert.equal(step.delta, step.after - step.before);
      before = step.after;
      assert.deepEqual(publicOutcome(testCase).value.steps[index], { status: "ready", before: step.before, after: step.after, delta: step.delta });
    });
    assert.equal(result.after, before);
  }
});

test("actual TS: additional/refusal domains retain raw categories and are not called equivalent", () => {
  for (const testCase of casesFor("growth.minimumExpForLevel", (testCase) => testCase.domain === "additional")) {
    assert.equal(raw(testCase).kind, "error-object");
    assert.equal(raw(testCase).class, null);
    assert.equal(raw(testCase).raw.error, "invalid-level");
  }
  for (const testCase of casesFor("growth.levelFromExp", (testCase) => testCase.domain === "additional")) {
    assert.equal(raw(testCase).kind, "raised");
    assert.equal(raw(testCase).class, "RangeError");
    assert.equal(publicOutcome(testCase).kind, "raised");
  }
  for (const testCase of kit.request.cases.filter((testCase) => testCase.capability === "friendship" && testCase.domain === "additional")) {
    assert.equal(raw(testCase).kind, "error-object");
    assert.equal(raw(testCase).raw.status, "refused");
  }
});
