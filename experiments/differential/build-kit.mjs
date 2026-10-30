#!/usr/bin/env node
import {isPre54, PROFILE, generatePre54Request} from './profiles/pre54-batch2.mjs';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateRequest } from "./lib/cases.mjs";
import { canonicalStringify, readJson, sha256File, strictStringify } from "./lib/json.mjs";
import { validateRequest } from "./lib/protocol.mjs";
import { KIT_PAYLOAD } from "./lib/kit-policy.mjs";
import { verifyKit } from "./lib/kit.mjs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const pre54 = args.length === 12 && args[10] === "--profile" && args[11] === PROFILE;
if ((!pre54 && args.length !== 10) || args[0] !== "--core" || args[2] !== "--runner" || args[4] !== "--out" || args[6] !== "--frozen-at" || args[8] !== "--source-metadata") {
  console.error("usage: node build-kit.mjs --core <core.cjs> --runner <ts-runner.mjs> --out <new-kit-dir> --frozen-at <UTC> --source-metadata <json>");
  process.exit(64);
}
if (process.version !== "v22.21.1") throw new Error("NODE_22.21.1_REQUIRED");
if (!Number.isFinite(Date.parse(args[7]))) throw new Error("FREEZE_TIME_INVALID");
const experiment = dirname(fileURLToPath(import.meta.url));
const worktree = resolve(experiment, "../..");
const out = resolve(args[5]);
if (existsSync(out) && readdirSync(out).length !== 0) throw new Error("KIT_OUTPUT_NOT_EMPTY");
mkdirSync(out, { recursive: true });
const copies = new Map([
  ["RUN-KIT.md", join(worktree, pre54 ? "docs/testing/differential-pre54-batch2.zh.md" : "docs/testing/differential-run-kit.zh.md")],
  ["compare.mjs", join(experiment, "compare.mjs")],
  ["config/mapping.json", join(experiment, pre54 ? "config/pre54-mapping.json" : "config/mapping.json")],
  ["config/normalizer.json", join(experiment, pre54 ? "config/pre54-normalizer.json" : "config/normalizer.json")],
  ["config/runners.template.json", join(experiment, pre54 ? "config/pre54-runners.template.json" : "config/runners.template.json")],
  ["core/core.cjs", resolve(args[1])],
  ["coverage.mjs", join(experiment, "coverage.mjs")],
  ["generate-request.mjs", join(experiment, "generate-request.mjs")],
  ["lib/cases.mjs", join(experiment, "lib/cases.mjs")],
  ["lib/compare.mjs", join(experiment, "lib/compare.mjs")],
  ["lib/json.mjs", join(experiment, "lib/json.mjs")],
  ["lib/kit-policy.mjs", join(experiment, "lib/kit-policy.mjs")],
  ["lib/kit.mjs", join(experiment, "lib/kit.mjs")],
  ["lib/normalize.mjs", join(experiment, "lib/normalize.mjs")],
  ["lib/process.mjs", join(experiment, "lib/process.mjs")],
  ["lib/protocol.mjs", join(experiment, "lib/protocol.mjs")],
  ["lib/schema.mjs", join(experiment, "lib/schema.mjs")],
  ["requests/selection-coverage.json", join(experiment, pre54 ? "requests/pre54-selection-coverage.json" : "requests/selection-coverage.json")],
  ["requests/wp30-r2.json", join(experiment, pre54 ? "requests/pre54-batch2.json" : "requests/wp30-r2.json")],
  ["run-dual.mjs", join(experiment, "run-dual.mjs")],
  ["runners/ts-runner.mjs", resolve(args[3])],
  ["schema/artifact-manifest.schema.json", join(experiment, "schema/artifact-manifest.schema.json")],
  ["schema/behavior-package.schema.json", join(experiment, "schema/behavior-package.schema.json")],
  ["schema/freeze.schema.json", join(experiment, "schema/freeze.schema.json")],
  ["schema/handoff.schema.json", join(experiment, "schema/handoff.schema.json")],
  ["schema/mapping.schema.json", join(experiment, "schema/mapping.schema.json")],
  ["schema/normalizer.schema.json", join(experiment, "schema/normalizer.schema.json")],
  ["schema/request.schema.json", join(experiment, "schema/request.schema.json")],
  ["schema/runner-config.schema.json", join(experiment, "schema/runner-config.schema.json")],
  ["schema/runner-response.schema.json", join(experiment, "schema/runner-response.schema.json")],
  ["verify-kit.mjs", join(experiment, "verify-kit.mjs")]
]);
for (const path of KIT_PAYLOAD) if (path === "profiles/pre54-batch2.mjs" || path.startsWith("schema/pre54-")) copies.set(path, join(experiment, path));
if (copies.size !== KIT_PAYLOAD.length || ![...copies.keys()].sort().every((path, index) => path === KIT_PAYLOAD[index])) throw new Error("BUILD_COPY_ALLOWLIST_MISMATCH");
for (const [relative, source] of copies) {
  if (!statSync(source).isFile()) throw new Error("KIT_SOURCE_NOT_REGULAR_FILE");
  const destination = join(out, relative);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination, 1);
}
const request = validateRequest(readJson(join(out, "requests/wp30-r2.json")));
const core = createRequire(import.meta.url)(resolve(args[1]));
const regenerated = pre54 ? generatePre54Request() : generateRequest(core);
if (isPre54(request) !== pre54) throw new Error("BUILD_PROFILE_MISMATCH");
if (canonicalStringify(request) !== canonicalStringify(regenerated)) throw new Error("KIT_CORE_REQUEST_DERIVATION_MISMATCH");
const sourceMetadata = readJson(resolve(args[9]), 1024 * 1024);
const files = KIT_PAYLOAD.map((path) => ({ path, bytes: statSync(join(out, path)).size, sha256: sha256File(join(out, path)) }));
const manifest = {
  protocol: "ruby-ts-differential/artifact-manifest-v1",
  builtAtUTC: args[7],
  nodeVersion: "v22.21.1",
  viteVersion: "8.3.1",
  typescriptVersion: "7.0.2",
  source: sourceMetadata,
  files
};
writeFileSync(join(out, "artifacts.manifest.json"), strictStringify(manifest, true) + "\n", { flag: "wx" });
const logical = {
  request: "requests/wp30-r2.json",
  selectionCoverage: "requests/selection-coverage.json",
  requestSchema: pre54 ? "schema/pre54-request.schema.json" : "schema/request.schema.json",
  rawResponseSchema: "schema/runner-response.schema.json",
  behaviorSchema: pre54 ? "schema/pre54-behavior-package.schema.json" : "schema/behavior-package.schema.json",
  runnerConfigSchema: "schema/runner-config.schema.json",
  handoffSchema: "schema/handoff.schema.json",
  artifactManifestSchema: "schema/artifact-manifest.schema.json",
  freezeSchema: pre54 ? "schema/pre54-freeze.schema.json" : "schema/freeze.schema.json",
  mappingSchema: pre54 ? "schema/pre54-mapping.schema.json" : "schema/mapping.schema.json",
  normalizerSchema: pre54 ? "schema/pre54-normalizer.schema.json" : "schema/normalizer.schema.json",
  mapping: "config/mapping.json",
  normalizer: "config/normalizer.json"
};
const hashes = Object.fromEntries(Object.entries(logical).map(([name, path]) => [name, sha256File(join(out, path))]));
const freeze = {
  protocol: "ruby-ts-differential/freeze-v3",
  frozenAtUTC: args[7],
  schemaVersion: pre54 ? "pre54-batch2-schema-v1" : "wp30-r2-schema-v3",
  normalizerVersion: pre54 ? "pre54-batch2-normalizer-v1" : "wp30-r2-normalizer-v2",
  mappingVersion: pre54 ? "pre54-batch2-mapping-v1" : "wp30-r2-mapping-v1",
  selectionVersion: pre54 ? PROFILE : "wp30-r2-v1",
  randomPolicy: "seed-null-draws-0-otherwise-block-v1",
  mappingApprovalCount: 0,
  requestHash: request.requestHash,
  artifactsManifestSha256: sha256File(join(out, "artifacts.manifest.json")),
  hashes
};
writeFileSync(join(out, "freeze.json"), strictStringify(freeze, true) + "\n", { flag: "wx" });
const verified = verifyKit(out);
console.log(JSON.stringify({ status: "KIT_BUILT_AND_VERIFIED", freezeHash: verified.freeze.hash, requestHash: request.requestHash, caseCount: request.cases.length, artifactCount: files.length, coreSHA256: sha256File(resolve(args[1])), runnerSHA256: sha256File(resolve(args[3])) }));
