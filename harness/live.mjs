// Standalone widget fixture: no grading implementation lives here.
const query=new URLSearchParams(location.search),textarea=document.querySelector('textarea');
textarea.readOnly=query.has('readonly');
let language=query.get('language') || 'python3';
const preloads={python3:textarea.value,cpp:'#include <iostream>\nint main(){std::cout << 42 << "\\n";}'};
let state={};try{state=JSON.parse(sessionStorage.getItem('vizcode-widget-fixture') || '{}');}catch{}
state.drafts=state.drafts || {};state.aux=state.aux || {};
const root=document.createElement('div');textarea.after(root);textarea.hidden=true;let switching=false;
const persist=()=>sessionStorage.setItem('vizcode-widget-fixture',JSON.stringify(state));
const aux=state.aux[language] || {};
textarea.value=state.drafts[language] ?? preloads[language] ?? '';
window.widget=VizCode.create({initialCode:textarea.value,language,brokerUrl:'http://127.0.0.1:4104/live/broker.html',
 readOnly:textarea.readOnly,autoTraceOnMount:!query.has('noautotrace'),initialFunctions:aux.functions,initialBreakpoints:aux.breakpoints,
 initialInput:aux.stdin || '',initialInputHistory:aux.inputHistory,initialInputEof:aux.inputEof,
 onChange:code=>{if(!switching){textarea.value=code;state.drafts[language]=code;persist();}},
 onAuxiliaryChange:current=>{if(!switching){state.aux[language]=current;persist();}}
});
await widget.mount(root);
const bar=document.createElement('div');bar.className='vizcode-languages';
for(const [next,label]of [['python3','Python'],['cpp','C++']]){
 const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=textarea.readOnly;
 button.setAttribute('aria-pressed',String(next===language));bar.append(button);
 button.addEventListener('click',()=>{
  if(next===language)return;state.aux[language]=widget.getAuxiliaryState();state.drafts[language]=widget.getCode();language=next;
  switching=true;widget.setLanguage(next,state.drafts[next] ?? preloads[next] ?? '',state.aux[next]);switching=false;
  textarea.value=widget.getCode();persist();for(const b of bar.children)b.setAttribute('aria-pressed',String(b===button));
 });
}root.prepend(bar);
document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();window.submittedValue=widget.getCode();textarea.value=submittedValue;document.querySelector('#submitted').textContent=submittedValue;});
