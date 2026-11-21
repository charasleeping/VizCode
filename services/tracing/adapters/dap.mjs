// SPDX-License-Identifier: GPL-3.0-or-later
import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
export class DapClient {
 constructor(command,args=[],options={}){
  this.child=spawn(command,args,{...options,detached:true,stdio:['pipe','pipe','pipe']});this.seq=0;this.pending=new Map();this.events=[];this.waiters=[];this.buffer=Buffer.alloc(0);this.error='';
  this.child.stderr.on('data',b=>{if(this.error.length<4000)this.error+=b;});this.child.stdin.on('error',()=>{});
  this.child.stdout.on('data',b=>{try{this.buffer=Buffer.concat([this.buffer,b]);if(this.buffer.length>2200000)throw Error('DAP message exceeds limit');while(true){const end=this.buffer.indexOf('\r\n\r\n');if(end<0)break;const header=this.buffer.subarray(0,end).toString();const match=header.match(/(?:^|\r\n)Content-Length: (\d+)/i);if(!match)throw Error('Invalid DAP framing');const size=Number(match[1]);if(size>2200000)throw Error('DAP message exceeds limit');if(this.buffer.length<end+4+size)break;const m=JSON.parse(this.buffer.subarray(end+4,end+4+size));this.buffer=this.buffer.subarray(end+4+size);if(m.type==='response'){const p=this.pending.get(m.request_seq);if(p){clearTimeout(p.timer);this.pending.delete(m.request_seq);m.success?p.resolve(m.body||{}):p.reject(Error(m.message||'DAP request failed'));}}else if(m.type==='event'){this.events.push(m);this.notify();}else if(m.type==='request'){this.write({type:'response',request_seq:m.seq,command:m.command,success:false,message:'Reverse requests are not supported by this isolated profile'});}}}catch(e){this.close(e);}});
  this.child.on('error',e=>this.close(e));this.child.on('exit',()=>this.close(Error('DAP adapter exited: '+this.error)));
 }
 write(message){const data=JSON.stringify({seq:++this.seq,...message});this.child.stdin.write('Content-Length: '+Buffer.byteLength(data)+'\r\n\r\n'+data);}
 request(command,args={}){return new Promise((resolve,reject)=>{const seq=this.seq+1;const timer=setTimeout(()=>{this.pending.delete(seq);reject(Error('DAP '+command+' timed out'));},10000);this.pending.set(seq,{resolve,reject,timer});this.write({type:'request',command,arguments:args});});}
 notify(){for(const w of [...this.waiters]){const i=this.events.findIndex(e=>w.names.includes(e.event));if(i>=0){this.waiters.splice(this.waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(this.events.splice(i,1)[0]);}}}
 event(names){const i=this.events.findIndex(e=>names.includes(e.event));if(i>=0)return Promise.resolve(this.events.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={names,resolve,reject};w.timer=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);reject(Error('DAP execution timed out'));},15000);this.waiters.push(w);});}
 close(error=Error('DAP execution cancelled')){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();for(const w of this.waiters){clearTimeout(w.timer);w.reject(error);}this.waiters=[];if(!this.child.killed){try{process.kill(-this.child.pid,'SIGTERM');}catch{this.child.kill();}}}
}
export async function runDap(profile,request,source){
 const client=new DapClient(profile.command[0],profile.command.slice(1));let stdout='',events=[],nextFrame=0,previous=[],previousLocation={source:'answer',line:1},terminated=false;const sourceName=source.split('/').at(-1),deadline=Date.now()+20000;
 try{
  await client.request('initialize',{adapterID:'vizcode',clientID:'vizcode',linesStartAt1:true,columnsStartAt1:true,pathFormat:'path',supportsVariableType:true,supportsVariablePaging:true,supportsRunInTerminalRequest:false});
  const launch={...profile.launch,program:source,stopOnEntry:true,redirectOutput:true};const launching=client.request('launch',launch);launching.catch(()=>{});
  await client.event(['initialized']);await client.request('setExceptionBreakpoints',{filters:profile.exceptionFilters||['uncaught']});await client.request('configurationDone');await launching;
  for(let step=0;step<1000;step++){
   const event=await client.event(['stopped','output','terminated','exited']);
   if(event.event==='output'){if(['stdout','console'].includes(event.body.category))stdout+=event.body.output||'';if(Buffer.byteLength(stdout)>65536)throw Error('Output exceeds limit');continue;}
   if(['terminated','exited'].includes(event.event)){terminated=true;break;}
   const threadId=event.body.threadId??(await client.request('threads')).threads[0]?.id;
   const stack=await client.request('stackTrace',{threadId,startFrame:0,levels:64});const frames=[];const objects={};let budget=10000;
   async function encode(v,depth=0){
    if(Date.now()>deadline)throw Error('DAP inspection timed out');
    if(--budget<0||depth>6)return {kind:'truncated',reason:'Inspection limit'};
    if(v.variablesReference>0){if(['module','function','type','builtin_function_or_method','method'].includes(v.type))return {kind:'unsupported',reason:'Runtime internals are opaque'};const id=step+':'+v.variablesReference;if(objects[id])return {kind:'reference',id};objects[id]={kind:'instance',type:(v.type||'Value')+' (identity unavailable)',fields:[]};const children=await client.request('variables',{variablesReference:v.variablesReference,start:0,count:200});for(const child of children.variables.filter(v=>!v.name.startsWith('__')&&!['special variables','function variables','class variables'].includes(v.name)).slice(0,100))objects[id].fields.push({name:child.name,value:await encode(child,depth+1)});return {kind:'reference',id};}
    const text=String(v.value??'');if(/^-?\d+$/.test(text)){const n=Number(text);return Number.isSafeInteger(n)?{kind:'primitive',type:'number',value:n}:{kind:'integer',value:text};}
    if(['true','false','True','False'].includes(text))return {kind:'primitive',type:'boolean',value:text.toLowerCase()==='true'};
    if(['null','None','nullptr'].includes(text))return {kind:'primitive',type:'null',value:null};
    return {kind:'primitive',type:'string',value:text};
   }
   const userFrames=stack.stackFrames.filter(f=>f.source?.path===source||f.source?.name===sourceName).reverse();
   for(let i=0;i<userFrames.length;i++){
    const f=userFrames[i],id=previous[i]?.name===f.name?previous[i].id:String(++nextFrame);const locals=[];
    const scopes=await client.request('scopes',{frameId:f.id});for(const scope of scopes.scopes.filter(s=>!s.expensive&&/local|argument/i.test(s.name)).slice(0,2)){const data=await client.request('variables',{variablesReference:scope.variablesReference,start:0,count:200});for(const v of data.variables.slice(0,200)){if(!v.name.startsWith('__')&&!['special variables','function variables','class variables'].includes(v.name))locals.push({name:v.name,value:await encode(v)});}}
    frames.push({id,name:f.name,locals,highlighted:i===userFrames.length-1});
   }
   if(frames.length){if(event.body.reason!=='exception'&&previous.length>frames.length){for(let depth=previous.length;depth>frames.length;depth--){const callee={...previous[depth-1],locals:[]};events.push({kind:'return',location:previousLocation,frames:[...frames,callee],globals:[],objects:structuredClone(objects),stdout,return:{kind:'unavailable'}});}}const f=userFrames.at(-1);const kind=event.body.reason==='exception'?'exception':frames.length>previous.length?'call':'step_line';events.push({kind,location:{source:'answer',line:f.line},frames,globals:[],objects,stdout,...(event.body.reason==='exception'?{diagnostic:event.body.text||event.body.description||'Program exception'}:{})});previous=frames;previousLocation={source:'answer',line:f.line};}
   if(JSON.stringify(events).length>2000000)throw Error('Trace exceeds limit');
   await client.request('stepIn',{threadId,singleThread:true,granularity:'statement'});
  }
  if(!terminated){while(events.length>=1000)events.pop();events.push({kind:'instruction_limit_reached',location:previousLocation,frames:[],globals:[],objects:{},stdout,diagnostic:'DAP step limit reached'});}
  // Drain output already received before termination.
  for(const e of client.events)if(e.event==='output'&&['stdout','console'].includes(e.body.category))stdout+=e.body.output||'';
  if(events.length)events.at(-1).stdout=stdout;
  return {version:'1.0',code:request.code,events};
 }finally{client.close();}
}
