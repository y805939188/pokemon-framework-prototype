'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {TradeTimeline}=require('../../../src/plugins/progression/trade-timeline.ts');
test('trade first card naturally advances at 50/20 seconds, Use and Back only advance',()=>{
 for(const input of [{use:true},{back:true}]){const t=new TradeTimeline(0);t.update(1,input);assert.equal(t.phase,'outgoing');}
 const t=new TradeTimeline(0);t.update(2499,{});assert.equal(t.phase,'card');t.update(2500,{});assert.equal(t.phase,'outgoing');
});
test('trade animations ignore cancellation; messages each need their own acknowledgement',()=>{
 const t=new TradeTimeline(0);t.update(2500,{});t.update(3000,{back:true});assert.equal(t.phase,'outgoing');t.update(4500,{});assert.equal(t.phase,'sending');t.update(4501,{back:true});assert.equal(t.phase,'farewell');t.update(4502,{use:true});assert.equal(t.phase,'incoming');t.update(5000,{back:true});assert.equal(t.phase,'incoming');t.update(6502,{});assert.equal(t.phase,'received');t.update(6503,{use:true});assert.equal(t.phase,'care');assert.equal(t.update(6504,{back:true}),'presented');assert.equal(t.phase,'ended');assert.equal(t.update(6505,{use:true}),null);
});
test('trade clock never rewinds or equates display frames with elapsed time',()=>{
 const t=new TradeTimeline(100);t.update(2400,{});t.update(-200,{});assert.equal(t.phase,'card');t.update(2600,{});assert.equal(t.phase,'outgoing');
});
