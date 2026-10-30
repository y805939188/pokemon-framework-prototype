import { fileURLToPath } from "node:url";
import { readJson, sha256File, sha256Json } from "./json.mjs";
import { validateSchema } from "./schema.mjs";

import {isPre54, sealPre54, validatePre54Case, sanitizePre54Outcome, gatePre54Outcome, OPERATIONS, REFERENCE_ROLES, NORMALIZER_PROTOCOL, BEHAVIOR_PROTOCOL} from '../profiles/pre54-batch2.mjs';

const schemaPath = (name) => fileURLToPath(new URL(`../schema/${name}`, import.meta.url));
export const loadSchema = (name) => readJson(schemaPath(name));
export const schemas = {
  request: (request = null) => loadSchema(isPre54(request) ? "pre54-request.schema.json" : "request.schema.json"),
  rawResponse: () => loadSchema("runner-response.schema.json"),
  behavior: (request = null) => loadSchema(isPre54(request) ? "pre54-behavior-package.schema.json" : "behavior-package.schema.json"),
  config: () => loadSchema("runner-config.schema.json"),
  handoff: () => loadSchema("handoff.schema.json"),
  mapping: () => loadSchema("mapping.schema.json"),
  normalizer: () => loadSchema("normalizer.schema.json")
};

export const caseRequestHash = (testCase) => sha256Json({
  caseId: testCase.caseId,
  capability: testCase.capability,
  operation: testCase.operation,
  domain: testCase.domain,
  additionalClass: testCase.additionalClass,
  input: testCase.input
});

export function requestBody(request) {
  return {
    protocol: request.protocol,
    selectionVersion: request.selectionVersion,
    thresholdSource: request.thresholdSource,
    capabilities: request.capabilities,
    cases: request.cases
  };
}

export function sealRequest(body) {
  if (isPre54(body)) return sealPre54(body);
  const cases = body.cases.map((testCase) => ({ ...testCase, requestHash: caseRequestHash(testCase) }));
  const unsigned = { ...body, cases };
  const requestHash = sha256Json(requestBody(unsigned));
  return { ...unsigned, requestId: `wp30-r2-${requestHash.slice(0, 16)}`, requestHash };
}

const operationShapes = {
  "growth.minimumExpForLevel": ["curve", "maxLevel", "level"],
  "growth.maximumExp": ["curve", "maxLevel"],
  "growth.addExp": ["curve", "maxLevel", "current", "amount"],
  "growth.addExpSequence": ["curve", "maxLevel", "current", "amounts"],
  "growth.levelFromExp": ["curve", "maxLevel", "exp"],
  "friendship.change": ["method", "friendship", "originMap", "mapId", "ball", "item", "AFFECTION_EFFECTS"],
  "friendship.changeSequence": ["name", "initial", "steps", "originMap", "mapId", "ball", "item", "AFFECTION_EFFECTS"],
  "friendship.affection": ["friendship"]
};
const knownMethods = new Set(["walking", "levelup", "groom", "evberry", "vitamin", "wing", "machine", "battleitem", "faint", "faintbad", "powder", "energyroot", "revivalherb"]);
const exactKeys = (value, keys) => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};
const validFriendship = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 255;

