/** Scripted complete-individual input. This module reads plain data; it owns no battle or world permission. */
import { snapshotMember } from '../rules/save-schema';
import { scriptedWildData, scriptedWildRequest, scriptedWildFlags } from './scripted-wild-input';
import { memberContentProblems } from '../rules/member-content';
import { initialWildBattleNameOf } from '../rules/species-key';
import type { Content, Member } from '../rules/types';
import type { BattleStartRequest, GivenWildBattleStartRequest } from './ports';

export interface CapturedGivenWildBattle { readonly input: GivenWildBattleStartRequest; readonly request: BattleStartRequest; readonly member: Member }
export function captureGivenWildBattle(input: unknown): CapturedGivenWildBattle {
  const raw=scriptedWildData(input,['member'],'given-wild');
  const checked = snapshotMember(raw.member);
  if (!checked.ok) throw Error('given-wild-member-invalid: ' + checked.problems.map(p => `${p.path} ${p.message}`).join('; '));
  const member=checked.member,request=scriptedWildRequest(raw,member.species,member.level,'given-wild');
  const accepted:GivenWildBattleStartRequest={...scriptedWildFlags(request),member};
  return { input: accepted, request, member };
}
export function assertGivenWildMember(member: Member, content: Content): void {
  if (!initialWildBattleNameOf(content, { species: member.species, form: member.form! })) throw Error('given-wild-member-form-unmapped');
  const problems = memberContentProblems(member, content, 'given.member');
  if (problems.length) throw Error('given-wild-member-content-invalid: ' + problems.map(p => `${p.path} ${p.message}`).join('; '));
  if (!member.moves.length) throw Error('given-wild-member-no-moves');
}
