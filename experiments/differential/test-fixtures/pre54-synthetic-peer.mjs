// INFRASTRUCTURE SELF-TEST ONLY: echoes a prebuilt TS fixture, never a Ruby implementation or oracle.
import {readFileSync,writeFileSync} from 'node:fs';
const [mode,response,started]=process.argv.slice(2);
writeFileSync(started,'synthetic child started\n',{flag:'wx'});
if(mode==='stderr')process.stderr.write('SYNTHETIC_STDERR\n');
if(mode==='nonzero')process.exitCode=7;
process.stdout.write(readFileSync(response));
