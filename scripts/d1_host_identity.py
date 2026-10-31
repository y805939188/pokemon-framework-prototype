"""Bounded identity for this macOS arm64 benchmark, not hostile-host attestation."""
from pathlib import Path
import hashlib,json,os,plistlib,stat,struct,subprocess

def digest(data):return hashlib.sha256(data).hexdigest()

def complete_app(app):
    app=app.resolve();entries={}
    for p in sorted(app.rglob('*')):
        rel=p.relative_to(app).as_posix();mode=stat.S_IMODE(p.lstat().st_mode)
        if p.is_symlink():
            target=p.resolve(strict=True)
            if not target.is_relative_to(app):raise RuntimeError('external app symlink: '+rel)
            entries[rel]=dict(kind='link',target=os.readlink(p),mode=mode)
        elif p.is_file():entries[rel]=dict(kind='file',sha256=digest(p.read_bytes()),mode=mode)
        elif p.is_dir():entries[rel]=dict(kind='directory',mode=mode)
        else:raise RuntimeError('unsupported app entry: '+rel)
    return entries

def signed_main_code(raw):
    # Only the installed thin arm64 Mach-O is supported. Unknown layouts fail closed.
    if len(raw)<32 or raw[:4]!=b'\xcf\xfa\xed\xfe':raise RuntimeError('unsupported host Mach-O')
    cpu=struct.unpack_from('<I',raw,4)[0]
    if cpu!=0x100000c:raise RuntimeError('host must be arm64')
    ncmds,size=struct.unpack_from('<II',raw,16);end=32+size;offset=32;signatures=[]
    if end>len(raw)or ncmds>4096:raise RuntimeError('invalid Mach-O commands')
    for _ in range(ncmds):
        if offset+8>end:raise RuntimeError('truncated Mach-O command')
        cmd,length=struct.unpack_from('<II',raw,offset)
        if length<8 or length%8 or offset+length>end:raise RuntimeError('invalid Mach-O command length')
        if cmd==0x1d:
            if length!=16:raise RuntimeError('invalid signature command')
            signatures.append(struct.unpack_from('<II',raw,offset+8))
        offset+=length
    if offset!=end or len(signatures)!=1:raise RuntimeError('one bounded signature required')
    start,length=signatures[0]
    if start<end or length<12 or start+length!=len(raw):raise RuntimeError('signature must be a bounded tail')
    magic,blob_length=struct.unpack_from('>II',raw,start)
    if magic!=0xfade0cc0 or not 12<=blob_length<=length:raise RuntimeError('invalid embedded signature')
    signature=raw[start:start+blob_length];count=struct.unpack_from('>I',signature,8)[0];policies={}
    if count>32 or 12+count*8>blob_length:raise RuntimeError('invalid signature index')
    for i in range(count):
        slot,offset=struct.unpack_from('>II',signature,12+i*8)
        if offset<12+count*8 or offset+8>blob_length or str(slot)in policies:raise RuntimeError('invalid signature slot')
        tag,size=struct.unpack_from('>II',signature,offset)
        if size<8 or offset+size>blob_length:raise RuntimeError('invalid signature blob')
        blob=bytearray(signature[offset:offset+size])
        if slot==0 or 0x1000<=slot<=0x1005:
            if tag!=0xfade0c02 or size<44:raise RuntimeError('invalid CodeDirectory')
            hashes,_,special,code=struct.unpack_from('>IIII',blob,16);width=blob[36]
            if width not in [20,32,48]or hashes-special*width<44 or hashes+code*width>size:raise RuntimeError('invalid CodeDirectory hash bounds')
            # Only Info.plist and CodeResources digests vary with allowed display names / changed game payload.
            # All signing flags, code-page hashes, requirements and entitlement blobs remain bound.
            for item in [1,3]:
                if special>=item:blob[hashes-item*width:hashes-(item-1)*width]=b'\0'*width
        policies[str(slot)]=digest(blob)
    if '0'not in policies:raise RuntimeError('missing primary CodeDirectory')
    return dict(codeSHA256=digest(raw[:start]),signaturePolicy=policies,signatureOffset=start,signatureLength=length)

def launch_config(app):
    doc=json.loads((app/'Contents/Resources/app.nw/package.json').read_text())
    if not isinstance(doc,dict)or not isinstance(doc.get('name'),str)or not doc['name']:raise RuntimeError('missing package name')
    return {k:v for k,v in doc.items()if k!='name'}

def host_identity(app,*,synthetic=False):
    all_entries=complete_app(app);result={}
    for name,value in all_entries.items():
        if name=='Contents/Resources/app.nw'or name.startswith('Contents/Resources/app.nw/'):continue
        if name=='Contents/Info.plist':
            doc=plistlib.loads((app/name).read_bytes())
            for key in ['CFBundleName','CFBundleDisplayName']:
                if not isinstance(doc.get(key),str)or not doc[key]:raise RuntimeError('missing bundle display name')
                doc.pop(key)
            result[name]=dict(kind='plist',value=doc,mode=value['mode'])
        elif name=='Contents/MacOS/nwjs'and not synthetic:
            result[name]=dict(kind='signed-main',**signed_main_code((app/name).read_bytes()),mode=value['mode'])
        elif name=='Contents/_CodeSignature/CodeResources'and not synthetic:
            # The resource envelope necessarily changes with PS_BattleFlow.js and package names.
            # Verify each complete signature below; never ignore any executable code or other host file.
            result[name]=dict(kind='verified-resource-envelope',mode=value['mode'])
        else:result[name]=value
    if not synthetic:
        verified=subprocess.run(['codesign','--verify','--deep','--strict',str(app)],capture_output=True,text=True,timeout=30)
        if verified.returncode:raise RuntimeError('host signature verification failed: '+verified.stderr.strip())
    return dict(host=result,launch=launch_config(app),kind='SYNTHETIC_ONLY'if synthetic else'BOUNDED_SIGNED_ARM64_HOST')

def require_pair(control,candidate,*,synthetic=False):
    left=host_identity(control,synthetic=synthetic);right=host_identity(candidate,synthetic=synthetic)
    # Type-preserving comparison: Python otherwise equates true with 1 in launch/Info.plist values.
    if (plistlib.dumps(left['host'],sort_keys=True)!=plistlib.dumps(right['host'],sort_keys=True)
        or json.dumps(left['launch'],sort_keys=True,allow_nan=False)!=json.dumps(right['launch'],sort_keys=True,allow_nan=False)):
        raise RuntimeError('control/candidate host code or launch configuration differs')
    return left

RUNTIME_FIELDS=('nw','node','chromium','v8','platform','arch')
def runtime_identity(env):
    identity={k:env.get(k)for k in RUNTIME_FIELDS}
    if any(not isinstance(v,str)or not v for v in identity.values()):raise RuntimeError('missing runtime version identity')
    return identity

def require_runtime(previous,env):
    current=runtime_identity(env)
    if previous is not None and previous!=current:raise RuntimeError('runtime version identity differs across groups')
    return current
