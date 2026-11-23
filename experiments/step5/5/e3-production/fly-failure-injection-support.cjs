'use strict';
const vm=require('node:vm');
// Match the Error realm used by the actual presentation consumer. Keep one
// configured object: callback/cleanup must throw that object without conversion.
function configuredFlyFailure(context,phase){
 if(phase!=='callback'&&phase!=='cleanup')throw Error('configured-fly-failure-phase');
 const reason='configured-fly-'+phase+'-failed';
 const RealmError=vm.runInContext('Error',context);
 return Object.freeze({reason,error:Reflect.construct(RealmError,[reason])});
}
module.exports={configuredFlyFailure};
