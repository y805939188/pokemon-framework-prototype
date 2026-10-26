'use strict';
const assert=require('node:assert/strict');const {setup,dispose,clone}=require(process.cwd()+'/experiments/step5/3/pokedex/ui-host.cjs');
let w;
try {
  let fail=true,hook,newToken,oldToken;
  w=setup({port:state=>({read:()=>{const f=hook;hook=null;f?.();return state.read();},replace:n=>{if(fail)throw Error('controlled zero write');state.replace(n);}})});
  const old=w.app.updatePokedex({kind:'view',value:{mode:4}});assert.equal(old.status,'pending');oldToken=old.view.token;
  hook=()=>{
    const current=w.app.pendingPokedex;assert.equal(current.token,oldToken);
    assert.equal(w.app.resolvePokedex(current.token,current.revision,{kind:'technical-terminate'}).status,'technically-terminated');
    const created=w.app.updatePokedex({kind:'view',value:{mode:5}});assert.equal(created.status,'pending');newToken=created.view.token;assert.notEqual(newToken,oldToken);
  };
  const before=clone(w.state.current());const result=w.open();
  const attached=w.app.pendingPokedex?.token===newToken&&w.p()?.view.kind==='recovery';
  fail=false;w.press('ok');
  const after={pendingToken:w.app.pendingPokedex?.token??null,mode:w.state.current().dex.view.mode,view:w.p()?.view.kind??null};
  console.log(JSON.stringify({openStatus:result.status,oldToken,newToken,attachedToCallbackCreatedOwner:attached,beforeMode:before.dex.view.mode,after}));
  assert.equal(result.status,'refused','an opener must refuse a different owner created by its first external callback');
  assert.equal(w.app.pendingPokedex?.token,newToken,'the old opener must not consume the new edit owner');
} finally {dispose();}
