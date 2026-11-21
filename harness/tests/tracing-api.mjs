import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4104',editor='http://localhost:4100';
const catalog=await fetch(origin+'/v1/adapters').then(r=>r.json());assert.equal(catalog.version,'1.0');assert(catalog.adapters.every(a=>!a.image&&!a.command&&!a.url));
const cpp=catalog.adapters.find(a=>a.id==='cpp-gdb');assert(cpp);
const request={adapterId:cpp.id,adapterVersion:cpp.version,sourceProfile:'auto',language:'cpp',code:'int fact(int n){return n<2?1:n*fact(n-1);}',scratchCode:'fact(5);',stdin:'',inputEof:true};
const ticket=async body=>(await fetch(editor+'/trace-ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json())).ticket;
const post=(body,key)=>fetch(origin+'/v1/traces',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)});
assert.equal((await post(request,'invalid')).status,422);
const key=await ticket(request);assert.equal((await post({...request,code:request.code+'\n'},key)).status,422);
const response=await post(request,key);assert.equal(response.status,202,await response.clone().text());const job=await response.json();
assert.equal((await post(request,key)).status,422);
const url=origin+'/v1/traces/'+job.id;assert.equal((await fetch(url)).status,404);
let result;for(let i=0;i<300;i++){result=await fetch(url,{headers:{Authorization:'Bearer '+job.token}}).then(r=>r.json());if(result.status!=='running')break;await new Promise(r=>setTimeout(r,100));}
assert.equal(result.status,'complete',JSON.stringify(result));assert.equal(result.result.code,request.code);
assert(result.result.events.some(e=>e.return?.value?.value===120),JSON.stringify(result));
const loop={...request,code:'int main(){while(true){}}',scratchCode:''};const pending=await (await post(loop,await ticket(loop))).json();
assert.equal((await fetch(origin+'/v1/traces/'+pending.id,{method:'DELETE',headers:{Authorization:'Bearer '+pending.token}})).status,200);
assert.equal((await fetch(origin+'/v1/traces/'+pending.id,{headers:{Authorization:'Bearer '+pending.token}})).status,404);
const extra=catalog.adapters.find(a=>a.id==='counter-example');if(extra){const unsupported={...request,adapterId:extra.id,adapterVersion:extra.version,language:'counter',diagnose:true};const denied=await post(unsupported,await ticket(unsupported));assert.equal(denied.status,422);assert.match((await denied.json()).error,/Syntax-only diagnostics are unsupported/);}
console.log('Registry privacy, source-bound tickets, replay rejection, private job access, native return trace and cancellation passed');
