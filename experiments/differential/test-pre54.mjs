import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest} from './lib/protocol.mjs';
import {generatePre54Request} from './profiles/pre54-batch2.mjs';
test('closed pre54 batch2 request is supported without changing the product',()=>assert.doesNotThrow(()=>validateRequest(generatePre54Request())));
