import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalStringify, readJson, sha256File } from "./json.mjs";
import { validateSchema } from "./schema.mjs";
import { GateError, loadSchema, validateMapping, validateNormalizer, validateRequest } from "./protocol.mjs";
import { KIT_METADATA, KIT_PAYLOAD, safeKitPath } from "./kit-policy.mjs";
import { generateCoverage } from "./cases.mjs";
import { NODE_EXECUTION_POLICY } from "./process.mjs";

const requireKit = (condition, code) => { if (!condition) throw new GateError(code); };
const payloadSet = new Set(KIT_PAYLOAD);

/** Formal CLI only; builders and library self-tests deliberately keep using verifyKit. */
export function verifyCliKit(rootArgument, { expectedFreezeHash, entryURL, entryRole }) {
  requireKit(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, "NODE_LOADER_ENVIRONMENT_REJECTED");
  // The supported formal command is bare Node + the kit entry. This includes rejecting
  // --require/-r, --import and --loader, rather than claiming hashes over injected semantics.
  requireKit(process.execArgv.length === 0, "NODE_EXEC_ARGV_REJECTED");
  const entries = { "verify-kit": "verify-kit.mjs", "run-dual": "run-dual.mjs", compare: "compare.mjs" };
  requireKit(Object.hasOwn(entries, entryRole), "HARNESS_ENTRY_ROLE_REJECTED");
  const root = realpathSync(resolve(rootArgument));
  const moduleRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  requireKit(moduleRoot === root, "HARNESS_KIT_ROOT_MISMATCH");
  const entry = realpathSync(fileURLToPath(entryURL));
  requireKit(entry === realpathSync(join(root, entries[entryRole])), "HARNESS_ENTRY_ROOT_MISMATCH");
  // Also bind Node's launched main file, not a caller-supplied URL naming an unloaded entry.
  requireKit(process.argv[1] && realpathSync(resolve(process.argv[1])) === entry, "HARNESS_PROCESS_ENTRY_MISMATCH");
  // Every fixed relative dependency is in this exact, symlink-free verified payload.
  // Merely declaring an entry path or hashing a different --kit cannot satisfy this check.
  const kit = verifyKit(root, { expectedFreezeHash });
  const entrySha256 = sha256File(entry);
  requireKit(entrySha256 === kit.hashes.get(entries[entryRole]), "HARNESS_ENTRY_HASH_MISMATCH");
  return { ...kit, harness: {
    policy: "verified-kit-cli-v1", entryRole, entrySha256,
    manifestSha256: sha256File(join(root, "artifacts.manifest.json")),
    dependencyPolicy: "verified-relative-payload-v1",
    environmentPolicy: NODE_EXECUTION_POLICY,
    nodeOptions: "absent-or-empty", nodePath: "absent-or-empty", execArgv: "none"
  } };
}

function listFiles(root, relative = "") {
  const output = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    requireKit(safeKitPath(path), "KIT_UNSAFE_OR_SOURCE_PATH");
    const stat = lstatSync(join(root, path));
    requireKit(!stat.isSymbolicLink(), "KIT_SYMLINK_REJECTED");
    if (entry.isDirectory()) output.push(...listFiles(root, path));
    else {
      requireKit(entry.isFile(), "KIT_NONREGULAR_FILE_REJECTED");
      output.push(path);
    }
  }
  return output.sort();
}

function schemaCheck(schema, value, code) {
  const result = validateSchema(schema, value);
  if (!result.valid) throw new GateError(code, result.errors);
}

