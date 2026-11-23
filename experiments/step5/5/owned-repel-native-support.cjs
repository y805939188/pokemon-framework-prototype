const fs=require('node:fs'),path=require('node:path');
const fixed=process.env.PF_C1_NATIVE_FIXTURE_ROOT,out=process.env.PF_C1_NATIVE_BUNDLE;
if(!fixed || !path.isAbsolute(fixed))throw Error('PF_C1_NATIVE_FIXTURE_ROOT must name the matching frozen fixture worktree');
if(!out)throw Error('PF_C1_NATIVE_BUNDLE required');
const B={out,E:require(path.join(out,'production.cjs')),inventory:fs.readFileSync(path.join(out,'PS_Inventory.js'),'utf8'),world:fs.readFileSync(path.join(out,'PS_World.js'),'utf8'),flow:fs.readFileSync(path.join(out,'PS_BattleFlow.js'),'utf8')};
require(path.join(fixed,'experiments/step5/5/d-mz-integration-support.cjs')).build=async()=>B;
module.exports=require(path.join(fixed,'experiments/step5/5/surf-production-native-support.cjs'));
