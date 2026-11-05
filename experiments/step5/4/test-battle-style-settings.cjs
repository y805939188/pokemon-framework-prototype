'use strict';
// Real installed MZ configuration/Options method bodies; rendering and persistence I/O are controlled.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs');let temp,style;
test.before(async()=>{temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-battle-style-'));const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:temp,minify:false,lib:{entry:path.join(ROOT,'src/plugins/battleflow/battle-style-settings.ts'),formats:['cjs'],fileName:()=>'settings.cjs'}}});style=require(path.join(temp,'settings.cjs'));});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function method(source,name){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);return source.slice(a,b+3);}
function host(lang='en'){
 const managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),windows=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8'),scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8');
 function Options(){this._list=[];this._index=0;this.sounds=0;}Options.prototype={addCommand(name,symbol,enabled=true){this._list.push({name,symbol,enabled});},index(){return this._index;},commandSymbol(i){return this._list[i].symbol;},isCommandEnabled(i){return this._list[i].enabled;},findSymbol(s){return this._list.findIndex(r=>r.symbol===s);},redrawItem(){},playCursorSound(){this.sounds++;},changeVolume(){this.volumeDelegated=true;}};
 const G={ConfigManager:{},Window_Options:Options,Scene_Options:function(){},TextManager:{alwaysDash:'Dash',commandRemember:'Remember',touchUI:'Touch'}};vm.createContext(G);vm.runInContext('Number.prototype.clamp=function(min,max){return Math.min(Math.max(this,min),max);};',G);
 for(const n of ['makeData','applyData','readFlag','readVolume'])vm.runInContext(method(managers,'ConfigManager.'+n),G);
 for(const n of ['addGeneralOptions','statusText','processOk','cursorRight','cursorLeft','isVolumeSymbol','booleanStatusText','volumeStatusText','getConfigValue','setConfigValue','changeValue'])vm.runInContext(method(windows,'Window_Options.prototype.'+n),G);
 vm.runInContext(method(scenes,'Scene_Options.prototype.maxCommands'),G);G.ConfigManager.applyData({});style.installBattleStyleSettings(G,()=>E.i18n.translatorFor(lang));return G;
}
test('style parser accepts only the two styles or explicit inheritance; missing preference defaults Switch',()=>{
 for(const value of [undefined,'','inherit'])assert.equal(style.parseBattleStyle(value),undefined);for(const value of ['switch','set'])assert.equal(style.parseBattleStyle(value),value);for(const value of [null,false,true,0,'false',{},[]])assert.throws(()=>style.parseBattleStyle(value),/battleStyle must be/);
 assert.equal(style.playerBattleStyle({}),'switch');assert.equal(style.effectiveBattleStyle({ConfigManager:{psBattleStyle:'set'}},''),'set');assert.equal(style.effectiveBattleStyle({ConfigManager:{psBattleStyle:'set'}},'switch'),'switch');
});
test('actual ConfigManager make/apply round-trip Set and keep old native configuration; old or invalid fields default Switch',()=>{
 const G=host();G.ConfigManager.applyData({alwaysDash:true,touchUI:false,bgmVolume:40,psBattleStyle:'set'});assert.equal(style.playerBattleStyle(G),'set');const saved=JSON.parse(JSON.stringify(G.ConfigManager.makeData()));assert.equal(saved.psBattleStyle,'set');assert.equal(saved.alwaysDash,true);assert.equal(saved.touchUI,false);assert.equal(saved.bgmVolume,40);const next=host();next.ConfigManager.applyData(saved);assert.equal(next.ConfigManager.psBattleStyle,'set');assert.equal(next.ConfigManager.bgmVolume,40);
 for(const value of [undefined,null,0,'bad']){next.ConfigManager.applyData({psBattleStyle:value});assert.equal(style.playerBattleStyle(next),'switch');}assert.equal(new G.Scene_Options().maxCommands(),8);
});
for(const lang of ['en','zh'])test(lang+' real Options methods select both styles with OK/left/right and leave native options functional',()=>{
 const G=host(lang),w=new G.Window_Options();w.addGeneralOptions();assert.equal(w._list.length,4);assert.equal(w._list.at(-1).name,E.i18n.translatorFor(lang).t('ui.options.battle_style'));w._index=3;assert.equal(w.statusText(3),E.i18n.translatorFor(lang).t('ui.options.style_switch'));w.processOk();assert.equal(G.ConfigManager.psBattleStyle,'set');assert.equal(w.statusText(3),E.i18n.translatorFor(lang).t('ui.options.style_set'));w.cursorLeft();assert.equal(G.ConfigManager.psBattleStyle,'switch');w.cursorRight();assert.equal(G.ConfigManager.psBattleStyle,'set');w.processOk();assert.equal(G.ConfigManager.psBattleStyle,'switch');assert.equal(w.sounds,4);
 w._index=0;w.processOk();assert.equal(G.ConfigManager.alwaysDash,true);assert.equal(w.statusText(0),'ON');w._list.push({name:'Music',symbol:'bgmVolume',enabled:true});w._index=4;w.cursorRight();assert(w.volumeDelegated);assert.equal(G.ConfigManager.psBattleStyle,'switch');
});
test('a disabled style command cannot change the setting and installing twice does not duplicate it',()=>{
 const G=host();style.installBattleStyleSettings(G,()=>E.i18n.translatorFor('en'));const w=new G.Window_Options();w.addGeneralOptions();assert.equal(w._list.filter(r=>r.symbol==='psBattleStyle').length,1);w._index=3;w._list[3].enabled=false;w.processOk();w.cursorRight();w.cursorLeft();assert.equal(G.ConfigManager.psBattleStyle,'switch');assert.equal(w.sounds,0);
});
test('legacy controlled hosts without configuration methods retain default reads without installing fake persistence',()=>{
 const G={ConfigManager:{}};style.installBattleStyleSettings(G,()=>E.i18n.translatorFor('en'));assert.equal(style.playerBattleStyle(G),'switch');assert.equal(G.ConfigManager.makeData,undefined);
});
test('App rejects malformed author styles before session construction or persistent writes',async()=>{
 const F=require('./trainer-ai-integration/fixtures.cjs'),content=F.content(),state=F.T.fakes.createMemoryState(E.state.newGame({content,party:[],money:1000}));let calls=0;const app=new E.app.GameApplication({state,content:()=>({content}),sessions:{async create(){calls++;throw Error('must not create');}},projection:F.T.fakes.createRecordingProjection(),random:()=>0});
 for(const battleStyle of [null,true,0,'inherit','bad',{}])await assert.rejects(app.startBattle({battleId:'bad-style',kind:'wild',foes:[{species:'pidgey',level:3}],seq:1,battleStyle}),/battleStyle must be/);assert.equal(calls,0);assert.equal(state.replaced.length,0);
});
