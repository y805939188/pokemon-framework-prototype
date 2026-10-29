// INFRASTRUCTURE_SELF_TEST_ONLY_NOT_RUBY. Never use this file as reference behavior or coverage.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readJson, strictStringify } from "../lib/json.mjs";

const [mode, requestPath, markerPath] = process.argv.slice(2);
const request = requestPath ? readJson(requestPath) : null;
const response = (raw = 1) => ({
  protocol: "ruby-ts-differential/runner-response-v1",
  requestHash: request.requestHash,
  random: { seed: null, drawCount: 0, draws: [] },
  cases: request.cases.map((testCase) => ({ caseId: testCase.caseId, requestHash: testCase.requestHash, outcome: { kind: "value", class: null, raw } }))
});
const output = (value) => process.stdout.write(strictStringify(value) + "\n");
const hang = () => { setInterval(() => {}, 1000); };

switch (mode) {
  case "success": output(response()); break;
  case "success-two": output(response(2)); break;
  case "random-success": { const value = response(); value.random = { seed: null, drawCount: 1, draws: [{ order: 0, bound: 2, value: 1 }] }; output(value); break; }
  case "nonzero-valid-response": output(response()); process.exitCode = 7; break;
  case "timeout-valid-response": output(response()); hang(); break;
  case "output-valid-response": output(response()); process.stdout.write("x".repeat(4 * 1024 * 1024)); break;
  case "stderr-limit": output(response()); process.stderr.write("x".repeat(4096)); break;
  case "stderr-valid-response": output(response()); process.stderr.write("infrastructure warning\n"); break;
  case "valid-json-nonzero": process.stdout.write("{}\n"); process.exitCode = 7; break;
  case "valid-json-signal": process.stdout.write("{}\n", () => process.kill(process.pid, "SIGTERM")); break;
  case "crash": process.exitCode = 3; break;
  case "uncaught": throw new Error("INFRASTRUCTURE_SELF_TEST_CRASH");
  case "timeout": process.stdout.write("{}\n"); hang(); break;
  case "timeout-tree": {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, "grandchild", "", markerPath], { stdio: "ignore" });
    if (!child.pid) throw new Error("SELF_TEST_CHILD_NOT_STARTED");
    process.stdout.write("{}\n");
    hang();
    break;
  }
  case "grandchild":
    writeFileSync(markerPath, String(process.pid));
    setInterval(() => writeFileSync(markerPath, String(process.pid)), 20);
    break;
  case "output-limit": process.stdout.write("x".repeat(4096)); break;
  case "stderr": process.stdout.write("{}\n"); process.stderr.write("infrastructure stderr\n"); break;
  case "empty": break;
  case "invalid": process.stdout.write("not-json\n"); break;
  case "multiple": process.stdout.write("{}\n{}\n"); break;
  case "logging": process.stdout.write("log\n{}\n"); break;
  case "duplicate": {
    const value = response();
    value.cases[1] = value.cases[0];
    output(value);
    break;
  }
  case "missing": { const value = response(); value.cases.pop(); output(value); break; }
  case "extra": {
    const value = response();
    value.cases.push({ ...value.cases[0], caseId: "infrastructure-extra-case" });
    output(value);
    break;
  }
  case "wrong-request": { const value = response(); value.requestHash = "0".repeat(64); output(value); break; }
  case "schema-error": { const value = response(); value.cases[0].unexpected = true; output(value); break; }
  case "serialize-nan":
  case "serialize-infinity":
  case "serialize-undefined":
  case "serialize-bigint":
  case "serialize-cycle": {
    let value;
    if (mode === "serialize-nan") value = Number.NaN;
    if (mode === "serialize-infinity") value = Number.POSITIVE_INFINITY;
    if (mode === "serialize-undefined") value = { omitted: undefined };
    if (mode === "serialize-bigint") value = { number: 1n };
    if (mode === "serialize-cycle") { value = {}; value.self = value; }
    try {
      strictStringify({ value });
      throw new Error("SERIALIZATION_NEGATIVE_UNEXPECTEDLY_ACCEPTED");
    } catch (error) {
      if (!error.code?.startsWith("JSON_")) throw error;
      output({ protocol: "ruby-ts-differential/runner-response-v1", requestHash: request?.requestHash ?? null, error: { kind: "SERIALIZATION_ERROR", code: error.code } });
    }
    break;
  }
  default: throw new Error("UNKNOWN_INFRASTRUCTURE_SELF_TEST_MODE");
}
