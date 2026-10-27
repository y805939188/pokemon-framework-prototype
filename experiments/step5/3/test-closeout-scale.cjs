'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{corpus}=require('./closeout/scale.cjs');
test('I-SCALE lawful 8/128/900 rows, multiform two regions compile reproducibly and reach strict runtime query',()=>{
 const E=require('../../../js/engine/build/engine.cjs'),a=corpus(),b=corpus();
 assert.deepEqual(a.map(x=>x.compiledSha256),b.map(x=>x.compiledSha256));
 for(const x of a){assert.equal(x.baseSpecies+2,x.rows);assert.equal(x.forms,2);assert.equal(x.regions,2);const r=E.contentRuntime.assembleContent(E.contentRuntime.loadCompiled(x.compiled),E.dex.createDexLookup());assert.deepEqual(r.errors,[]);const c=r.content;assert.equal(Object.keys(c.species).length,x.rows);assert.equal(c.meta.showdownSourceChecked,true);assert.equal(c.forms.rotom[1],'Rotom-Heat');assert.equal(c.forms.rotom[2],'Rotom-Wash');const state=E.state.newGame({party:[],content:c});const app=new E.app.GameApplication({state:{read:()=>state,replace:()=>assert.fail('query writes')},content:()=>({content:c,dex:E.dex.createDexLookup()}),sessions:{create:()=>assert.fail('query battle')},projection:{project(){}},random:()=>assert.fail('query random'),clock:()=>0});const directory=app.pokedexSearchDirectory('zh');assert(directory.types.length>=18);const snap=app.pokedexSnapshot({},0);assert.equal(snap.catalog.layout.national.length,x.baseSpecies);assert.equal(snap.catalog.forms.length,x.rows);}
});
