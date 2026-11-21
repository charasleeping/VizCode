// SPDX-License-Identifier: GPL-3.0-or-later
// Language-neutral trace boundary. Legacy encoding is confined to this converter.
const fail=message=>{throw Error(message);};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const kinds=new Set(['step_line','call','return','exception','uncaught_exception','instruction_limit_reached']);
export function fromLegacy(result){
 if(!record(result)||!Array.isArray(result.trace)||typeof result.code!=='string')fail('Invalid legacy trace');
 const encode=v=>{
  if(v===null)return {kind:'primitive',type:'null',value:null};
  if(['string','boolean','number'].includes(typeof v))return {kind:'primitive',type:typeof v,value:v};
  if(!Array.isArray(v))fail('Invalid legacy value');
  if(v[0]==='REF')return {kind:'reference',id:String(v[1])};
  if(v[0]==='IMPORTED_FAUX_PRIMITIVE'&&/^-?\d+$/.test(v[1]))return {kind:'integer',value:v[1]};
  return {kind:'display',encoding:v};
 };
 const vars=o=>Object.entries(o||{}).map(([name,value])=>({name,value:encode(value)}));
 const events=result.trace.map(t=>({kind:t.event,location:{source:t.source_area==='scratch'?'calls':'answer',line:t.source_line??t.line??1},line:t.line,
  frames:(t.stack_to_render||[]).map(f=>({id:String(f.frame_id),name:f.func_name,locals:vars(f.encoded_locals),highlighted:!!f.is_highlighted})),globals:vars(t.globals),
  objects:Object.fromEntries(Object.entries(t.heap||{}).map(([id,v])=>[String(id),v[0]==='LIST'?{kind:'sequence',type:'List',items:v.slice(1).map(encode)}:v[0]==='DICT'?{kind:'mapping',type:'Map',entries:v.slice(1).map(([key,value])=>({key:encode(key),value:encode(value)}))}:v[0]==='INSTANCE'?{kind:'instance',type:v[1],fields:v.slice(2).map(([name,value])=>({name,value:encode(value)}))}:{encoding:v}])),stdout:t.stdout||'',
  ...(t.exception_msg?{diagnostic:t.exception_msg}:{}),...(t.event==='return'?{return:t.stack_to_render?.at(-1)?.encoded_locals?.__return__!==undefined?{kind:'value',value:encode(t.stack_to_render.at(-1).encoded_locals.__return__)}:{kind:['void','exceptional'].includes(t.return_kind)?t.return_kind:'unavailable'}}:{})}));
 const out={version:'1.0',code:result.code,events};if(result.inputRequest)out.inputRequest=result.inputRequest;return out;
}
export function validateDocument(document){
 if(!record(document)||document.version!=='1.0'||typeof document.code!=='string'||document.code.length>200100||!Array.isArray(document.events)||document.events.length>1001||JSON.stringify(document).length>2200000)fail('Invalid trace document');
 for(const e of document.events){
  if(!record(e)||!kinds.has(e.kind)||!record(e.location)||!['answer','calls'].includes(e.location.source)||!Number.isSafeInteger(e.location.line)||e.location.line<0||!Array.isArray(e.frames)||e.frames.length>64||!record(e.objects)||typeof e.stdout!=='string'||new TextEncoder().encode(e.stdout).length>65536)fail('Invalid trace event');
  const ids=new Set(Object.keys(e.objects));let budget=100000;
  const encoded=(v,depth=0)=>{if(--budget<0||depth>60)fail('Value inspection limit');if(Array.isArray(v)){if(v[0]==='REF'&&!ids.has(String(v[1])))fail('Unresolved object reference');for(const x of v)encoded(x,depth+1);}else if(record(v))for(const x of Object.values(v))encoded(x,depth+1);else if(typeof v==='number'&&!Number.isFinite(v))fail('Invalid numeric value');};
  const value=v=>{
   if(!record(v))fail('Invalid typed value');
   if(v.kind==='reference'){if(typeof v.id!=='string'||!ids.has(v.id))fail('Unresolved object reference');}
   else if(v.kind==='primitive'){if(!['string','boolean','number','null'].includes(v.type)||(v.type==='null'?v.value!==null:typeof v.value!==v.type)||(v.type==='number'&&!Number.isFinite(v.value)))fail('Invalid primitive');}
   else if(v.kind==='integer'){if(typeof v.value!=='string'||!/^[-]?\d+$/.test(v.value))fail('Invalid exact integer');}
   else if(v.kind==='display'){if(!Array.isArray(v.encoding))fail('Invalid display value');encoded(v.encoding);}
   else if(!['unavailable','unsupported','expired','truncated'].includes(v.kind)||typeof v.reason!=='string')fail('Unknown value kind');
  };
  const variables=entries=>{if(!Array.isArray(entries)||entries.length>10000)fail('Invalid variables');for(const v of entries){if(!record(v)||typeof v.name!=='string')fail('Invalid variable');value(v.value);}};
  variables(e.globals||[]);const frames=new Set();for(const f of e.frames){if(typeof f.id!=='string'||frames.has(f.id)||typeof f.name!=='string')fail('Invalid frame');frames.add(f.id);variables(f.locals);}
  for(const obj of Object.values(e.objects)){if(!record(obj))fail('Invalid object');if(obj.encoding)encoded(obj.encoding);else {if(!['instance','sequence','mapping','opaque'].includes(obj.kind)||typeof obj.type!=='string')fail('Invalid object kind');variables(obj.fields||[]);for(const v of obj.items||[])value(v);for(const pair of obj.entries||[]){if(!record(pair))fail('Invalid mapping entry');value(pair.key);value(pair.value);}}}
  if(e.return){if(!['value','void','unavailable','exceptional'].includes(e.return.kind))fail('Invalid return');if(e.return.kind==='value')value(e.return.value);}
 }
 const input=document.inputRequest;if(input&&(!['line','all'].includes(input.kind)||typeof input.prompt!=='string'||!Number.isSafeInteger(input.step)||input.step<0||input.step>=document.events.length))fail('Invalid input request');
 return document;
}
export function toLegacy(document){
 validateDocument(document);
 const identities=new Map(),frameIds=new Map();for(const e of document.events){for(const id of Object.keys(e.objects))if(!identities.has(id))identities.set(id,identities.size+1);for(const f of e.frames)if(!frameIds.has(f.id))frameIds.set(f.id,frameIds.size+1);}
 const maps=document.events.map(()=>identities);
 const trace=document.events.map((e,index)=>{
  const ids=maps[index];const remap=v=>Array.isArray(v)?v[0]==='REF'?['REF',ids.get(String(v[1]))]:v.map(remap):v;
  const value=v=>v.kind==='reference'?['REF',ids.get(v.id)]:v.kind==='primitive'?v.value:v.kind==='integer'?['IMPORTED_FAUX_PRIMITIVE',v.value]:v.kind==='display'?remap(v.encoding):['IMPORTED_FAUX_PRIMITIVE','<'+v.kind+': '+v.reason+'>'];
  const vars=a=>Object.fromEntries((a||[]).map(v=>[v.name,value(v.value)]));
  const frames=e.frames.map((f,i)=>({frame_id:frameIds.get(f.id),func_name:f.name,encoded_locals:vars(f.locals),ordered_varnames:f.locals.map(v=>v.name),unique_hash:f.id,parent_frame_id_list:[],is_parent:false,is_zombie:false,is_highlighted:!!f.highlighted}));
  if(e.return?.kind&&e.return.kind!=='value'&&frames.length){frames.at(-1).encoded_locals.__return__=['IMPORTED_FAUX_PRIMITIVE',e.return.kind==='void'?'void':'<return '+e.return.kind+'>'];frames.at(-1).ordered_varnames.push('__return__');}
  if(e.return?.kind==='value'&&frames.length){frames.at(-1).encoded_locals.__return__=value(e.return.value);if(!frames.at(-1).ordered_varnames.includes('__return__'))frames.at(-1).ordered_varnames.push('__return__');}
  const heap=Object.fromEntries(Object.entries(e.objects).map(([id,obj])=>[String(ids.get(id)),obj.encoding?remap(obj.encoding):obj.kind==='sequence'?['LIST',...(obj.items||[]).map(value)]:obj.kind==='mapping'?['DICT',...(obj.entries||[]).map(pair=>[value(pair.key),value(pair.value)])]:['INSTANCE',obj.type,...(obj.fields||[]).map(v=>[v.name,value(v.value)])]]));
  return {event:e.kind,line:e.location.source==='calls'?document.code.split('\n').length+1+e.location.line:e.location.line,source_area:e.location.source==='calls'?'scratch':'answer',source_line:e.location.line,stack_to_render:frames,globals:vars(e.globals),ordered_globals:(e.globals||[]).map(v=>v.name),heap,stdout:e.stdout,...(e.diagnostic?{exception_msg:e.diagnostic}:{})};
 });return {code:document.code,trace,...(document.inputRequest?{inputRequest:document.inputRequest}:{})};
}
