'use strict';
// Pure observer controls; this registered entry never imports a fixture/test body.
const assert=require('node:assert/strict'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');assert.equal(process.version,'v22.21.1');assert.deepEqual(process.argv.slice(2),[]);
const H=require('../headless-regression-binding.cjs'),captured=H.capture(ROOT,process.env.PF_HEADLESS_REGRESSION_BINDING);
H.boundFiles(captured,['scripts/tests/e3-phase-observer-support.test.cjs',
 'experiments/step5/5/e3-production/phase-observer-support.cjs',
 'experiments/step5/5/e3-production/test-phase-observer-support.cjs',
 'experiments/step5/5/e3-production/test-phase-birth-support.cjs',
 'experiments/step5/5/e3-production/native-consumer-observer.cjs',
 'experiments/step5/5/e3-production/companion-fixture.cjs',
 'experiments/step5/5/e3-mz-world-travel-fixture.cjs',
 'experiments/step5/5/test-e3-mz-world-travel-joint.cjs']);
require('./c-regular-runtime.cjs').verify(ROOT,captured.binding);
require('node:test').after(()=>H.capture(ROOT,process.env.PF_HEADLESS_REGRESSION_BINDING,captured.sha256));
require('../../experiments/step5/5/e3-production/test-phase-observer-support.cjs');
