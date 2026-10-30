/** Gen8 basic trainer policy. Pure values/intent only; no source capability or host integration. */
export type MemberId = string;
export type CandidateId = string;
export type PersistentStatus = "none" | "slp" | "frz" | "par" | "psn" | "tox" | "brn";
export type RandomN = (exclusiveUpperBound: number) => number;
/** Correlation only. Copying this record cannot authorize registration, recovery, inventory or source access. */
export interface DecisionBinding {
  readonly requestKey: string;
  readonly requestRevision: string;
  readonly generation: number;
  readonly turn: number;
  readonly ownResourceRevision: number;
}
export interface Ratio { readonly numerator: number; readonly denominator: number; }
export interface PublicHpBar { readonly parts: number; readonly scale: 100; }
export interface PublicOpponent {
  readonly appearanceKey: string;
  readonly displayedSpecies: string;
  readonly displayedForm: number;
  readonly level: number;
  /** Public Gen8 `???` is neutral typeless, never inferred from an opponent's hidden real type. */
  readonly shownTypes: readonly string[];
  readonly hpBar: PublicHpBar;
  readonly status: PersistentStatus;
  readonly stages: Readonly<{ atk: number; def: number; spa: number; spd: number; spe: number; accuracy: number; evasion: number }>;
  readonly revealedMoves: readonly string[];
  readonly lastPublicMove: { readonly moveId: string; readonly moveType: string; readonly basePower: number } | null;
  readonly fainted: boolean;
  readonly revealedAbility: string | null;
  readonly revealedItem: string | null;
}
export interface OwnMove {
  readonly slot: number;
  readonly moveId: string;
  readonly pp: number;
  readonly maxpp: number;
}
export interface OwnMember {
  readonly memberId: MemberId;
  readonly partyOrder: number;
  readonly active: boolean;
  readonly hp: number;
  readonly maxhp: number;
  readonly status: PersistentStatus;
  readonly confusionTurns: number;
  /** Fixed Gen8's exact `???` sentinel is typeless: neutral defense and no move-type STAB. */
  readonly types: readonly string[];
  readonly knownAbility: string;
  readonly knownHeldItem: string;
  readonly moves: readonly OwnMove[];
}
export interface TrainerResource {
  readonly resourceKey: string;
  readonly itemId: string;
  readonly count: number;
}
export interface LegalMoveCandidate {
  readonly candidateId: CandidateId;
  readonly slot: number;
  readonly moveId: string;
  readonly mode: "normal" | "engine-auto-struggle";
  readonly target: { readonly kind: "self" } | { readonly kind: "opponent"; readonly appearanceKey: string };
  readonly metadata: {
    readonly family: "basic-damage" | "known-useless" | "unmodeled";
    readonly moveType: string;
    readonly basePower: number;
    readonly accuracy: { readonly kind: "always" } | { readonly kind: "percent"; readonly value: number };
    readonly publicTypeMultiplier: Ratio;
    readonly publicFailure: "none" | "type-immune" | "no-public-target" | "public-condition";
    readonly omittedModifiers: readonly string[];
  };
}
export interface LegalSwitchCandidate {
  readonly candidateId: CandidateId;
  readonly memberId: MemberId;
}
export interface LegalItemCandidate {
  readonly candidateId: CandidateId;
  readonly resourceKey: string;
  readonly itemId: string;
  readonly targetMemberId: MemberId;
  readonly family: "heal-hp" | "full-restore" | "cure-status";
  /** AI preference estimate only. Never the execution amount, a source capability, or an instruction to heal. */
  readonly estimateHp: number;
  readonly cures: "all" | readonly PersistentStatus[];
  readonly curesConfusion: boolean;
}
export type AiRequest =
  | { readonly kind: "move"; readonly actorId: MemberId; readonly legalMoves: readonly LegalMoveCandidate[]; readonly legalItems: readonly LegalItemCandidate[] }
  | { readonly kind: "force-switch"; readonly legalSwitches: readonly LegalSwitchCandidate[] }
  | { readonly kind: "wait" }
  | { readonly kind: "finished" };
export interface TrainerAiSnapshot {
  readonly schema: "trainer-ai-public-v1";
  readonly gen: 8;
  readonly format: "gen8rpgcustomgame";
  readonly binding: DecisionBinding;
  readonly profile: { readonly skillLevel: number; readonly flags: readonly string[] };
  readonly own: { readonly side: "p2"; readonly party: readonly OwnMember[]; readonly resources: readonly TrainerResource[] };
  readonly opponent: { readonly active: readonly PublicOpponent[] };
  readonly field: { readonly weather: string; readonly terrain: string; readonly publicConditions: readonly string[] };
  readonly request: AiRequest;
}
export type Diagnostic =
  | "unmodeled-move-family" | "omitted-public-modifier" | "unsupported-trainer-item-family"
  | "zero-total-weight" | "first-legal-fallback" | "no-voluntary-switch-in-basic-profile";
export type DecisionPlan =
  | { readonly kind: "choose"; readonly binding: DecisionBinding; readonly candidateId: CandidateId; readonly retryOrder: readonly CandidateId[]; readonly diagnostics: readonly Diagnostic[] }
  | { readonly kind: "fallback"; readonly binding: DecisionBinding; readonly candidateIds: readonly CandidateId[]; readonly reason: "zero-total-weight" | "no-normal-move"; readonly diagnostics: readonly Diagnostic[] }
  | { readonly kind: "none"; readonly binding: DecisionBinding; readonly reason: "wait" | "finished" }
  | { readonly kind: "error"; readonly binding: DecisionBinding; readonly reason: "invalid-snapshot" | "invalid-random-result" | "no-legal-action" | "unsupported-request" };
