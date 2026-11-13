'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-battle-request-types-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
function compilePlugin(name, mutate = source => source) {
  const sandbox = fs.mkdtempSync(path.join(dir, 'plugin-'));
  const plugins = path.join(sandbox, 'src/plugins');
  fs.mkdirSync(plugins, { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'src/framework'), path.join(sandbox, 'src/framework'), 'dir');
  for (const entry of fs.readdirSync(path.join(ROOT, 'src/plugins'))) {
    if (entry !== name + '.ts') fs.symlinkSync(path.join(ROOT, 'src/plugins', entry), path.join(plugins, entry));
  }
  const file = path.join(plugins, name + '.ts');
  fs.writeFileSync(file, mutate(fs.readFileSync(path.join(ROOT, 'src/plugins', name + '.ts'), 'utf8')));
  const config = path.join(sandbox, 'tsconfig.json');
  fs.writeFileSync(config, JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    noEmit: true, skipLibCheck: false, lib: ['ES2022'], types: [],
    typeRoots: [path.join(ROOT, 'src/vendor/rpgreactor/types/compat')],
  }, files: [file, ...['globals.d.ts', 'compat/lib.dom.generated.d.ts'].map(p => path.join(ROOT, 'src/vendor/rpgreactor/types', p))] }));
  const result = spawnSync(process.execPath, [path.join(ROOT, 'src/node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { code: result.status, output: result.stdout + result.stderr };
}
function compile(name, source) {
  const file = path.join(dir, name + '.ts');
  fs.writeFileSync(file, source);
  const config = path.join(dir, name + '.json');
  fs.writeFileSync(config, JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    noEmit: true, skipLibCheck: false, lib: ['ES2022'], types: ['node'],
    typeRoots: [path.join(ROOT, 'src/node_modules/@types')],
  }, files: [file] }));
  const result = spawnSync(process.execPath, [path.join(ROOT, 'src/node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { code: result.status, output: result.stdout + result.stderr };
}

const prefix = `import type { BattleDriver, GatewayMessage } from ${JSON.stringify(path.join(ROOT, 'src/framework/battle/driver'))};
import type { RequestMessage } from ${JSON.stringify(path.join(ROOT, 'src/framework/battle/protocol'))};
import type { BattleSession, FoeAi } from ${JSON.stringify(path.join(ROOT, 'src/framework/flow/session'))};
type IsAny<T> = 0 extends (1 & T) ? true : false;
type NoAny<T extends false> = T;
`;
test('gateway, protocol, Session and pending request payloads cannot be any', () => {
  const r = compile('no-any', prefix + `
  type GatewayPayload = Extract<GatewayMessage, {kind:'request'}>['request'];
  type A = NoAny<IsAny<NonNullable<GatewayPayload>['active']>>;
  type B = NoAny<IsAny<NonNullable<RequestMessage['request']>['active']>>;
  type C = NoAny<IsAny<NonNullable<ReturnType<BattleSession['currentRequest']>>['active']>>;
  type D = NoAny<IsAny<NonNullable<ReturnType<BattleDriver['awaitingChoice']>>['active']>>;
  type E = NoAny<IsAny<NonNullable<Parameters<FoeAi>[0]>['active']>>;
  `);
  assert.equal(r.code, 0, r.output);
});
for (const [name, source] of [
  ['gateway-field', `declare const m: Extract<GatewayMessage,{kind:'request'}>; if (m.request?.active) m.request.active[0].moves[0].pp = 'bad';`],
  ['protocol-field', `declare const m: RequestMessage; if (m.request?.active) m.request.active[0].moves[0].misspelled;`],
  ['session-field', `declare const s: BattleSession; const r=s.currentRequest(); if(r?.active) r.active[0].moves[0].disabled = 42;`],
  ['driver-field', `declare const d: BattleDriver; const r=d.awaitingChoice('p1'); if(r?.side) r.side.pokemon[0].condition=42;`],
  ['ai-field', `const ai:FoeAi=r=>r.forceSwitch ? r.forceSwitch.map(x=>x.toUpperCase()).join(',') : 'move 1';`],
  ['ai-return', `const ai:FoeAi=()=>42;`],
]) test(`invalid ${name} is rejected`, () => {
  const r=compile(name,prefix+source);
  assert.notEqual(r.code,0,'invalid battle consumer compiled');
  assert.match(r.output,/TS(?:2322|2339|2345)/,r.output);
  assert.doesNotMatch(r.output,/Cannot find module|Cannot find type definition/,r.output);
});
test('normal, forced, waiting, preview, empty and PP-less requests retain their real optional fields', () => {
  const r=compile('request-shapes',prefix+`
  import type { BattleRequest } from ${JSON.stringify(path.join(ROOT,'src/framework/battle/request'))};
  const side={id:'p1',name:'Player',pokemon:[{ident:'p1: P1',details:'Pikachu',condition:'80/100',active:true}]};
  const shapes: (BattleRequest|null)[]=[null,{}, {wait:true,side}, {teamPreview:true,side}, {forceSwitch:[true,false],side},
    {active:[{moves:[{id:'struggle',move:'Struggle'}]}],side}, {active:[null,{moves:[{id:'outrage',move:'Outrage'}]}],side}];
  const ai:FoeAi=request=>request.forceSwitch ? 'switch 2' : request.active?.[0]?.moves.length ? 'move 1' : undefined;
  declare const driver:BattleDriver,session:BattleSession;
  const pending:BattleRequest|null=driver.awaitingChoice('p1');
  const current:BattleRequest|null|undefined=session.currentRequest();
  const checkpoint=session._checkpoint();
  session._restoreCheckpoint(checkpoint).then(()=>session.currentRequest());
  void [shapes,ai,pending,current];
  `);
  assert.equal(r.code,0,r.output);
});
test('real BattleFlow compiles without ambient Node types', () => {
  const r=compilePlugin('PS_BattleFlow'); assert.equal(r.code,0,r.output);
});
for (const [name,before,after] of [
 ['begin-result','      return session;','      session.chooseMove("bad"); return session;'],
 ['scene-request','    const moves = req.active[0].moves;','    const moves = req.active[0].moves; moves[0].pp="bad";'],
 ['message','      for (const message of msgs) {','      for (const message of msgs) { message.misspelled;'],
 ['controller-field','    scene._controller = c;','    c.session?.chooseMove("bad"); scene._controller = c;'],
 ['action-result','      if (r && r.ok === false) {','      r.misspelled; if (r && r.ok === false) {'],
 ['menu-action','return activeSession(this).chooseMove(ext);','return activeSession(this).chooseMove("bad");'],
]) test(`actual BattleFlow ${name} cannot erase the type`,()=>{
 const r=compilePlugin('PS_BattleFlow',source=>{assert(source.includes(before),before);return source.replace(before,after);});
 assert.notEqual(r.code,0,'real battle consumer compiled an invalid field or argument');
 assert.match(r.output,/TS(?:2322|2339|2345)/,r.output);
 assert.doesNotMatch(r.output,/Cannot find module|Cannot find type definition/,r.output);
});
