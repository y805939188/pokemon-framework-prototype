// INFRASTRUCTURE SELF-TEST ONLY. Every reference outcome below is synthetic, never Ruby execution or coverage.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { executeArgv, attachRunnerResponse, writePrivateExecution, DEFAULT_LIMITS } from "./lib/process.mjs";
import { GateError, loadSchema, validateNormalizer, validateRawResponse } from "./lib/protocol.mjs";
import { makeBehaviorPackage, sanitizeOutcome } from "./lib/normalize.mjs";
import { compareBehaviorPackages } from "./lib/compare.mjs";
import { strictStringify } from "./lib/json.mjs";
import { validateSchema } from "./lib/schema.mjs";
import { kit, testRoot, requestPath, fixturePath, candidateMetadata, syntheticReferenceMetadata } from "./test-helpers.mjs";

const clone = (value) => structuredClone(value);
const changeSpecs = [
  { before: -1, after: 42 },
  { before: 256, after: 128 },
  { before: 1.5, after: 2.5 }
].map((spec) => {
  const testCase = kit.request.cases.find((entry) => entry.operation === "friendship.change" && entry.input.friendship === spec.before);
  assert.ok(testCase, `missing frozen synthetic input ${spec.before}`);
  return { ...spec, testCase };
});
const changesById = new Map(changeSpecs.map((spec) => [spec.testCase.caseId, spec]));
const sequenceCase = kit.request.cases.find((entry) => entry.operation === "friendship.changeSequence" && entry.input.steps.length === 2);
assert.ok(sequenceCase, "a two-step frozen sequence is required");
const sequenceRaw = {
  steps: [
    { status: "ready", method: sequenceCase.input.steps[0], before: sequenceCase.input.initial, after: 1.5, delta: 1.5 - sequenceCase.input.initial },
    { status: "ready", method: sequenceCase.input.steps[1], before: 1.5, after: 256.5, delta: 255 }
  ],
  after: 256.5
};

function plan(spec, different) {
  const after = different ? spec.after + 1 : spec.after;
  return { status: "ready", method: spec.testCase.input.method, before: spec.before, after, delta: after - spec.before };
}
const project = ({ status, before, after, delta }) => ({ status, before, after, delta });
const projectedPlan = (spec, different) => project(plan(spec, different));
const projectedSequence = { steps: sequenceRaw.steps.map(project), after: sequenceRaw.after };

function syntheticResponse(mode) {
  return {
    protocol: "ruby-ts-differential/runner-response-v1",
    requestHash: kit.request.requestHash,
    random: { seed: null, drawCount: 0, draws: [] },
    cases: kit.request.cases.map((testCase) => {
      const spec = changesById.get(testCase.caseId);
      let outcome = { kind: "value", class: null, raw: 0 };
      if (spec && mode === "error-object") {
        outcome = { kind: "error-object", class: null, raw: { status: "refused", reason: "friendship-out-of-domain", value: testCase.input.friendship } };
      } else if (spec) {
        outcome = { kind: "value", class: null, raw: plan(spec, mode === "different") };
      } else if (testCase.caseId === sequenceCase.caseId) {
        outcome = { kind: "value", class: null, raw: clone(sequenceRaw) };
      }
      return { caseId: testCase.caseId, requestHash: testCase.requestHash, outcome };
    })
  };
}

async function realSyntheticChild(role, name, mode) {
  const directory = join(testRoot, `numeric-carrier-${name}-${role}`);
  mkdirSync(directory, { recursive: true });
  const payload = join(directory, "synthetic-response.json");
  writeFileSync(payload, strictStringify(syntheticResponse(mode)) + "\n", { flag: "wx" });
  const execution = await executeArgv({
    argv: [process.execPath, fixturePath, "relay-file", requestPath, payload],
    cwd: dirname(fixturePath), role,
    entryId: role === "reference" ? "reference-rules-v1" : "ts-core-v1"
  }, DEFAULT_LIMITS);
  attachRunnerResponse(execution, execution.stdout.toString("utf8"), (response) => validateRawResponse(response, kit.request));
  writePrivateExecution(execution, join(directory, "private"), DEFAULT_LIMITS);
  assert.equal(execution.status, "success", execution.infrastructureCode ?? execution.protocolCode ?? "synthetic child failed");
  const behavior = makeBehaviorPackage({
    execution, request: kit.request, freezeHash: kit.freeze.hash,
    publicMetadata: role === "reference" ? syntheticReferenceMetadata() : candidateMetadata(),
    limits: DEFAULT_LIMITS, manifest: kit.manifest
  });
  writeFileSync(join(directory, "public.json"), strictStringify(behavior, true) + "\n", { flag: "wx" });
  return behavior;
}

