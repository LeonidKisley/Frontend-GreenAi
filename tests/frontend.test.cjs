const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
function context(overrides = {}) {
  const session = {access_token:'old',user:{email:'test@example.test',user_metadata:{}}};
  const auth = {getSession:async()=>({data:{session}}),refreshSession:async()=>({data:{session:{...session,access_token:'new'}}}),signOut:async()=>({error:null})};
  const ctx = vm.createContext({window:{GREEN_AI_CONFIG:{supabaseUrl:'https://project.test',supabasePublishableKey:'public',gatewayBaseUrl:'http://localhost:8081'},supabase:{createClient:()=>({auth})}},
    location:{href:'http://localhost:3001/dashboard.html',pathname:'/dashboard.html',replace:()=>{}},
    document:{addEventListener:()=>{}}, Headers,URL,AbortSignal,atob,console,...overrides});
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'metrics.js'),'utf8'),ctx);
  return {ctx,auth};
}
test('null/nonfinite/missing remain absent; CPU is percent and memory absolute',()=>{
  const {ctx}=context();
  const format=ctx.window.GreenMetrics.value;
  assert.equal(format({value:null,quality:'missing'},'ratio'),'Sin dato');
  assert.equal(format({value:Infinity,quality:'valid'},'bytes'),'Sin dato');
  assert.match(format({value:0,quality:'valid'},'ratio'),/^0 %$/);
  assert.match(format({value:0.5,quality:'valid'},'ratio'),/^50 %$/);
  assert.equal(format({value:1073741824,quality:'valid'},'bytes'),'1 GiB');
});
test('history timestamps use RFC3339 with whole seconds',()=>{
  const {ctx}=context();
  assert.equal(ctx.window.GreenMetrics.rfc3339Seconds(new Date('2026-09-24T04:27:57.080Z')),'2026-09-24T04:27:57Z');
  assert.equal(ctx.window.GreenMetrics.rfc3339Seconds('2026-09-24T04:27:57.999Z'),'2026-09-24T04:27:57Z');
});
test('JWT cannot be sent to arbitrary origins',async()=>{
  const {ctx}=context({fetch:()=>{throw new Error('must not fetch');}});
  await assert.rejects(vm.runInContext("authenticatedFetch('https://evil.test/api/logs')",ctx),/Destino/);
});
test('401 refreshes once and retries with new bearer',async()=>{
  const sent=[];
  const {ctx}=context({fetch:async(url,options)=>{
    sent.push(options.headers.get('Authorization'));
    return new Response('',{status:sent.length===1?401:200});
  }});
  const res=await vm.runInContext("authenticatedFetch('http://localhost:8081/api/monitoring/v1/metrics/catalog')",ctx);
  assert.equal(res.status,200);
  assert.deepEqual(sent,['Bearer old','Bearer new']);
});
test('403 does not refresh or log out',async()=>{
  const {ctx,auth}=context({fetch:async()=>new Response('',{status:403})});
  auth.refreshSession=()=>{throw new Error('must not refresh');};
  auth.signOut=()=>{throw new Error('must not sign out');};
  assert.equal((await vm.runInContext("authenticatedFetch('http://localhost:8081/api/monitoring/v1/metrics/catalog')",ctx)).status,403);
});
