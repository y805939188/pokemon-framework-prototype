/** Brand-check with the native operation, not instanceof across NW's renderer/CommonJS realms.
 * Non-Promise thenables never have their then property read. Native Promise species remain trusted JS.
 */
export function nativePromise(value:unknown):Promise<{value:unknown}>|null {
  let fulfill!:(value:unknown)=>void,reject!:(error:unknown)=>void;
  // Box the raw fulfillment value: resolving with it directly would assimilate a late `then` getter.
  const owned=new Promise<{value:unknown}>((resolve,fail)=>{fulfill=value=>resolve({value});reject=fail;});
  try { Promise.prototype.then.call(value,fulfill,reject);return owned; }
  catch { return null; }
}
