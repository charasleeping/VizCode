import {discoverJava} from './javaDiscovery';
import {pythonLanguage} from '@codemirror/lang-python';
import {cppLanguage} from '@codemirror/lang-cpp';
export interface Argument {name:string; optional:boolean;}
export interface FunctionRow {id:string; name:string; parameters:Argument[]; reason:string; checked:boolean; args:string[];}
export interface FunctionState {version:1; rows:FunctionRow[];}
const children=(node:any)=>{const out:any[]=[];for(let n=node.firstChild;n;n=n.nextSibling)out.push(n);return out;};
const find=(node:any,name:string):any=>{if(node.name===name)return node;for(const c of children(node)){const found=find(c,name);if(found)return found;}return null;};
export function discover(code:string,language:string,previous?:FunctionState) {
 if(!['python3','cpp','java'].includes(language))throw new Error('Unsupported language');
 if(language==='java')return discoverJava(code,previous);
 const parser=language==='cpp'?cppLanguage.parser:pythonLanguage.parser;
 const tree=parser.parse(code);let invalid=false;tree.iterate({enter:n=>{if(n.type.isError)invalid=true;}});
 if(invalid)return {valid:false,locked:true,rows:previous?.rows || []};
 const text=(n:any)=>n?code.slice(n.from,n.to):'';
 const rows:FunctionRow[]=[];let locked=false;
 const topCalls=(node:any):boolean=>{
  if(['ArrowFunction','FunctionExpression','FunctionDefinition','FunctionDeclaration'].includes(node.name))return false;
  return ['CallExpression','NewExpression','AwaitExpression'].includes(node.name) || children(node).some(topCalls);
 };
 const add=(node:any,nameNode:any,params:any)=>{
  const name=text(nameNode);if(!name||!params)return;
  const raw=text(params);const parts:any[][]=[[]];
  for(const p of children(params)){if(['(',')'].includes(p.name))continue;if(p.name===',')parts.push([]);else parts.at(-1)!.push(p);}
  const parameters:Argument[]=[];let reason='';
  if (/\basync\b/.test(text(node).slice(0,text(node).indexOf(name))) || find(node,'YieldExpression') || find(node,'YieldStatement') || find(node,'Star'))reason='Use this callable directly in your answer.';
  for(const group of parts){if(!group.length)continue;
   const composite=group.length===1?group[0]:null;
   const candidates=composite && /ParameterDeclaration/.test(composite.name)?children(composite):group;
   const parameter=candidates.find(p=>['VariableName','VariableDefinition','Identifier'].includes(p.name));
   if(!parameter || group.some(p=>['*','**','/','Spread'].includes(p.name)) || /\.\.\./.test(group.map(text).join(''))) {reason='Use this signature directly in your answer.';continue;}
   parameters.push({name:text(parameter),optional:group.some(p=>['AssignOp','Equals'].includes(p.name)) || composite?.name==='OptionalParameterDeclaration'});
  }
  if(language==='cpp' && name==='main'){locked=true;return;}
  const id=name+raw.replace(/\s+/g,' ');
  rows.push({id,name,parameters,reason,checked:false,args:parameters.map(()=> '')});
 };
 for(const node of children(tree.topNode)){
  if(['Comment','LineComment','BlockComment','ImportStatement','ImportDeclaration','PreprocDirective','UsingDeclaration','TypeDefinition','EmptyStatement'].includes(node.name))continue;
  if(['FunctionDefinition','FunctionDeclaration'].includes(node.name)){
   const declaration=language==='cpp'?find(node,'FunctionDeclarator'):node;
   add(node,children(declaration).find(p=>['VariableName','VariableDefinition','Identifier'].includes(p.name)),find(declaration,language==='cpp'?'ParameterList':'ParamList'));continue;
  }
  if(['AssignStatement','VariableDeclaration','Declaration'].includes(node.name)){
   if(topCalls(node) || find(node,'LambdaExpression'))locked=true;
   continue;
  }
  if(language==='python3' && node.name==='ExpressionStatement' && children(node).every(p=>['String','FormatString'].includes(p.name)))continue;
  if(['ClassDefinition','ClassDeclaration','StructSpecifier'].includes(node.name))continue;
  locked=true;
 }
 if(language==='cpp')for(const row of rows)if(rows.filter(r=>r.name===row.name).length>1)row.reason='Call overloaded functions directly in your answer.';
 const old=previous?.version===1?previous.rows:[];
 for(const row of rows){const saved=old.find(r=>r.id===row.id);if(saved){row.checked=!!saved.checked;row.args=row.parameters.map((_,i)=>typeof saved.args?.[i]==='string'?saved.args[i]:'');}}
 rows.sort((a,b)=>{const ai=old.findIndex(r=>r.id===a.id),bi=old.findIndex(r=>r.id===b.id);return (ai<0?old.length:ai)-(bi<0?old.length:bi);});
 return {valid:true,locked,rows};
}
export function buildCalls(code:string,language:string,state?:FunctionState){
 const result=discover(code,language,state);const lines:string[]=[];const mapping:string[]=[];
 if(!result.valid)throw new Error('Fix the answer syntax before debugging.');
 if(!result.locked)for(const row of result.rows){
  if(!row.checked)continue;if(row.reason)throw new Error(row.reason);
  const args:string[]=[];
  row.parameters.forEach((p,i)=>{const value=row.args[i]?.trim() || '';if(!value&&!p.optional)throw new Error('Enter an argument for '+row.name+' → '+p.name+'.');
   if(language==='python3'){if(value)args.push(p.name+'=('+value+')');}
   else args.push(value?'('+value+')':'');
  });
  if(language==='cpp'){while(args.at(-1)==='')args.pop();if(args.includes(''))throw new Error('C++ default arguments can only be omitted at the end.');}
  const call=row.name+'('+args.join(',')+')'+(language==='python3'?'':';');
  lines.push(call);mapping.push(...call.split('\n').map(()=>row.id));
 }
 const source=lines.join('\n');if(source.length>100000)throw new Error('Function arguments exceed the debugging limit.');
 return {...result,source,mapping};
}