/** Pure policy boundary: values in, untrusted intent out. Never submit directly from this interface. */
export interface TrainerAiPolicy { decide(snapshot: TrainerAiSnapshot, random: RandomN): DecisionPlan; }
/** Test seams for exact WP51 weight and forced-replacement arithmetic; not driver-provided final scores. */
export interface ScoredMove { readonly candidateId: CandidateId; readonly requestOrder: number; readonly score: number; }
export interface ForcedSwitchFeatures {
  readonly candidateId: CandidateId;
  readonly partyOrder: number;
  readonly hp: number;
  readonly maxhp: number;
  readonly entryHpLossEstimate: number;
  readonly poisonEntryPenalty: boolean;
  readonly stickyWebPenalty: boolean;
  readonly ownMoveAdvantages: readonly { readonly power: number; readonly publicTypeMultiplier: Ratio }[];
  readonly publicLastMoveRisks: readonly { readonly power: number; readonly publicTypeMultiplier: Ratio }[];
}

/** Public, fixed Gen8 metadata, copied at construction. No engine objects or lookup callbacks. */
export interface TrainerAiCatalog {
  readonly gen: 8;
  readonly moves: Readonly<Record<string, Pick<LegalMoveCandidate['metadata'], 'family' | 'moveType' | 'basePower' | 'accuracy'>>>;
  readonly types: Readonly<Record<string, Readonly<Record<string, Ratio>>>>;
  /** Framework author item IDs, not limited to Showdown's held-item directory. */
  readonly items: Readonly<Record<string, {
    readonly family: LegalItemCandidate['family'] | 'unsupported';
    readonly estimateHp: number;
    readonly cures: 'all' | readonly PersistentStatus[];
    readonly curesConfusion: boolean;
  }>>;
}
type Failure = { kind: 'error'; reason: 'invalid-snapshot' | 'invalid-random-result' | 'no-legal-action' };
class Invalid extends Error {}
class BadRandom extends Error {}
const requireValue: (value: unknown) => asserts value = value => { if (!value) throw new Invalid(); };
const statuses = ['none', 'slp', 'frz', 'par', 'psn', 'tox', 'brn'] as const;
const emptyBinding = (): DecisionBinding => ({requestKey: '', requestRevision: '', generation: 0, turn: 0, ownResourceRevision: 0});
const failure = (error: unknown): Failure => ({kind: 'error', reason: error instanceof BadRandom ? 'invalid-random-result' : 'invalid-snapshot'});

