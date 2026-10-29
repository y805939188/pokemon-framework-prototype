#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readJson, strictStringify } from "./lib/json.mjs";
import { compareBehaviorPackages, exitForComparison } from "./lib/compare.mjs";
import { verifyKit } from "./lib/kit.mjs";

const args = process.argv.slice(2);
if (args.length !== 10 || args[0] !== "--kit" || args[2] !== "--expected-freeze" || args[4] !== "--reference" || args[6] !== "--candidate" || args[8] !== "--out") {
  console.error("usage: node compare.mjs --kit <kit> --expected-freeze <sha256> --reference <reference.json> --candidate <candidate.json> --out <report.json>");
  process.exit(64);
}
let report;
try {
  const kit = verifyKit(args[1], { expectedFreezeHash: args[3] });
  const reference = readJson(resolve(args[5]));
  const candidate = readJson(resolve(args[7]));
  report = compareBehaviorPackages({ reference, candidate, request: kit.request, freeze: kit.freeze, mapping: kit.mapping, normalizer: kit.normalizer });
} catch (error) {
  report = {
    protocol: "ruby-ts-differential/comparison-report-v1",
    status: "GATE_FAILED",
    error: {
      code: error.code ?? "GATE_FAILED",
      details: (error.details ?? []).map(({ code, schemaPath }) => ({ code: String(code).split(":")[0], schemaPath }))
    }
  };
}
writeFileSync(resolve(args[9]), strictStringify(report, true) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: report.status, summary: report.summary ?? null, error: report.error ?? null }));
process.exitCode = exitForComparison(report);
