'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {E,clone,setup,count}=require('./ef-support.cjs');
const limits=E.limits.DEFAULT_LIMITS??{party:6,boxes:1200,bagPerItem:999,money:999999};
function shop(x,stock=['potion'],allowSell=true){return {stock,allowSell,overrides:{},revision:0};}
const buy=(x,s,id,q=1,extra={})=>E.shop.planShop(x.game,x.content,s,{kind:'buy',itemId:id,quantity:q,confirmed:true,...extra},limits);
const sell=(x,s,id,q=1,extra={})=>E.shop.planShop(x.game,x.content,s,{kind:'sell',itemId:id,quantity:q,confirmed:true,...extra},limits);
const refusal=(fn,reason)=>assert.throws(fn,e=>e.message===reason||e.reason===reason);
test('P52-23 price slots read/writes, sell times2 and explicit0, old values, overflow',()=>{
 const x=setup(),s=shop(x);x.content.items.potion.price=300;x.content.items.potion.sellPrice=150;
 assert.equal(E.shop.shopPrice(x.content,s,'potion'),300);assert.equal(E.shop.shopPrice(x.content,s,'potion',true),150);
 s.overrides.potion=E.shop.updatePrice(undefined,250,60);assert.deepEqual(s.overrides.potion,{buy:250,sell:120});assert.equal(E.shop.shopPrice(x.content,s,'potion',true),120);
 assert.deepEqual(E.shop.updatePrice(s.overrides.potion,0),{buy:250,sell:120});assert.deepEqual(E.shop.updatePrice(s.overrides.potion,-1,-1),{buy:250,sell:120});assert.deepEqual(E.shop.updatePrice(s.overrides.potion,500),{buy:500,sell:500});s.overrides.potion=E.shop.updatePrice(s.overrides.potion,-1,0);refusal(()=>sell(x,s,'potion'),'not-sellable');assert.equal(E.shop.shopPrice(x.content,s,'potion'),250);
 for(const n of [NaN,Infinity,0.5])refusal(()=>E.shop.updatePrice(undefined,n),'invalid-price');refusal(()=>E.shop.updatePrice(undefined,1,Number.MAX_SAFE_INTEGER),'integer-overflow');
});
test('P52-21 quote/confirm rechecks price, balance and slot capacity without partial state',()=>{
 const x=setup({bag:{potion:998},settings:{BAG_POCKET_SLOTS:[-1,1,-1,-1,-1,-1,-1,-1]},edit:g=>{g.money=1000;}}),s=shop(x);x.content.items.potion.price=100;const before=clone(x.game),quote=E.shop.shopQuote(x.game,x.content,s,'potion',false,limits);assert.deepEqual(quote,{price:100,maximum:10,revision:0});assert.equal(buy(x,s,'potion',1,{confirmed:undefined}).status,'pending');assert.equal(buy(x,s,'potion',1,{confirmed:false}).status,'cancelled');
 refusal(()=>buy(x,s,'potion',2),'inventory-full');s.overrides.potion={buy:200,sell:-1};s.revision++;refusal(()=>buy(x,s,'potion',1,{expectedPrice:quote.price,expectedRevision:quote.revision}),'stale-price');assert.deepEqual(x.game,before);x.game.money=50;refusal(()=>buy(x,s,'potion'),'purchase-limit');x.game.money=1000;const r=buy(x,s,'potion');assert.equal(r.state.money,800);assert.equal(count(r.state,'potion',x.content),999);assert.equal(r.state.stats.money_spent_at_marts,200);assert.equal(r.state.stats.mart_items_bought,1);
});
test('P52-22 free purchase writes cap, important fixed1/latest ownership and caller array aliases',()=>{
 const x=setup({bag:{'box-link':1},edit:g=>{g.money=1000000;}}),stock=['box-link','potion'],s=shop(x,stock);E.shop.filterShopStock(x.game,x.content,stock);assert.deepEqual(stock,['potion']);assert.strictEqual(s.stock,stock);assert.equal(buy(x,s,'potion').state.money,999999);
 const y=setup(),original=['box-link','potion'];let t=y.app.beginMoneyShop({stock:original});assert.equal(y.app.inventoryRequest(t,'q2',{kind:'buy',itemId:'box-link',quantity:2,confirmed:true}).reason,'purchase-limit');assert.equal(y.app.inventoryRequest(t,'link',{kind:'buy',itemId:'box-link',quantity:1,confirmed:true}).status,'committed');assert.deepEqual(original,['potion']);y.app.endInventoryOperation(t);
 t=y.app.beginInventoryOperation();y.app.inventoryRequest(t,'take',{kind:'remove-items',itemId:'box-link',quantity:1});y.app.endInventoryOperation(t);t=y.app.beginMoneyShop({stock:original});assert.deepEqual(y.app.shopView(t).stock,['potion']);y.app.endInventoryOperation(t);t=y.app.beginMoneyShop({stock:['box-link','potion']});assert.deepEqual(y.app.shopView(t).stock,['box-link','potion']);y.app.endInventoryOperation(t);
 const z=setup({bag:{'box-link':1}});refusal(()=>buy(z,shop(z,['box-link']),'box-link'),'not-in-stock');
});
test('P52-22 catalog shop keeps catalog bytes, allowSell and per-session override cleanup',()=>{
 const x=setup({bag:{'box-link':1}});x.content.shops={local:{id:'local',stock:['box-link','potion'],allowSell:false,overrides:{potion:{buy:10,sell:4}},source:'synthetic-author'}};const before=clone(x.content.shops);let t=x.app.beginMoneyShop({shopId:'local'});assert.deepEqual(x.app.shopView(t).stock,['potion']);assert.equal(x.app.shopQuote(t,'potion').price,10);assert.throws(()=>x.app.shopQuote(t,'potion',true),/not-sellable/);x.app.setShopPrices(t,'potion',50,0);assert.equal(x.app.shopQuote(t,'potion').price,50);x.app.endInventoryOperation(t);t=x.app.beginMoneyShop({stock:['potion']});assert.equal(x.app.shopQuote(t,'potion').price,0);x.app.endInventoryOperation(t);assert.deepEqual(x.content.shops,before);
});
for(const q of [9,10,24,25])for(const generous of [false,true])test(`P52-25 bonus ball count ${q}/${generous}`,()=>{
 const x=setup({settings:{MORE_BONUS_PREMIER_BALLS:generous}}),s=shop(x,['pokeball']);const r=buy(x,s,'pokeball',q),expected=q<10?0:generous?Math.floor(q/10):1;assert.equal(r.result.bonus,expected);assert.equal(count(r.state,'premierball',x.content),expected);assert.equal(r.state.stats.premier_balls_earned,expected);assert.equal(r.state.stats.mart_items_bought,q);
});
test('P52-25 nonordinary ball branch, nonball, no fabricated missing Premier identity',()=>{
 const x=setup({settings:{MORE_BONUS_PREMIER_BALLS:false}});assert.equal(buy(x,shop(x,['masterball']),'masterball',25).result.bonus,0);x.content.settings.MORE_BONUS_PREMIER_BALLS=true;assert.equal(buy(x,shop(x,['masterball']),'masterball',25).result.bonus,2);assert.equal(buy(x,shop(x),'potion',25).result.bonus,0);delete x.content.items.premierball;assert.equal(buy(x,shop(x,['pokeball']),'pokeball',25).result.bonus,0);
});
test('P52-25 partial/zero gift capacity after successful main purchase; main failure has no money/stats',()=>{
 const x=setup({bag:{premierball:998},settings:{BAG_POCKET_SLOTS:[-1,-1,2,-1,-1,-1,-1,-1]}}),s=shop(x,['pokeball']);x.content.items.pokeball.price=2;const before=clone(x.game),r=buy(x,s,'pokeball',25);assert.equal(r.result.bonus,1);assert.equal(count(r.state,'premierball',x.content),999);assert.equal(count(r.state,'pokeball',x.content),25);assert.equal(r.state.money,950);assert.equal(r.state.stats.premier_balls_earned,1);assert.deepEqual(x.game,before);
 x.game.inventory=E.inventory.inventoryFromBag({premierball:999,pokeball:998},x.content.items);const r2=buy(x,s,'pokeball',1);assert.equal(r2.result.bonus,0);refusal(()=>buy(x,s,'pokeball',2),'inventory-full');assert.equal(count(x.game,'pokeball',x.content),998);
});
test('P52-24 sell explicit5/default1, no sell0/important, cap actual gain and duplicate feedback',()=>{
 for(const [q,left,money]of [[1,4,150],[5,0,750]]){const x=setup({bag:{potion:5},edit:g=>{g.money=0;}});x.content.items.potion.sellPrice=150;const r=sell(x,shop(x),'potion',q);assert.equal(count(r.state,'potion',x.content),left);assert.equal(r.state.money,money);assert.equal(r.state.stats.money_earned_at_marts,money);}
 const x=setup({bag:{potion:5},edit:g=>{g.money=999950;}});x.content.items.potion.sellPrice=100;const r=sell(x,shop(x),'potion');assert.equal(r.state.money,999999);assert.equal(r.state.stats.money_earned_at_marts,49);assert.equal(sell(x,shop(x),'potion',1,{confirmed:false}).status,'cancelled');x.content.items.potion.sellPrice=0;refusal(()=>sell(x,shop(x),'potion'),'not-sellable');refusal(()=>sell(x,shop(x,['box-link']),'box-link'),'not-sellable');
});
test('P52-21/24/29 app retry/duplicate no double trade; committed feedback failure never undoes resources',()=>{
 const x=setup({bag:{potion:5}});x.content.items.potion.price=100;x.content.items.potion.sellPrice=50;const t=x.app.beginMoneyShop({stock:['potion']}),request={kind:'buy',itemId:'potion',quantity:2,confirmed:true};x.state.failReplace=Error('replace fault');const before=clone(x.state.current());assert.equal(x.app.inventoryRequest(t,'buy',request).reason,'commit-failed');assert.deepEqual(x.state.current(),before);x.state.failReplace=null;assert.equal(x.app.inventoryRequest(t,'buy',request,()=>{throw Error('feedback fault');}).presentation,'failed');assert.equal(x.state.replaced.length,1);assert.equal(x.app.inventoryRequest(t,'buy',request).status,'duplicate');assert.equal(x.state.replaced.length,1);assert.equal(x.state.current().money,800);assert.equal(x.state.current().stats.money_spent_at_marts,200);
 const sale={kind:'sell',itemId:'potion',quantity:5,confirmed:true};assert.equal(x.app.inventoryRequest(t,'sale',sale).status,'committed');assert.equal(x.app.inventoryRequest(t,'sale',sale).status,'duplicate');assert.equal(x.state.current().money,1050);assert.equal(x.state.current().stats.money_earned_at_marts,250);assert.equal(count(x.state.current(),'potion',x.content),2);assert.equal(x.state.replaced.length,2);
});
test('P52-21 externally changed price/stock and invalid frozen aliases cannot create an unrecorded commit',()=>{
 const x=setup(),stock=['potion'],t=x.app.beginMoneyShop({stock}),q=x.app.shopQuote(t,'potion');x.app.setShopPrices(t,'potion',1);const request={kind:'buy',itemId:'potion',quantity:1,confirmed:true,expectedPrice:q.price,expectedRevision:q.revision};assert.equal(x.app.inventoryRequest(t,'stale',request).reason,'stale-price');stock.push('unknown');assert.equal(x.app.inventoryRequest(t,'badstock',{kind:'buy',itemId:'potion',quantity:1,confirmed:true}).reason,'unknown-item');assert.equal(x.state.replaced.length,0);x.app.endInventoryOperation(t);assert.throws(()=>x.app.beginMoneyShop({stock:Object.freeze(['potion'])}),/invalid-stock/);const next=x.app.beginInventoryOperation();x.app.endInventoryOperation(next);
});
test('P52-24 unresolved high-initial-balance signed statistic is isolated with no resource changes',()=>{
 const x=setup({bag:{potion:1},edit:g=>{g.money=1000000;}});x.content.items.potion.sellPrice=1;const before=clone(x.game);refusal(()=>sell(x,shop(x),'potion'),'income-policy-decision-required');assert.deepEqual(x.game,before);
});
test('P52-21 stock frozen before install rejects; stock host failure after install retains committed receipt',()=>{
 const x=setup(),stock=['potion'],t=x.app.beginMoneyShop({stock}),request={kind:'buy',itemId:'potion',quantity:1,confirmed:true};Object.freeze(stock);assert.equal(x.app.inventoryRequest(t,'frozen',request).reason,'invalid-stock');assert.equal(x.state.replaced.length,0);x.app.endInventoryOperation(t);
 const y=setup(),alias=['potion'],token=y.app.beginMoneyShop({stock:alias}),replace=y.state.replace;y.state.replace=next=>{replace(next);Object.freeze(alias);};const r=y.app.inventoryRequest(token,'once',request);assert.equal(r.status,'committed');assert.equal(r.presentation,'failed');assert.match(r.error,/stock-update-failed/);assert.equal(y.app.inventoryRequest(token,'once',request).status,'duplicate');assert.equal(y.state.replaced.length,1);assert.equal(count(y.state.current(),'potion',y.content),1);y.app.endInventoryOperation(token);
});
test('P52-25 catalog canonical ball identity does not require opening battle-use mapping',()=>{
 const x=setup({settings:{MORE_BONUS_PREMIER_BALLS:false}});delete x.content.items.pokeball.battleId;x.content.items.pokeball.battleUse='none';x.content.items.premierball.flags=['PokeBall'];assert.equal(buy(x,shop(x,['pokeball']),'pokeball',25).result.bonus,1);assert.equal(E.inventory.battleBag(buy(x,shop(x,['pokeball']),'pokeball',25).state.inventory,x.content.items).pokeball,undefined);
});
