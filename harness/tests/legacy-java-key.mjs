import assert from 'node:assert/strict';import http from 'node:http';import {createHash,createHmac,randomUUID} from 'node:crypto';
import {javaTrace} from '../../services/java/proxy.mjs';
let forwarded=0;
const supervisor=http.createServer(async(req,res)=>{for await(const _ of req){};forwarded++;assert.equal(req.headers.authorization,'Bearer supervisor-fixture-key');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({trace:[]}));});
const broker=http.createServer(javaTrace);
await new Promise(resolve=>supervisor.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>broker.listen(0,'127.0.0.1',resolve));
process.env.VIZCODE_SUPERVISOR_KEY='supervisor-fixture-key';process.env.VIZCODE_JAVA_SUPERVISOR='http://127.0.0.1:'+supervisor.address().port;
try{
 for(const legacy of ['', 'legacy-signing-key-for-tests-123456789']){
  process.env.VIZCODE_TRACE_KEY='generic-signing-key-for-tests-12345678';process.env.VIZCODE_JAVA_KEY=legacy;
  const request={code:'static int f(){return 120;}',scratchCode:'',stdin:''};
  const body=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+60,user:1,nonce:randomUUID(),hash:createHash('sha256').update(JSON.stringify(request)).digest('hex')})).toString('base64url');
  const key=legacy||process.env.VIZCODE_TRACE_KEY;const token=body+'.'+createHmac('sha256',key).update(body).digest('base64url');
  const send=code=>fetch('http://127.0.0.1:'+broker.address().port+'/java/trace',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...request,code,javaTicket:token})});
  assert.equal((await send(request.code+'\n')).status,422);assert.equal((await send(request.code)).status,200);assert.equal((await send(request.code)).status,422);
 }
 assert.equal(forwarded,2);console.log('Legacy Java requests accept the configured generic key, prefer a separate legacy key, and still reject source tampering and replay.');
}finally{await Promise.all([new Promise(resolve=>broker.close(resolve)),new Promise(resolve=>supervisor.close(resolve))]);}