const referencePackage = await realSyntheticChild("reference", "base", "same");
const identicalCandidate = await realSyntheticChild("candidate", "same", "same");
const differentCandidate = await realSyntheticChild("candidate", "different", "different");
const errorCandidate = await realSyntheticChild("candidate", "error", "error-object");
const compare = (reference, candidate) => compareBehaviorPackages({
  reference, candidate, request: kit.request, mapping: kit.mapping,
  normalizer: kit.normalizer, freeze: kit.freeze, manifest: kit.manifest
});
const publicCase = (behavior, testCase) => behavior.cases.find((entry) => entry.caseId === testCase.caseId);

// Synthetic comparator calibration only: this PASS is not original Ruby coverage.
test("infrastructure self-test: real children preserve synthetic out-of-range/fractional state and ordered sequences", () => {
  for (const spec of changeSpecs) {
    assert.deepEqual(publicCase(referencePackage, spec.testCase).outcome, { kind: "value", value: projectedPlan(spec, false) });
    assert.deepEqual(publicCase(identicalCandidate, spec.testCase).outcome, { kind: "value", value: projectedPlan(spec, false) });
  }
  assert.deepEqual(publicCase(referencePackage, sequenceCase).outcome.value, projectedSequence);
  assert.equal(publicCase(referencePackage, sequenceCase).outcome.value.steps[1].before, 1.5);
  assert.equal(publicCase(referencePackage, sequenceCase).outcome.value.after, 256.5);
  const report = compare(referencePackage, identicalCandidate);
  assert.equal(report.status, "PASS");
  assert.equal(report.summary.comparedCaseCount, kit.request.cases.length);
  assert.equal(report.summary.differenceCount, 0);
});

test("infrastructure self-test: public numeric value versus candidate error-object remains DIFFERENCE", () => {
  const report = compare(referencePackage, errorCandidate);
  assert.equal(report.status, "FAIL");
  assert.equal(report.summary.differenceCount, changeSpecs.length);
  assert.equal(report.summary.unapprovedDifferenceCount, changeSpecs.length);
  for (const spec of changeSpecs) {
    const difference = report.differences.find((entry) => entry.caseId === spec.testCase.caseId);
    assert.ok(difference);
    assert.deepEqual(difference.fields, ["kind", "value"]);
    assert.equal(difference.reference.kind, "value");
    assert.equal(difference.candidate.kind, "error-object");
    assert.deepEqual(difference.reference.value, projectedPlan(spec, false));
    assert.deepEqual(difference.candidate.value, { code: "friendship-out-of-domain", value: spec.before });
  }
});

test("infrastructure self-test: changed public numeric values remain unexplained DIFFERENCE", () => {
  const report = compare(referencePackage, differentCandidate);
  assert.equal(report.status, "FAIL");
  assert.equal(report.summary.differenceCount, changeSpecs.length);
  assert.equal(report.summary.unapprovedDifferenceCount, changeSpecs.length);
  for (const spec of changeSpecs) {
    const difference = report.differences.find((entry) => entry.caseId === spec.testCase.caseId);
    assert.ok(difference);
    assert.deepEqual(difference.fields, ["value"]);
    assert.deepEqual(difference.reference.value, projectedPlan(spec, false));
    assert.deepEqual(difference.candidate.value, projectedPlan(spec, true));
    assert.notEqual(difference.referenceOutcomeHash, difference.candidateOutcomeHash);
  }
});

test("numeric carrier v2: old behavior, normalizer and freeze contracts cannot masquerade as current", () => {
  assert.equal(referencePackage.protocol, "ruby-ts-differential/behavior-package-v2");
  assert.equal(kit.normalizer.version, "wp30-r2-normalizer-v2");
  assert.equal(kit.freeze.value.protocol, "ruby-ts-differential/freeze-v3");
  assert.equal(kit.freeze.value.schemaVersion, "wp30-r2-schema-v3");
  assert.equal(kit.freeze.value.normalizerVersion, "wp30-r2-normalizer-v2");

  const oldBehavior = clone(referencePackage);
  oldBehavior.protocol = "ruby-ts-differential/behavior-package-v1";
  assert.throws(() => compare(oldBehavior, identicalCandidate), (error) => error instanceof GateError && error.code === "BEHAVIOR_SCHEMA_REJECTED");

  const oldNormalizer = clone(kit.normalizer);
  oldNormalizer.protocol = "ruby-ts-differential/normalizer-v1";
  oldNormalizer.version = "wp30-r2-normalizer-v1";
  assert.throws(() => validateNormalizer(oldNormalizer), (error) => error instanceof GateError && error.code === "NORMALIZER_SCHEMA_REJECTED");
  const oldProjection = clone(kit.normalizer);
  oldProjection.projections.find((entry) => entry.operation === "friendship.change").projection = "ruby-state-change-to-ts-plan-after-v1";
  assert.throws(() => validateNormalizer(oldProjection), (error) => error instanceof GateError && error.code === "NORMALIZER_SCHEMA_REJECTED");

  const oldFreeze = clone(kit.freeze.value);
  oldFreeze.protocol = "ruby-ts-differential/freeze-v1";
  oldFreeze.schemaVersion = "wp30-r2-schema-v1";
  oldFreeze.normalizerVersion = "wp30-r2-normalizer-v1";
  assert.equal(validateSchema(loadSchema("freeze.schema.json"), oldFreeze).valid, false);
});