/** Read descriptors, never accessors or toJSON. Detach before invoking any supplied random callback. */
function dataCopy(value: unknown, limit = 100_000): unknown {
  let remaining = limit;
  const parents = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    requireValue(--remaining >= 0 && depth <= 20);
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { requireValue(v.length <= 512); return v; }
    if (typeof v === 'number') { requireValue(Number.isFinite(v)); return v; }
    requireValue(typeof v === 'object' && v !== null && !parents.has(v));
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    requireValue(array ? proto === Array.prototype : proto === Object.prototype || proto === null);
    parents.add(v);
    const keys = Reflect.ownKeys(v), out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    if (array) {
      const ld = Object.getOwnPropertyDescriptor(v, 'length');
      requireValue(ld && 'value' in ld && Number.isSafeInteger(ld.value) && ld.value <= 4096);
      const length = ld.value as number;
      requireValue(keys.length === length + 1);
      const a: unknown[] = [];
      for (let i = 0; i < length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        requireValue(d && 'value' in d && d.enumerable);
        a.push(visit(d.value, depth + 1));
      }
      parents.delete(v); return a;
    }
    for (const key of keys) {
      requireValue(typeof key === 'string');
      const d = Object.getOwnPropertyDescriptor(v, key);
      requireValue(d && 'value' in d && d.enumerable);
      Object.defineProperty(out, key, {value: visit(d.value, depth + 1), enumerable: true});
    }
    parents.delete(v); return out;
  }
  return visit(value, 0);
}
function record(v: unknown, keys: string): asserts v is Record<string, unknown> {
  requireValue(v !== null && typeof v === 'object' && !Array.isArray(v));
  const expected = keys ? keys.split(' ') : [], actual = Object.keys(v);
  requireValue(actual.length === expected.length && expected.every(k => Object.hasOwn(v, k)));
}
function text(v: unknown, empty = false): asserts v is string { requireValue(typeof v === 'string' && (empty || v.length > 0)); }
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts v is number {
  requireValue(Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max);
}
function bool(v: unknown): asserts v is boolean { requireValue(typeof v === 'boolean'); }
function list(v: unknown, max = 4096): asserts v is unknown[] { requireValue(Array.isArray(v) && v.length <= max); }
function strings(v: unknown, max = 4096, unique = true): asserts v is string[] { list(v, max); v.forEach(x => text(x)); requireValue(!unique || new Set(v).size === v.length); }
function status(v: unknown): asserts v is PersistentStatus { requireValue(statuses.includes(v as PersistentStatus)); }
function ratio(v: unknown): asserts v is Ratio { record(v, 'numerator denominator'); number(v.numerator, 0, 16); number(v.denominator, 1, 16); }
function accuracy(v: unknown): void {
  requireValue(v && typeof v === 'object'); const kind = (v as Record<string, unknown>).kind;
  if (kind === 'always') record(v, 'kind');
  else { record(v, 'kind value'); requireValue(kind === 'percent'); number(v.value, 0, 100); }
}
function add(a: number, b: number): number { const x = a + b; requireValue(Number.isSafeInteger(x)); return x; }
function multiply(a: number, b: number): number { const x = a * b; requireValue(Number.isSafeInteger(x)); return x; }
function draw(random: RandomN, n: number): number {
  number(n, 1); if (typeof random !== 'function') throw new BadRandom();
  let x: number;
  try { x = random(n); } catch { throw new BadRandom(); }
  if (!Number.isSafeInteger(x) || x < 0 || x >= n) throw new BadRandom();
  return x;
}
function flagsFor(skill: number, flags: readonly string[]): string[] {
  number(skill); strings(flags,128,false);
  const out = new Set(flags);
  if (skill > 0) for (const f of ['PredictMoveFailure','ScoreMoves','PreferMultiTargetMoves']) out.add(f);
  if (skill >= 32) for (const f of ['ConsiderSwitching','HPAware']) out.add(f);
  if (skill < 32) out.add('UsePokemonInOrder'); else if (skill >= 100) out.add('ReserveLastPokemon');
  for (const f of out) if (f.startsWith('Anti')) out.delete(f.slice(4));
  return [...out];
}
export function effectiveTrainerAiFlags(skill: number, flags: readonly string[]): {flags: string[]} | Failure {
  try { const copy = dataCopy({skill, flags}) as {skill: number; flags: string[]}; return {flags: flagsFor(copy.skill, copy.flags)}; }
  catch (error) { return failure(error); }
}
interface MoveScoreInput {
  basePower: number; stab: boolean; publicTypeMultiplier: Ratio; accuracy: number;
  family: LegalMoveCandidate['metadata']['family']; scoreMoves: boolean; predictFailure: boolean;
  publicFailure: LegalMoveCandidate['metadata']['publicFailure'];
}
function scoreMove(x: MoveScoreInput): {score: number; modeled: boolean; diagnostic?: Diagnostic} {
  record(x, 'basePower stab publicTypeMultiplier accuracy family scoreMoves predictFailure publicFailure');
  number(x.basePower); bool(x.stab); ratio(x.publicTypeMultiplier); number(x.accuracy, 0, 100);
  bool(x.scoreMoves); bool(x.predictFailure);
  requireValue(['basic-damage','known-useless','unmodeled'].includes(x.family));
  requireValue(['none','type-immune','no-public-target','public-condition'].includes(x.publicFailure));
  const modeled = x.family !== 'unmodeled', extra = modeled ? {} : {diagnostic: 'unmodeled-move-family' as const};
  if (x.predictFailure && (x.publicFailure !== 'none' || (x.family === 'basic-damage' && x.publicTypeMultiplier.numerator === 0))) return {score: 20, modeled, ...extra};
  if (!x.scoreMoves) return {score: 100, modeled, ...extra};
  if (x.family !== 'basic-damage') return {score: 60, modeled, ...extra};
  const numerator = multiply(multiply(multiply(x.basePower, x.stab ? 3 : 1), x.publicTypeMultiplier.numerator), x.accuracy);
  const denominator = multiply(multiply(x.stab ? 2 : 1, x.publicTypeMultiplier.denominator), 100);
  return {score: add(100, Math.floor(numerator / denominator)), modeled};
}
export function scoreTrainerMove(input: MoveScoreInput): ReturnType<typeof scoreMove> | Failure {
  try { return scoreMove(dataCopy(input) as MoveScoreInput); } catch (error) { return failure(error); }
}
interface WeightedSelection { kind: 'choose' | 'fallback'; q: number; weights: number[]; total: number; candidateId?: string; candidateIds?: string[]; retryOrder?: string[]; reason?: 'zero-total-weight'; }
function select(skill: number, candidates: readonly ScoredMove[], random: RandomN): WeightedSelection | Failure {
  number(skill); list(candidates, 64); const ids = new Set<string>(), orders = new Set<number>();
  for (const c of candidates) {
    record(c, 'candidateId requestOrder score'); text(c.candidateId); number(c.requestOrder); number(c.score);
    requireValue(!ids.has(c.candidateId) && !orders.has(c.requestOrder)); ids.add(c.candidateId); orders.add(c.requestOrder);
  }
  if (candidates.length === 0) return {kind: 'error', reason: 'no-legal-action'};
  const ordered = [...candidates].sort((a,b) => a.requestOrder - b.requestOrder);
  const q = Math.floor(Math.max(...ordered.map(c => c.score)) * (0.6 + 0.35 * Math.sqrt(Math.min(skill,100) / 100)));
  number(q);
  const weights = ordered.map(c => Math.max(c.score - q, 0)), total = weights.reduce(add, 0);
  if (total === 0) return {kind: 'fallback', q, weights, total, candidateIds: ordered.map(c => c.candidateId), reason: 'zero-total-weight'};
  const n = draw(random, total); let accumulated = 0, chosen: ScoredMove | undefined;
  for (let i = 0; i < ordered.length; i++) { accumulated += weights[i]!; if (n < accumulated) { chosen = ordered[i]; break; } }
  requireValue(chosen);
  const rest = ordered.filter(c => c !== chosen).sort((a,b) => b.score - a.score || a.requestOrder - b.requestOrder);
  return {kind: 'choose', q, weights, total, candidateId: chosen.candidateId, retryOrder: [chosen.candidateId, ...rest.map(c => c.candidateId)]};
}
export function selectTrainerMove(skill: number, candidates: readonly ScoredMove[], random: RandomN): WeightedSelection | Failure {
  try { const c = dataCopy({skill, candidates}) as {skill:number; candidates:ScoredMove[]}; return select(c.skill, c.candidates, random); }
  catch (error) { return failure(error); }
}
function switchScore(x: ForcedSwitchFeatures): number {
  record(x, 'candidateId partyOrder hp maxhp entryHpLossEstimate poisonEntryPenalty stickyWebPenalty ownMoveAdvantages publicLastMoveRisks');
  text(x.candidateId); number(x.partyOrder,0,5); number(x.maxhp,1); number(x.hp,1,x.maxhp); number(x.entryHpLossEstimate);
  bool(x.poisonEntryPenalty); bool(x.stickyWebPenalty); list(x.ownMoveAdvantages,4); list(x.publicLastMoveRisks,1);
  let score = 100 - (x.entryHpLossEstimate >= x.hp ? 50 : Math.floor(multiply(50,x.entryHpLossEstimate) / x.hp));
  if (x.poisonEntryPenalty) score -= 20; if (x.stickyWebPenalty) score -= 15;
  for (const [entries,denominator,sign] of [[x.ownMoveAdvantages,10,1],[x.publicLastMoveRisks,5,-1]] as const) {
    for (const e of entries) { record(e, 'power publicTypeMultiplier'); number(e.power); ratio(e.publicTypeMultiplier);
      const v = Math.floor(multiply(e.power,e.publicTypeMultiplier.numerator) / multiply(e.publicTypeMultiplier.denominator,denominator)); score = add(score,sign * v); }
  }
  return score;
}
export function scoreTrainerSwitch(input: ForcedSwitchFeatures): {score:number} | Failure {
  try { return {score:switchScore(dataCopy(input) as ForcedSwitchFeatures)}; } catch (error) { return failure(error); }
}
interface SwitchScore { candidateId: string; partyOrder: number; score: number; }
function chooseSwitch(flags: readonly string[], candidates: readonly SwitchScore[], last: number): {kind:'choose';candidateId:string;retryOrder:string[]} | Failure {
  strings(flags); list(candidates,6); number(last,0,5);
  const ids=new Set<string>(), orders=new Set<number>();
  for(const c of candidates) { record(c,'candidateId partyOrder score'); text(c.candidateId);number(c.partyOrder,0,5);number(c.score,-Number.MAX_SAFE_INTEGER);requireValue(!ids.has(c.candidateId)&&!orders.has(c.partyOrder));ids.add(c.candidateId);orders.add(c.partyOrder); }
  if (!candidates.length) return {kind:'error',reason:'no-legal-action'};
  const reserve = flags.includes('ReserveLastPokemon') && candidates.some(c=>c.partyOrder!==last);
  const selected = candidates.filter(c=>!reserve || c.partyOrder!==last).sort((a,b)=>flags.includes('UsePokemonInOrder') ? a.partyOrder-b.partyOrder : b.score-a.score || a.partyOrder-b.partyOrder);
  // A reserved last member remains a legal last-resort retry, never a fabricated switch target.
  const order=[...selected,...candidates.filter(c=>!selected.includes(c)).sort((a,b)=>a.partyOrder-b.partyOrder)];
  return {kind:'choose',candidateId:order[0]!.candidateId,retryOrder:order.map(c=>c.candidateId)};
}
export function chooseTrainerSwitch(flags: readonly string[], candidates: readonly SwitchScore[], lastOwnerPartyOrder: number): ReturnType<typeof chooseSwitch> {
  try { const x=dataCopy({flags,candidates,lastOwnerPartyOrder}) as {flags:string[];candidates:SwitchScore[];lastOwnerPartyOrder:number};return chooseSwitch(x.flags,x.candidates,x.lastOwnerPartyOrder); }
  catch(error) {return failure(error);}
}
export interface ItemPreferenceInput {
  hp:number; maxhp:number; status:PersistentStatus; confusionTurns:number;
  eligible:readonly LegalItemCandidate[]; unsupportedResources:readonly string[];
}
type ItemPreference = {kind:'choose';candidateId:string;retryOrder:string[];phase:'hp'|'status';preferenceEstimate:number;effectAmountIsNotEstimate:true;diagnostics:Diagnostic[]} | {kind:'continue-to-moves';itemCandidateId:null;diagnostics:Diagnostic[]} | Failure;
function curesStatus(c: LegalItemCandidate, s: PersistentStatus): boolean {return s!=='none' && (c.cures==='all' || c.cures.includes(s));}
function itemData(c: LegalItemCandidate): void {
  record(c,'candidateId resourceKey itemId targetMemberId family estimateHp cures curesConfusion');
  text(c.candidateId);text(c.resourceKey);text(c.itemId);text(c.targetMemberId);number(c.estimateHp);bool(c.curesConfusion);
  requireValue(['heal-hp','full-restore','cure-status'].includes(c.family));
  if(c.cures!=='all') {strings(c.cures,6);c.cures.forEach(s=>{status(s);requireValue(s!=='none');});}
  if(c.family==='heal-hp') requireValue(c.estimateHp>0 && c.cures!=='all' && c.cures.length===0 && !c.curesConfusion);
  if(c.family==='full-restore') requireValue(c.estimateHp===999 && c.cures==='all' && c.curesConfusion);
  if(c.family==='cure-status') requireValue(c.estimateHp===0 && (c.cures==='all'||c.cures.length>0||c.curesConfusion));
}
function preferItem(x: ItemPreferenceInput, random: RandomN): ItemPreference {
  record(x,'hp maxhp status confusionTurns eligible unsupportedResources');number(x.maxhp,1);number(x.hp,1,x.maxhp);status(x.status);number(x.confusionTurns);list(x.eligible,256);strings(x.unsupportedResources,256);
  const ids=new Set<string>();for(const c of x.eligible) {itemData(c);requireValue(!ids.has(c.candidateId));ids.add(c.candidateId);}
  const diagnostics:Diagnostic[]=x.unsupportedResources.length ? ['unsupported-trainer-item-family'] : [];
  const hasCure=x.status!=='none'||x.confusionTurns>0;
  const fullPriority=x.hp<=Math.floor(multiply(2,x.maxhp)/3)&&hasCure;
  const hp=x.eligible.filter(c=>(c.family==='heal-hp'||c.family==='full-restore')&&x.hp<x.maxhp);
  if(hp.length && x.hp<=x.maxhp/2 && (x.hp<=x.maxhp/4 || draw(random,100)<30)) {
    const priority=(c:LegalItemCandidate)=>c.family==='full-restore' ? (fullPriority?3:7) : 5;
    const sorted=hp.map((c,i)=>({c,i})).sort((a,b)=>priority(a.c)-priority(b.c)||a.c.estimateHp-b.c.estimateHp||a.i-b.i).map(e=>e.c);
    const needed=multiply(3,x.maxhp-x.hp)/4;
    const chosen=sorted.find(c=>c.estimateHp>=needed)??sorted[sorted.length-1]!;
    return {kind:'choose',candidateId:chosen.candidateId,retryOrder:[chosen.candidateId,...sorted.filter(c=>c!==chosen).map(c=>c.candidateId)],phase:'hp',preferenceEstimate:chosen.estimateHp,effectAmountIsNotEstimate:true,diagnostics};
  }
  const state=x.eligible.filter(c=>curesStatus(c,x.status)||(x.confusionTurns>0&&c.curesConfusion));
  if(state.length && (x.status==='slp'||x.status==='frz'||draw(random,100)<40)) {
    const priority=(c:LegalItemCandidate)=>c.family==='full-restore' ? (fullPriority?3:9) : c.cures==='all'?7:5;
    const order=state.map((c,i)=>({c,i})).sort((a,b)=>priority(a.c)-priority(b.c)||a.i-b.i).map(e=>e.c),chosen=order[0]!;
    return {kind:'choose',candidateId:chosen.candidateId,retryOrder:order.map(c=>c.candidateId),phase:'status',preferenceEstimate:chosen.estimateHp,effectAmountIsNotEstimate:true,diagnostics};
  }
  return {kind:'continue-to-moves',itemCandidateId:null,diagnostics};
}
export function preferTrainerItem(input:ItemPreferenceInput,random:RandomN):ItemPreference {
  try{return preferItem(dataCopy(input) as ItemPreferenceInput,random);}catch(error){return failure(error);}
}

