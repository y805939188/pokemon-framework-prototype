import { canonicalStringify, sha256Json } from "./json.mjs";
import { sealRequest } from "./protocol.mjs";

export const CURVES = Object.freeze(["medium", "fast", "slow", "parabolic", "erratic", "fluctuating"]);
export const MAX_LEVELS = Object.freeze([50, 100, 101]);
export const FRIENDSHIP_METHODS = Object.freeze(["walking", "levelup", "groom", "evberry", "vitamin", "wing", "machine", "battleitem", "faint", "faintbad", "powder", "energyroot", "revivalherb"]);
export const FRIENDSHIP_VALUES = Object.freeze([0, 99, 100, 149, 150, 178, 179, 199, 200, 229, 230, 254, 255]);
const prefixes = {
  "growth.minimumExpForLevel": "growth-min",
  "growth.maximumExp": "growth-max",
  "growth.addExp": "growth-add",
  "growth.addExpSequence": "growth-addseq",
  "growth.levelFromExp": "growth-level",
  "friendship.change": "friendship-change",
  "friendship.changeSequence": "friendship-sequence",
  "friendship.affection": "friendship-affection"
};

export function generateRequest(core) {
  for (const name of ["minExp", "maxExp"]) {
    if (typeof core?.growth?.[name] !== "function") throw new Error(`CORE_INPUT_DERIVATION_MISSING_${name}`);
  }
  const cases = [];
  const dedup = new Set();
  const add = (operation, input, domain = "common", additionalClass = "none") => {
    const capability = operation.split(".")[0];
    const key = canonicalStringify({ operation, input, domain, additionalClass });
    if (dedup.has(key)) return;
    dedup.add(key);
    const ordinal = String(cases.length + 1).padStart(5, "0");
    const identity = sha256Json({ operation, input, domain, additionalClass }).slice(0, 12);
    cases.push({ caseId: `${prefixes[operation]}-${ordinal}-${identity}`, requestHash: "", capability, operation, domain, additionalClass, input });
  };
  const minimum = (curve, maxLevel, level, domain = "common", additionalClass = "none") => add("growth.minimumExpForLevel", { curve, maxLevel, level }, domain, additionalClass);
  const levelFromExp = (curve, maxLevel, exp, domain = "common", additionalClass = "none") => add("growth.levelFromExp", { curve, maxLevel, exp }, domain, additionalClass);

  // Full default tables plus the fixed configuration seams. Values are inputs, never expected outcomes.
  for (const curve of CURVES) {
    for (let level = 1; level <= 100; level++) minimum(curve, 100, level);
    for (const maxLevel of MAX_LEVELS) {
      for (const level of [1, 49, 50, 51, 99, 100, 101, 102]) minimum(curve, maxLevel, level);
      add("growth.maximumExp", { curve, maxLevel });
    }
  }

  for (const curve of CURVES) for (const maxLevel of MAX_LEVELS) {
    const maximum = core.growth.maxExp(curve, maxLevel);
    for (const [current, amount] of [
      [0, 0], [0, 1], [Math.floor(maximum / 2), 1], [maximum - 1, 1], [maximum, 1],
      [maximum - 1, 2], [maximum, 1000], [0, -1], [1, -1], [maximum, -1], [maximum, -maximum]
    ]) add("growth.addExp", { curve, maxLevel, current, amount });
    add("growth.addExpSequence", { curve, maxLevel, current: Math.max(0, maximum - 1), amounts: [1, 1, 1] });
    add("growth.addExpSequence", { curve, maxLevel, current: 0, amounts: [-1, -1] });
  }

  const thresholdLevels = [1, 2, 15, 16, 35, 36, 37, 49, 50, 51, 67, 68, 69, 97, 98, 99, 100, 101];
  for (const curve of CURVES) for (const maxLevel of MAX_LEVELS) {
    const levels = new Set([...thresholdLevels, maxLevel - 1, maxLevel, maxLevel + 1]);
    for (const level of levels) {
      if (!Number.isInteger(level) || level < 1) continue;
      minimum(curve, maxLevel, level);
      const threshold = core.growth.minExp(curve, level, maxLevel);
      for (const exp of [threshold - 1, threshold, threshold + 1]) {
        if (Number.isSafeInteger(exp) && exp >= 0) levelFromExp(curve, maxLevel, exp);
      }
    }
    for (const exp of [0, 1, 999999, 1000000, 1640000, 20504, 20505, 20506, 618473, 618474, 618475]) levelFromExp(curve, maxLevel, exp);
    levelFromExp(curve, maxLevel, null, "additional", "growth-invalid-exp");
    levelFromExp(curve, maxLevel, -1, "additional", "growth-invalid-exp");
  }
  for (const curve of CURVES) for (const level of [null, 0, -1]) minimum(curve, 100, level, "additional", "growth-invalid-level");

  for (const method of FRIENDSHIP_METHODS) for (const friendship of FRIENDSHIP_VALUES) {
    for (const mapId of [1, 2]) for (const ball of ["pokeball", "luxuryball"]) for (const item of ["", "soothebell"]) for (const AFFECTION_EFFECTS of [false, true]) {
      add("friendship.change", { method, friendship, originMap: 1, mapId, ball, item, AFFECTION_EFFECTS });
    }
  }
  for (let friendship = 0; friendship <= 255; friendship++) add("friendship.affection", { friendship });

  const sequenceBase = { originMap: 1, mapId: 1, ball: "pokeball", item: "", AFFECTION_EFFECTS: false };
  const sequences = [
    { name: "cross-99-100", initial: 99, steps: ["walking", "walking"], ...sequenceBase },
    { name: "soft-cap-178-179", initial: 178, steps: ["walking", "evberry", "walking"], ...sequenceBase, AFFECTION_EFFECTS: true },
    { name: "cross-199-200", initial: 199, steps: ["vitamin", "machine", "battleitem"], ...sequenceBase, mapId: 1, ball: "luxuryball", item: "soothebell" },
    { name: "clamp-255-up-down", initial: 254, steps: ["evberry", "faintbad", "revivalherb", "faint"], ...sequenceBase, AFFECTION_EFFECTS: true },
    { name: "clamp-0-lower", initial: 0, steps: ["faint", "walking"], ...sequenceBase }
  ];
  for (const sequence of sequences) add("friendship.changeSequence", sequence);

  add("friendship.change", { method: "unknown", friendship: 80, originMap: 1, mapId: 1, ball: "pokeball", item: "", AFFECTION_EFFECTS: false }, "additional", "unknown-friendship-method");
  for (const method of FRIENDSHIP_METHODS) for (const friendship of [-1, 256]) {
    add("friendship.change", { method, friendship, originMap: 1, mapId: 1, ball: "pokeball", item: "", AFFECTION_EFFECTS: false }, "additional", "friendship-out-of-domain");
  }
  add("friendship.change", { method: "walking", friendship: 1.5, originMap: 1, mapId: 1, ball: "pokeball", item: "", AFFECTION_EFFECTS: false }, "additional", "friendship-out-of-domain");
  for (const friendship of [-1, 256, 1.5]) add("friendship.affection", { friendship }, "additional", "friendship-out-of-domain");

  return sealRequest({ protocol: "ruby-ts-differential/request-v1", selectionVersion: "wp30-r2-v1", thresholdSource: "clean-ts-minExp-v1", capabilities: ["growth", "friendship"], cases });
}