test("numeric carrier v2: non-numeric, unsafe, negative-zero, non-finite, bad delta and broken chains still reject", () => {
  const testCase = changeSpecs[0].testCase;
  const valid = plan(changeSpecs[0], false);
  const outcome = (raw) => ({ kind: "value", class: null, raw });
  const invalid = [
    ["non-numeric", { ...valid, before: "-1" }, "FRIENDSHIP_RAW_PLAN_CONTENT"],
    ["unsafe", { ...valid, before: Number.MAX_SAFE_INTEGER + 1 }, "FRIENDSHIP_RAW_PLAN_CONTENT"],
    ["negative-zero", { ...valid, before: -0 }, "FRIENDSHIP_RAW_PLAN_CONTENT"],
    ["non-finite", { ...valid, after: Number.POSITIVE_INFINITY }, "FRIENDSHIP_RAW_PLAN_CONTENT"],
    ["bad-delta", { ...valid, delta: valid.delta + 1 }, "FRIENDSHIP_RAW_PLAN_CONTENT"],
    ["extra-field", { ...valid, diagnostic: "not allowed" }, "FRIENDSHIP_RAW_PLAN_SHAPE"]
  ];
  for (const [name, raw, code] of invalid) {
    assert.throws(() => sanitizeOutcome(outcome(raw), testCase), (error) => error.code === code, name);
  }
  assert.deepEqual(sanitizeOutcome(outcome(valid), testCase), { kind: "value", value: project(valid) });

  const broken = clone(sequenceRaw);
  broken.steps[1].before = 2.5;
  broken.steps[1].delta = broken.steps[1].after - broken.steps[1].before;
  assert.throws(() => sanitizeOutcome(outcome(broken), sequenceCase), (error) => error.code === "FRIENDSHIP_SEQUENCE_CHAIN");
  const wrongFinal = clone(sequenceRaw);
  wrongFinal.after = 255.5;
  assert.throws(() => sanitizeOutcome(outcome(wrongFinal), sequenceCase), (error) => error.code === "FRIENDSHIP_SEQUENCE_FINAL");
});

test("numeric carrier v2: real child lexical underflow in friendship state remains RUN_FAILED, never PASS", async () => {
  const directory = join(testRoot, "numeric-carrier-lexical-loss");
  mkdirSync(directory, { recursive: true });
  const response = syntheticResponse("same");
  const target = response.cases.find((entry) => entry.caseId === changeSpecs[0].testCase.caseId);
  target.outcome.raw = { status: "ready", method: changeSpecs[0].testCase.input.method, before: 0, after: 1, delta: 1 };
  const original = strictStringify(response);
  const needle = '"before":0,"after":1,"delta":1';
  assert.ok(original.includes(needle));
  const altered = original.replace(needle, '"before":1e-400,"after":1,"delta":1');
  assert.notEqual(altered, original);
  const payload = join(directory, "synthetic-response.json");
  writeFileSync(payload, altered, { flag: "wx" });
  const execution = await executeArgv({
    argv: [process.execPath, fixturePath, "relay-file", requestPath, payload],
    cwd: dirname(fixturePath), role: "candidate", entryId: "ts-core-v1"
  }, DEFAULT_LIMITS);
  attachRunnerResponse(execution, execution.stdout.toString("utf8"), (value) => validateRawResponse(value, kit.request));
  writePrivateExecution(execution, join(directory, "private"), DEFAULT_LIMITS);
  assert.equal(execution.status, "protocol-error");
  assert.equal(execution.protocolCode, "JSON_NUMERIC_PRECISION_LOSS");
  assert.equal(execution.response, null);
  assert.ok(execution.stdout.toString("utf8").includes('"before":1e-400'));
  const failedCandidate = makeBehaviorPackage({
    execution, request: kit.request, freezeHash: kit.freeze.hash,
    publicMetadata: candidateMetadata(), limits: DEFAULT_LIMITS, manifest: kit.manifest
  });
  const report = compare(referencePackage, failedCandidate);
  assert.equal(report.status, "RUN_FAILED");
  assert.equal(report.summary.comparedCaseCount, 0);
  assert.notEqual(report.status, "PASS");
});
