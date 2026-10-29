import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJson, strictStringify, JsonProtocolError } from "./json.mjs";

export const DEFAULT_LIMITS = Object.freeze({ timeoutMs: 30000, maxStdoutBytes: 16 * 1024 * 1024, maxStderrBytes: 1024 * 1024 });

function validateArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > 64) throw new Error("ARGV_ARRAY_REQUIRED");
  for (const arg of argv) {
    if (typeof arg !== "string" || arg.length === 0 || arg.includes("\0")) throw new Error("ARGV_NONEMPTY_STRING_REQUIRED");
  }
}

export async function executeArgv({ argv, cwd, env, role = "candidate", entryId = "ts-core-v1" }, limits = DEFAULT_LIMITS) {
  validateArgv(argv);
  if (!Number.isInteger(limits.timeoutMs) || limits.timeoutMs < 1) throw new Error("TIMEOUT_LIMIT_REQUIRED");
  if (!Number.isInteger(limits.maxStdoutBytes) || limits.maxStdoutBytes < 1) throw new Error("STDOUT_LIMIT_REQUIRED");
  if (!Number.isInteger(limits.maxStderrBytes) || limits.maxStderrBytes < 1) throw new Error("STDERR_LIMIT_REQUIRED");

  const startedAtUTC = new Date().toISOString();
  const started = performance.now();
  const detached = process.platform !== "win32";
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    env: env === undefined ? process.env : env,
    shell: false,
    detached,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  let outputLimitExceeded = false;
  let outputLimitStream = null;
  let spawnError = null;
  let terminated = false;
  const stdoutParts = [];
  const stderrParts = [];
  const stdoutHash = createHash("sha256");
  const stderrHash = createHash("sha256");

  const terminateGroup = () => {
    if (terminated || child.pid === undefined) return;
    terminated = true;
    try {
      if (detached) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        try { child.kill("SIGKILL"); } catch { /* close remains authoritative */ }
      }
    }
  };

  const timer = setTimeout(() => {
    timedOut = true;
    terminateGroup();
  }, limits.timeoutMs);

  const capture = (stream, parts, hash, limit, name) => (chunk) => {
    const buffer = Buffer.from(chunk);
    const previous = stream === "stdout" ? stdoutBytes : stderrBytes;
    const total = previous + buffer.length;
    if (stream === "stdout") stdoutBytes = total; else stderrBytes = total;
    hash.update(buffer);
    const remaining = Math.max(0, limit - previous);
    if (remaining > 0) parts.push(buffer.subarray(0, remaining));
    if (total > limit && !outputLimitExceeded) {
      outputLimitExceeded = true;
      outputLimitStream = name;
      terminateGroup();
    }
  };
  child.stdout.on("data", capture("stdout", stdoutParts, stdoutHash, limits.maxStdoutBytes, "stdout"));
  child.stderr.on("data", capture("stderr", stderrParts, stderrHash, limits.maxStderrBytes, "stderr"));
  child.on("error", (error) => { spawnError = { code: error.code ?? "SPAWN_ERROR" }; });

  const { exitCode: rawExitCode, signal: rawSignal } = await new Promise((resolve) => {
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
  clearTimeout(timer);
  const endedAtUTC = new Date().toISOString();
  const spawnFailed = spawnError !== null;
  const exitCode = spawnFailed ? null : (Number.isInteger(rawExitCode) && rawExitCode >= 0 ? rawExitCode : null);
  const signal = rawSignal ?? null;
  let status = "success";
  let infrastructureCode = null;
  if (spawnFailed) { status = "process-error"; infrastructureCode = `SPAWN_${spawnError.code}`; }
  else if (timedOut) { status = "timeout"; infrastructureCode = "TIMEOUT"; }
  else if (outputLimitExceeded) { status = "process-error"; infrastructureCode = `OUTPUT_LIMIT_${outputLimitStream.toUpperCase()}`; }
  else if (signal !== null) { status = "process-error"; infrastructureCode = "PROCESS_SIGNAL"; }
  else if (exitCode !== 0) { status = "process-error"; infrastructureCode = "PROCESS_NONZERO_EXIT"; }
  else if (stderrBytes !== 0) { status = "process-error"; infrastructureCode = "STDERR_NONEMPTY"; }

  return {
    role, entryId, argv: [...argv], cwd: cwd ?? null,
    startedAtUTC, endedAtUTC, durationMs: Math.max(0, Math.round(performance.now() - started)),
    exitCode, signal, timedOut, outputLimitExceeded, outputLimitStream,
    stdoutBytes, stderrBytes,
    stdoutSha256: stdoutHash.digest("hex"), stderrSha256: stderrHash.digest("hex"),
    retainedStdoutBytes: Buffer.concat(stdoutParts).length, retainedStderrBytes: Buffer.concat(stderrParts).length,
    stdout: Buffer.concat(stdoutParts), stderr: Buffer.concat(stderrParts),
    spawnError, status, infrastructureCode,
    response: null, protocolCode: null
  };
}

/** Infrastructure failures are authoritative; a valid JSON response cannot override them. */
export function attachRunnerResponse(execution, responseText, validateResponse) {
  if (execution.status !== "success") return execution;
  try {
    const parsed = parseJson(responseText);
    const validated = validateResponse(parsed);
    if (validated.status && validated.status !== "success") {
      execution.status = validated.status;
      execution.protocolCode = validated.code ?? "RUNNER_RESPONSE_REJECTED";
      return execution;
    }
    execution.response = parsed;
  } catch (error) {
    execution.status = "protocol-error";
    execution.protocolCode = error instanceof JsonProtocolError ? error.code : (error.code ?? "RUNNER_RESPONSE_REJECTED");
    execution.protocolDetails = error.details ?? null;
  }
  return execution;
}

export function publicExecution(execution, limits) {
  return {
    status: execution.status,
    startedAtUTC: execution.startedAtUTC,
    endedAtUTC: execution.endedAtUTC,
    durationMs: execution.durationMs,
    exitCode: execution.exitCode,
    signal: execution.signal,
    timeoutMs: limits.timeoutMs,
    maxStdoutBytes: limits.maxStdoutBytes,
    maxStderrBytes: limits.maxStderrBytes,
    stdoutBytes: execution.stdoutBytes,
    stderrBytes: execution.stderrBytes,
    stdoutSha256: execution.stdoutSha256,
    stderrSha256: execution.stderrSha256,
    timedOut: execution.timedOut,
    outputLimitExceeded: execution.outputLimitExceeded
  };
}

export function writePrivateExecution(execution, directory, limits) {
  mkdirSync(directory, { recursive: true });
  const exclusive = { flag: "wx" };
  writeFileSync(join(directory, "stdout.bin"), execution.stdout, exclusive);
  writeFileSync(join(directory, "stderr.bin"), execution.stderr, exclusive);
  if (execution.response !== null) writeFileSync(join(directory, "response.json"), strictStringify(execution.response, true) + "\n", exclusive);
  const receipt = {
    protocol: "ruby-ts-differential/private-execution-receipt-v1",
    role: execution.role,
    entryId: execution.entryId,
    argv: execution.argv,
    cwd: execution.cwd,
    limits,
    execution: publicExecution(execution, limits),
    retainedStdoutBytes: execution.retainedStdoutBytes,
    retainedStderrBytes: execution.retainedStderrBytes,
    stdoutTruncated: execution.stdoutBytes > execution.retainedStdoutBytes,
    stderrTruncated: execution.stderrBytes > execution.retainedStderrBytes,
    spawnError: execution.spawnError,
    infrastructureCode: execution.infrastructureCode,
    protocolCode: execution.protocolCode,
    protocolDetails: execution.protocolDetails ?? null
  };
  writeFileSync(join(directory, "receipt.json"), strictStringify(receipt, true) + "\n", exclusive);
  return receipt;
}
