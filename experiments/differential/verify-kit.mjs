#!/usr/bin/env node
import { verifyCliKit } from "./lib/kit.mjs";

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--kit" || args[2] !== "--expected-freeze") {
  console.error("usage: node verify-kit.mjs --kit <kit> --expected-freeze <sha256>");
  process.exit(64);
}
try {
  const kit = verifyCliKit(args[1], { expectedFreezeHash: args[3], entryURL: import.meta.url, entryRole: "verify-kit" });
  console.log(JSON.stringify({ status: "KIT_VERIFIED", freezeHash: kit.freeze.hash, requestHash: kit.request.requestHash, caseCount: kit.request.cases.length, artifactCount: kit.manifest.files.length, harness: kit.harness }));
} catch (error) {
  console.error(JSON.stringify({ status: "KIT_GATE_FAILED", error: { code: error.code ?? "KIT_GATE_FAILED", details: (error.details ?? []).map(({ code, schemaPath }) => ({ code: String(code).split(":")[0], schemaPath })) } }));
  process.exitCode = 2;
}
