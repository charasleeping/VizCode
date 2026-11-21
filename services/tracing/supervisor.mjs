// SPDX-License-Identifier: GPL-3.0-or-later
// Private host supervisor. Never expose this port or its Docker socket to students.
import http from 'node:http';import {spawn} from 'node:child_process';import {randomUUID,timingSafeEqual} from 'node:crypto';
import {loadRegistry} from './registry.mjs';import {body,boundedText} from './jobs.mjs';
const key=process.env.VIZCODE_SUPERVISOR_KEY||'';if(key.length<32)throw Error('Configure a supervisor key');
const registry=loadRegistry(),active=new Set();
const equal=(a,b)=>Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
export async function runAdapter(adapter,request,signal,operation='trace'){
 if(operation==='discover'&&!adapter.discoveryCommand&&!adapter.discoverUrl)return {valid:true,locked:true,rows:[],supported:false};
 if(adapter.transport==='http'){
  const url=operation==='discover'?adapter.discoverUrl:adapter.url;
  const response=await fetch(url,{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(45000)]),redirect:'error',headers:{'Content-Type':'application/json',...(adapter.keyEnv?{Authorization:'Bearer '+process.env[adapter.keyEnv]}:{})},body:JSON.stringify(request)});
  const text=await boundedText(response);if(Buffer.byteLength(text)>2200000)throw Error('Adapter output exceeds limit');if(!response.ok)throw Error('Self-hosted adapter failed.');return JSON.parse(text);
 }
 const name='vizcode-trace-'+randomUUID();
 const policy=adapter.sandbox||{},memory=policy.memoryMiB||384;
 const args=['run','--pull','never','--rm','-i','--name',name,'--network','none','--read-only','--user','10001:10001','-e','HOME=/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',memory+'m','--memory-swap',memory+'m','--cpus','1','--pids-limit','64','--tmpfs','/tmp:rw,'+(policy.execTmp?'exec,':'')+'nosuid,nodev,size=128m,mode=1777',...(policy.ptrace?['--cap-add','SYS_PTRACE']:[])];
 if(!adapter.image)throw Error('Executable/DAP adapters require an installed isolated image');
 const command='docker';
 if(adapter.transport==='container'&&operation!=='discover')args.push(adapter.image);
 else {
  const entry=operation==='discover'?adapter.discoveryCommand:adapter.command;
  args.push('--entrypoint',entry[0],adapter.image,...entry.slice(1));
 }
 return await new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['pipe','pipe','pipe']});let output='',errors='',done=false;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const stop=()=>{if(done)return;spawn('docker',['rm','-f',name],{stdio:'ignore'});child.kill();};
  const timeout=setTimeout(stop,45000);signal.addEventListener('abort',stop,{once:true});
  child.stdout.on('data',data=>{output+=data;if(Buffer.byteLength(output)>2200000)stop();});child.stderr.on('data',data=>{if(errors.length<4000)errors+=data;});child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify({...request,...(operation==='discover'?{discover:true}:{})}));
  child.on('error',error=>{stop();reject(error);});child.on('close',()=>{done=true;clearTimeout(timeout);signal.removeEventListener('abort',stop);try{if(signal.aborted)throw Error('Trace cancelled');const result=JSON.parse(output);if(result.error)throw Error(result.error);resolve(result);}catch(error){reject(Error(error.message||'Adapter could not complete'));}});
 });
}
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health'){json(res,200,{status:'ready'});return;}
 if(!['/adapter','/trace'].includes(req.url)||req.method!=='POST'||!equal(String(req.headers.authorization||''),'Bearer '+key)){json(res,403,{error:'Forbidden'});return;}
 if(active.size>=2){json(res,503,{error:'Tracing is busy. Try again shortly.'});return;}
 const abort=new AbortController();active.add(abort);res.on('close',()=>{if(!res.writableEnded)abort.abort();});
 try{const input=await body(req);const adapter=registry.find(a=>a.id===(req.url==='/trace'?'java-jdi':input.adapter));if(!adapter)throw Error('Adapter is not installed');const result=await runAdapter(adapter,req.url==='/trace'?input:input.request,abort.signal,input.operation||'trace');if(!res.destroyed)json(res,200,result);}
 catch(error){if(!res.destroyed)json(res,422,{error:error.message});}finally{active.delete(abort);}
});server.listen(Number(process.env.VIZCODE_SUPERVISOR_PORT||4103),process.env.VIZCODE_SUPERVISOR_BIND||'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{for(const a of active)a.abort();server.close();});
