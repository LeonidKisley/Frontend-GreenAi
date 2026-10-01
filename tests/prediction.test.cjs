const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(predictionStatus = 200) {
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, {value:'', hidden:true, addEventListener:(_,fn)=>{elements.get(id).click=fn;}}); return elements.get(id); };
  el('cluster').value='sim-run-test'; el('node').value='node-01';
  const calls=[];
  const dataset={datasetId:'dataset-test', resource:{cluster:'sim-run-test',id:'node-01'},features:[{cpu_utilization:42}],origins:['simulated'],warnings:['Cobertura parcial']};
  const ctx=vm.createContext({document:{getElementById:el,addEventListener:(_,fn)=>fn()},
    GATEWAY_BASE_URL:'http://gateway.test',URLSearchParams,AbortSignal,console,
    GreenMetrics:{rfc3339Seconds:d=>d.toISOString().replace(/\.\d{3}Z$/,'Z'),origin:v=>v},
    put:(id,value)=>{el(id).textContent=value;},
    authenticatedFetch:async(url,options)=>{
      calls.push({url,options});
      const result={value:45,origin:'estimated',target:'cpu_utilization',unit:'%',inputDatasetId:'dataset-test',resource:dataset.resource,predictedFor:'2026-09-30T20:15:00Z',generatedAt:'2026-09-30T20:00:00Z',modelVersion:'1',horizon:'15m'};
      return new Response(JSON.stringify(calls.length===1?dataset:result),{status:calls.length===1?200:predictionStatus});
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','prediction.js'),'utf8'),ctx);
  return {el,calls,dataset};
}
test('prediction uses prepared dataset, authenticated gateway and shows estimated output',async()=>{
  const {el,calls,dataset}=setup(); await el('predict-button').click();
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\/api\/processing\/v1\/prediction\/dataset\?/);
  assert.equal(calls[1].url,'http://gateway.test/api/prediction/v1/predictions');
  assert.deepEqual(JSON.parse(calls[1].options.body),dataset);
  assert.equal(calls[1].options.method,'POST');
  assert.equal(el('prediction-result').hidden,false);
  assert.match(el('prediction-value').textContent,/Estimado/);
});
test('insufficient data shows no prediction and never retries POST',async()=>{
  const {el,calls}=setup(422); await el('predict-button').click();
  assert.equal(calls.length,2); assert.equal(el('prediction-result').hidden,true);
  assert.match(el('prediction-status').textContent,/ventana de CPU/);
  assert.equal(el('predict-button').disabled,false);
});
test('requires an explicit cluster and node before requesting a dataset',async()=>{
  const {el,calls}=setup(); el('node').value=''; await el('predict-button').click();
  assert.equal(calls.length,0); assert.equal(el('prediction-result').hidden,true);
});
