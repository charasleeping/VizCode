// SPDX-License-Identifier: GPL-3.0-or-later
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
const consumed=new Map(),users=new Map();
export async function javaTrace(req,res){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.writeHead(405);res.end(JSON.stringify({error:'POST required.'}));return;}
 try{
  const secret=process.env.VIZCODE_JAVA_KEY || process.env.VIZCODE_TRACE_KEY || '';if(secret.length<32)throw Error('Java tracing is not configured.');
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>650000)throw Error('Trace request exceeds limit.');}
  const payload=JSON.parse(raw);const {javaTicket,...request}=payload;const token=String(req.headers.authorization || '').replace(/^Bearer /,'');
  if(token!==javaTicket)throw Error('Invalid Java trace ticket.');const [body,signature,...extra]=token.split('.');
  const expected=createHmac('sha256',secret).update(body || '').digest();const actual=Buffer.from(signature || '', 'base64url');
  if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Invalid Java trace ticket.');
  const claim=JSON.parse(Buffer.from(body,'base64url').toString('utf8')),now=Math.floor(Date.now()/1000);
  if(!Number.isInteger(claim.exp)||claim.exp<now||claim.exp>now+125||!Number.isInteger(claim.user)||typeof claim.nonce!=='string')throw Error('Expired Java trace ticket.');
  if(createHash('sha256').update(JSON.stringify(request)).digest('hex')!==claim.hash)throw Error('Java trace request changed.');
  for(const [nonce,exp] of consumed)if(exp<now)consumed.delete(nonce);
  for(const [user,entry] of users)if(entry.start<now-60)users.delete(user);
  if(consumed.has(claim.nonce))throw Error('Java trace ticket has already been used.');
  let rate=users.get(claim.user);if(!rate){rate={start:now,count:0};users.set(claim.user,rate);}if(++rate.count>40)throw Error('Java debugging is busy. Wait a moment before trying again.');
  consumed.set(claim.nonce,claim.exp);
  const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  const response=await fetch((process.env.VIZCODE_JAVA_SUPERVISOR || 'http://java-supervisor:4103')+'/trace',{
   method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(process.env.VIZCODE_SUPERVISOR_KEY || '')},body:JSON.stringify(request),signal:abort.signal});
  const result=await response.text();if(Buffer.byteLength(result)>2200000)throw Error('Trace exceeds limit.');
  if(!res.destroyed){res.writeHead(response.status);res.end(result);}
 }catch(error){if(!res.destroyed){res.writeHead(422);res.end(JSON.stringify({error:error.name==='AbortError'?'Java tracing was cancelled.':error.message}));}}
}