function validateCaseSemantics(testCase) {
  const expectedCapability = testCase.operation.split(".")[0];
  if (testCase.capability !== expectedCapability || !operationShapes[testCase.operation] || !exactKeys(testCase.input, operationShapes[testCase.operation])) return "CASE_OPERATION_INPUT_MISMATCH";
  if (testCase.domain === "common" && testCase.additionalClass !== "none") return "COMMON_CASE_HAS_ADDITIONAL_CLASS";
  if (testCase.domain === "additional" && testCase.additionalClass === "none") return "ADDITIONAL_CLASS_REQUIRED";
  const input = testCase.input;
  if (testCase.operation === "growth.minimumExpForLevel") {
    const valid = Number.isInteger(input.level) && input.level >= 1;
    if (testCase.domain === "common" && !valid) return "COMMON_LEVEL_OUTSIDE_DOMAIN";
    if (testCase.domain === "additional" && (testCase.additionalClass !== "growth-invalid-level" || valid)) return "INVALID_LEVEL_CLASS_MISMATCH";
  }
  if (testCase.operation === "growth.levelFromExp") {
    const valid = Number.isInteger(input.exp) && input.exp >= 0;
    if (testCase.domain === "common" && !valid) return "COMMON_EXP_OUTSIDE_DOMAIN";
    if (testCase.domain === "additional" && (testCase.additionalClass !== "growth-invalid-exp" || valid)) return "INVALID_EXP_CLASS_MISMATCH";
  }
  if (!["growth.minimumExpForLevel", "growth.levelFromExp", "friendship.change", "friendship.affection"].includes(testCase.operation) && testCase.domain !== "common") return "OPERATION_HAS_NO_ADDITIONAL_DOMAIN";
  if (testCase.operation === "friendship.change") {
    const methodKnown = knownMethods.has(input.method);
    const friendshipValid = validFriendship(input.friendship);
    if (testCase.domain === "common" && (!methodKnown || !friendshipValid)) return "COMMON_FRIENDSHIP_CHANGE_INVALID";
    if (testCase.domain === "additional") {
      if (testCase.additionalClass === "unknown-friendship-method" && (methodKnown || !friendshipValid)) return "UNKNOWN_METHOD_DOMAIN_MISMATCH";
      if (testCase.additionalClass === "friendship-out-of-domain" && (!methodKnown || friendshipValid)) return "FRIENDSHIP_DOMAIN_MISMATCH";
    }
  }
  if (testCase.operation === "friendship.affection") {
    const friendshipValid = validFriendship(input.friendship);
    if (testCase.domain === "common" && !friendshipValid) return "COMMON_AFFECTION_INVALID";
    if (testCase.domain === "additional" && (testCase.additionalClass !== "friendship-out-of-domain" || friendshipValid)) return "AFFECTION_DOMAIN_MISMATCH";
  }
  return null;
}

function schemaFailure(label, result) {
  const error = new Error(`${label}_SCHEMA_REJECTED`);
  error.code = `${label}_SCHEMA_REJECTED`;
  error.details = result.errors.map(({ code, path, schemaPath }) => ({ code, path, schemaPath }));
  return error;
}

export function validateRequest(request) {
  const schemaResult = validateSchema(schemas.request(request), request);
  if (!schemaResult.valid) throw schemaFailure("REQUEST", schemaResult);
  const ids = new Set();
  for (const testCase of request.cases) {
    if (ids.has(testCase.caseId)) throw Object.assign(new Error("REQUEST_DUPLICATE_CASE_ID"), { code: "REQUEST_DUPLICATE_CASE_ID" });
    ids.add(testCase.caseId);
    if (caseRequestHash(testCase) !== testCase.requestHash) throw Object.assign(new Error("REQUEST_CASE_HASH_MISMATCH"), { code: "REQUEST_CASE_HASH_MISMATCH" });
    const semantic = isPre54(request) ? (validatePre54Case(testCase), null) : validateCaseSemantics(testCase);
    if (semantic) throw Object.assign(new Error(semantic), { code: semantic });
  }
  const expected = sealRequest(requestBody(request));
  if (expected.requestHash !== request.requestHash || expected.requestId !== request.requestId) throw Object.assign(new Error("REQUEST_HASH_MISMATCH"), { code: "REQUEST_HASH_MISMATCH" });
  return request;
}

export function validateRawResponse(response, request) {
  const schemaResult = validateSchema(schemas.rawResponse(), response);
  if (!schemaResult.valid) return { status: "protocol-error", code: "RUNNER_RESPONSE_SCHEMA_REJECTED", details: schemaResult.errors };
  if (response.error) return { status: "protocol-error", code: response.error.code };
  if (response.requestHash !== request.requestHash) return { status: "protocol-error", code: "RUNNER_REQUEST_HASH_MISMATCH" };
  if (response.random.drawCount !== response.random.draws.length) return { status: "protocol-error", code: "RANDOM_DRAW_COUNT_MISMATCH" };
  for (let index = 0; index < response.random.draws.length; index++) {
    const draw = response.random.draws[index];
    if (draw.order !== index || draw.value >= draw.bound) return { status: "protocol-error", code: "RANDOM_DRAW_ORDER_OR_BOUND" };
  }
  const expected = new Map(request.cases.map((testCase) => [testCase.caseId, testCase.requestHash]));
  const actual = new Set();
  for (const [index, result] of response.cases.entries()) {
    if (isPre54(request) && request.cases[index]?.caseId !== result.caseId) return {status:"protocol-error", code:"PRE54_CASE_ORDER"};
    if (actual.has(result.caseId)) return { status: "protocol-error", code: "RUNNER_DUPLICATE_CASE_ID" };
    actual.add(result.caseId);
    if (!expected.has(result.caseId)) return { status: "protocol-error", code: "RUNNER_EXTRA_CASE_ID" };
    if (expected.get(result.caseId) !== result.requestHash) return { status: "protocol-error", code: "RUNNER_CASE_HASH_MISMATCH" };
  }
  for (const id of expected.keys()) if (!actual.has(id)) return { status: "protocol-error", code: "RUNNER_MISSING_CASE_ID" };
  if (actual.size !== expected.size) return { status: "protocol-error", code: "RUNNER_CASE_COUNT_MISMATCH" };
  return { status: "success" };
}

