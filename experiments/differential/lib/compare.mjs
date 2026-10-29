import { canonicalStringify, sha256Json } from "./json.mjs";
import { gateBehaviorPackage, GateError } from "./protocol.mjs";

function classMapping(mapping, testCase, referenceOutcome, candidateOutcome) {
  if (referenceOutcome.kind !== candidateOutcome.kind || referenceOutcome.kind === "value") return null;
  return mapping.errorClassMappings.find((entry) =>
    entry.operation === testCase.operation &&
    entry.additionalClass === testCase.additionalClass &&
    entry.kind === referenceOutcome.kind &&
    entry.referenceClass === (referenceOutcome.class ?? null) &&
    entry.candidateClass === (candidateOutcome.class ?? null)
  ) ?? null;
}

function outcomeDifference(testCase, referenceOutcome, candidateOutcome, mapping) {
  const fields = [];
  if (referenceOutcome.kind !== candidateOutcome.kind) fields.push("kind");
  let applied = null;
  if (!fields.includes("kind") && referenceOutcome.kind !== "value" && (referenceOutcome.class ?? null) !== (candidateOutcome.class ?? null)) {
    applied = classMapping(mapping, testCase, referenceOutcome, candidateOutcome);
    if (!applied) fields.push("class");
  }
  if (referenceOutcome.kind !== "raised" && candidateOutcome.kind !== "raised" && canonicalStringify(referenceOutcome.value) !== canonicalStringify(candidateOutcome.value)) fields.push("value");
  return { fields, applied };
}

function executionSummary(behavior) {
  const execution = behavior.execution;
  return {
    role: behavior.role,
    entryId: behavior.entryId,
    status: execution.status,
    exitCode: execution.exitCode,
    signal: execution.signal,
    timedOut: execution.timedOut,
    outputLimitExceeded: execution.outputLimitExceeded,
    stdoutBytes: execution.stdoutBytes,
    stderrBytes: execution.stderrBytes,
    stdoutSha256: execution.stdoutSha256,
    stderrSha256: execution.stderrSha256
  };
}

export function compareBehaviorPackages({ reference, candidate, request, freeze, mapping, normalizer, manifest, handoff = null }) {
  // No outcome field is read before BOTH independent clean-side gates succeed.
  gateBehaviorPackage(reference, { request, freezeHash: freeze.hash, role: "reference", manifest });
  gateBehaviorPackage(candidate, { request, freezeHash: freeze.hash, role: "candidate", manifest });

  const byId = new Map(request.cases.map((testCase) => [testCase.caseId, testCase]));
  const approvalIssues = [];
  for (const approval of mapping.approvedDifferences) {
    const testCase = byId.get(approval.caseId);
    if (!testCase || testCase.requestHash !== approval.requestHash) throw new GateError("APPROVAL_UNKNOWN_CASE");
  }
  const evaluatedAtUTC = [reference.observedAtUTC, candidate.observedAtUTC].sort().at(-1);
  const reportBase = {
    protocol: "ruby-ts-differential/comparison-report-v1",
    requestHash: request.requestHash,
    freezeHash: freeze.hash,
    schemaVersion: freeze.value.schemaVersion,
    normalizerVersion: normalizer.version,
    mappingVersion: mapping.version,
    evaluatedAtUTC,
    equivalenceScope: "under-frozen-reviewed-projection-only",
    handoffSHA256: handoff?.hash ?? null,
    behaviorArtifacts: handoff?.value.artifacts ?? [],
    reproduction: { entryId: "compare-v1", requestHash: request.requestHash, freezeHash: freeze.hash, handoffSHA256: handoff?.hash ?? null },
    executions: [executionSummary(reference), executionSummary(candidate)]
  };
  if (reference.execution.status !== "success" || candidate.execution.status !== "success") {
    return {
      ...reportBase,
      status: "RUN_FAILED",
      summary: { caseCount: request.cases.length, comparedCaseCount: 0, differenceCount: 0, approvedDifferenceCount: 0, mappedEquivalenceCount: 0, approvalIssueCount: approvalIssues.length },
      differences: [], mappedEquivalences: [], approvalIssues
    };
  }

  const referenceCases = new Map(reference.cases.map((testCase) => [testCase.caseId, testCase]));
  const candidateCases = new Map(candidate.cases.map((testCase) => [testCase.caseId, testCase]));
  const differences = [];
  const mappedEquivalences = [];
  const usedApprovals = new Set();
  for (const testCase of request.cases) {
    const referenceOutcome = referenceCases.get(testCase.caseId).outcome;
    const candidateOutcome = candidateCases.get(testCase.caseId).outcome;
    const { fields, applied } = outcomeDifference(testCase, referenceOutcome, candidateOutcome, mapping);
    if (applied) mappedEquivalences.push({ caseId: testCase.caseId, requestHash: testCase.requestHash, mappingId: applied.mappingId, referenceClass: applied.referenceClass, candidateClass: applied.candidateClass });
    if (fields.length === 0) continue;
    const referenceOutcomeHash = sha256Json(referenceOutcome);
    const candidateOutcomeHash = sha256Json(candidateOutcome);
    const approval = mapping.approvedDifferences.find((entry) => entry.caseId === testCase.caseId && entry.referenceOutcomeHash === referenceOutcomeHash && entry.candidateOutcomeHash === candidateOutcomeHash);
    let approved = false;
    if (approval) {
      usedApprovals.add(approval);
      if (Date.parse(approval.expiresUTC) <= Date.parse(evaluatedAtUTC)) approvalIssues.push({ code: "APPROVAL_EXPIRED", caseId: testCase.caseId, requestHash: testCase.requestHash });
      else approved = true;
    }
    differences.push({
      caseId: testCase.caseId,
      requestHash: testCase.requestHash,
      fields,
      reference: referenceOutcome,
      candidate: candidateOutcome,
      referenceOutcomeHash,
      candidateOutcomeHash,
      classification: approved ? "approved-divergence" : "unexplained"
    });
  }
  for (const approval of mapping.approvedDifferences) {
    if (!usedApprovals.has(approval)) approvalIssues.push({ code: "APPROVAL_WITHOUT_MATCHING_DIFFERENCE", caseId: approval.caseId, requestHash: approval.requestHash });
  }
  const unapproved = differences.filter((difference) => difference.classification === "unexplained").length;
  const approvedCount = differences.length - unapproved;
  const status = approvalIssues.length > 0 || unapproved > 0 ? "FAIL" : (approvedCount > 0 ? "PASS_WITH_APPROVED_DIVERGENCE" : "PASS");
  return {
    ...reportBase,
    status,
    summary: {
      caseCount: request.cases.length,
      comparedCaseCount: request.cases.length,
      differenceCount: differences.length,
      unapprovedDifferenceCount: unapproved,
      approvedDifferenceCount: approvedCount,
      mappedEquivalenceCount: mappedEquivalences.length,
      approvalIssueCount: approvalIssues.length
    },
    differences,
    mappedEquivalences,
    approvalIssues
  };
}

export function exitForComparison(report) {
  if (report.status === "PASS" || report.status === "PASS_WITH_APPROVED_DIVERGENCE") return 0;
  if (report.status === "GATE_FAILED") return 2;
  return 1;
}
