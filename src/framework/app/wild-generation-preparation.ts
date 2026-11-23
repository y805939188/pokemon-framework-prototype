/** The shared full individual stage after a caller has already selected/provided species+level. No selection or admission. */
import { resolveConfig } from '../rules/config';
import { catalogOf, itemForLegacyId } from '../rules/item-catalog';
import { itemQuantity } from '../rules/inventory';
import { allocateMemberId } from '../rules/member-identity';
import { allMembers } from '../rules/storage';
import { toPersistentMember, keyOfBattleName } from '../rules/species-key';
import { createWildSpecies } from '../rules/wild-generation';
import type { WildGenerationSource, OrdinaryWildGenerationFacts } from '../rules/wild-generation';
import { resolveSpecies } from '../flow/content-runtime';
import { ENVIRONMENT } from '../rules/initial-field';
import { own } from '../rules/own';
import type { Content, DexLookup, Member } from '../rules/types';
import type { GameState } from '../rules/state';
import type { WorldBusinessFacts } from '../rules/world-state';
import type { WorldFact } from '../rules/world-data';
import type { WildFormRegistration } from '../rules/wild-member';
export interface WildPreparationSource { game:GameState;content:Content;dex?:DexLookup;facts:WorldBusinessFacts;mapId:number;environment:WorldFact<keyof typeof ENVIRONMENT>;source:WildGenerationSource }
export interface WildPreparationPorts { assertCurrent(content?:Content):void;now():number;random(n:number):number;switchOn(id:number):boolean;allowHeldItemSources:boolean }
export type PreparedWildIndividual={status:'created';member:Member;nextMemberOrdinal:string;registrations?:readonly WildFormRegistration[]}|{status:'unsupported';reason:string};
export function prepareWildIndividual(speciesInput:string,level:number,source:WildPreparationSource,ports:WildPreparationPorts):PreparedWildIndividual{
 const {game,content,dex,facts,mapId,environment}=source;ports.assertCurrent(content);
 if(facts.mapId.status!=='value'||facts.mapId.value!==mapId)throw Error('wild-business-map-mismatch');
 if(facts.hour.status!=='value'||!Number.isInteger(facts.hour.value)||facts.hour.value<0||facts.hour.value>23)throw Error('wild-hour-unavailable');
 if(facts.mapMetadata.status!=='value'&&facts.mapMetadata.status!=='absent')throw Error('wild-map-metadata-unavailable');
 if(environment.status!=='value'||!Object.hasOwn(ENVIRONMENT,environment.value))throw Error('wild-creation-environment-unavailable');
 const metadata=facts.mapMetadata.status==='value'?facts.mapMetadata.value:undefined,flags=metadata?.flags;
 if(flags!==undefined&&(!Array.isArray(flags)||flags.some(flag=>typeof flag!=='string')))throw Error('wild-map-flags-invalid');
 const regionId=metadata?.mapPosition?.regionId??0;if(!Number.isSafeInteger(regionId)||regionId<0)throw Error('wild-region-invalid');
 const species=resolveSpecies(content,speciesInput);if(!species)return{status:'unsupported',reason:'wild-species-unavailable:'+speciesInput};
 const config=resolveConfig(content.settings),forceShiny=ports.switchOn(config.SHINY_WILD_POKEMON_SWITCH);ports.assertCurrent();
 const fateful=ports.switchOn(config.FATEFUL_ENCOUNTER_SWITCH);ports.assertCurrent();
 const now=ports.now();ports.assertCurrent();if(!Number.isFinite(now)||now<0||!Number.isFinite(new Date(now).getTime()))throw Error('wild-origin-clock-invalid');
 const canonical=keyOfBattleName(content,species)?.species??speciesInput;
 const allocated=allocateMemberId(game.nextMemberOrdinal,new Set(allMembers(game).map(member=>member.id))),hour=facts.hour.value,charm=itemForLegacyId(catalogOf(content),'shinycharm');
 const factsForGeneration:OrdinaryWildGenerationFacts={source:source.source,session:'ordinary',registration:{playerPresent:true,dexPresent:true},party:game.party.map(member=>{const gender=member.gender;if(gender!=='M'&&gender!=='F'&&gender!=='N')throw Error('invalid-wild-party-gender');return{isEgg:member.isEgg===true,hp:member.hp,level:member.level,ability:member.ability,gender,nature:member.nature};}),forceShiny,shinyCharm:!!charm&&itemQuantity(game.inventory,charm.id,catalogOf(content))>0,higherShinyByBattled:config.HIGHER_SHINY_CHANCES_WITH_NUMBER_BATTLED,battledCount:(own(game.dex.capturedCounts,canonical)??0)+(own(game.dex.defeatedCounts,canonical)??0),moreAbilities:config.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS,roamer:false,legendaryPerfectIVs:config.LEGENDARIES_HAVE_SOME_PERFECT_IVS,scaleWildLevels:flags?.some(flag=>flag.toLowerCase()==='scalewildencounterlevels')===true,allowHeldItemSources:ports.allowHeldItemSources};
 const random=(n:number)=>{ports.assertCurrent();const result=ports.random(n);ports.assertCurrent();return result;};
 const generated=createWildSpecies({id:allocated.id,species,level,owner:game.player,context:{fateful,map:mapId,receivedAt:Math.floor(now/1000),playerId:game.player.id,environment:environment.value,timeOfDay:hour<5||hour>=20?'night':hour>=17?'dusk':'day',hour,month:new Date(now).getMonth()+1,regionId,distortionWorld:flags?.some(flag=>flag.toLowerCase()==='distortionworld')??false}},content,factsForGeneration,random,id=>{ports.assertCurrent();const item=dex?.heldItem?.(id)??null;ports.assertCurrent();return item;});
 ports.assertCurrent();if(generated.status!=='created')return generated;if(!generated.member.moves.length)return{status:'unsupported',reason:'wild-member-no-moves'};
 return{status:'created',member:toPersistentMember(generated.member,content),nextMemberOrdinal:allocated.nextMemberOrdinal,...(generated.registrations?.length?{registrations:generated.registrations}:{})};
}
