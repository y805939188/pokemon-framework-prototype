#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { generateRequest } from "./lib/cases.mjs";
import { strictStringify } from "./lib/json.mjs";
import { validateRequest } from "./lib/protocol.mjs";

const usage = "usage: node generate-request.mjs --core <core.cjs> --out <request.json> [--check]";
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return null;
  return args[index + 1];
};
const corePath = option("--core");
const outPath = option("--out");
const check = args.includes("--check");
if (!corePath || !outPath || args.length !== (check ? 5 : 4)) {
  console.error(usage);
  process.exit(64);
}
const core = createRequire(import.meta.url)(resolve(corePath));
const request = validateRequest(generateRequest(core));
const output = strictStringify(request, true) + "\n";
const destination = resolve(outPath);
if (check) {
  if (!existsSync(destination) || readFileSync(destination, "utf8") !== output) {
    console.error("REQUEST_REGENERATION_MISMATCH");
    process.exit(1);
  }
} else if (existsSync(destination)) {
  if (readFileSync(destination, "utf8") !== output) {
    console.error("REQUEST_EXISTS_DIFFERENT; choose a new candidate path");
    process.exit(1);
  }
} else {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, output, { flag: "wx" });
}
console.log(JSON.stringify({ status: check ? "REQUEST_REGENERATION_MATCH" : "REQUEST_FROZEN", requestHash: request.requestHash, caseCount: request.cases.length }));
