#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readJson, strictStringify } from "./lib/json.mjs";
import { compareBehaviorPackages, exitForComparison } from "./lib/compare.mjs";
import { verifyCliKit } from "./lib/kit.mjs";
import { verifyHandoff } from "./lib/protocol.mjs";

const args = process.argv.slice(2);
if (args.length !== 14 || args[0] !== "--kit" || args[2] !== "--expected-freeze" || args[4] !== "--handoff" || args[6] !== "--expected-handoff" || args[8] !== "--reference" || args[10] !== "--candidate" || args[12] !== "--out") {
  console.error("usage: node compare.mjs --kit <kit> --expected-freeze <sha256> --handoff <handoff.json> --expected-handoff <sha256> --reference <reference.json> --candidate <candidate.json> --out <report.json>");
  process.exit(64);
}
let report;
let comparatorHarness = null;
try {
  const kit = verifyCliKit(args[1], { expectedFreezeHash: args[3], entryURL: import.meta.url, entryRole: "compare" });
  comparatorHarness = kit.harness;
  const referencePath = resolve(args[9]);
  const candidatePath = resolve(args[11]);
  const handoff = verifyHandoff({
    handoffPath: resolve(args[5]),
    expectedHandoffHash: args[7],
    referencePath,
    candidatePath,
    request: kit.request,
    freezeHash: kit.freeze.hash,
    manifest: kit.manifest,
    manifestSha256: kit.harness.manifestSha256
  });
  const reference = readJson(referencePath);
  const candidate = readJson(candidatePath);
  report = compareBehaviorPackages({ reference, candidate, request: kit.request, freeze: kit.freeze, mapping: kit.mapping, normalizer: kit.normalizer, manifest: kit.manifest, handoff, comparatorHarness });
} catch (error) {
  report = {
    protocol: "ruby-ts-differential/comparison-report-v1",
    status: "GATE_FAILED",
    harness: { mode: "rejected-before-comparison", comparator: comparatorHarness, producer: null },
    error: {
      code: error.code ?? "GATE_FAILED",
      details: (error.details ?? []).map(({ code, schemaPath }) => ({ code: String(code).split(":")[0], schemaPath }))
    }
  };
}
writeFileSync(resolve(args[13]), strictStringify(report, true) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: report.status, summary: report.summary ?? null, handoffSHA256: report.handoffSHA256 ?? null, behaviorArtifacts: report.behaviorArtifacts ?? [], participants: report.participants ?? [], harness: report.harness ?? null, error: report.error ?? null }));
process.exitCode = exitForComparison(report);
