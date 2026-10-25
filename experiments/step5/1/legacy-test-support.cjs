'use strict';
const I6 = require("../2/test-support.cjs");
// Explicit test setup/comparison bridge for historical schema assertions. Never used by runtime code.
const E=require('../../../js/engine/build/engine.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function legacyMember(member,schema){const old=E.state.protocolMember(member);if(schema>=4)old.form=member.form??0;return old;}
function legacyGame(game,schema){const boxes=game.storage?E.storage.boxedMembers(game):game.boxes;const result={schema,party:game.party.map(m=>legacyMember(m,schema)),boxes:boxes.map(m=>legacyMember(m,schema)),bag:clone(I6.bagOf(game)),money:game.money,dex:{seen:clone(game.dex.seen),owned:clone(game.dex.owned)},appliedBattles:clone(game.appliedBattles)};if(schema>=3)result.claims=clone(game.claims??{});if(schema>=4){result.stats=clone(game.stats??E.stats.newStats());result.steps=game.steps??0;}return result;}
function setBoxed(game,members){game.storage=E.storage.newStorage();members.forEach((m,i)=>{if(i>=1200)throw Error('test setup exceeds fixed storage');game.storage.boxes[Math.floor(i/30)].slots[i%30]=m;});}
function templatesFor(state,result){const templates={};for(const captured of result.captured??[]){const member=E.storage.allMembers(state).find(m=>m.id===captured.id);if(!member)throw Error(`historical template missing for ${captured.id}`);templates[captured.id]=clone(member);}return {templates,profile:{mode:1,naming:1}};}
// Old headless suites explicitly opt into automatic reception and a fixed clock. New 5.1 suites test normal pending defaults.
class AutomaticApplication extends E.app.GameApplication { constructor(ports,options={}) { super({...ports,clock:ports.clock??(()=>1234567890000)},{receivingProfile:{mode:1,naming:1},...options}); } }
module.exports={legacyGame,legacyMember,setBoxed,templatesFor,AutomaticApplication};