export class GateError extends Error {
  constructor(code, details = []) {
    super(code);
    this.name = "GateError";
    this.code = code;
    this.details = details.map(({ code, path, schemaPath }) => ({ code, path, schemaPath }));
  }
}

const validTime = (value) => Number.isFinite(Date.parse(value));
function requireGate(condition, code) { if (!condition) throw new GateError(code); }

/** Closed metadata only: actual original-file loading still needs the independent observer's audit. */
export function gateReferenceMetadata({ source, runtime }, request = null, manifest = null) {
  const schema = schemas.behavior(request);
  for (const [name, value] of [["source", source], ["runtime", runtime]]) {
    const result = validateSchema({ $ref: `#/$defs/${name}` }, value, schema);
    if (!result.valid) throw new GateError("REFERENCE_METADATA_SCHEMA_REJECTED", result.errors);
  }
  requireGate(runtime.name === "reference" && source.commit === "8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b" && source.tag === "v21.1" && source.tree === null && source.dirty === null, "REFERENCE_PROVENANCE_MISMATCH");
  const roles = source.files.map((file) => file.role);
  requireGate(new Set(roles).size === roles.length, "BEHAVIOR_SOURCE_ROLE_DUPLICATE");
  for (const role of (isPre54(request) ? REFERENCE_ROLES : ["growth-rules", "friendship-rules", "adapter"])) requireGate(roles.includes(role), "REFERENCE_SOURCE_HASH_MISSING");
  requireGate(source.files.every((file) => file.sha256 !== "0".repeat(64)), "REFERENCE_SOURCE_HASH_PLACEHOLDER");
  if (isPre54(request)) {
    requireGate(roles.length === REFERENCE_ROLES.length, "PRE54_REFERENCE_ROLE_SET");
    requireGate(manifest && source.files.find(f => f.role === "fixture-directory")?.sha256 === manifest.files.find(f => f.path === "profiles/pre54-batch2.mjs")?.sha256, "PRE54_DIRECTORY_BINDING");
  }
  const dependencies = runtime.dependencies.map((dependency) => dependency.name);
  requireGate(new Set(dependencies).size === dependencies.length, "BEHAVIOR_DEPENDENCY_DUPLICATE");
  for (const name of ["reference-runtime", "adapter"]) requireGate(dependencies.includes(name), "REFERENCE_DEPENDENCY_VERSION_MISSING");
  const placeholder = /^(?:UNVERIFIED|UNKNOWN|NOT_RUN|PLACEHOLDER|TODO|TBD)$/i;
  requireGate(!placeholder.test(runtime.version) && runtime.dependencies.every((dependency) => !placeholder.test(dependency.version)), "REFERENCE_VERSION_PLACEHOLDER");
  return { source, runtime };
}