function validateCatalog(input:unknown):TrainerAiCatalog {
  const x=dataCopy(input,500_000) as TrainerAiCatalog;
  record(x,'gen moves types items');requireValue(x.gen===8);
  for(const table of [x.moves,x.types,x.items]) requireValue(table&&typeof table==='object'&&!Array.isArray(table));
  const typeNames=Object.keys(x.types);requireValue(typeNames.length>0&&typeNames.length<=18);
  const gen8=['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
  requireValue(new Set(typeNames.map(k=>k.toLowerCase())).size===typeNames.length);
  for(const t of typeNames) {
    requireValue(gen8.includes(t.toLowerCase()));const row=x.types[t]!;record(row,typeNames.join(' '));
    for(const r of Object.values(row)) {ratio(r);requireValue([0,0.5,1,2].includes(r.numerator/r.denominator));}
  }
  requireValue(Object.keys(x.moves).length<=2000&&Object.keys(x.items).length<=4096);
  for(const [id,m] of Object.entries(x.moves)) {
    text(id);record(m,'family moveType basePower accuracy');requireValue(['basic-damage','known-useless','unmodeled'].includes(m.family));
    requireValue(typeNames.includes(m.moveType));number(m.basePower,0,1000);accuracy(m.accuracy);
  }
  for(const [id,i] of Object.entries(x.items)) {
    text(id);record(i,'family estimateHp cures curesConfusion');
    requireValue(['heal-hp','full-restore','cure-status','unsupported'].includes(i.family));number(i.estimateHp);bool(i.curesConfusion);
    if(i.cures!=='all'){strings(i.cures,6);for(const s of i.cures){status(s);requireValue(s!=='none');}}
    if(i.family!=='unsupported') itemData({candidateId:'metadata',resourceKey:'metadata',itemId:id,targetMemberId:'metadata',...i} as LegalItemCandidate);
  }
  return x;
}
function typeMultiplier(catalog:TrainerAiCatalog,attackType:string,defenseTypes:readonly string[]):Ratio {
  let numerator=1,denominator=1;
  for(const t of defenseTypes) {
    if(t==='???')continue;
    const row=Object.hasOwn(catalog.types,attackType)?catalog.types[attackType]:undefined;
    const r=row&&Object.hasOwn(row,t)?row[t]:undefined;requireValue(r);
    numerator=multiply(numerator,r.numerator);denominator=multiply(denominator,r.denominator);
  }
  // Type-chart inputs are Gen8 0/half/one/double; reduce to a stable small rational.
  while(numerator%2===0&&denominator%2===0&&denominator>1){numerator/=2;denominator/=2;}
  return {numerator,denominator};
}
function validateSnapshot(input:unknown,catalog:TrainerAiCatalog):TrainerAiSnapshot {
  const x=dataCopy(input) as TrainerAiSnapshot;
  record(x,'schema gen format binding profile own opponent field request');
  requireValue(x.schema==='trainer-ai-public-v1'&&x.gen===8&&x.format==='gen8rpgcustomgame');
  record(x.binding,'requestKey requestRevision generation turn ownResourceRevision');text(x.binding.requestKey);text(x.binding.requestRevision);
  number(x.binding.generation);number(x.binding.turn);number(x.binding.ownResourceRevision);
  record(x.profile,'skillLevel flags');number(x.profile.skillLevel);strings(x.profile.flags,128,false);
  record(x.own,'side party resources');requireValue(x.own.side==='p2');list(x.own.party,6);requireValue(x.own.party.length>0);list(x.own.resources,256);
  const members=new Map<string,OwnMember>(),orders=new Set<number>(),resources=new Map<string,TrainerResource>(),resourceItems=new Set<string>();
  for(const m of x.own.party){
    record(m,'memberId partyOrder active hp maxhp status confusionTurns types knownAbility knownHeldItem moves');text(m.memberId);number(m.partyOrder,0,5);bool(m.active);
    number(m.maxhp,1,65535);number(m.hp,0,m.maxhp);status(m.status);number(m.confusionTurns,0,255);strings(m.types,2);requireValue(m.types.length>0&&m.types.every(t=>t==='???'||Object.hasOwn(catalog.types,t)));
    text(m.knownAbility,true);text(m.knownHeldItem,true);list(m.moves,4);const slots=new Set<number>();
    for(const move of m.moves){record(move,'slot moveId pp maxpp');number(move.slot,1,4);text(move.moveId);number(move.maxpp,1,255);number(move.pp,0,move.maxpp);requireValue(!slots.has(move.slot)&&Object.hasOwn(catalog.moves,move.moveId));slots.add(move.slot);}
    requireValue(!members.has(m.memberId)&&!orders.has(m.partyOrder));members.set(m.memberId,m);orders.add(m.partyOrder);
  }
  requireValue(x.own.party.filter(m=>m.active).length<=1);
  for(const r of x.own.resources){record(r,'resourceKey itemId count');text(r.resourceKey);text(r.itemId);number(r.count);requireValue(!resources.has(r.resourceKey)&&!resourceItems.has(r.itemId)&&Object.hasOwn(catalog.items,r.itemId));resources.set(r.resourceKey,r);resourceItems.add(r.itemId);}
  record(x.opponent,'active');list(x.opponent.active,1);
  for(const foe of x.opponent.active){
    record(foe,'appearanceKey displayedSpecies displayedForm level shownTypes hpBar status stages revealedMoves lastPublicMove fainted revealedAbility revealedItem');
    text(foe.appearanceKey);text(foe.displayedSpecies);number(foe.displayedForm,0,65535);number(foe.level,1,100);strings(foe.shownTypes,2);requireValue(foe.shownTypes.length>0&&foe.shownTypes.every(t=>t==='???'||Object.hasOwn(catalog.types,t)));
    record(foe.hpBar,'parts scale');requireValue(foe.hpBar.scale===100);number(foe.hpBar.parts,0,100);bool(foe.fainted);requireValue(foe.fainted===(foe.hpBar.parts===0));status(foe.status);
    record(foe.stages,'atk def spa spd spe accuracy evasion');for(const stage of Object.values(foe.stages))number(stage,-6,6);
    strings(foe.revealedMoves,64);requireValue(foe.revealedMoves.every(id=>Object.hasOwn(catalog.moves,id)));
    if(foe.lastPublicMove!==null){record(foe.lastPublicMove,'moveId moveType basePower');const m=Object.hasOwn(catalog.moves,foe.lastPublicMove.moveId)?catalog.moves[foe.lastPublicMove.moveId]:undefined;requireValue(m&&foe.revealedMoves.includes(foe.lastPublicMove.moveId)&&foe.lastPublicMove.moveType===m.moveType&&foe.lastPublicMove.basePower===m.basePower);}
    for(const v of [foe.revealedAbility,foe.revealedItem])if(v!==null)text(v);
  }
  record(x.field,'weather terrain publicConditions');text(x.field.weather,true);text(x.field.terrain,true);strings(x.field.publicConditions,64);
  requireValue(x.request&&typeof x.request==='object');const req=x.request,ids=new Set<string>();
  function candidate(id:string){text(id);requireValue(!ids.has(id));ids.add(id);}
  if(req.kind==='wait'||req.kind==='finished'){record(req,'kind');return x;}
  if(req.kind==='force-switch'){
    record(req,'kind legalSwitches');list(req.legalSwitches,6);
    for(const c of req.legalSwitches){record(c,'candidateId memberId');candidate(c.candidateId);const m=members.get(c.memberId);requireValue(m&&!m.active&&m.hp>0);}
    requireValue(new Set(req.legalSwitches.map(c=>c.memberId)).size===req.legalSwitches.length);return x;
  }
  requireValue(req.kind==='move');record(req,'kind actorId legalMoves legalItems');
  const actor=members.get(req.actorId);requireValue(actor&&actor.active&&actor.hp>0);list(req.legalMoves,64);list(req.legalItems,256);
  const moveTargets=new Set<string>();let auto=0,lastSlot=0;
  for(const c of req.legalMoves){
    record(c,'candidateId slot moveId mode target metadata');candidate(c.candidateId);number(c.slot,1,4);text(c.moveId);requireValue(c.slot>=lastSlot);lastSlot=c.slot;
    const move=Object.hasOwn(catalog.moves,c.moveId)?catalog.moves[c.moveId]:undefined;requireValue(move);
    if(c.mode==='engine-auto-struggle'){requireValue(c.moveId==='struggle');auto++;}
    else{requireValue(c.mode==='normal');const own=actor.moves.find(m=>m.slot===c.slot);requireValue(own&&own.moveId===c.moveId&&own.pp>0);}
    requireValue(c.target&&typeof c.target==='object');let targetTypes:readonly string[];
    if(c.target.kind==='self'){record(c.target,'kind');targetTypes=actor.types;}
    else{record(c.target,'kind appearanceKey');requireValue(c.target.kind==='opponent');const appearance=c.target.appearanceKey;const target=x.opponent.active.find(t=>t.appearanceKey===appearance&&!t.fainted);requireValue(target);targetTypes=target.shownTypes;}
    const targetKey=c.slot+':'+c.target.kind+':'+(c.target.kind==='opponent'?c.target.appearanceKey:'');requireValue(!moveTargets.has(targetKey));moveTargets.add(targetKey);
    record(c.metadata,'family moveType basePower accuracy publicTypeMultiplier publicFailure omittedModifiers');
    requireValue(c.metadata.family===move.family&&c.metadata.moveType===move.moveType&&c.metadata.basePower===move.basePower);accuracy(c.metadata.accuracy);
    requireValue(c.metadata.accuracy.kind===move.accuracy.kind&&(c.metadata.accuracy.kind==='always'||(move.accuracy.kind==='percent'&&c.metadata.accuracy.value===move.accuracy.value)));
    ratio(c.metadata.publicTypeMultiplier);const expected=typeMultiplier(catalog,c.metadata.moveType,targetTypes);
    requireValue(c.metadata.publicTypeMultiplier.numerator*expected.denominator===expected.numerator*c.metadata.publicTypeMultiplier.denominator);
    requireValue(['none','type-immune','no-public-target','public-condition'].includes(c.metadata.publicFailure));
    requireValue(c.metadata.publicFailure!=='type-immune'||expected.numerator===0);strings(c.metadata.omittedModifiers,64);
  }
  requireValue(auto===0||(auto===1&&req.legalMoves.length===1));
  const resourceCandidates=new Set<string>();
  for(const c of req.legalItems){
    itemData(c);candidate(c.candidateId);const r=resources.get(c.resourceKey);requireValue(r&&r.itemId===c.itemId&&r.count>0&&c.targetMemberId===actor.memberId&&!resourceCandidates.has(c.resourceKey));resourceCandidates.add(c.resourceKey);
    const i=catalog.items[c.itemId]!;requireValue(i.family===c.family&&i.estimateHp===c.estimateHp&&i.curesConfusion===c.curesConfusion);
    requireValue(i.cures==='all'?c.cures==='all':c.cures!=='all'&&i.cures.length===c.cures.length&&i.cures.every((s,j)=>s===c.cures[j]));
    requireValue(((c.family==='heal-hp'||c.family==='full-restore')&&actor.hp<actor.maxhp)||curesStatus(c,actor.status)||(c.curesConfusion&&actor.confusionTurns>0));
  }
  return x;
}
function id(s:string):string{return s.toLowerCase().replace(/[^a-z0-9]/g,'');}
function switchFeatures(c:LegalSwitchCandidate,x:TrainerAiSnapshot,catalog:TrainerAiCatalog):ForcedSwitchFeatures {
  const m=x.own.party.find(m=>m.memberId===c.memberId)!;
  const foe=x.opponent.active.find(m=>!m.fainted),types=m.types.map(id),ability=id(m.knownAbility),item=id(m.knownHeldItem);
  const grounded=item==='ironball'||(!types.includes('flying')&&ability!=='levitate'&&item!=='airballoon');
  const conditions=x.field.publicConditions,boots=item==='heavydutyboots';let entry=0;
  if(!boots&&ability!=='magicguard'){
    const spikes=conditions.includes('p2:spikes:3')?3:conditions.includes('p2:spikes:2')?2:conditions.includes('p2:spikes:1')?1:0;
    if(grounded&&spikes)entry=add(entry,Math.floor(m.maxhp/(spikes===1?8:spikes===2?6:4)));
    if(conditions.includes('p2:stealthrock')){
      const rock=Object.keys(catalog.types).find(t=>id(t)==='rock');requireValue(rock);const mult=typeMultiplier(catalog,rock,m.types);
      entry=add(entry,Math.floor(multiply(m.maxhp,mult.numerator)/multiply(8,mult.denominator)));
    }
  }
  const advantages:ForcedSwitchFeatures['ownMoveAdvantages']=foe?m.moves.filter(move=>move.pp>0&&catalog.moves[move.moveId]!.family==='basic-damage').map(move=>({power:catalog.moves[move.moveId]!.basePower,publicTypeMultiplier:typeMultiplier(catalog,catalog.moves[move.moveId]!.moveType,foe.shownTypes)})):[];
  const last=foe?.lastPublicMove,risks:ForcedSwitchFeatures['publicLastMoveRisks']=last&&catalog.moves[last.moveId]!.family==='basic-damage'?[{power:last.basePower,publicTypeMultiplier:typeMultiplier(catalog,last.moveType,m.types)}]:[];
  return {candidateId:c.candidateId,partyOrder:m.partyOrder,hp:m.hp,maxhp:m.maxhp,entryHpLossEstimate:entry,
    poisonEntryPenalty:!boots&&grounded&&m.status==='none'&&!types.includes('poison')&&!types.includes('steel')&&ability!=='immunity'&&conditions.some(s=>s==='p2:toxicspikes:1'||s==='p2:toxicspikes:2'),
    stickyWebPenalty:!boots&&grounded&&conditions.includes('p2:stickyweb'),ownMoveAdvantages:advantages,publicLastMoveRisks:risks};
}

/** Construct once from fixed public Gen8/author metadata. This grants no source/registration authority. */
export function createTrainerAiPolicy(publicCatalog:TrainerAiCatalog):TrainerAiPolicy {
  let catalog:TrainerAiCatalog;
  try{catalog=validateCatalog(publicCatalog);}catch{throw new Error('invalid trainer AI public catalog');}
  return {decide(input:TrainerAiSnapshot,random:RandomN):DecisionPlan{
    let binding=emptyBinding();
    try{
      const x=validateSnapshot(input,catalog);binding={...x.binding};const flags=flagsFor(x.profile.skillLevel,x.profile.flags),req=x.request;
      if(req.kind==='wait'||req.kind==='finished')return {kind:'none',binding,reason:req.kind};
      const diagnostics:Diagnostic[]=[];
      const diagnostic=(d:Diagnostic)=>{if(!diagnostics.includes(d))diagnostics.push(d);};
      const modeledFlags=['PredictMoveFailure','ScoreMoves','PreferMultiTargetMoves','ConsiderSwitching','HPAware','UsePokemonInOrder','ReserveLastPokemon'];
      if(flags.some(f=>!modeledFlags.includes(f)&&!(f.startsWith('Anti')&&modeledFlags.includes(f.slice(4)))))diagnostic('omitted-public-modifier');
      if(x.field.weather||x.field.terrain||x.field.publicConditions.length||x.opponent.active.some(f=>Object.values(f.stages).some(n=>n!==0)))diagnostic('omitted-public-modifier');
      if(req.kind==='force-switch'){
        const candidates=req.legalSwitches.map(c=>{const f=switchFeatures(c,x,catalog);const m=x.own.party.find(m=>m.memberId===c.memberId)!;if(m.moves.some(v=>catalog.moves[v.moveId]!.family!=='basic-damage'))diagnostic('unmodeled-move-family');return {candidateId:c.candidateId,partyOrder:f.partyOrder,score:switchScore(f)};});
        const chosen=chooseSwitch(flags,candidates,Math.max(...x.own.party.map(m=>m.partyOrder)));
        if(chosen.kind==='error')return {...chosen,binding};
        return {...chosen,binding,diagnostics};
      }
      // A normal request must provide its move/explicit auto candidate set before any item gate.
      // Otherwise declining a legal item's probability could consume RNG and only then report no action.
      if(req.legalMoves.length===0)return {kind:'error',binding,reason:req.legalItems.length?'invalid-snapshot':'no-legal-action'};
      const actor=x.own.party.find(m=>m.memberId===req.actorId)!;
      // Compute all deterministic scores before the first RNG call, including any overflow checks.
      const scored=req.legalMoves.map((c,requestOrder)=>{
        const score=scoreMove({basePower:c.metadata.basePower,stab:actor.types.includes(c.metadata.moveType),publicTypeMultiplier:c.metadata.publicTypeMultiplier,accuracy:c.metadata.accuracy.kind==='always'?100:c.metadata.accuracy.value,family:c.metadata.family,scoreMoves:flags.includes('ScoreMoves'),predictFailure:flags.includes('PredictMoveFailure'),publicFailure:c.metadata.publicFailure});
        if(score.diagnostic)diagnostic(score.diagnostic);if(c.metadata.omittedModifiers.length)diagnostic('omitted-public-modifier');
        return {candidateId:c.candidateId,requestOrder,score:score.score};
      });
      const item=preferItem({hp:actor.hp,maxhp:actor.maxhp,status:actor.status,confusionTurns:actor.confusionTurns,eligible:req.legalItems,unsupportedResources:x.own.resources.filter(r=>r.count>0&&catalog.items[r.itemId]!.family==='unsupported').map(r=>r.resourceKey)},random);
      if(item.kind==='error')return {...item,binding};for(const d of item.diagnostics)diagnostic(d);
      if(item.kind==='choose')return {kind:'choose',binding,candidateId:item.candidateId,retryOrder:item.retryOrder,diagnostics};
      if(flags.includes('ConsiderSwitching'))diagnostic('no-voluntary-switch-in-basic-profile');
      if(req.legalMoves[0]?.mode==='engine-auto-struggle')return {kind:'fallback',binding,candidateIds:[req.legalMoves[0].candidateId],reason:'no-normal-move',diagnostics};
      const chosen=select(x.profile.skillLevel,scored,random);
      if(chosen.kind==='error')return {...chosen,binding};
      if(chosen.kind==='fallback')return {kind:'fallback',binding,candidateIds:chosen.candidateIds!,reason:'zero-total-weight',diagnostics:[...diagnostics,'zero-total-weight','first-legal-fallback']};
      return {kind:'choose',binding,candidateId:chosen.candidateId!,retryOrder:chosen.retryOrder!,diagnostics};
    }catch(error){return {...failure(error),binding};}
  }};
}

/** Internal composition boundary: identical validation to basic, without invoking a strategy or drawing RNG. */
export function createTrainerAiSnapshotValidator(publicCatalog:TrainerAiCatalog):(input:unknown)=>TrainerAiSnapshot {
  const catalog=validateCatalog(publicCatalog);return input=>{try{return validateSnapshot(input,catalog);}catch{throw new Error('trainer-ai-invalid-public-snapshot');}};
}
