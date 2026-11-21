import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {fromLegacy,toLegacy,validateDocument} from '../../plugin/vizcode/frontend/src/widget/protocol.mjs';
import {builtins,validateRegistry,resolveAdapter} from '../../services/tracing/registry.mjs';
import {validateDiscovery} from '../../services/tracing/jobs.mjs';
const request={code:'2\n3\n9007199254740993',stdin:'',scratchCode:''};
for(const [cmd,args]of [['python3',['examples/adapters/stdio-python.py']],['node',['examples/adapters/stdio-node.mjs']]]){
 const p=spawnSync(cmd,args,{input:JSON.stringify(request),encoding:'utf8'});assert.equal(p.status,0,p.stderr);const document=validateDocument(JSON.parse(p.stdout));const legacy=toLegacy(document);assert.equal(legacy.trace.at(-1).stack_to_render[0].encoded_locals.total[1],'9007199254740998');
}
const trace={code:'x',trace:[{event:'return',line:1,stack_to_render:[{frame_id:1,func_name:'f',encoded_locals:{x:['REF',5],__return__:['REF',5]}}],heap:{5:['INSTANCE','Box',['next',['REF',5]]]},stdout:''}]};
const document=fromLegacy(trace);validateDocument(document);const restored=toLegacy(document);assert.deepEqual(restored.trace[0].stack_to_render[0].encoded_locals.x,restored.trace[0].stack_to_render[0].encoded_locals.__return__);
const invalid=structuredClone(document);invalid.events[0].frames[0].locals[0].value.id='missing';assert.throws(()=>validateDocument(invalid),/reference/);
const unsupported=structuredClone(document);unsupported.events[0].frames[0].locals[0].value={kind:'unsupported',reason:'Not inspected'};assert.doesNotThrow(()=>validateDocument(unsupported));
validateRegistry(structuredClone(builtins));assert.throws(()=>validateRegistry([builtins[0],builtins[0]]));assert.throws(()=>resolveAdapter(builtins,{adapterId:'cpp-gdb',adapterVersion:'1.0.0',language:'java',sourceProfile:'auto'}));
assert.throws(()=>validateRegistry([{...builtins[1],transport:'stdio',image:'',command:['python3']}]));
assert.throws(()=>validateRegistry([{...builtins[1],discoveryCommand:['']}]));
const snapshots=structuredClone(document);snapshots.events.push(structuredClone(snapshots.events[0]));snapshots.events[1].objects={'other':{kind:'sequence',type:'List',items:[]},...snapshots.events[1].objects};
const roundtrip=toLegacy(snapshots);assert.deepEqual(roundtrip.trace[0].stack_to_render[0].encoded_locals.x,roundtrip.trace[1].stack_to_render[0].encoded_locals.x);
assert.equal(roundtrip.trace[0].stack_to_render[0].frame_id,roundtrip.trace[1].stack_to_render[0].frame_id);
assert.doesNotThrow(()=>validateDiscovery({valid:true,locked:true,rows:[]}));assert.throws(()=>validateDiscovery({valid:true,locked:false,rows:[{}]}));
console.log('Cross-language adapters, exact integers, cycles, return aliases, capability and registry contracts passed');
