// SPDX-License-Identifier: GPL-3.0-or-later
// Private, trusted supervisor. Never expose this service or its Docker socket to Moodle/student jobs.
import http from 'node:http';import {spawn} from 'node:child_process';import {randomUUID,timingSafeEqual} from 'node:crypto';
const key=process.env.VIZCODE_SUPERVISOR_KEY || '';if(key.length<32)throw Error('Set VIZCODE_SUPERVISOR_KEY (32+ characters).');
const active=new Set();const image=process.env.VIZCODE_JAVA_IMAGE || 'vizcode-java-job:21';
const secure=(a,b)=>Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health' && req.method==='GET'){res.end('OK');return;}
 if(req.url!=='/trace' || req.method!=='POST' || !secure(req.headers.authorization || '','Bearer '+key)){res.writeHead(403);res.end();return;}
 if(active.size>=2){res.writeHead(503);res.end(JSON.stringify({error:'Java debugging is busy. Try again shortly.'}));return;}
 let body='';try{for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>650000)throw Error('Request exceeds limit.');}const request=JSON.parse(body);if(typeof request.code!=='string'||typeof request.stdin!=='string'||typeof request.scratchCode!=='string')throw Error('Invalid trace request.');}catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message}));return;}
 const name='vizcode-java-'+randomUUID();const child=spawn('docker',['run','--pull','never','--rm','-i','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','384m','--memory-swap','384m','--cpus','1','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=1777',image],{stdio:['pipe','pipe','pipe']});
 active.add(name);let output='',errors='',stopped=false;
 const stop=()=>{if(stopped)return;stopped=true;spawn('docker',['rm','-f',name],{stdio:'ignore'});child.kill();};
 const timer=setTimeout(stop,45000);res.on('close',()=>{if(!res.writableEnded)stop();});
 child.stdout.on('data',data=>{output+=data;if(Buffer.byteLength(output)>2200000)stop();});child.stderr.on('data',data=>{if(errors.length<4000)errors+=data;});
 child.stdin.on('error',()=>{});child.stdin.end(body);
 child.on('error',()=>{stop();});child.on('close',()=>{
  clearTimeout(timer);active.delete(name);if(res.destroyed)return;
  let result;try{result=JSON.parse(output);if(result.error)throw Error(result.error);if(!Array.isArray(result.trace))throw Error('Invalid Java trace.');}catch(error){if(errors)console.error('Java sandbox launch failed: '+errors.slice(0,1000));res.writeHead(422,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message==='Unexpected end of JSON input'?'Java tracing could not complete.':error.message}));return;}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 });
});server.listen(4103,'0.0.0.0');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const name of active)spawn('docker',['rm','-f',name],{stdio:'ignore'});server.close();});
