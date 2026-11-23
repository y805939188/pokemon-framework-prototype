/** Explicit canonical species+level input. Ordinary encounter selection/repel gates do not apply here. */
import { scriptedWildData, scriptedWildRequest, scriptedWildFlags } from './scripted-wild-input';
import type { BattleStartRequest, GeneratedWildBattleStartRequest } from './ports';
export function captureGeneratedWildBattle(input:unknown):{input:GeneratedWildBattleStartRequest;request:BattleStartRequest}{
 const raw=scriptedWildData(input,['species','level'],'generated-wild');
 if(typeof raw.species!=='string'||!raw.species.length||typeof raw.level!=='number'||!Number.isInteger(raw.level)||raw.level<1||raw.level>100)throw Error('generated-wild-species-level-invalid');
 const request=scriptedWildRequest(raw,raw.species,raw.level,'generated-wild');return{request,input:{...scriptedWildFlags(request),species:raw.species,level:raw.level}};
}
