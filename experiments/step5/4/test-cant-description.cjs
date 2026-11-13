'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const E = require(process.env.PF_CANT_RUNTIME || '../../../js/engine/build/production.cjs');
const reasons = {
 slp: ['{name} is fast asleep.', '{name}仍在熟睡。'],
 par: ["{name} is paralyzed! It can't move!", '{name}麻痹了，无法行动！'],
 frz: ['{name} is frozen solid!', '{name}被冻住了！'],
 flinch: ["{name} flinched and couldn't move!", '{name}畏缩了，无法行动！'],
 recharge: ['{name} must recharge!', '{name}必须休息！'],
 nopp: ['{name} has no PP left for that move!', '{name}的这个招式已经没有PP了！'],
 'ability: Truant': ['{name} is loafing around!', '{name}正在偷懒！'],
 Attract: ['{name} is immobilized by love!', '{name}因着迷而无法行动！'],
 Disable: ["{name}'s move is disabled!", '{name}的招式被定身法封住了！'],
 'Focus Punch': ["{name} lost its focus and couldn't move!", '{name}失去了集中力，无法出招！'],
 'Shell Trap': ["{name}'s Shell Trap didn't work!", '{name}的陷阱甲壳没有奏效！'],
 'move: Taunt': ["{name} can't use that move because of Taunt!", '{name}受到挑衅，无法使出这个招式！'],
 'move: Imprison': ["{name} can't use the sealed move!", '{name}无法使出被封印的招式！'],
 'move: Gravity': ["{name} can't use that move because of gravity!", '{name}受到重力影响，无法使出这个招式！'],
 'move: Heal Block': ["{name} can't use that move because of Heal Block!", '{name}受到回复封锁，无法使出这个招式！'],
 'move: Throat Chop': ["{name} can't use sound-based moves because of Throat Chop!", '{name}受到地狱突刺影响，无法使出声音类招式！'],
};
const event = args => Object.freeze({type: 'cant', args: Object.freeze(args), raw: '|cant|' + args.join('|')});
for (const [index, lang] of ['en', 'zh'].entries()) {
 for (const [reason, text] of Object.entries(reasons)) test(`${lang} description ${reason}, stable actor and side`, () => {
  const tr=E.i18n.translatorFor(lang), names=Object.freeze({A:'Alpha', B:'Beta'}), d=E.describe.make(names,tr);
  for (const [ident,name] of [['p1a: A','Alpha'],['p1: A','Alpha'],['p2a: B',lang==='zh'?'对手的Beta':"The foe's Beta"]]) {
   const e=event([ident,reason,'untrusted move text']), before=JSON.stringify(e);
   assert.deepEqual(d.event(e),[text[index].replace('{name}',name)]);
   assert.deepEqual(d.message({kind:'events',seq:7,events:[e]}),d.event(e));assert.equal(JSON.stringify(e),before);
  }
  assert.deepEqual(tr.diagnostics(),{missingKeys:[],missingParams:[]});
 });
 test(`${lang} fallback does not invent actor identities or echo unknown protocol fields`,()=>{
  const tr=E.i18n.translatorFor(lang),d=E.describe.make({A:'Holder',B:'Mover'},tr),expected=lang==='zh'?'行动受到了限制。':'An action was restricted.';
  for(const args of [[],['p1a: A'],['p1a: A','constructor'],['p1a: A','__proto__'],['p1a: A','toString'],['p1a: A','move: Future Reason','\\C[2]SECRET'],['p2a: B','ability: Damp','Explosion','[of] p1a: A'],['p2a: B','ability: Queenly Majesty','Quick Attack','[of] p1a: A'],['p2a: B','ability: Dazzling','Quick Attack','[of] p1a: A'],['p2a: B','ability: Armor Tail','Quick Attack','[of] p1a: A'],['','par'],['p10a: A','par'],['p2a: \\C[1]bad','par']]) assert.deepEqual(d.event(event(args)),[expected]);
  assert.deepEqual(tr.diagnostics(),{missingKeys:[],missingParams:[]});
  assert.deepEqual(E.describe.make({'A#._:-123':'Stable'},tr).event(event(['p1a: A#._:-123','slp'])),[reasons.slp[index].replace('{name}','Stable')]);
  const own=E.describe.make({},tr).event(event(['p1a: constructor','par']));assert.equal(own[0],reasons.par[index].replace('{name}','constructor'));
  assert.deepEqual(d.event({type:'unknown-event',args:['anything'],raw:'|unknown-event|anything'}),[]);
 });
}
