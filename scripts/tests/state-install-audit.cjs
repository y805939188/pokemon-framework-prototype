'use strict';
const vm=require('node:vm'),{types}=require('node:util');
const {observeStateInstalls}=require('../../src/plugins/flowtest/state-install-audit.ts');
const audits=new WeakMap(),all=new Set();
require('node:test').after(()=>{for(const audit of all)audit.dispose();all.clear();});
function observe(root,installed){
  const audit=observeStateInstalls(root,root.PSFlow.app(),root.$gameSystem,vm.runInContext('Reflect',root),types.isProxy,installed);
  all.add(audit);const list=audits.get(root)??[];list.push(audit);audits.set(root,list);return audit;
}
function dispose(root){const list=audits.get(root)??[];for(const audit of list.reverse())audit.dispose();audits.delete(root);}
module.exports={observe,dispose};
