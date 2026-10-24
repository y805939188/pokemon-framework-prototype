/** Spec-derived field-use identities. Prices are deliberately absent; aliases require real catalog records. */
export interface FieldEffect { family:string; parameters:Record<string,string|number|boolean> }
export const FIELD_EFFECTS:Record<string,FieldEffect>={};
const register=(ids:string[],family:string,parameters:FieldEffect['parameters']={})=>{for(const id of ids)FIELD_EFFECTS[id]={family,parameters:{...parameters}};};
for(const [ids,amount,old]of [[['potion','berryjuice','sweetheart'],20,20],[['superpotion'],60,50],[['hyperpotion'],120,200],[['freshwater'],30,50],[['sodapop'],50,60],[['lemonade'],70,80],[['moomoomilk'],100,100],[['oranberry'],10,10]] as [string[],number,number][])register(ids,'hp',{amount,oldAmount:old});
register(['maxpotion'],'hp',{full:true});register(['sitrusberry'],'hp',{fraction:4});register(['energypowder'],'hp',{amount:60,oldAmount:50,friendship:'powder'});register(['energyroot'],'hp',{amount:120,oldAmount:200,friendship:'energyroot'});
for(const [ids,status]of [[['antidote','pechaberry'],'psn'],[['burnheal','rawstberry'],'brn'],[['paralyzeheal','parlyzheal','cheriberry'],'par'],[['awakening','chestoberry','blueflute'],'slp'],[['iceheal','aspearberry'],'frz']] as [string[],string][])register(ids,'status',{status});
register(['fullheal','lavacookie','oldgateau','casteliacone','lumiosegalette','shaloursable','bigmalasada','pewtercrunchies','lumberry'],'status');register(['healpowder'],'status',{friendship:'powder'});register(['ragecandybar'],'rage-candy');register(['fullrestore'],'full-restore');register(['revive'],'revive',{fraction:2});register(['maxrevive','maxhoney'],'revive');register(['revivalherb'],'revive',{friendship:'revivalherb'});register(['sacredash'],'sacred-ash');
register(['ether','leppaberry'],'pp',{amount:10});register(['maxether'],'pp',{full:true});register(['elixir'],'pp',{amount:10,all:true});register(['maxelixir'],'pp',{full:true,all:true});register(['ppup'],'pp-up');register(['ppmax'],'pp-up',{max:true});
const rows=[['hp','hpup','health','pomeg'],['atk','protein','muscle','kelpsy'],['def','iron','resist','qualot'],['spa','calcium','genius','hondew'],['spd','zinc','clever','grepa'],['spe','carbos','swift','tamato']];
for(const [stat,vitamin,feather,berry]of rows){register([vitamin!],'vitamin',{stat:stat!});register([feather+'feather',feather+'wing'],'wing',{stat:stat!});register([berry+'berry'],'ev-berry',{stat:stat!});}
for(const nature of ['lonely','brave','adamant','naughty','bold','relaxed','impish','lax','timid','hasty','serious','jolly','naive','modest','mild','quiet','rash','calm','gentle','sassy','careful'])register([nature+'mint'],'mint',{nature});
register(['abilitycapsule'],'ability-capsule');register(['abilitypatch'],'ability-patch');register(['rarecandy'],'rare-candy');for(const [size,exp]of [['xs',100],['s',800],['m',3000],['l',10000],['xl',30000]] as [string,number][])register(['expcandy'+size],'exp-candy',{exp});

/** Unknown families remain opaque/not-ready. Known families cannot coerce scalar strings into effects. */
export function fieldEffectProblem(effect:FieldEffect):string|null {
 const {family,parameters:p}=effect,positive=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
 const keys:Record<string,string[]>={hp:['amount','oldAmount','full','fraction','friendship'],status:['status','friendship'],'full-restore':[],revive:['fraction','friendship'],'sacred-ash':[],'rage-candy':[],pp:['amount','full','all'],'pp-up':['max'],vitamin:['stat'],wing:['stat'],'ev-berry':['stat'],mint:['nature'],'ability-capsule':[],'ability-patch':[],'rare-candy':[],'exp-candy':['exp']};
 if(!Object.hasOwn(keys,family))return null;
 if(Object.keys(p).some(k=>!keys[family]!.includes(k)))return 'unknown parameter for field effect';
 for(const k of ['amount','oldAmount','fraction','exp'])if(p[k]!==undefined&&!positive(p[k]))return `${k} must be a positive safe integer`;
 for(const k of ['full','all','max'])if(p[k]!==undefined&&typeof p[k]!=='boolean')return `${k} must be boolean`;
 if(p.friendship!==undefined&&!['powder','energyroot','revivalherb'].includes(String(p.friendship)))return 'invalid friendship method';
 if(family==='hp'&&Number(p.amount!==undefined)+Number(p.fraction!==undefined)+Number(p.full===true)!==1)return 'hp needs exactly one of amount, fraction or full:true';
 if(p.oldAmount!==undefined&&p.amount===undefined)return 'oldAmount needs amount';
 if(family==='pp'&&Number(p.amount!==undefined)+Number(p.full===true)!==1)return 'pp needs amount or full:true';
 if(family==='status'&&p.status!==undefined&&!['psn','brn','par','slp','frz'].includes(String(p.status)))return 'invalid field status';
 if(['vitamin','wing','ev-berry'].includes(family)&&!['hp','atk','def','spa','spd','spe'].includes(String(p.stat)))return 'invalid effect stat';
 if(family==='mint'&&!['hardy','lonely','brave','adamant','naughty','bold','docile','relaxed','impish','lax','timid','hasty','serious','jolly','naive','modest','mild','quiet','bashful','rash','calm','gentle','sassy','careful','quirky'].includes(String(p.nature)))return 'invalid calculation nature';
 if(family==='exp-candy'&&!positive(p.exp))return 'exp must be a positive safe integer';
 return null;
}