export function verifyKit(rootArgument, { expectedFreezeHash = null } = {}) {
  const root = resolve(rootArgument);
  const actual = listFiles(root);
  const expected = [...KIT_PAYLOAD, ...KIT_METADATA].sort();
  requireKit(actual.length === expected.length && actual.every((path, index) => path === expected[index]), "KIT_FILE_SET_MISMATCH");
  for (const path of actual) {
    if (!/\.(?:cjs|mjs|json|md)$/i.test(path)) throw new GateError("KIT_EXTENSION_REJECTED");
    const text = readFileSync(join(root, path), "utf8");
    const sourceMapMarker = "source" + "MappingURL=";
    const inlineMapMarker = "data:application/json;" + "base64";
    requireKit(!text.includes(sourceMapMarker) && !text.includes(inlineMapMarker), "KIT_SOURCE_MAP_REJECTED");
  }

  const manifestPath = join(root, "artifacts.manifest.json");
  const manifest = readJson(manifestPath, 1024 * 1024);
  schemaCheck(loadSchema("artifact-manifest.schema.json"), manifest, "KIT_MANIFEST_SCHEMA_REJECTED");
  const manifestPaths = manifest.files.map((file) => file.path).sort();
  requireKit(manifestPaths.length === KIT_PAYLOAD.length && manifestPaths.every((path, index) => path === KIT_PAYLOAD[index]), "KIT_MANIFEST_ALLOWLIST_MISMATCH");
  const hashes = new Map();
  for (const file of manifest.files) {
    requireKit(payloadSet.has(file.path) && safeKitPath(file.path), "KIT_MANIFEST_UNKNOWN_PAYLOAD");
    const path = join(root, file.path);
    const sha256 = sha256File(path);
    requireKit(statSync(path).size === file.bytes, "KIT_ARTIFACT_SIZE_MISMATCH");
    requireKit(sha256 === file.sha256, "KIT_ARTIFACT_HASH_MISMATCH");
    hashes.set(file.path, sha256);
  }
  const artifactsManifestSha256 = sha256File(manifestPath);
  const freezePath = join(root, "freeze.json");
  const freezeValue = readJson(freezePath, 1024 * 1024);
  schemaCheck(loadSchema("freeze.schema.json"), freezeValue, "KIT_FREEZE_SCHEMA_REJECTED");
  const freezeHash = sha256File(freezePath);
  requireKit(expectedFreezeHash === null || freezeHash === expectedFreezeHash, "KIT_EXTERNAL_FREEZE_HASH_MISMATCH");
  requireKit(freezeValue.artifactsManifestSha256 === artifactsManifestSha256, "KIT_MANIFEST_SEAL_MISMATCH");

  const request = validateRequest(readJson(join(root, "requests/wp30-r2.json")));
  const coverage = readJson(join(root, "requests/selection-coverage.json"));
  requireKit(canonicalStringify(coverage) === canonicalStringify(generateCoverage(request)), "KIT_COVERAGE_MISMATCH");
  const mapping = validateMapping(readJson(join(root, "config/mapping.json"), 1024 * 1024));
  const normalizer = validateNormalizer(readJson(join(root, "config/normalizer.json"), 1024 * 1024));
  requireKit(freezeValue.requestHash === request.requestHash, "KIT_REQUEST_FREEZE_MISMATCH");
  requireKit(freezeValue.normalizerVersion === normalizer.version && freezeValue.mappingVersion === mapping.version && freezeValue.selectionVersion === request.selectionVersion, "KIT_VERSION_FREEZE_MISMATCH");
  requireKit(freezeValue.mappingApprovalCount === mapping.approvedDifferences.length, "KIT_APPROVAL_COUNT_MISMATCH");
  const logical = {
    request: "requests/wp30-r2.json",
    selectionCoverage: "requests/selection-coverage.json",
    requestSchema: "schema/request.schema.json",
    rawResponseSchema: "schema/runner-response.schema.json",
    behaviorSchema: "schema/behavior-package.schema.json",
    runnerConfigSchema: "schema/runner-config.schema.json",
    handoffSchema: "schema/handoff.schema.json",
    artifactManifestSchema: "schema/artifact-manifest.schema.json",
    freezeSchema: "schema/freeze.schema.json",
    mappingSchema: "schema/mapping.schema.json",
    normalizerSchema: "schema/normalizer.schema.json",
    mapping: "config/mapping.json",
    normalizer: "config/normalizer.json"
  };
  for (const [name, path] of Object.entries(logical)) requireKit(freezeValue.hashes[name] === hashes.get(path), "KIT_LOGICAL_HASH_MISMATCH");
  return { root, request, mapping, normalizer, manifest, hashes, freeze: { value: freezeValue, hash: freezeHash } };
}
