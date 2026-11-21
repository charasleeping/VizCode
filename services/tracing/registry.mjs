// SPDX-License-Identifier: GPL-3.0-or-later
import {readFileSync} from 'node:fs';
export const builtins=[
 {id:'python-pyodide',version:'1.0.0',label:'Python',languages:['python3','python'],transport:'browser',discovery:'python3',editorMode:'python',renderer:'py3',legacySeparator:'# Scratch (local only)',profiles:['auto'],capabilities:{frames:true,objects:true,identity:true,returns:true,input:true,discovery:true}},
 {id:'cpp-gdb',version:'1.0.0',label:'C++',languages:['cpp','c++','cpp17'],transport:'container',image:'vizcode-cpp-job:1',sandbox:{ptrace:true,execTmp:true,memoryMiB:512},discovery:'cpp',editorMode:'c_cpp',renderer:'cpp',legacySeparator:'// Scratch (local only)',inputPolicy:{endOnEmpty:true,endOnMultiline:true},profiles:['auto'],capabilities:{frames:true,objects:true,identity:true,returns:true,input:true,discovery:true}},
 {id:'java-jdi',version:'1.0.0',label:'Java',languages:['java'],transport:'container',image:'vizcode-java-job:21',discovery:'java',editorMode:'java',renderer:'java',legacySeparator:'// Scratch (local only)',inputPolicy:{endOnMultiline:true},profiles:['auto'],capabilities:{frames:true,objects:true,identity:true,returns:true,input:true,discovery:true}}
];
for(const adapter of builtins)adapter.capabilities.diagnostics=true;
const identifier=/^[a-z][a-z0-9._+-]{0,79}$/;
export function validateRegistry(entries){
 if(!Array.isArray(entries)||entries.length>100)throw Error('Invalid adapter registry');
 const ids=new Set(),languages=new Set();
 for(const a of entries){
  if(!a||!identifier.test(a.id)||ids.has(a.id)||typeof a.version!=='string'||typeof a.label!=='string'||!['browser','container','stdio','http','dap'].includes(a.transport)||!Array.isArray(a.languages)||!a.languages.length||!Array.isArray(a.profiles)||!a.profiles.length||!a.profiles.every(p=>identifier.test(p))||!a.capabilities||typeof a.capabilities!=='object')throw Error('Invalid adapter registration');
  if(a.transport==='browser'&&a.id!=='python-pyodide')throw Error('Browser transport is reserved for the built-in Pyodide adapter');
  if(Object.values(a.capabilities).some(v=>typeof v!=='boolean')||(a.inputPolicy&&Object.values(a.inputPolicy).some(v=>typeof v!=='boolean')))throw Error('Capabilities and input policies must be booleans');
  if(a.sandbox&&['ptrace','execTmp'].some(k=>a.sandbox[k]!==undefined&&typeof a.sandbox[k]!=='boolean'))throw Error('Invalid sandbox permission');
  ids.add(a.id);
  for(const language of a.languages){if(typeof language!=='string'||!language||language.length>80||languages.has(language.toLowerCase()))throw Error('Duplicate/invalid adapter language');languages.add(language.toLowerCase());}
  if(a.sandbox&&(!Number.isInteger(a.sandbox.memoryMiB||384)||(a.sandbox.memoryMiB||384)<128||(a.sandbox.memoryMiB||384)>1024||Object.keys(a.sandbox).some(k=>!['ptrace','execTmp','memoryMiB'].includes(k))))throw Error('Invalid sandbox policy');
  if(['container','stdio','dap'].includes(a.transport)&&(typeof a.image!=='string'||!a.image||a.image.startsWith('-')))throw Error('An installed image is required');
  if(['stdio','dap'].includes(a.transport)&&(!Array.isArray(a.command)||!a.command.length||!a.command[0]||a.command.some(x=>typeof x!=='string'||x.includes('\0'))))throw Error('An installed adapter command is required');
  if(a.discoveryCommand!==undefined&&(!Array.isArray(a.discoveryCommand)||!a.discoveryCommand.length||!a.discoveryCommand[0]||a.discoveryCommand.some(x=>typeof x!=='string'||x.includes('\0'))))throw Error('Invalid discovery command');
  if(a.discoverUrl!==undefined){const url=new URL(a.discoverUrl);if(a.transport!=='http'||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid self-hosted discovery URL');}
  if(a.transport==='http'){const url=new URL(a.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid self-hosted adapter URL');}
 }
 return entries;
}
export function loadRegistry(){return validateRegistry(process.env.VIZCODE_ADAPTER_REGISTRY?JSON.parse(readFileSync(process.env.VIZCODE_ADAPTER_REGISTRY,'utf8')):structuredClone(builtins));}
export function publicAdapter(a){return Object.fromEntries(['id','version','label','languages','transport','discovery','editorMode','renderer','legacySeparator','inputPolicy','profiles','capabilities'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));}
export function resolveAdapter(registry,request){const a=registry.find(a=>a.id===request.adapterId);if(!a||a.version!==request.adapterVersion||!a.languages.some(l=>l.toLowerCase()===request.language?.toLowerCase())||!a.profiles.includes(request.sourceProfile))throw Error('Adapter, language, version or source profile is not enabled');return a;}
