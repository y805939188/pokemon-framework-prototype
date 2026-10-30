#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, sha256File, strictStringify } from "./lib/json.mjs";
import { validateSchema } from "./lib/schema.mjs";
import { gateReferenceMetadata, loadSchema, makeHandoff, validateRawResponse, validateRequest } from "./lib/protocol.mjs";
import { attachRunnerResponse, executeArgv, writePrivateExecution } from "./lib/process.mjs";
import { makeBehaviorPackage } from "./lib/normalize.mjs";
import { verifyCliKit } from "./lib/kit.mjs";

const configReject = (code) => {
  console.error(JSON.stringify({ status: "CONFIG_REJECTED", code }));
  process.exit(2);
};
const candidateMetadataFromKit = (kit) => ({
  source: {
    ...kit.manifest.source,
    tag: null,
    files: [
      { role: "core-bundle", sha256: kit.hashes.get("core/core.cjs") },
      { role: "runner", sha256: kit.hashes.get("runners/ts-runner.mjs") }
    ]
  },
  runtime: {
    name: "node",
    version: process.version,
    dependencies: [
      { name: "node", version: process.version },
      { name: "vite", version: kit.manifest.viteVersion },
      { name: "typescript", version: kit.manifest.typescriptVersion }
    ]
  }
});
const isContained = (ancestor, path) => {
  const rel = relative(ancestor, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
const directoryIdentity = (path) => {
  const stats = statSync(path, { bigint: true });
  return stats.ino === 0n ? null : `${stats.dev}:${stats.ino}`;
};
const ancestorIdentities = (path) => {
  const identities = new Set();
  let current = path;
  while (true) {
    const identity = directoryIdentity(current);
    if (identity !== null) identities.add(identity);
    const parent = dirname(current);
    if (parent === current) return identities;
    current = parent;
  }
};
const isPhysicallyContained = (ancestor, path) => {
  const identity = directoryIdentity(ancestor);
  return identity !== null && ancestorIdentities(path).has(identity);
};

const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== "--kit" || args[2] !== "--expected-freeze" || args[4] !== "--config") {
  console.error("usage: node run-dual.mjs --kit <kit> --expected-freeze <sha256> --config <private-runners.json>");
  process.exit(64);
}
try {
const kit = verifyCliKit(args[1], { expectedFreezeHash: args[3], entryURL: import.meta.url, entryRole: "run-dual" });
const configPath = resolve(args[5]);
const config = readJson(configPath, 1024 * 1024);
const configSchema = validateSchema(loadSchema("runner-config.schema.json"), config);
if (!configSchema.valid) {
  console.error(JSON.stringify({ status: "CONFIG_REJECTED", details: configSchema.errors.map(({ code, schemaPath }) => ({ code: code.split(":")[0], schemaPath })) }));
  process.exit(2);
}
if (config.freezeHash !== kit.freeze.hash) throw new Error("CONFIG_FREEZE_HASH_MISMATCH");
const configuredRequestPath = resolve(dirname(configPath), config.request);
const configuredRequest = validateRequest(readJson(configuredRequestPath));
if (configuredRequest.requestHash !== kit.request.requestHash || sha256File(configuredRequestPath) !== kit.freeze.value.hashes.request) throw new Error("CONFIG_REQUEST_NOT_FROZEN_KIT_INPUT");
const roles = config.runners.map((runner) => runner.role).sort();
if (roles.join(",") !== "candidate,reference") throw new Error("CONFIG_TWO_DISTINCT_ROLES_REQUIRED");
for (const runner of config.runners) {
  if (runner.entryId !== (runner.role === "reference" ? "reference-rules-v1" : "ts-core-v1")) throw new Error("CONFIG_ENTRY_ROLE_MISMATCH");
}
// The same closed source/version check is repeated by the independent comparator.
// Non-placeholder metadata alone is not proof that the original source was actually loaded.
gateReferenceMetadata(config.runners.find((runner) => runner.role === "reference").publicMetadata, kit.request, kit.manifest);

// The fixed TS side must execute the verified kit itself. This preflight precedes either child, including reference.
const candidateRunner = config.runners.find((runner) => runner.role === "candidate");
const expectedCandidateArgv = [process.execPath, "runners/ts-runner.mjs", "--request", "requests/wp30-r2.json", "--core", "core/core.cjs"];
if (process.version !== kit.manifest.nodeVersion || candidateRunner.argv.length !== expectedCandidateArgv.length || !expectedCandidateArgv.every((arg, index) => candidateRunner.argv[index] === arg)) {
  configReject("CANDIDATE_COMMAND_MISMATCH");
}
let candidateCwd;
try {
  candidateCwd = realpathSync(resolve(dirname(configPath), candidateRunner.cwd));
} catch {
  configReject("CANDIDATE_CWD_MISMATCH");
}
if (candidateCwd !== realpathSync(kit.root)) configReject("CANDIDATE_CWD_MISMATCH");
const verifiedCandidateMetadata = candidateMetadataFromKit(kit);

const prepareDirectory = (pathArgument) => {
  const path = resolve(dirname(configPath), pathArgument);
  mkdirSync(path, { recursive: true });
  return path;
};
const privateDirectory = prepareDirectory(config.privateDirectory);
const publicDirectory = prepareDirectory(config.publicDirectory);
// Both directories now exist, so realpath also covers symlink aliases and previously missing leaf components.
const canonicalPrivate = realpathSync(privateDirectory);
const canonicalPublic = realpathSync(publicDirectory);
if (isContained(canonicalPrivate, canonicalPublic) || isContained(canonicalPublic, canonicalPrivate) || isPhysicallyContained(canonicalPrivate, canonicalPublic) || isPhysicallyContained(canonicalPublic, canonicalPrivate)) configReject("OUTPUT_DIRECTORIES_OVERLAP");
if ((existsSync(privateDirectory) && readdirSync(privateDirectory).length !== 0) || (existsSync(publicDirectory) && readdirSync(publicDirectory).length !== 0)) throw new Error("RUN_OUTPUT_DIRECTORY_NOT_EMPTY");

const summary = [];
const behaviorArtifacts = [];
let exitCode = 0;
let publicationBlocked = false;
for (const runner of config.runners) {
  const execution = await executeArgv({
    argv: runner.argv,
    cwd: resolve(dirname(configPath), runner.cwd),
    role: runner.role,
    entryId: runner.entryId
  }, config.limits);
  attachRunnerResponse(execution, execution.stdout.toString("utf8"), (response) => validateRawResponse(response, configuredRequest));
  const privateRoleDirectory = resolve(privateDirectory, runner.role);
  writePrivateExecution(execution, privateRoleDirectory, config.limits);
  let behavior;
  try {
    const publicMetadata = runner.role === "candidate" ? verifiedCandidateMetadata : runner.publicMetadata;
    behavior = makeBehaviorPackage({ execution, request: configuredRequest, freezeHash: kit.freeze.hash, publicMetadata, limits: config.limits, manifest: kit.manifest });
  } catch (error) {
    writeFileSync(resolve(privateRoleDirectory, "sanitize-error.json"), strictStringify({ code: error.code ?? "SANITIZE_OR_METADATA_REJECTED" }, true) + "\n", { flag: "wx" });
    publicationBlocked = true;
    exitCode = 1;
    summary.push({ role: runner.role, entryId: runner.entryId, status: "blocked", infrastructureCode: execution.infrastructureCode, protocolCode: execution.protocolCode, sanitizeCode: error.code ?? "SANITIZE_OR_METADATA_REJECTED" });
    continue;
  }
  const publicPath = resolve(publicDirectory, `${runner.role}.json`);
  writeFileSync(publicPath, strictStringify(behavior, true) + "\n", { flag: "wx" });
  behaviorArtifacts.push({ role: runner.role, entryId: runner.entryId, sha256: sha256File(publicPath) });
  if (behavior.execution.status !== "success") exitCode = 1;
  summary.push({ role: runner.role, entryId: runner.entryId, status: behavior.execution.status, infrastructureCode: execution.infrastructureCode, protocolCode: execution.protocolCode });
}
let handoffSHA256 = null;
if (!publicationBlocked && readdirSync(publicDirectory).sort().join(",") !== "candidate.json,reference.json") {
  publicationBlocked = true;
  exitCode = 1;
  summary.push({ role: "publication", entryId: "publication-file-set", status: "blocked", sanitizeCode: "PUBLIC_FILE_SET_MISMATCH" });
}
if (!publicationBlocked) {
  const handoff = makeHandoff({ request: configuredRequest, freezeHash: kit.freeze.hash, artifacts: behaviorArtifacts, producer: kit.harness });
  const handoffPath = resolve(publicDirectory, "handoff.json");
  writeFileSync(handoffPath, strictStringify(handoff, true) + "\n", { flag: "wx" });
  handoffSHA256 = sha256File(handoffPath);
}
writeFileSync(resolve(privateDirectory, "run-summary.json"), strictStringify({
  protocol: "ruby-ts-differential/private-dual-run-v1",
  kitRoot: kit.root,
  configPath,
  harnessEntryPath: fileURLToPath(import.meta.url),
  harness: kit.harness,
  requestPath: configuredRequestPath,
  requestHash: configuredRequest.requestHash,
  freezeHash: kit.freeze.hash,
  handoffSHA256,
  publicationBlocked,
  runners: summary,
  rubyExecution: "OBSERVER_ONLY"
}, true) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: publicationBlocked ? "RUN_BLOCKED" : (exitCode === 0 ? "RUNNERS_COMPLETE" : "RUN_FAILED"), requestHash: configuredRequest.requestHash, freezeHash: kit.freeze.hash, handoffSHA256, harness: kit.harness, runners: summary }));
process.exitCode = exitCode;
} catch (error) {
  const candidateCode = error.code ?? error.message;
  const code = typeof candidateCode === "string" && /^[A-Z][A-Z0-9_]{1,95}$/.test(candidateCode) ? candidateCode : "RUN_CONFIGURATION_REJECTED";
  console.error(JSON.stringify({ status: "CONFIG_REJECTED", code }));
  process.exitCode = 2;
}
