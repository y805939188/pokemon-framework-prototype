'use strict';
// Pure test-input controls only. Never imports an empty-load business case.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');assert.equal(process.version,'v22.21.1');assert.deepEqual(process.argv.slice(2),[]);
const H=require('../headless-regression-binding.cjs'),captured=H.capture(root,process.env.PF_HEADLESS_REGRESSION_BINDING);
H.boundFiles(captured,['scripts/tests/e3-empty-load-input-support.test.cjs','experiments/step5/5/companion-cold-native-joint/empty-load-input-support.cjs','experiments/step5/5/companion-cold-native-joint/test-empty-load-input-support.cjs','experiments/step5/5/companion-cold-native-joint/global-info-input-support.cjs','experiments/step5/5/companion-cold-native-joint/test-global-info-input-support.cjs','experiments/step5/5/companion-cold-native-joint/empty-receipt-input-support.cjs','experiments/step5/5/companion-cold-native-joint/test-empty-receipt-input-support.cjs']);
require('./c-regular-runtime.cjs').verify(root,captured.binding);
require('node:test').after(()=>H.capture(root,process.env.PF_HEADLESS_REGRESSION_BINDING,captured.sha256));
require('../../experiments/step5/5/companion-cold-native-joint/test-empty-load-input-support.cjs');
require('../../experiments/step5/5/companion-cold-native-joint/test-global-info-input-support.cjs');
require('../../experiments/step5/5/companion-cold-native-joint/test-empty-receipt-input-support.cjs');