/** This function must complete before any caller reads or compares case outcomes. */
export function gateBehaviorPackage(behavior, { request, freezeHash, role, manifest = null }) {
  const schemaResult = validateSchema(schemas.behavior(request), behavior);
  if (!schemaResult.valid) throw new GateError("BEHAVIOR_SCHEMA_REJECTED", schemaResult.errors);
  requireGate(behavior.role === role, "BEHAVIOR_ROLE_MISMATCH");
  requireGate(behavior.entryId === (role === "reference" ? "reference-rules-v1" : "ts-core-v1"), "BEHAVIOR_ENTRY_MISMATCH");
  requireGate(behavior.requestHash === request.requestHash, "BEHAVIOR_REQUEST_HASH_MISMATCH");
  requireGate(behavior.freezeHash === freezeHash, "BEHAVIOR_FREEZE_HASH_MISMATCH");
  requireGate(validTime(behavior.observedAtUTC), "BEHAVIOR_OBSERVED_TIME_INVALID");
  const execution = behavior.execution;
  requireGate(validTime(execution.startedAtUTC) && validTime(execution.endedAtUTC), "BEHAVIOR_EXECUTION_TIME_INVALID");
  requireGate(Date.parse(execution.startedAtUTC) <= Date.parse(execution.endedAtUTC), "BEHAVIOR_EXECUTION_TIME_ORDER");
  const source = behavior.source;
  const fileRoles = source.files.map((file) => file.role);
  requireGate(new Set(fileRoles).size === fileRoles.length, "BEHAVIOR_SOURCE_ROLE_DUPLICATE");
  const dependencyNames = behavior.runtime.dependencies.map((dependency) => dependency.name);
  requireGate(new Set(dependencyNames).size === dependencyNames.length, "BEHAVIOR_DEPENDENCY_DUPLICATE");
  if (role === "reference") {
    gateReferenceMetadata(behavior, request, manifest);
  } else {
    requireGate(behavior.runtime.name === "node" && source.commit !== null && source.tree !== null && source.tag === null && typeof source.dirty === "boolean", "CANDIDATE_PROVENANCE_INCOMPLETE");
    for (const required of ["core-bundle", "runner"]) requireGate(fileRoles.includes(required), "CANDIDATE_SOURCE_HASH_MISSING");
    requireGate(manifest !== null, "CANDIDATE_PROVENANCE_BINDING_REQUIRED");
    requireGate(source.commit === manifest.source.commit && source.tree === manifest.source.tree && source.dirty === manifest.source.dirty, "CANDIDATE_SOURCE_MISMATCH");
    requireGate(fileRoles.length === 2, "CANDIDATE_ARTIFACT_ROLE_MISMATCH");
    for (const [fileRole, artifactPath] of [["core-bundle", "core/core.cjs"], ["runner", "runners/ts-runner.mjs"]]) {
      const declared = source.files.find((file) => file.role === fileRole)?.sha256;
      const expected = manifest.files.find((file) => file.path === artifactPath)?.sha256;
      requireGate(declared === expected, "CANDIDATE_ARTIFACT_HASH_MISMATCH");
    }
  }
  if (execution.status === "success") {
    requireGate(execution.exitCode === 0 && execution.signal === null && !execution.timedOut && !execution.outputLimitExceeded && execution.stderrBytes === 0, "SUCCESS_PREDICATE_VIOLATION");
    const expected = new Map(request.cases.map((testCase) => [testCase.caseId, testCase.requestHash]));
    const actual = new Set();
    for (const [index, result] of behavior.cases.entries()) {
      if (isPre54(request)) requireGate(request.cases[index]?.caseId === result.caseId, "PRE54_CASE_ORDER");
      requireGate(!actual.has(result.caseId), "BEHAVIOR_DUPLICATE_CASE_ID");
      actual.add(result.caseId);
      requireGate(expected.has(result.caseId), "BEHAVIOR_EXTRA_CASE_ID");
      requireGate(expected.get(result.caseId) === result.requestHash, "BEHAVIOR_CASE_HASH_MISMATCH");
      if (isPre54(request)) gatePre54Outcome(result.outcome, request.cases.find(c => c.caseId === result.caseId));
    }
    requireGate(actual.size === expected.size, "BEHAVIOR_CASE_COUNT_MISMATCH");
    for (const id of expected.keys()) requireGate(actual.has(id), "BEHAVIOR_MISSING_CASE_ID");
  } else {
    requireGate(behavior.cases.length === 0, "FAILED_EXECUTION_CONTAINS_BEHAVIOR");
    if (execution.status === "timeout") requireGate(execution.timedOut, "TIMEOUT_FLAG_MISMATCH");
    if (execution.outputLimitExceeded) requireGate(execution.status === "process-error", "OUTPUT_LIMIT_STATUS_MISMATCH");
  }
  return behavior;
}

function isValidUtcDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]) return false;
  return Number.isFinite(Date.parse(value));
}

