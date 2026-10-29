#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateCoverage } from "./lib/cases.mjs";
import { readJson, strictStringify } from "./lib/json.mjs";
import { validateRequest } from "./lib/protocol.mjs";

const args = process.argv.slice(2);
if (![4, 5].includes(args.length) || args[0] !== "--request" || args[2] !== "--out" || (args.length === 5 && args[4] !== "--check")) {
  console.error("usage: node coverage.mjs --request <request.json> --out <selection-coverage.json> [--check]");
  process.exit(64);
}
const request = validateRequest(readJson(resolve(args[1])));
const coverage = generateCoverage(request);
const output = strictStringify(coverage, true) + "\n";
const destination = resolve(args[3]);
if (args.length === 5) {
  if (!existsSync(destination) || readFileSync(destination, "utf8") !== output) {
    console.error("COVERAGE_REGENERATION_MISMATCH");
    process.exit(1);
  }
} else if (existsSync(destination)) {
  if (readFileSync(destination, "utf8") !== output) {
    console.error("COVERAGE_EXISTS_DIFFERENT; choose a new candidate path");
    process.exit(1);
  }
} else {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, output, { flag: "wx" });
}
console.log(JSON.stringify({ status: args.length === 5 ? "COVERAGE_REGENERATION_MATCH" : "COVERAGE_FROZEN", requestHash: request.requestHash, caseCount: request.cases.length, percentage: coverage.percentage }));
