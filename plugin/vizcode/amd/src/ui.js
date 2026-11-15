// SPDX-License-Identifier: GPL-3.0-or-later
// CodeRunner UI contract: native textarea contents remain the graded response.
define(['core/ajax','core/str','qtype_coderunner/showdiff'], function(Ajax,Str,ShowDiff) {
    let bundle;
    const labels={python3:'Python',cpp:'C++',java:'Java'};
    const normalize=value=>({python:'python3',python3:'python3',cpp:'cpp','c++':'cpp',c_cpp:'cpp',java:'java'})[String(value).toLowerCase()];
    function load() {
        if(window.VizCode)return Promise.resolve(window.VizCode);
        if(!bundle)bundle=new Promise((resolve,reject)=>{
            const script=document.createElement('script');script.src=M.cfg.wwwroot+'/local/vizcode/assets/widget.js';
            script.onload=()=>window.VizCode?resolve(window.VizCode):reject(Error('Editor unavailable'));
            script.onerror=()=>reject(Error('Editor unavailable'));document.head.append(script);
        }).catch(error=>{bundle=undefined;throw error;});
        return bundle;
    }
    function UI(id,width,height,params) {
        this.id=id;this.textarea=document.getElementById(id);this.params=params;
        this.root=document.createElement('div');this.root.className='vizcode-coderunner';
        this.config=JSON.parse(this.textarea.dataset.vizcode || '{}');
        this.selector=document.getElementById(id.replace(/answer$/,'language'));
        this.language=normalize(String(this.selector?.value || params.lang || 'python3').split(',')[0].replace('*',''));
        this.fail=!this.language;this.events=new AbortController();this.switching=false;this.destroyed=false;
        this.key=JSON.stringify(['vizcode-cr-v1',location.origin,this.config.userId,this.config.usageid,this.config.slot,id]);
        try{this.state=JSON.parse(sessionStorage.getItem(this.key) || '{}');}catch{this.state={};}
        this.state.byLanguage=this.state.byLanguage || {};this.state.drafts=this.state.drafts || {};
    }
    UI.prototype.ready=async function() {
        this.api=await load();
        if(!this.config.brokerUrl)this.config={...this.config,...await Ajax.call([{methodname:'local_vizcode_configuration',args:{}}])[0]};
        if(!document.querySelector('link[data-vizcode-style]')){
            const style=document.createElement('link');style.rel='stylesheet';style.href=M.cfg.wwwroot+'/local/vizcode/styles.css';style.dataset.vizcodeStyle='1';document.head.append(style);
        }
    };
    UI.prototype.postInsert=function(wrapper) {
        wrapper.classList.add('vizcode-wrapper');wrapper.style.height='auto';wrapper.style.overflow='visible';wrapper.style.resize='none';wrapper.style.border='0';
        const question=this.textarea.closest('.que');question?.classList.add('vizcode-enabled');
        this.mount().catch(()=>{this.fail=true;wrapper.hidden=true;wrapper.style.display='none';this.textarea.style.display='block';});
    };
    UI.prototype.persist=function(){try{sessionStorage.setItem(this.key,JSON.stringify(this.state));}catch{ /* Optional local state. */ }};
    UI.prototype.mount=async function() {
        if(this.destroyed)return;
        const aux=this.state.byLanguage[this.language] || {};
        this.widget=this.api.create({initialCode:this.textarea.value,language:this.language,
            readOnly:this.textarea.readOnly || this.textarea.disabled,brokerUrl:this.config.brokerUrl,
            autoTraceOnMount:!!this.config.usageid,tracingEnabled:!!this.config.usageid,
            initialFunctions:aux.functions,initialBreakpoints:aux.breakpoints,initialInput:aux.stdin || '',
            initialInputHistory:aux.inputHistory,initialInputEof:aux.inputEof,
            getJavaTicket:async request=>{
                const bytes=new TextEncoder().encode(JSON.stringify(request));
                const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
                const result=await Ajax.call([{methodname:'local_vizcode_java_ticket',args:{usageid:this.config.usageid,slot:this.config.slot,sourcehash:hash}}])[0];
                return result.ticket;
            },
            onChange:code=>{
                if(this.switching)return;this.textarea.value=code;this.state.drafts[this.language]=code;this.persist();
                this.textarea.dispatchEvent(new Event('input',{bubbles:true}));this.textarea.dispatchEvent(new Event('change',{bubbles:true}));
            },
            onAuxiliaryChange:state=>{if(!this.switching){this.state.byLanguage[this.language]=state;this.persist();}}
        });
        await this.widget.mount(this.root);if(this.destroyed){this.widget.destroy();return;}
        this.textarea.vizcodeWidget=this.widget;
        const selector=document.getElementById(this.id.replace(/answer$/,'language'));
        this.selector=selector;
        if(selector && !selector.value && !this.textarea.readOnly){const initial=Array.from(selector.options).find(o=>normalize(o.value)===this.language);if(initial)selector.value=initial.value;}
        if(selector && selector.options.length>1){
            const bar=document.createElement('div');bar.className='vizcode-languages';bar.setAttribute('role','group');bar.setAttribute('aria-label','Answer language');
            this.buttons=[];
            for(const option of selector.options){
                const language=normalize(option.value);if(!language)continue;
                const button=document.createElement('button');button.type='button';button.textContent=labels[language];button.disabled=this.textarea.readOnly;
                button.dataset.language=language;button.setAttribute('aria-pressed',String(language===this.language));
                button.addEventListener('click',()=>{selector.value=option.value;selector.dispatchEvent(new Event('change',{bubbles:true}));this.setLanguage(option.value);},{signal:this.events.signal});
                bar.append(button);this.buttons.push(button);
            }
            if(this.buttons.length>1){this.root.prepend(bar);selector.hidden=true;}
            selector.addEventListener('change',()=>this.setLanguage(selector.value),{signal:this.events.signal});
            if(selector.value)this.setLanguage(selector.value);
        }
        window.addEventListener('pagehide',()=>{this.sync();this.widget?.suspend();},{signal:this.events.signal});
        window.addEventListener('pageshow',event=>{if(event.persisted)this.widget?.resume();},{signal:this.events.signal});
        this.installCheck();
        this.observer=new ResizeObserver(()=>this.textarea.current_ui_wrapper?.updateHeight());this.observer.observe(this.root);
    };
    UI.prototype.setLanguage=function(value){
        const next=normalize(value);if(!next || next===this.language || !this.widget || this.textarea.readOnly)return;
        this.sync();this.state.byLanguage[this.language]=this.widget.getAuxiliaryState();this.state.drafts[this.language]=this.textarea.value;
        this.language=next;const code=typeof this.state.drafts[next]==='string'?this.state.drafts[next]:'';
        this.switching=true;this.widget.setLanguage(next,code,this.state.byLanguage[next]);this.switching=false;
        this.textarea.value=code;this.buttons?.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===next)));
        this.persist();this.textarea.dispatchEvent(new Event('input',{bubbles:true}));this.textarea.dispatchEvent(new Event('change',{bubbles:true}));
    };
    UI.prototype.installCheck=function(){
        if(!this.config.usageid || this.textarea.readOnly)return;
        const form=this.textarea.form,question=this.textarea.closest('.que');if(!form || !question)return;
        this.notice=document.createElement('p');this.notice.setAttribute('role','alert');this.root.after(this.notice);
        this.busy=document.createElement('span');this.busy.className='accesshide';this.busy.setAttribute('role','status');this.root.after(this.busy);
        const busyButtons=()=>question.querySelectorAll('.im-controls [type=submit]');
        form.addEventListener('click',async event=>{
            const button=event.target.closest('[type=submit]');
            if(!button || button.closest('.que')!==question || !/-(submit|precheck)$/.test(button.name))return;
            event.preventDefault();event.stopImmediatePropagation();if(this.checking)return;
            this.sync();this.checking=true;this.notice.textContent='';this.busy.textContent='Grading answer…';
            const disabled=Array.from(busyButtons()).map(b=>[b,b.disabled]);disabled.forEach(([b])=>b.disabled=true);
            const original={label:button.value,html:button.innerHTML,width:button.getBoundingClientRect().width};
            let spinner,shell;
            if(button.tagName==='INPUT'){
                shell=document.createElement('span');shell.className='vizcode-check-shell';button.before(shell);shell.append(button);
                spinner=document.createElement('span');spinner.className='vizcode-check-spinner';spinner.setAttribute('aria-hidden','true');shell.append(spinner);
            }
            button.setAttribute('aria-label',button.getAttribute('aria-label') || button.value || button.textContent);button.setAttribute('aria-busy','true');
            button.style.width=original.width+'px';void button.offsetWidth;button.classList.add('vizcode-check-busy');button.style.width='42px';
            if(button.tagName==='INPUT')button.value='';else button.textContent='';
            const prefix='q'+this.config.usageid+':'+this.config.slot+'_';
            const seq=form.elements.namedItem(prefix+':sequencecheck');
            const response={};for(const [name,value] of new FormData(form)){if(name.startsWith(prefix) && !name.startsWith(prefix+':') && typeof value==='string')response[name.slice(prefix.length)]=value;}
            response.answer=this.textarea.value;
            try{
                const result=await Ajax.call([{methodname:'local_vizcode_check',args:{usageid:this.config.usageid,slot:this.config.slot,
                    sequence:Number(seq.value),response:JSON.stringify(response),action:button.name.endsWith('-precheck')?'precheck':'check'}}])[0];
                if(this.destroyed || !question.isConnected)return;
                const parsed=new DOMParser().parseFromString(result.html,'text/html');
                // The native wrapper polls this attribute, not its constructor's
                // cached parameters, to identify stale feedback after edits.
                const checkedTextarea=parsed.getElementById(this.id);
                if(checkedTextarea?.hasAttribute('data-params'))this.textarea.setAttribute('data-params',checkedTextarea.getAttribute('data-params'));
                for(const selector of ['.info .state','.info .grade','.im-controls','.outcome','.validationerror']){
                    const current=question.querySelector(selector),next=parsed.querySelector('.que '+selector);
                    if(current && next)current.replaceWith(document.importNode(next,true));
                    else if(next)question.querySelector('.content').append(document.importNode(next,true));
                    else if(current && selector==='.validationerror')current.remove();
                }
                seq.value=String(result.sequence);this.sync();
                const diff=question.querySelector('[name$="-diffbutton"]');
                if(diff){const strings=await Str.get_strings(['showdifferences','hidedifferences','expectedcolhdr','gotcolhdr'].map(key=>({key,component:'qtype_coderunner'})));
                    ShowDiff.initDiffButton(diff.id,...strings);}

                // CodeRunner renders and filters feedback; this only applies the VizCode palette.
                const state=parsed.querySelector('.coderunner-test-results')?.className || '';
                question.dataset.vizcodeOutcome=/\bpartial\b/.test(state)?'partial':/\bbad\b/.test(state)?'incorrect':'correct';

            }catch(error){this.notice.textContent=error.message || 'Server grading is unavailable. Your answer remains editable; retry Check.';}
            finally{
                this.busy.textContent='';this.checking=false;spinner?.remove();if(shell?.isConnected)shell.replaceWith(button);
                disabled.forEach(([b,value])=>b.disabled=value);button.classList.remove('vizcode-check-busy');button.removeAttribute('aria-busy');
                if(button.tagName==='INPUT')button.value=original.label;else button.innerHTML=original.html;
                button.style.width=original.width+'px';setTimeout(()=>button.style.width='',180);
            }
        },{capture:true,signal:this.events.signal});
    };
    UI.prototype.failed=function(){return this.fail;};UI.prototype.failMessage=function(){return 'ace_ui_notready';};
    UI.prototype.getElement=function(){return this.root;};
    UI.prototype.sync=function(){if(this.widget && !this.textarea.readOnly)this.textarea.value=this.widget.getCode();};
    UI.prototype.syncIntervalSecs=function(){return 2;};UI.prototype.requiredHeight=function(){return this.root.scrollHeight;};
    UI.prototype.resize=function(){};UI.prototype.hasFocus=function(){return this.root.contains(document.activeElement);};
    UI.prototype.destroy=function(){this.destroyed=true;this.sync();this.widget?.destroy();this.observer?.disconnect();this.events.abort();this.notice?.remove();this.busy?.remove();this.root.remove();delete this.textarea.vizcodeWidget;if(this.selector)this.selector.hidden=false;};
    return {Constructor:UI};
});
