// Test-only build/setup. No reference executable is invoked by this module.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyKit } from "./lib/kit.mjs";

export const experimentRoot = dirname(fileURLToPath(import.meta.url));
export const worktreeRoot = resolve(experimentRoot, "../..");
export const testRoot = process.env.DIFFERENTIAL_TEST_ROOT ? resolve(process.env.DIFFERENTIAL_TEST_ROOT) : join(worktreeRoot, "build", `differential-tests-${process.pid}-${Date.now()}`);
mkdirSync(testRoot, { recursive: true });
const commandReceipts = [];
function run(name, argv, cwd = worktreeRoot, env = process.env) {
  const result = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
  commandReceipts.push({ name, argv, cwd, status: result.status, signal: result.signal, error: result.error?.code ?? null });
  writeFileSync(join(testRoot, `${name}.log`), `status=${result.status} signal=${result.signal} error=${result.error?.code ?? ""}\n${result.stdout ?? ""}${result.stderr ?? ""}`, { flag: "wx" });
  assert.equal(result.status, 0, `${name}: ${result.stdout ?? ""}${result.stderr ?? ""}${result.error ?? ""}`);
  return result;
}
assert.equal(process.version, "v22.21.1", "the accepted Node runtime is required; do not skip");
run("selftest-core-build", [process.execPath, "node_modules/vite/bin/vite.js", "build", "-c", "vite.engine.config.mts"], join(worktreeRoot, "src"), { ...process.env, ENGINE_ENTRY: "core" });
const runnerOutput = join(testRoot, "compiled");
run("selftest-tsc", [process.execPath, join(worktreeRoot, "src/node_modules/typescript/bin/tsc"), "-p", join(experimentRoot, "tsconfig.runner.json"), "--noEmit", "false", "--outDir", runnerOutput]);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: worktreeRoot, encoding: "utf8" }).trim();
const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: worktreeRoot, encoding: "utf8" }).trim();
const sourceMetadata = { commit, tree, dirty: true };
const sourceMetadataPath = join(testRoot, "source-metadata.json");
writeFileSync(sourceMetadataPath, JSON.stringify(sourceMetadata), { flag: "wx" });
const corePath = join(worktreeRoot, "js/engine/build/core.cjs");
const runnerPath = join(runnerOutput, "runners/ts-runner.mjs");
run("selftest-kit-build", [process.execPath, join(experimentRoot, "build-kit.mjs"), "--core", corePath, "--runner", runnerPath, "--out", join(testRoot, "kit"), "--frozen-at", "2026-10-29T00:00:00Z", "--source-metadata", sourceMetadataPath]);
export const kit = verifyKit(join(testRoot, "kit"));
writeFileSync(join(testRoot, "setup-receipt.json"), JSON.stringify({ protocol: "infrastructure-self-test-setup-v1", rubyExecution: "NOT_RUN", commands: commandReceipts, freezeHash: kit.freeze.hash }, null, 2), { flag: "wx" });

export const requestPath = join(testRoot, "kit/requests/wp30-r2.json");
export const fixturePath = join(experimentRoot, "test-fixtures/child.mjs");
export const candidateMetadata = () => ({
  source: {
    commit: kit.manifest.source.commit,
    tree: kit.manifest.source.tree,
    tag: null,
    dirty: kit.manifest.source.dirty,
    files: [
      { role: "core-bundle", sha256: kit.hashes.get("core/core.cjs") },
      { role: "runner", sha256: kit.hashes.get("runners/ts-runner.mjs") }
    ]
  },
  runtime: { name: "node", version: process.version, dependencies: [{ name: "node", version: process.version }, { name: "vite", version: "8.3.1" }, { name: "typescript", version: "7.0.2" }] }
});
export const syntheticReferenceMetadata = () => ({
  source: {
    commit: "8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b", tree: null, tag: "v21.1", dirty: null,
    files: [{ role: "growth-rules", sha256: "0".repeat(64) }, { role: "friendship-rules", sha256: "0".repeat(64) }, { role: "adapter", sha256: "0".repeat(64) }]
  },
  runtime: { name: "reference", version: "INFRASTRUCTURE-SELF-TEST", dependencies: [{ name: "reference-runtime", version: "INFRASTRUCTURE-SELF-TEST" }, { name: "adapter", version: "1" }] }
});
