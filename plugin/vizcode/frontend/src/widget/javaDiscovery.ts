import {javaLanguage} from '@codemirror/lang-java';
import type {FunctionState,FunctionRow} from './functionDiscovery';
const children=(node:any)=>{const nodes:any[]=[];for(let n=node.firstChild;n;n=n.nextSibling)nodes.push(n);return nodes;};
const find=(node:any,name:string):any=>node.name===name?node:children(node).map(n=>find(n,name)).find(Boolean);
export function discoverJava(code:string,previous?:FunctionState){
 let text=code,tree=javaLanguage.parser.parse(text);
 const topClass=children(tree.topNode).find(n=>['ClassDeclaration','RecordDeclaration','EnumDeclaration'].includes(n.name));
 if(!topClass){text='class VizAnswer {\n'+code+'\n}';tree=javaLanguage.parser.parse(text);}
 let invalid=false;tree.iterate({enter:n=>{if(n.type.isError)invalid=true;}});
 if(invalid)return {valid:false,locked:true,rows:previous?.rows || []};
 const slice=(n:any)=>n?text.slice(n.from,n.to):'';let locked=false;const rows:FunctionRow[]=[];
 const executable=(n:any):boolean=>['MethodInvocation','ObjectCreationExpression','ClassInstanceCreationExpression','ArrayCreationExpression','LambdaExpression'].includes(n.name) || children(n).some(executable);
 for(const cls of children(tree.topNode).filter(n=>['ClassDeclaration','RecordDeclaration','EnumDeclaration'].includes(n.name))){
  const owner=children(cls).find(n=>n.name==='Definition');const body=children(cls).find(n=>n.name==='ClassBody');if(!body)continue;
  for(const member of children(body)){
   if(['StaticInitializer','Block'].includes(member.name)){locked=true;continue;}
   if(member.name==='FieldDeclaration'){if(executable(member))locked=true;continue;}
   if(member.name!=='MethodDeclaration')continue;
   const name=children(member).find(n=>n.name==='Definition');const params=children(member).find(n=>n.name==='FormalParameters');if(!name || !params)continue;
   const mods=children(member).find(n=>n.name==='Modifiers');const isStatic=children(mods || {firstChild:null}).some(n=>n.name==='static');
   if(slice(name)==='main' && isStatic){locked=true;continue;}
   const parameters=children(params).filter(n=>n.name==='FormalParameter').map(n=>({name:slice(children(n).find(p=>p.name==='Definition')),optional:false}));
   const fullName=slice(owner)+'.'+slice(name);let reason=isStatic?'':'Call instance methods from your own program.';
   if(children(mods || {firstChild:null}).some(n=>n.name==='private'))reason='Call private methods from your own program.';
   if(/\.\.\./.test(slice(params)) || parameters.some(p=>!p.name))reason='Call this signature from your own program.';
   const id=fullName+slice(params).replace(/\s+/g,' ');
   rows.push({id,name:fullName,parameters,reason,checked:false,args:parameters.map(()=> '')});
  }
 }
 for(const row of rows){if(rows.filter(r=>r.name===row.name).length>1)row.reason='Call overloaded methods from your own program.';
  const saved=previous?.rows.find(r=>r.id===row.id);if(saved){row.checked=!!saved.checked;row.args=row.parameters.map((_,i)=>saved.args?.[i] || '');}}
 const old=previous?.rows || [];rows.sort((a,b)=>{const aIndex=old.findIndex(r=>r.id===a.id),bIndex=old.findIndex(r=>r.id===b.id);return (aIndex<0?old.length:aIndex)-(bIndex<0?old.length:bIndex);});
 return {valid:true,locked,rows};
}
