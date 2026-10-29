import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readJson, strictStringify } from "../lib/json.mjs";
import { validateRequest } from "../lib/protocol.mjs";

type Curve = "medium" | "fast" | "slow" | "parabolic" | "erratic" | "fluctuating";
type Checked = { ok: true; value: number } | { ok: false; error: "invalid-level" };
type FriendshipPlan = { status: "ready" | "refused"; [key: string]: unknown };
type TestCase = {
  caseId: string;
  requestHash: string;
  operation: string;
  input: Record<string, any>;
};
type Request = { requestHash: string; cases: TestCase[] };
type RawOutcome = { kind: "value" | "error-object" | "raised"; class: string | null; raw: unknown };
type Core = {
  growth: {
    minimumExpForLevel(curve: Curve, level: unknown, maxLevel: number): Checked;
    maxExp(curve: Curve, maxLevel: number): number;
    addExp(curve: Curve, current: number, amount: number, maxLevel: number): number;
    levelForExp(curve: Curve, exp: number, maxLevel: number): number;
  };
  friendship: {
    planFriendshipChange(member: Record<string, unknown>, method: string, context: Record<string, unknown>): FriendshipPlan;
    deriveAffection(member: Record<string, unknown>): FriendshipPlan;
  };
};

const value = (raw: unknown): RawOutcome => ({ kind: "value", class: null, raw });
const errorObject = (raw: unknown): RawOutcome => ({ kind: "error-object", class: null, raw });
const numeric = (input: Record<string, any>, key: string): number => input[key] as number;
const curve = (input: Record<string, any>): Curve => input.curve as Curve;
const maxLevel = (input: Record<string, any>): number => numeric(input, "maxLevel");

function raised(error: unknown): RawOutcome {
  const constructorName = (error as { constructor?: { name?: unknown } } | null)?.constructor?.name;
  const className = typeof constructorName === "string" ? constructorName : (typeof error === "string" ? "String" : "Error");
  const raw = {
    name: typeof (error as { name?: unknown })?.name === "string" ? (error as { name: string }).name : className,
    message: typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : String(error),
    stack: typeof (error as { stack?: unknown })?.stack === "string" ? (error as { stack: string }).stack : null
  };
  return { kind: "raised", class: className, raw };
}

function friendshipResult(result: FriendshipPlan): RawOutcome {
  return result.status === "refused" ? errorObject(result) : value(result);
}

function execute(testCase: TestCase, core: Core): RawOutcome {
  const input = testCase.input;
  try {
    switch (testCase.operation) {
      case "growth.minimumExpForLevel": {
        const result = core.growth.minimumExpForLevel(curve(input), input.level, maxLevel(input));
        return result.ok ? value(result.value) : errorObject(result);
      }
      case "growth.maximumExp":
        return value(core.growth.maxExp(curve(input), maxLevel(input)));
      case "growth.addExp":
        return value(core.growth.addExp(curve(input), numeric(input, "current"), numeric(input, "amount"), maxLevel(input)));
      case "growth.addExpSequence": {
        let after = numeric(input, "current");
        const steps: number[] = [];
        for (const amount of input.amounts as number[]) {
          after = core.growth.addExp(curve(input), after, amount, maxLevel(input));
          steps.push(after);
        }
        return value({ after, steps });
      }
      case "growth.levelFromExp":
        return value(core.growth.levelForExp(curve(input), numeric(input, "exp"), maxLevel(input)));
      case "friendship.change": {
        const result = core.friendship.planFriendshipChange({
          friendship: input.friendship,
          origin: { map: input.originMap },
          ball: input.ball,
          item: input.item
        }, input.method as string, { mapId: input.mapId, AFFECTION_EFFECTS: input.AFFECTION_EFFECTS });
        return friendshipResult(result);
      }
      case "friendship.changeSequence": {
        let after = numeric(input, "initial");
        const steps: FriendshipPlan[] = [];
        for (const method of input.steps as string[]) {
          const result = core.friendship.planFriendshipChange({
            friendship: after,
            origin: { map: input.originMap },
            ball: input.ball,
            item: input.item
          }, method, { mapId: input.mapId, AFFECTION_EFFECTS: input.AFFECTION_EFFECTS });
          if (result.status !== "ready") throw new Error("FRIENDSHIP_SEQUENCE_REFUSED");
          steps.push(result);
          after = result.after as number;
        }
        return value({ steps, after });
      }
      case "friendship.affection":
        return friendshipResult(core.friendship.deriveAffection({ friendship: input.friendship }));
      default:
        throw new Error("PROTOCOL_OPERATION_UNKNOWN");
    }
  } catch (error) {
    return raised(error);
  }
}

function failure(requestHash: string | null, kind: "SERIALIZATION_ERROR" | "PROTOCOL_ERROR", code: string): string {
  const safeCode = /^[A-Z][A-Z0-9_]{1,80}$/.test(code) ? code : "RUNNER_PROTOCOL_FAILURE";
  return strictStringify({ protocol: "ruby-ts-differential/runner-response-v1", requestHash, error: { kind, code: safeCode } }) + "\n";
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--request" || args[2] !== "--core") {
    console.error("usage: ts-runner.mjs --request <request.json> --core <core.cjs>");
    process.exitCode = 64;
    return;
  }
  // A missing/incompatible core is a real process failure, never a behavioral value.
  const core = createRequire(import.meta.url)(resolve(args[3]!)) as Core;
  let request: Request;
  try {
    const parsed = readJson(resolve(args[1]!));
    request = validateRequest(parsed) as Request;
  } catch (error) {
    process.stdout.write(failure(null, "PROTOCOL_ERROR", (error as { code?: string }).code ?? "REQUEST_READ_FAILED"));
    return;
  }
  const response = {
    protocol: "ruby-ts-differential/runner-response-v1",
    requestHash: request.requestHash,
    random: { seed: null, drawCount: 0, draws: [] },
    cases: request.cases.map((testCase) => ({ caseId: testCase.caseId, requestHash: testCase.requestHash, outcome: execute(testCase, core) }))
  };
  try {
    process.stdout.write(strictStringify(response) + "\n");
  } catch (error) {
    process.stdout.write(failure(request.requestHash, "SERIALIZATION_ERROR", (error as { code?: string }).code ?? "SERIALIZATION_FAILED"));
  }
}

main();
