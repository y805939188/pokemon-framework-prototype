import testing = require("@pokemon-framework/engine/testing");

// The testing harness publicly reports Node process versions/platform and therefore needs @types/node.
export type SmokeReport = Awaited<ReturnType<typeof testing.harness.runSmoke>>;
export function acceptReport(report: SmokeReport): SmokeReport { return report; }
