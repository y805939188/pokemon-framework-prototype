// Single registered suite; synthetic workers never count as original Ruby coverage.
import { before } from "node:test";

// Module setup awaits real child stdout. No synchronous test callback may starve
// those pipes (or their deadlines) while another module is still initializing.
let releaseBootstrap;
const bootstrapReady = new Promise(resolve => { releaseBootstrap = resolve; });
before(() => bootstrapReady);
try {
  for (const module of [
    "./test-infrastructure.mjs",
    "./test-runner.mjs",
    "./test-numeric-carrier.mjs",
    "./test-source-gates.mjs",
    "./test-pre54.mjs",
    "./test-pre54-integration.mjs"
  ]) await import(module);
} finally {
  releaseBootstrap(); // Initialization errors still reject the entry; never swallow them.
}