export function validateMapping(mapping) {
  const result = validateSchema(mapping?.version === "pre54-batch2-mapping-v1" ? loadSchema("pre54-mapping.schema.json") : schemas.mapping(), mapping);
  if (!result.valid) throw new GateError("MAPPING_SCHEMA_REJECTED", result.errors);
  const ids = new Set();
  for (const entry of mapping.errorClassMappings) {
    requireGate(!ids.has(entry.mappingId), "MAPPING_ID_DUPLICATE");
    ids.add(entry.mappingId);
    requireGate(entry.kind !== "value", "MAPPING_CANNOT_TOUCH_VALUE");
    requireGate(entry.referenceClass !== entry.candidateClass, "MAPPING_IDENTITY_CLASS_NOT_ALLOWED");
  }
  for (const approval of mapping.approvedDifferences) requireGate(isValidUtcDate(approval.expiresUTC), "APPROVAL_EXPIRY_INVALID_UTC");
  return mapping;
}

export function validateNormalizer(normalizer) {
  const result = validateSchema(normalizer?.protocol === NORMALIZER_PROTOCOL ? loadSchema("pre54-normalizer.schema.json") : schemas.normalizer(), normalizer);
  if (!result.valid) throw new GateError("NORMALIZER_SCHEMA_REJECTED", result.errors);
  const operations = normalizer.projections.map(entry => entry.operation);
  requireGate(normalizer.protocol === NORMALIZER_PROTOCOL ? operations.length === OPERATIONS.length && new Set(operations).size === OPERATIONS.length && OPERATIONS.every(op => operations.includes(op)) && normalizer.projections.every(p => p.projection === "pre54-" + p.operation + "-v1") : new Set(operations).size === 8, "NORMALIZER_OPERATION_SET_MISMATCH");
  return normalizer;
}

export function validateHandoff(handoff, { request, freezeHash, manifest = null, manifestSha256 = null }) {
  const result = validateSchema(schemas.handoff(), handoff);
  if (!result.valid) throw new GateError("HANDOFF_SCHEMA_REJECTED", result.errors);
  requireGate(handoff.requestHash === request.requestHash, "HANDOFF_REQUEST_HASH_MISMATCH");
  requireGate(handoff.freezeHash === freezeHash, "HANDOFF_FREEZE_HASH_MISMATCH");
  if (manifest !== null) {
    requireGate(handoff.producer.manifestSha256 === manifestSha256, "HANDOFF_HARNESS_MANIFEST_MISMATCH");
    requireGate(handoff.producer.entrySha256 === manifest.files.find((file) => file.path === "run-dual.mjs")?.sha256, "HANDOFF_HARNESS_ENTRY_MISMATCH");
  }
  const roles = handoff.artifacts.map((artifact) => artifact.role).sort();
  requireGate(roles.join(",") === "candidate,reference", "HANDOFF_ROLE_SET_MISMATCH");
  for (const artifact of handoff.artifacts) {
    requireGate(artifact.entryId === (artifact.role === "reference" ? "reference-rules-v1" : "ts-core-v1"), "HANDOFF_ENTRY_MISMATCH");
  }
  return handoff;
}

export function makeHandoff({ request, freezeHash, artifacts, producer }) {
  const order = { reference: 0, candidate: 1 };
  return validateHandoff({
    protocol: "ruby-ts-differential/handoff-v2",
    requestHash: request.requestHash,
    freezeHash,
    producer,
    artifacts: [...artifacts].sort((a, b) => order[a.role] - order[b.role]).map(({ role, entryId, sha256 }) => ({ role, entryId, sha256 }))
  }, { request, freezeHash });
}

/** Verify the externally fixed handoff and raw behavior artifact bytes before parsing either behavior body. */
export function verifyHandoff({ handoffPath, expectedHandoffHash, referencePath, candidatePath, request, freezeHash, manifest, manifestSha256 }) {
  const hash = sha256File(handoffPath);
  requireGate(hash === expectedHandoffHash, "HANDOFF_EXTERNAL_HASH_MISMATCH");
  const value = validateHandoff(readJson(handoffPath, 1024 * 1024), { request, freezeHash, manifest, manifestSha256 });
  for (const artifact of value.artifacts) {
    const path = artifact.role === "reference" ? referencePath : candidatePath;
    requireGate(sha256File(path) === artifact.sha256, "HANDOFF_ARTIFACT_HASH_MISMATCH");
  }
  return { value, hash };
}
