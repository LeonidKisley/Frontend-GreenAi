const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(status='not_evaluable') {
  const elements = new Map(), calls=[];
  const el = id => {
    if (!elements.has(id)) elements.set(id, {value:'',files:[],addEventListener:(_,fn)=>{elements.get(id).submit=fn;}});
    return elements.get(id);
  };
  el('cluster').value='lab'; el('node').value='n1'; el('policy-origin').value='simulated';
  const resource={type:'node',id:'n1',cluster:'lab'};
  const ctx=vm.createContext({document:{getElementById:el,addEventListener:(_,fn)=>fn()}, URLSearchParams,
    GreenMetrics:{rfc3339Seconds:d=>d.toISOString(),origin:s=>s}, put:(id,s)=>el(id).textContent=s,
    predictionRequest:async(url,options)=>{
      calls.push({url,options});
      if(url.includes('/processing/')) return {datasetId:'d1',resource,features:[{}]};
      if(url.endsWith('/energy')) return {energyKwh:0.01,co2eKg:null,origin:'simulated',warnings:[],start:'start',end:'end'};
      return {status, action:'none', resource, executionAllowed:false, checks:[], warnings:['Demo'], policy:{},recommendationId:'r1'};
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','recommendations.js'),'utf8'),ctx);
  return {el,calls};
}
const event={preventDefault(){}};
test('missing telemetry stays null and displays not evaluable',async()=>{
  const {el,calls}=setup(); await el('recommendation-form').submit(event);
  assert.equal(calls.length,2);
  assert.equal(JSON.parse(calls[1].options.body).telemetry,null);
  assert.match(el('recommendation-status').textContent,/No evaluable/);
  assert.equal(el('recommend-button').disabled,false);
});
test('missing resource prevents network requests',async()=>{
  const {el,calls}=setup(); el('node').value=''; await el('recommendation-form').submit(event);
  assert.equal(calls.length,0);
});
test('unknown status fails closed',async()=>{
  const {el}=setup('approved'); await el('recommendation-form').submit(event);
  assert.match(el('recommendation-status').textContent,/inválida/);
  assert.equal(el('recommendation-result').textContent,'');
});
test('missing individual metric is not converted to zero',async()=>{
  const {el,calls}=setup(); el('policy-time').value='2026-10-28T12:00'; el('policy-memory').value='45';
  await el('recommendation-form').submit(event);
  const telemetry=JSON.parse(calls[1].options.body).telemetry;
  assert.equal(telemetry.memoryPercent,45); assert.equal(telemetry.latencyP95Ms,null);
});
test('energy displays absence of carbon factor and rejects oversized file',async()=>{
  const {el,calls}=setup(); el('energy-file').files=[{size:50,text:async()=>'{"origin":"simulated"}'}];
  await el('energy-form').submit(event);
  assert.match(el('energy-status').textContent,/CO₂e no evaluable/);
  el('energy-file').files=[{size:2000000}]; await el('energy-form').submit(event);
  assert.equal(calls.length,1);
});
