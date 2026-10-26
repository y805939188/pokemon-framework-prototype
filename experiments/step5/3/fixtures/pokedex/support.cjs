'use strict';
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { createHash } = require('node:crypto');
const root = resolve(__dirname, '../../../../..');
function load(name) {
  const path = resolve(root, 'src/framework/rules', name + '.ts');
  return import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(path, 'utf8'), {sourceUrl:path})).toString('base64'));
}
const layout = () => ({national:['a','b','c','d','e'],regions:[{id:0,species:['a','b','c','d']},{id:1,species:['c','e']}]});
function dex(table = layout(), extra = {}) {
  return {seen:[],owned:[],hasDex:true,seenForms:{},lastSeenForm:{},capturedCounts:{},defeatedCounts:{},
    unlocked:[...table.regions.map((_,i)=>i===0),false],view:{region:table.regions.length?0:-1,indices:Array(table.regions.length+1).fill(0),mode:0},
    layoutIdentity:createHash('sha256').update(JSON.stringify(table)).digest('hex'),...extra};
}
const appearance = (species = 'a', extra = {}) => ({species,gender:0,form:0,shiny:false,...extra});
function catalog(table = layout()) {
  return {layout:table,forms:[
    {species:'a',form:0,name:'Alpha',heightDm:10,weightHg:100,types:['grass','poison'],color:'green',shape:'quadruped',categoryKey:'cat.a',entryKey:'entry.a',gender:128},
    {species:'b',form:0,name:'Beta',heightDm:20,weightHg:400,types:['fire'],color:'red',shape:'biped',gender:128},
    {species:'c',form:0,name:'Charlie',heightDm:10,weightHg:100,types:['water'],color:'blue',shape:'fish',gender:128},
    {species:'d',form:0,name:'Delta',heightDm:5,weightHg:50,types:['grass'],color:'green',shape:'quadruped',gender:128},
    {species:'e',form:0,name:'Echo',heightDm:30,weightHg:800,types:['fire'],color:'red',shape:'biped',gender:128},
    {species:'a',form:1,name:'Alpha Tall',heightDm:40,weightHg:900,types:['grass','fairy'],color:'pink',shape:'biped',formName:'Tall',pokedexForm:1,gender:128},
  ]};
}
const options = {locale:'en-GB'};
const directory = {names:Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ',c=>({id:c,characters:c.toLowerCase()})),types:['grass','poison','fire','water','fairy'],colors:['green','red','blue','pink'],shapes:['quadruped','biped','fish']};
const empty = mode => [mode??0,-1,-1,-1,-1,-1,-1,-1,-1,-1];
function freeze(value) { if (value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
module.exports = {load,root,layout,dex,appearance,catalog,options,directory,empty,freeze};
