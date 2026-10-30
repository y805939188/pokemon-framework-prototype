// One closed profile, not a dynamic plug-in platform. Contains clean inputs/projections, never a Ruby oracle.
import { sha256Json } from '../lib/json.mjs';
import { validateSchema } from '../lib/schema.mjs';
export const PROFILE = 'pre54-batch2-v1';
export const REQUEST_PROTOCOL = 'ruby-ts-differential/request-pre54-batch2-v1';
export const BEHAVIOR_PROTOCOL = 'ruby-ts-differential/behavior-pre54-batch2-v1';
export const NORMALIZER_PROTOCOL = 'ruby-ts-differential/normalizer-pre54-batch2-v1';
export const OPERATIONS = Object.freeze(['learning.relearningCandidates','learning.forgetting','pokedex.recordSequence','pokedex.recentSequence','stats.computeStats','stats.hpAfterRecalc']);
export const REFERENCE_ROLES = Object.freeze(['learning-rules','pokedex-rules','stats-rules','adapter','fixture-directory']);
export const isPre54 = request => request?.protocol === REQUEST_PROTOCOL;
export const NATURES = Object.freeze(['hardy','lonely','brave','adamant','naughty','bold','docile','relaxed','impish','lax','timid','hasty','serious','jolly','naive','modest','mild','quiet','bashful','rash','calm','gentle','sassy','careful','quirky']);
// Explicit external directory fixture. Same input identity on both sides; no claim of full official content coverage.
export const DIRECTORY = Object.freeze({
 id:'pre54-directory-v1',
 species:{alpha:{formName:'',form:0,pokedexForm:0},'alpha-1':{formName:'Named',form:1,pokedexForm:1},'alpha-2':{formName:'',form:2,pokedexForm:1},beta:{formName:'',form:0,pokedexForm:0}},
 forms:{alpha:{'0':'alpha','1':'alpha-1','2':'alpha-2'},beta:{'0':'beta'}}
});
const int=(min,max)=>({type:'integer',minimum:min,maximum:max});
const bool={type:'boolean'},id={enum:['alpha','beta']},moveId={enum:['tackle','growl','ember','flamethrower','protect','cut']};
const array=(items,max=32,min=0)=>({type:'array',minItems:min,maxItems:max,items});
const record=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const nullable=x=>({oneOf:[{type:'null'},x]});
const moves=array(record({id:moveId,pp:int(0,64),maxpp:int(1,64),ppUps:int(0,3)}),4);
const stats=record(Object.fromEntries(['hp','atk','def','spa','spd','spe'].map(k=>[k,int(1,10000)])));
const statInput=record(Object.fromEntries(['hp','atk','def','spa','spd','spe'].map(k=>[k,int(0,252)])));
const appearance=record({species:id,gender:int(0,2),form:int(0,2),shiny:bool});
const form=record({gender:int(0,2),form:int(0,2),shiny:bool});
const dict=values=>({type:'object',additionalProperties:false,properties:{alpha:values,beta:values}});
export const dexStateSchema=record({seen:array(id,2),owned:array(id,2),seenForms:dict(array(form,12)),lastSeenForm:dict(form),capturedCounts:dict(int(0,10000)),defeatedCounts:dict(int(0,10000))});
const levelMoves=array(record({level:int(0,100),id:moveId}),16);
const dexCall=record({source:{enum:['set-seen','set-owned','appearance','defeat','capture','grant','receive','party-gift','party-silent','evolution','split','trade','form-commit']},species:nullable(id),appearance:nullable(appearance),internalBattle:bool,seeForm:bool,shouldRefresh:bool});
export const INPUT_SCHEMAS=Object.freeze({
 'learning.relearningCandidates':record({member:nullable(record({level:int(1,100),isEgg:bool,moves,firstMoves:array(moveId,8)})),levelMoves,moreMoves:bool,shadow:bool}),
 'learning.forgetting':record({member:nullable(record({moves})),slot:{oneOf:[int(-1,4),{enum:['pending','cancel']}]}}),
 'pokedex.recordSequence':record({directoryId:{const:DIRECTORY.id},initial:dexStateSchema,calls:array(dexCall,8,1)}),
 'pokedex.recentSequence':record({directoryId:{const:DIRECTORY.id},initial:dexStateSchema,individuals:array(appearance,8,1)}),
 'stats.computeStats':record({base:stats,ivs:record(Object.fromEntries(['hp','atk','def','spa','spd','spe'].map(k=>[k,int(0,31)]))),evs:statInput,level:int(1,100),nature:{enum:NATURES}}),
 'stats.hpAfterRecalc':record({hp:int(0,65535),oldMax:int(1,65535),newMax:int(1,65535),reviveFainted:bool})
});
export const VALUE_SCHEMAS=Object.freeze({
 'learning.relearningCandidates':record({moves:array(moveId,32)}),
 'learning.forgetting':record({status:{enum:['ready','cancelled','pending']},moves,forgotten:nullable(moveId)}),
 'pokedex.recordSequence':record({steps:array(record({changed:bool,refreshCalls:int(0,16),state:dexStateSchema}),8,1),state:dexStateSchema}),
 'pokedex.recentSequence':record({steps:array(record({changed:bool,refreshCalls:int(0,16),state:dexStateSchema}),8,1),state:dexStateSchema}),
 'stats.computeStats':stats,
 'stats.hpAfterRecalc':int(0,65535)
});
export const ERROR_SCHEMA=record({code:{enum:['absent-target','invalid-slot','last-move','invalid-dex-operation']},stateUnchanged:{const:true}});
const requireProfile=(condition,code)=>{if(!condition)throw Object.assign(new Error(code),{code});};
export function validatePre54Case(c){
 requireProfile(Object.hasOwn(INPUT_SCHEMAS,c.operation)&&c.capability===c.operation.split('.')[0],'PRE54_UNKNOWN_OPERATION');
 requireProfile(validateSchema(INPUT_SCHEMAS[c.operation],c.input).valid,'PRE54_INPUT_SHAPE');
 const expected=c.operation==='learning.forgetting'?'wrapper-qualification':c.operation==='stats.hpAfterRecalc'&&!c.input.reviveFainted&&c.input.hp===0&&c.input.newMax>c.input.oldMax?'approved-keep-fainted-default':'none';
 requireProfile(c.domain===(expected==='none'?'common':'additional')&&c.additionalClass===expected,'PRE54_DOMAIN_MISMATCH');
 if(c.operation==='stats.computeStats')requireProfile(Object.values(c.input.evs).reduce((a,b)=>a+b,0)<=510,'PRE54_EV_TOTAL');
 if(c.operation==='stats.hpAfterRecalc')requireProfile(c.input.hp<=c.input.oldMax,'PRE54_HP_INPUT');
 if(c.operation.startsWith('learning.'))for(const m of c.input.member?.moves??[])requireProfile(m.pp<=m.maxpp,'PRE54_MOVE_PP');
}
export function sanitizePre54Outcome(outcome,c){
 if(outcome.kind==='raised'){
  // An observer must retain any partial mutation privately and BLOCK rather than discard it as just a class.
  requireProfile(outcome.raw?.stateUnchanged===true,'PRE54_ERROR_STATE_UNPROVEN');
  return {kind:'raised',class:outcome.class};
 }
 const schema=outcome.kind==='error-object'?ERROR_SCHEMA:VALUE_SCHEMAS[c.operation];
 requireProfile(schema&&validateSchema(schema,outcome.raw).valid,'PRE54_OUTCOME_SHAPE');
 if(c.operation.endsWith('Sequence')&&outcome.kind==='value') sequenceShape(outcome.raw,c);
 return outcome.kind==='value'?{kind:'value',value:structuredClone(outcome.raw)}:{kind:'error-object',class:outcome.class,value:structuredClone(outcome.raw)};
}
function sequenceShape(value,c){
 requireProfile(value.steps.length===(c.input.calls??c.input.individuals).length,'PRE54_STEP_COUNT');
 requireProfile(sha256Json(value.state)===sha256Json(value.steps.at(-1).state),'PRE54_FINAL_STATE');
}
export function gatePre54Outcome(outcome,c){
 if(outcome.kind==='raised')return;
 requireProfile(validateSchema(outcome.kind==='value'?VALUE_SCHEMAS[c.operation]:ERROR_SCHEMA,outcome.value).valid,'PRE54_PUBLIC_OUTCOME_SHAPE');
 if(c.operation.endsWith('Sequence')&&outcome.kind==='value') sequenceShape(outcome.value,c);
}
export function sealPre54(body){
 const cases=body.cases.map(c=>({...c,requestHash:sha256Json({caseId:c.caseId,capability:c.capability,operation:c.operation,domain:c.domain,additionalClass:c.additionalClass,input:c.input})}));
 const requestHash=sha256Json({...body,cases});return {...body,cases,requestId:'pre54-batch2-'+requestHash.slice(0,16),requestHash};
}
export function emptyDex(){return {seen:[],owned:[],seenForms:{},lastSeenForm:{},capturedCounts:{},defeatedCounts:{}};}
export function generatePre54Request(){
 const cases=[];function add(operation,input){const additionalClass=operation==='learning.forgetting'?'wrapper-qualification':operation==='stats.hpAfterRecalc'&&!input.reviveFainted&&input.hp===0&&input.newMax>input.oldMax?'approved-keep-fainted-default':'none';cases.push({caseId:'pre54-'+String(cases.length+1).padStart(4,'0'),capability:operation.split('.')[0],operation,domain:additionalClass==='none'?'common':'additional',additionalClass,input});}
 const slots=[{id:'tackle',pp:7,maxpp:35,ppUps:0},{id:'growl',pp:2,maxpp:40,ppUps:0}];
 const table=[{level:0,id:'protect'},{level:1,id:'tackle'},{level:5,id:'ember'},{level:5,id:'ember'},{level:20,id:'flamethrower'}];
 for(const level of [1,4,5,19,20,100])for(const moreMoves of [false,true])for(const state of ['normal','egg','shadow','absent'])add('learning.relearningCandidates',{member:state==='absent'?null:{level,isEgg:state==='egg',moves:slots,firstMoves:['cut','ember','cut','growl']},levelMoves:table,moreMoves,shadow:state==='shadow'});
 for(const member of [null,{moves:[]},{moves:slots.slice(0,1)},{moves:slots}])for(const slot of ['pending','cancel',-1,0,1,4])add('learning.forgetting',{member,slot});
 const call=(source,a,internalBattle=true,seeForm=true)=>({source,species:a?.species??'alpha',appearance:a,internalBattle,seeForm,shouldRefresh:true});
 const app=(gender,form,shiny=false)=>({species:'alpha',gender,form,shiny});
 for(const source of ['set-seen','set-owned','appearance','defeat','capture','grant','party-silent','evolution','trade','form-commit'])for(const internal of [false,true]){
  const a=app(2,1),c=call(source,a,internal);add('pokedex.recordSequence',{directoryId:DIRECTORY.id,initial:emptyDex(),calls:[c,c]});
 }
 add('pokedex.recordSequence',{directoryId:DIRECTORY.id,initial:emptyDex(),calls:[call('grant',app(0,0),true,false),call('appearance',app(1,1)),call('capture',app(1,1)),call('defeat',app(1,1))]});
 for(const first of [app(0,0),app(2,1),app(2,2)])add('pokedex.recentSequence',{directoryId:DIRECTORY.id,initial:emptyDex(),individuals:[first,app(1,1,true),app(1,1,true),app(2,2)]});
 const all=v=>({hp:v,atk:v,def:v,spa:v,spd:v,spe:v});
 for(const nature of NATURES)for(const level of [1,50,100])for(const pair of [[0,0],[31,0],[31,252]]){const evs=all(0);evs.atk=pair[1];evs.spe=pair[1];add('stats.computeStats',{base:{hp:45,atk:49,def:49,spa:65,spd:65,spe:45},ivs:all(pair[0]),evs,level,nature});}
 add('stats.computeStats',{base:{hp:1,atk:90,def:45,spa:30,spd:30,spe:40},ivs:all(31),evs:all(0),level:50,nature:'lonely'});
 for(const hp of [0,1,40,100])for(const newMax of [1,80,100,120])for(const reviveFainted of [false,true])add('stats.hpAfterRecalc',{hp,oldMax:100,newMax,reviveFainted});
 return sealPre54({protocol:REQUEST_PROTOCOL,selectionVersion:PROFILE,thresholdSource:'fixed-clean-fixtures-not-product-derived',capabilities:['learning','pokedex','stats'],cases});
}
export function generatePre54Coverage(request){return {profile:PROFILE,requestHash:request.requestHash,directoryIdentity:sha256Json(DIRECTORY),selectionBasis:'WP30 learning; WP62 records/recent; WP19 stats; explicit clean fixtures, not original outputs',operations:OPERATIONS.map(operation=>{const selected=request.cases.filter(c=>c.operation===operation);return {operation,caseIds:selected.map(c=>c.caseId),denominator:selected.length,commonCaseIds:selected.filter(c=>c.domain==='common').map(c=>c.caseId),additionalCaseIds:selected.filter(c=>c.domain==='additional').map(c=>c.caseId),referenceQualification:'NOT_RUN',actualDualRun:'NOT_RUN'};}),knownProductPolicy:'2026-10-18 keep-fainted-default; exact observed divergences NOT pre-approved by this metadata',wholeFeatureCoverage:'NOT_COMPUTED',referenceExecution:'NOT_RUN',newDualRun:0};}
