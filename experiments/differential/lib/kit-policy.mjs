export const KIT_PAYLOAD = Object.freeze([
  "profiles/pre54-batch2.mjs",
  "schema/pre54-request.schema.json",
  "schema/pre54-behavior-package.schema.json",
  "schema/pre54-freeze.schema.json",
  "schema/pre54-mapping.schema.json",
  "schema/pre54-normalizer.schema.json",
  "RUN-KIT.md",
  "compare.mjs",
  "config/mapping.json",
  "config/normalizer.json",
  "config/runners.template.json",
  "core/core.cjs",
  "coverage.mjs",
  "generate-request.mjs",
  "lib/cases.mjs",
  "lib/compare.mjs",
  "lib/json.mjs",
  "lib/kit-policy.mjs",
  "lib/kit.mjs",
  "lib/normalize.mjs",
  "lib/process.mjs",
  "lib/protocol.mjs",
  "lib/schema.mjs",
  "requests/selection-coverage.json",
  "requests/wp30-r2.json",
  "run-dual.mjs",
  "runners/ts-runner.mjs",
  "schema/artifact-manifest.schema.json",
  "schema/behavior-package.schema.json",
  "schema/freeze.schema.json",
  "schema/handoff.schema.json",
  "schema/mapping.schema.json",
  "schema/normalizer.schema.json",
  "schema/request.schema.json",
  "schema/runner-config.schema.json",
  "schema/runner-response.schema.json",
  "verify-kit.mjs"
].sort());

export const KIT_METADATA = Object.freeze(["artifacts.manifest.json", "freeze.json"]);

export function safeKitPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  if (/\.(?:tsx?|mts|cts|map)$/i.test(path)) return false;
  return true;
}
