// SPDX-License-Identifier: GPL-3.0-or-later
import {randomUUID,randomBytes,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {loadRegistry,publicAdapter,resolveAdapter} from './registry.mjs';
import {fromLegacy,validateDocument} from '../../plugin/vizcode/frontend/src/widget/protocol.mjs';
const jobs=new Map(),nonces=new Map(),rates=new Map();
const registry=loadRegistry();
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const secret=()=>process.env.VIZCODE_TRACE_KEY||process.env.VIZCODE_JAVA_KEY||'';
export const bodyHash=Symbol('request body SHA256');
export function verifyTicket(token,request,hash){
 const key=secret();if(key.length<32)throw Error('Tracing is not configured.');
 const [body,signature,...extra]=String(token).split('.');const expected=createHmac('sha256',key).update(body||'').digest('base64url');
 if(extra.length||!signature||!equal(expected,signature))throw Error('Invalid trace ticket.');
 const claim=JSON.parse(Buffer.from(body,'base64url')),now=Date.now()/1000;
 if(!Number.isInteger(claim.exp)||claim.exp<now||claim.exp>now+125||!Number.isInteger(claim.user)||typeof claim.nonce!=='string'||claim.hash!==(hash||createHash('sha256').update(JSON.stringify(request)).digest('hex'))||claim.adapter!==request.adapterId||claim.language!==request.language)throw Error('Trace authorization does not match the request.');
 for(const [id,end]of nonces)if(end<now)nonces.delete(id);
 if(nonces.has(claim.nonce))throw Error('Trace ticket has already been used.');
 for(const [id,r]of rates)if(r.start<now-60)rates.delete(id);
 let rate=rates.get(claim.user);if(!rate||rate.start<now-60){rate={start:now,count:0};rates.set(claim.user,rate);}if(++rate.count>40)throw Error('Tracing is busy. Wait before retrying.');
 if([...jobs.values()].filter(j=>j.user===claim.user&&j.status==='running').length>=2)throw Error('Too many active traces.');
 nonces.set(claim.nonce,claim.exp);return claim;
}
export async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>650000)throw Error('Trace request exceeds limit.');chunks.push(chunk);}const bytes=Buffer.concat(chunks),value=JSON.parse(bytes.toString('utf8'));if(value&&typeof value==='object')Object.defineProperty(value,bodyHash,{value:createHash('sha256').update(bytes).digest('hex')});return value;}
export async function boundedText(response){let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>2200000)throw Error('Adapter output exceeds limit');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks).toString('utf8');}
setInterval(()=>{for(const [id,j] of jobs)if(j.expires<Date.now()){j.abort.abort();jobs.delete(id);}},30000).unref();
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
export function validateDiscovery(result){
 const text=(v,max=100000)=>typeof v==='string'&&v.length<=max;
 if(!result||!Array.isArray(result.rows)||result.rows.length>1000||typeof result.valid!=='boolean'||typeof result.locked!=='boolean'||(result.source!==undefined&&!text(result.source))||(result.mapping!==undefined&&(!Array.isArray(result.mapping)||result.mapping.length>100000||result.mapping.some(id=>!text(id,1000)))))throw Error('Invalid callable discovery result');
 const ids=new Set();
 for(const row of result.rows){
  if(!row||!text(row.id,1000)||ids.has(row.id)||!text(row.name,1000)||!text(row.reason,4000)||typeof row.checked!=='boolean'||!Array.isArray(row.parameters)||row.parameters.length>128||!Array.isArray(row.args)||row.args.length!==row.parameters.length||row.args.some(a=>!text(a))||row.parameters.some(p=>!p||!text(p.name,1000)||typeof p.optional!=='boolean'))throw Error('Invalid callable discovery row');
  ids.add(row.id);
 }
 if(result.mapping?.some(id=>!ids.has(id)))throw Error('Unknown callable source mapping');
 return result;
}
export async function tracingRoute(req,res){
 if(!req.url?.startsWith('/v1/'))return false;
 try{
  const path=new URL(req.url,'http://execution').pathname;
  if(path==='/v1/adapters'&&req.method==='GET'){json(res,200,{version:'1.0',adapters:registry.map(publicAdapter)});return true;}
  for(const [id,j] of jobs)if(j.expires<Date.now()){j.abort.abort();jobs.delete(id);}
  if((path==='/v1/traces'||path==='/v1/discover')&&req.method==='POST'){
   const request=await body(req);if(!request||typeof request.code!=='string'||request.code.length>100000||typeof request.stdin!=='string'||request.stdin.length>100000||typeof request.scratchCode!=='string'||request.scratchCode.length>100000)throw Error('Invalid trace request.');
   const a=resolveAdapter(registry,request);const claim=verifyTicket(String(req.headers.authorization||'').replace(/^Bearer /,''),request,request[bodyHash]);
   if(['diagnose','inputEof','interactiveInput'].some(k=>request[k]!==undefined&&typeof request[k]!=='boolean'))throw Error('Invalid trace flags');
   if(request.diagnose&&!a.capabilities.diagnostics)throw Error('Syntax-only diagnostics are unsupported by this adapter');
   if(a.transport==='browser')throw Error('This adapter runs in an isolated browser worker.');
   if(jobs.size>=100)throw Error('Tracing is busy.');
   const id=randomUUID(),token=randomBytes(32).toString('base64url'),abort=new AbortController();
   const job={status:'running',user:claim.user,token,abort,expires:Date.now()+120000,result:null,error:null};jobs.set(id,job);
   const discovery=path==='/v1/discover';
   fetch(process.env.VIZCODE_TRACE_SUPERVISOR||'http://java-supervisor:4103/adapter',{
    method:'POST',signal:abort.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.VIZCODE_SUPERVISOR_KEY},body:JSON.stringify({adapter:a.id,operation:discovery?'discover':'trace',request})
   }).then(async response=>{const raw=await boundedText(response);if(Buffer.byteLength(raw)>2200000)throw Error('Trace exceeds limit.');const result=JSON.parse(raw);if(!response.ok||result.error)throw Error(result.error||'Adapter execution failed.');
    if(discovery)job.result=validateDiscovery(result);else {const document=result.version?result:fromLegacy(result);if(!result.version)document.code=request.code;document.sources={answer:request.code,calls:request.scratchCode||''};if(document.code!==request.code)throw Error('Trace source does not match request');job.result=validateDocument(document);}job.status='complete';
   }).catch(error=>{job.error=error.name==='AbortError'?'Trace cancelled.':error.message;job.status='failed';});
   req.on('aborted',()=>abort.abort());json(res,202,{id,token,status:'running'});return true;
  }
  const match=path.match(/^\/v1\/traces\/([0-9a-f-]+)$/);const job=match&&jobs.get(match[1]);
  if(!job||!equal(String(req.headers.authorization||'').replace(/^Bearer /,''),job.token)){json(res,404,{error:'Trace job not found.'});return true;}
  if(req.method==='DELETE'){job.abort.abort();jobs.delete(match[1]);json(res,200,{status:'cancelled'});return true;}
  if(req.method!=='GET'){json(res,405,{error:'Method not allowed.'});return true;}
  json(res,200,{status:job.status,...(job.result?{result:job.result}:{}),...(job.error?{error:job.error}:{})});
 }catch(error){json(res,422,{error:error.message});}
 return true;
}
