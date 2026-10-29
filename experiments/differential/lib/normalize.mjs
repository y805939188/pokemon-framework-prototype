import { strictStringify, sha256Json } from "./json.mjs";
import { gateBehaviorPackage } from "./protocol.mjs";
import { publicExecution } from "./process.mjs";

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const integer = (value) => Number.isSafeInteger(value);
// Exact JSON lexical identity is enforced by parseJson before this projection.
// This carrier only adds finite, safe-range numeric state; it never rounds or clamps it.
const friendshipStateNumber = (value) => typeof value === "number" && Number.isFinite(value) &&
  !Object.is(value, -0) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const normalizationError = (code) => Object.assign(new Error(code), { code });

function publicPlan(raw, method) {
  if (!exact(raw, ["status", "method", "before", "after", "delta"])) throw normalizationError("FRIENDSHIP_RAW_PLAN_SHAPE");
  if (raw.status !== "ready" || raw.method !== method || !friendshipStateNumber(raw.before) || !friendshipStateNumber(raw.after) || !friendshipStateNumber(raw.delta) || raw.delta !== raw.after - raw.before) {
    throw normalizationError("FRIENDSHIP_RAW_PLAN_CONTENT");
  }
  return { status: "ready", before: raw.before, after: raw.after, delta: raw.delta };
}

function publicError(raw, testCase) {
  if (testCase.operation === "growth.minimumExpForLevel" && exact(raw, ["ok", "error"]) && raw.ok === false && raw.error === "invalid-level") {
    return { code: "invalid-level" };
  }
  if (exact(raw, ["status", "reason", "value"]) && raw.status === "refused" && raw.reason === "friendship-out-of-domain" && raw.value === testCase.input.friendship) {
    return { code: "friendship-out-of-domain", value: raw.value };
  }
  if (exact(raw, ["status", "reason", "method"]) && raw.status === "refused" && raw.reason === "unknown-friendship-method" && raw.method === testCase.input.method) {
    return { code: "unknown-friendship-method" };
  }
  throw normalizationError("UNRECOGNIZED_RAW_ERROR_OBJECT");
}

export function sanitizeOutcome(outcome, testCase) {
  if (outcome.kind === "raised") return { kind: "raised", class: outcome.class };
  if (outcome.kind === "error-object") return { kind: "error-object", class: outcome.class, value: publicError(outcome.raw, testCase) };
  if (outcome.kind !== "value") throw normalizationError("UNKNOWN_RAW_OUTCOME_KIND");
  const raw = outcome.raw;
  // A numeric value remains representable for every operation so an actual type difference is compared, not hidden.
  if (integer(raw)) return { kind: "value", value: raw };
  switch (testCase.operation) {
    case "friendship.change":
      return { kind: "value", value: publicPlan(raw, testCase.input.method) };
    case "friendship.affection":
      if (!exact(raw, ["status", "affection"]) || raw.status !== "ready" || !integer(raw.affection) || raw.affection < 0 || raw.affection > 5) throw normalizationError("AFFECTION_RAW_SHAPE");
      return { kind: "value", value: { status: "ready", affection: raw.affection } };
    case "growth.addExpSequence":
      if (!exact(raw, ["after", "steps"]) || !integer(raw.after) || !Array.isArray(raw.steps) || raw.steps.length !== testCase.input.amounts.length || !raw.steps.every(integer)) throw normalizationError("GROWTH_SEQUENCE_RAW_SHAPE");
      return { kind: "value", value: { after: raw.after, steps: [...raw.steps] } };
    case "friendship.changeSequence": {
      if (!exact(raw, ["steps", "after"]) || !Array.isArray(raw.steps) || raw.steps.length !== testCase.input.steps.length || !friendshipStateNumber(raw.after)) throw normalizationError("FRIENDSHIP_SEQUENCE_RAW_SHAPE");
      const steps = raw.steps.map((step, index) => publicPlan(step, testCase.input.steps[index]));
      let before = testCase.input.initial;
      for (const step of steps) {
        if (step.before !== before) throw normalizationError("FRIENDSHIP_SEQUENCE_CHAIN");
        before = step.after;
      }
      if (before !== raw.after) throw normalizationError("FRIENDSHIP_SEQUENCE_FINAL");
      return { kind: "value", value: { steps, after: raw.after } };
    }
    default:
      throw normalizationError("NUMERIC_RAW_VALUE_REQUIRED");
  }
}

function cleanMetadata(metadata) {
  return {
    source: {
      commit: metadata.source.commit,
      tree: metadata.source.tree,
      tag: metadata.source.tag,
      dirty: metadata.source.dirty,
      files: metadata.source.files.map(({ role, sha256 }) => ({ role, sha256 }))
    },
    runtime: {
      name: metadata.runtime.name,
      version: metadata.runtime.version,
      dependencies: metadata.runtime.dependencies.map(({ name, version }) => ({ name, version }))
    }
  };
}

export function makeBehaviorPackage({ execution, request, freezeHash, publicMetadata, limits, manifest = null }) {
  const metadata = cleanMetadata(publicMetadata);
  const executionReceipt = publicExecution(execution, limits);
  let cases = [];
  if (execution.status === "success") {
    if (!execution.response) throw normalizationError("SUCCESS_WITHOUT_RAW_RESPONSE");
    if (execution.response.random.seed !== null || execution.response.random.drawCount !== 0 || execution.response.random.draws.length !== 0) {
      // Unsupported RNG blocks publication. Never replace a private non-empty trace with a public zero.
      throw normalizationError("RANDOM_UNSUPPORTED");
    }
    const expected = new Map(request.cases.map((testCase) => [testCase.caseId, testCase]));
    cases = execution.response.cases.map((rawCase) => ({
      caseId: rawCase.caseId,
      requestHash: rawCase.requestHash,
      outcome: sanitizeOutcome(rawCase.outcome, expected.get(rawCase.caseId))
    }));
  }
  const behavior = {
    protocol: "ruby-ts-differential/behavior-package-v2",
    role: execution.role,
    entryId: execution.entryId,
    requestHash: request.requestHash,
    freezeHash,
    observedAtUTC: execution.endedAtUTC,
    ...metadata,
    execution: executionReceipt,
    random: { seed: null, drawCount: 0, draws: [] },
    cases
  };
  // Observer-side self-gate. The clean comparator independently repeats this gate before reading outcomes.
  gateBehaviorPackage(behavior, { request, freezeHash, role: execution.role, manifest });
  return behavior;
}

export function outcomeHash(outcome) {
  return sha256Json(outcome);
}

export function writeJsonExclusive(path, value, fs) {
  fs.writeFileSync(path, strictStringify(value, true) + "\n", { flag: "wx" });
}
