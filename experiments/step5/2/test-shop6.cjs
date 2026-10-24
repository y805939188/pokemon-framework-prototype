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
test('EF-DEC-01/P52-24/26 approved sale clamps wallet, consumes goods and adds only nonnegative actual income',()=>{
 // Hand-written expected balances/income: neither nominal sale totals nor negative wallet deltas are earnings.
 for(const [balance,cap,price,q,money,income]of [[1000000,999999,1,1,999999,0],[2000000,999999,100,2,999999,0],[999999,999999,100,1,999999,0],[999950,999999,100,1,999999,49],[1000,100,20,2,100,0],[70,100,20,1,90,20],[0,999999,150,5,750,750],[42,0,5,1,0,0],[0,0,5,1,0,0]]){
  const x=setup({bag:{potion:5},settings:{MAX_MONEY:cap},edit:(g,c)=>{g.money=balance;g.stats.money_earned_at_marts=17;c.items.potion.sellPrice=price;}}),before=clone(x.game),r=sell(x,shop(x),'potion',q);
  assert.equal(r.status,'ready',JSON.stringify({balance,cap,price,q}));assert.equal(r.state.money,money);assert.equal(r.result.actualMoney,money-balance);assert.equal(r.result.total,price*q);assert.equal(r.state.stats.money_earned_at_marts,17+income);assert.equal(count(r.state,'potion',x.content),5-q);assert.deepEqual(E.saveSchema.validateGame(r.state),[]);assert.deepEqual(x.game,before);
 }
});
test('EF-DEC-01/P52-04/24 trusted schema5 high wallet survives loading before a successful sale',()=>{
 const raw=clone(E.fixtures.makeGame());raw.schema=5;raw.bag=E.inventory.aggregateBag(raw.inventory);delete raw.inventory;delete raw.badges;for(const m of E.storage.allMembers(raw)){delete m.statNature;for(const move of m.moves)delete move.ppUps;}raw.money=1000000;raw.stats.money_earned_at_marts=9;const before=clone(raw),x=setup({settings:{MAX_MONEY:100}});x.content.items.potion.sellPrice=1;
 const loaded=E.saveSchema.migrateGame(raw,{content:x.content,speciesKey:E.speciesKey.identityKeys});assert.equal(loaded.ok,true);assert.equal(loaded.state.money,1000000);assert.deepEqual(raw,before);x.game=loaded.state;const r=sell(x,shop(x),'potion');assert.equal(r.state.money,100);assert.equal(r.state.stats.money_earned_at_marts,9);assert.equal(count(r.state,'potion',x.content),2);assert.equal(x.game.money,1000000);
});
test('EF-DEC-01/P52-21/24 over-cap cancel and invalid sale leave wallet, inventory and statistics byte-identical',()=>{
 for(const variant of ['cancel','zero-price','important','no-selling','too-many','bad-quantity','stale-price','overflow']){
  const x=setup({bag:{potion:5,'box-link':1},edit:(g,c)=>{g.money=variant==='overflow'?Number.MAX_SAFE_INTEGER:1000000;g.stats.money_earned_at_marts=23;c.items.potion.sellPrice=variant==='zero-price'?0:1;c.items['box-link'].sellPrice=100;}}),t=x.app.beginMoneyShop({stock:['potion'],allowSell:variant!=='no-selling'}),before=clone(x.state.current());
  const request={kind:'sell',itemId:variant==='important'?'box-link':'potion',quantity:variant==='too-many'?6:variant==='bad-quantity'?0:1,confirmed:variant!=='cancel',...(variant==='stale-price'?{expectedPrice:2}:{})},r=x.app.inventoryRequest(t,'unchanged',request);
  assert.equal(r.status,variant==='cancel'?'cancelled':'refused',variant);if(variant!=='cancel')assert.equal(r.reason,({'zero-price':'not-sellable',important:'not-sellable','no-selling':'not-sellable','too-many':'not-enough-items','bad-quantity':'invalid-quantity','stale-price':'stale-price',overflow:'integer-overflow'})[variant]);assert.deepEqual(x.state.current(),before,variant);assert.equal(x.state.replaced.length,0);x.app.endInventoryOperation(t);
 }
});
test('EF-DEC-01/P52-24/29 over-cap install failure retries once; duplicate and feedback failure never sell twice',()=>{
 const x=setup({bag:{potion:5},edit:(g,c)=>{g.money=1000000;g.stats.money_earned_at_marts=23;c.items.potion.sellPrice=100;}}),t=x.app.beginMoneyShop({stock:['potion']}),request={kind:'sell',itemId:'potion',quantity:2,confirmed:true},before=clone(x.state.current());
 x.state.failReplace=Error('sale replace fault');assert.equal(x.app.inventoryRequest(t,'sale',request).reason,'commit-failed');assert.deepEqual(x.state.current(),before);assert.equal(x.state.replaced.length,0);x.state.failReplace=null;
 const r=x.app.inventoryRequest(t,'sale',request,()=>{throw Error('sale feedback fault');});assert.equal(r.status,'committed');assert.equal(r.presentation,'failed');assert.equal(r.result.actualMoney,-1);assert.equal(x.state.current().money,999999);assert.equal(count(x.state.current(),'potion',x.content),3);assert.equal(x.state.current().stats.money_earned_at_marts,23);assert.equal(x.state.replaced.length,1);
 assert.equal(x.app.inventoryRequest(t,'sale',clone(request)).status,'duplicate');assert.equal(x.app.inventoryRequest(t,'sale',{...request,quantity:1}).reason,'request-conflict');assert.equal(x.state.replaced.length,1);assert.equal(count(x.state.current(),'potion',x.content),3);assert.equal(x.state.current().stats.money_earned_at_marts,23);x.app.endInventoryOperation(t);
});
test('P52-21 stock frozen before install rejects; stock host failure after install retains committed receipt',()=>{
 const x=setup(),stock=['potion'],t=x.app.beginMoneyShop({stock}),request={kind:'buy',itemId:'potion',quantity:1,confirmed:true};Object.freeze(stock);assert.equal(x.app.inventoryRequest(t,'frozen',request).reason,'invalid-stock');assert.equal(x.state.replaced.length,0);x.app.endInventoryOperation(t);
 const y=setup(),alias=['potion'],token=y.app.beginMoneyShop({stock:alias}),replace=y.state.replace;y.state.replace=next=>{replace(next);Object.freeze(alias);};const r=y.app.inventoryRequest(token,'once',request);assert.equal(r.status,'committed');assert.equal(r.presentation,'failed');assert.match(r.error,/stock-update-failed/);assert.equal(y.app.inventoryRequest(token,'once',request).status,'duplicate');assert.equal(y.state.replaced.length,1);assert.equal(count(y.state.current(),'potion',y.content),1);y.app.endInventoryOperation(token);
});
test('P52-25 catalog canonical ball identity does not require opening battle-use mapping',()=>{
 const x=setup({settings:{MORE_BONUS_PREMIER_BALLS:false}});delete x.content.items.pokeball.battleId;x.content.items.pokeball.battleUse='none';x.content.items.premierball.flags=['PokeBall'];assert.equal(buy(x,shop(x,['pokeball']),'pokeball',25).result.bonus,1);assert.equal(E.inventory.battleBag(buy(x,shop(x,['pokeball']),'pokeball',25).state.inventory,x.content.items).pokeball,undefined);
});
test('P52-25/39 legacy battle mappings survive field catalog enrichment including Premier',()=>{
 const catalog=E.itemCatalog.legacyCatalog();for(const id of E.items.BAG_ITEMS){assert.equal(catalog[id].battleId,id,id);assert.notEqual(catalog[id].battleUse,'none',id);}assert.equal(E.itemCatalog.hasFlag(catalog.premierball,'PremierBall'),true);assert.equal(E.inventory.battleBag(E.inventory.inventoryFromBag({premierball:1},catalog),catalog).premierball,1);
});
