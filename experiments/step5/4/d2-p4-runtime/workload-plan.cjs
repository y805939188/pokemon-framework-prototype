'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function compileIntentions() {
  const donor = JSON.parse(fs.readFileSync(path.join(ROOT, 'experiments/step5/4/d1/f100-v1.json'), 'utf8'));
  const proposal = JSON.parse(fs.readFileSync(path.join(ROOT, 'experiments/step5/4/d2-p4-preparation/workload-proposal.json'), 'utf8'));
  if (JSON.stringify(donor) !== JSON.stringify(proposal.business)) throw Error('donor business drift');
  if (donor.cases.length !== 100 || donor.cases.some((c, i) => c.id !== `F100-${String(i+1).padStart(3,'0')}` ||
      JSON.stringify(c.seed) !== JSON.stringify([1,2,3,4+i]))) throw Error('exact input/seed order required');
  const cases = donor.cases.map(c => ({ id: c.id, ordinal: c.ordinal, kind: c.kind, seed: [...c.seed],
    request: c.request, expected: c.expected, setup: c.setup, intentions: c.steps.map(step => {
      if (!proposal.semanticSteps[step]) throw Error('unresolved donor intention '+step);
      return { step, navigation: [...proposal.semanticSteps[step]] };
    }), resolvedNormalActions: null, qualifiedDeadlineMs: null }));
  return { version: 'D2-normal-intentions-v1', status: 'TRACE_RESOLUTION_REQUIRED_NOT_EXECUTABLE',
    donorHash: hash(donor), presentationHash: hash(proposal.presentation), cases, actualBattles: 0 };
}
function validateResolvedTraceShape(trace) {
  if (!trace || trace.version !== 'D2-normal-resolved-trace-v1' || trace.cases?.length !== 100) throw Error('resolved normal trace required');
  const expected = compileIntentions();
  if (trace.donorHash !== expected.donorHash || trace.presentationHash !== expected.presentationHash) throw Error('trace input identity mismatch');
  for (let i=0; i<100; i++) {
    const c = trace.cases[i];
    if (c.id !== expected.cases[i].id || JSON.stringify(c.seed) !== JSON.stringify(expected.cases[i].seed) ||
        !Array.isArray(c.actions) || !c.actions.length || !Number.isFinite(c.deadlineMs) || c.deadlineMs <= 0) throw Error('unresolved case '+expected.cases[i].id);
    for (const a of c.actions) if (!['choose','ackPaused','wait'].includes(a.kind) ||
      !Number.isFinite(a.deadlineMs) || a.deadlineMs <= 0 || a.deadlineMs > c.deadlineMs ||
      a.kind === 'choose' && (typeof a.phase !== 'string' || !Object.hasOwn(a,'key')) ||
      a.kind === 'wait' && typeof a.predicate !== 'string') throw Error('unresolved normal action');
  }
  // Identity/shape only; this neither approves semantic choices nor runs cases.
  return { status: 'TRACE_SHAPE_VALID_PENDING_SEMANTIC_REVIEW', actualBattles: 0 };
}
module.exports = { compileIntentions, validateResolvedTraceShape, hash };
