/** Native qualification binding bytes, never an authorization/permit issuer. Formal profiles remain separate. */
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const hex=(x:any,n:number)=>typeof x==='string'&&new RegExp('^[0-9a-f]{'+n+'}$').test(x);
const finite=(x:any)=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export class ClosedNativeAuthority { bindGroup():never{throw Error('native authority is not bound; no admission granted');} }
export function freezeNativeQualificationBinding(value:any,tools:any):any {
  const b=clone(value),keys=['version','stage','role','mode','nonce','groupId','sourceHead','sourceTree','pairBytesSHA256','packageInventorySHA256','sharedBridgeSHA256','donorHash','presentationHash','appRoot','profileRoot','saveRoot','outputRoot','caseIds','budget','view'];
  if(!b||typeof b!=='object'||Object.keys(b).sort().join('|')!==keys.sort().join('|'))throw Error('exact native qualification binding fields required; JSON cannot grant admission');
  if(b.version!=='D2-native-qualification-binding-v1'||b.stage!=='QUALIFICATION'||!['control','candidate'].includes(b.role)||b.mode!=='natural')throw Error('only separately labelled natural qualification is implemented; formal/off/GC remain gated');
  if(!hex(b.nonce,32)||b.groupId!=='qualification-'+b.role+'-'+b.nonce||!hex(b.sourceHead,40)||!hex(b.sourceTree,40))throw Error('versioned qualification identity required; no formal-group alias');
  for(const key of ['pairBytesSHA256','packageInventorySHA256','sharedBridgeSHA256'])if(!hex(b[key],64))throw Error('frozen source/package/bridge byte identity required');
  if(b.donorHash!==tools.donorHash||b.presentationHash!==tools.presentationHash)throw Error('native normal input/presentation identity drift');
  const expected=tools.compileNavigation().cases.map((c:any)=>c.id);if(JSON.stringify(b.caseIds)!==JSON.stringify(expected)||expected.length!==100)throw Error('exact complete ordered100 IDs required');
  const roots=['appRoot','profileRoot','saveRoot','outputRoot'].map(k=>b[k]);
  if(roots.some(p=>typeof p!=='string'||!p.startsWith('/')||p.split('/').includes('..')||p.endsWith('/'))||new Set(roots).size!==4)throw Error('distinct absolute frozen roots required');
  if(roots.slice(1).some(p=>p.startsWith(b.appRoot+'/'))||roots.some((p,i)=>roots.some((q,j)=>i!==j&&p.startsWith(q+'/'))))throw Error('qualification roots must be separate; physical link checks still belong to authority');
  if(!b.budget||Object.keys(b.budget).sort().join('|')!=='caseMs|runMs'||!finite(b.budget.caseMs)||!finite(b.budget.runMs)||b.budget.caseMs>b.budget.runMs)throw Error('finite qualification hygiene budget required, not a qualified formal deadline');
  if(!b.view||Object.keys(b.view).sort().join('|')!=='dpr|height|width'||b.view.width!==816||b.view.height!==624||b.view.dpr!==2)throw Error('frozen normal viewport required');
  const freeze=(o:any):any=>{if(o&&typeof o==='object'){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};return freeze(b);
}
export function nativeQualificationPreflight(argv:readonly string[],nodeRequire:any,tools:any):any {
  const args=argv.filter(x=>x.startsWith('--ps-d2-native-binding='));
  const result:any={version:'D2-native-qualification-preflight-v1',status:'BLOCKED_NATIVE_BINDING_MISSING',nativeAdmission:false,traceQualified:false,deadlineQualified:false,full100Accepted:false,actualBattles:0,stateHostAttached:false,actualInputSent:false};
  if(args.length===0)return Object.freeze(result);if(args.length!==1)throw Error('ambiguous native qualification binding');
  const fs=nodeRequire('node:fs'),path=nodeRequire('node:path'),crypto=nodeRequire('node:crypto'),file=args[0].slice('--ps-d2-native-binding='.length);
  if(!path.isAbsolute(file))throw Error('absolute native qualification binding file required');
  const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>1048576)throw Error('bounded regular qualification binding file required');
  const bytes=fs.readFileSync(file),binding=freezeNativeQualificationBinding(JSON.parse(bytes.toString('utf8')),tools);
  return Object.freeze({...result,status:'BINDING_BYTES_VALID_NATIVE_AUTHORITY_UNBOUND',binding,bindingFileSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),
    missing:['authenticated original full NW/Crashpad host gate and exclusive lease','actual final package/source/signature/CI verification','live authority/collector/qualified OS consumer binding'],authority:'CLOSED_NOT_CREATED_FROM_JSON'});
}