/** Selection denominators and complete caseId mapping only; no outcome or functional percentage. */
export function generateCoverage(request) {
  const ids = (operation, predicate = () => true) => request.cases.filter((testCase) => testCase.operation === operation && predicate(testCase)).map((testCase) => testCase.caseId);
  const additionalIds = (additionalClass) => request.cases.filter((testCase) => testCase.additionalClass === additionalClass).map((testCase) => testCase.caseId);
  const api = (operations, extra = {}) => ({
    operations,
    caseIds: request.cases.filter((testCase) => operations.includes(testCase.operation)).map((testCase) => testCase.caseId),
    ...extra
  });
  return {
    protocol: "ruby-ts-differential/selection-coverage-v1",
    requestHash: request.requestHash,
    sources: [
      { id: "WP30", path: "deliverables/final-specification-set/creature-rpg/wp30-growth-learning-and-friendship.md", sections: ["3.1", "3.2", "7.2", "7.3"] },
      { id: "BOUNDARY-MATRIX-R2", sha256: "c07907c053b5c4ac4a91e93f73611e3c5a8785967102b2dc05aebfc8edb68f7f" },
      { id: "ROUTING-736", path: "planning/implementation-routing/r8-20261017/", unitCount: 736, usage: "traceability-denominator-not-a-percentage" },
      { id: "HISTORICAL-GROWTH-3504", path: "docs/step3/differential-growth.md", usage: "frozen-replay-separate-from-this-run" }
    ],
    growth: {
      apiDenominator: 4,
      curveDenominator: 6,
      configurationDenominator: 18,
      apis: [
        api(["growth.minimumExpForLevel"], { defaultTableCaseIds: ids("growth.minimumExpForLevel", (testCase) => testCase.domain === "common" && testCase.input.maxLevel === 100 && testCase.input.level >= 1 && testCase.input.level <= 100) }),
        api(["growth.maximumExp"]),
        api(["growth.addExp", "growth.addExpSequence"], { compositeSequenceCaseIds: ids("growth.addExpSequence") }),
        api(["growth.levelFromExp"], { explicitAnchorCaseIds: ids("growth.levelFromExp", (testCase) => [0, 1, 999999, 1000000, 1640000, 20504, 20505, 20506, 618473, 618474, 618475].includes(testCase.input.exp)) })
      ]
    },
    friendship: {
      methodDenominator: 13,
      initialValues: [...FRIENDSHIP_VALUES],
      configurationDenominator: 16,
      methods: FRIENDSHIP_METHODS.map((method) => ({ method, commonCaseIds: ids("friendship.change", (testCase) => testCase.domain === "common" && testCase.input.method === method) })),
      affection: { inputDenominator: 256, thresholds: [99, 100, 149, 150, 199, 200, 229, 230, 254, 255], commonCaseIds: ids("friendship.affection", (testCase) => testCase.domain === "common") },
      sequences: request.cases.filter((testCase) => testCase.operation === "friendship.changeSequence").map((testCase) => ({ name: testCase.input.name, caseId: testCase.caseId, stepCount: testCase.input.steps.length }))
    },
    additionalDomains: {
      "growth-invalid-level": additionalIds("growth-invalid-level"),
      "growth-invalid-exp": additionalIds("growth-invalid-exp"),
      "unknown-friendship-method": additionalIds("unknown-friendship-method"),
      "friendship-out-of-domain": additionalIds("friendship-out-of-domain")
    },
    atFreeze: { referenceExecution: "NOT_RUN", actualDualRun: "NOT_RUN", approvedDivergence: 0, hostUnsupported: "NOT_EVALUATED" },
    historicalFrozenReplay: { growth3504: "SEPARATE_NOT_ACTUAL_DUAL_RUN" },
    percentage: "NOT_COMPUTED_CASE_COUNTS_ARE_NOT_FUNCTIONAL_COVERAGE"
  };
}
