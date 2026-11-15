import '../opt/js/_references';
import { OptCmEditor } from '../opt/js/cm-editor';
import { ExecutionVisualizer } from '../opt/js/pytutor';
import { createElement, ChevronLeft, ChevronRight, SkipBack, SkipForward, ArrowRight, Check, X } from 'lucide';
import type { PackageAsset } from './packageAssets';
import { ExecutionProvider } from './ExecutionProvider';
import { validateTrace } from './validateTrace';
import './widget.css';
import {discover,buildCalls,FunctionState} from './functionDiscovery';

export interface Config {
    initialCode: string;
    initialBreakpoints?: number[];
    language?: 'python3' | 'cpp' | 'java';
    readOnly?: boolean;
    autoTraceOnMount?: boolean;
    tracingEnabled?: boolean;
    getJavaTicket?: (request: any) => Promise<string>;
    brokerUrl: string;
    initialScratch?: string; // Deprecated and never executed.
    initialFunctions?: FunctionState;
    initialInput?: string;
    initialInputHistory?: string[];
    initialInputEof?: boolean;
    onChange?: (code: string) => void;
    onAuxiliaryChange?: (state: AuxiliaryState) => void;
    debug?: boolean;
    loadPackages?: (language: string) => Promise<PackageAsset[]>;
}

export interface AuxiliaryState {
    breakpoints?: number[];
    scratchCode: string; // Always empty; retained for storage compatibility.
    functions?: FunctionState;
    stdin: string;
    inputHistory?: string[];
    inputEof?: boolean;
}
type InputRequest = {kind: 'line' | 'all'; prompt: string; step: number};
export class Widget {
    private root: HTMLElement;
    private editor: OptCmEditor;
    private functions: FunctionState = {version:1,rows:[]};
    private functionsPanel: HTMLElement;
    private callsMapping: string[] = [];
    private stale = false;
    private functionsLocked = false;
    private animation?: Animation;
    private static active?: Widget;
    private inputHistory: string[] = [];
    private inputEof = false;
    private inputRequest?: InputRequest;
    private inputPanel: HTMLElement;
    private resumeStep = 0;
    private inputVisible = false;
    private status: HTMLElement;
    private output: HTMLElement;
    private outputPanel: HTMLElement;
    private dragPreview?: HTMLElement;
    private dropTarget?: HTMLElement;
    private error: HTMLElement;
    private traceRoot: HTMLElement;
    private counter: HTMLElement;
    private packageNotice: HTMLElement;
    private slider: HTMLInputElement;
    private sliderFrame=0;
    private sliderTarget=-1;
    private buttons: HTMLButtonElement[] = [];
    private visualization?: ExecutionVisualizer;
    private provider?: ExecutionProvider;
    private timer?: ReturnType<typeof setTimeout>;
    private revision = 0;
    private destroyed = false;
    private composing = false;
    private events = new AbortController();
    private observer?: ResizeObserver;

    constructor(private config: Config) {}

    async mount(container: HTMLElement) {
        if (this.root || this.destroyed) throw new Error('Widget already mounted');
        this.root = document.createElement('section');
        this.root.className = 'vizcode-widget';
        this.root.setAttribute('aria-label', 'Live program debugger');
        container.append(this.root);
        const toolbar = document.createElement('div');
        toolbar.className = 'vizcode-steps';
        const commands = [
            ['First step', SkipBack, () => this.jumpBreakpoint(false)],
            ['Previous step', ChevronLeft, () => this.step((this.visualization?.curInstr || 0) - 1)],
            ['Next step', ChevronRight, () => this.step((this.visualization?.curInstr || 0) + 1)],
            ['Last step', SkipForward, () => this.jumpBreakpoint(true)],
        ] as const;
        for (const [label, icon, action] of commands) {
            const button = document.createElement('button');
            button.type = 'button';
            button.title = label;
            button.setAttribute('aria-label', label);
            const image = createElement(icon);
            image.setAttribute('aria-hidden', 'true');
            button.append(image);
            button.addEventListener('click', action, { signal: this.events.signal });
            if(label==='First step' || label==='Last step'){
                const forward=label==='Last step';
                button.title=forward?'Next breakpoint or end (Shift+Right)':'Previous breakpoint or beginning (Shift+Left)';
                button.setAttribute('aria-description',button.title);
                button.setAttribute('aria-keyshortcuts',forward?'Shift+ArrowRight':'Shift+ArrowLeft');
            }
            this.buttons.push(button);
            toolbar.append(button);
        }
        this.slider = document.createElement('input');
        this.slider.type = 'range';this.slider.step='any';
        this.slider.min = '0';
        this.slider.max = '0';
        this.slider.setAttribute('aria-label', 'Execution step');
        this.slider.addEventListener('input', () => this.step(Math.round(Number(this.slider.value))), { signal: this.events.signal });
        this.counter = document.createElement('span');
        this.counter.className = 'vizcode-step-count';
        this.status = document.createElement('span');
        this.status.className = 'vizcode-status';
        this.status.setAttribute('role', 'status');
        this.setStatus(this.config.readOnly ? 'Read-only' : 'Ready');
        toolbar.append(this.slider, this.counter, this.status);
        this.root.append(toolbar);
        this.packageNotice = document.createElement('p'); this.packageNotice.className = 'vizcode-package-notice'; this.packageNotice.setAttribute('role','status'); this.root.append(this.packageNotice);
        const workspace = document.createElement('div');
        workspace.className = 'vizcode-workspace';
        const answer = document.createElement('div');
        answer.className = 'vizcode-source';
        this.traceRoot = document.createElement('div');
        this.traceRoot.id = 'vizcode-trace-' + crypto.randomUUID();
        this.traceRoot.className = 'vizcode-trace';
        workspace.append(answer);
        this.root.prepend(workspace);
        this.root.append(this.traceRoot);
        this.inputPanel = document.createElement('div');
        this.inputPanel.className = 'vizcode-input-request'; this.inputPanel.hidden = true;
        this.inputPanel.setAttribute('role', 'group'); this.inputPanel.setAttribute('aria-label', 'Program input');
        this.root.append(this.inputPanel);
        this.restoreInput({stdin: this.config.initialInput || '', inputHistory: this.config.initialInputHistory,
            inputEof: this.config.initialInputEof});
        this.editor = new OptCmEditor({ container: answer, value: this.config.initialCode, preserveWhitespace: true,
            readOnly: this.config.readOnly, breakpoints:true, onBreakpointsChange:()=>{if(this.editor)this.config.onAuxiliaryChange?.(this.getAuxiliaryState());}, mode: this.editorMode(), fontSize: '14px', onChange: code => {
                this.config.onChange?.(code);
                this.changed();
            } });
        answer.querySelector('.cm-content')?.setAttribute('aria-label', 'Answer source');
        this.functions = this.config.initialFunctions?.version === 1 ? this.config.initialFunctions : {version:1,rows:[]};
        this.functionsPanel = document.createElement('div'); this.functionsPanel.className='vizcode-functions';
        this.functionsPanel.setAttribute('role','group');this.functionsPanel.setAttribute('aria-label','Debugging functions');
        this.root.append(this.functionsPanel);
        this.editor.setBreakpoints(this.config.initialBreakpoints || []);
        this.output = document.createElement('pre');
        this.output.className = 'vizcode-output';
        this.output.setAttribute('aria-label', 'Execution output');
        this.outputPanel=document.createElement('aside');this.outputPanel.className='vizcode-output-panel';this.outputPanel.hidden=true;
        const outputHeading=document.createElement('h3');outputHeading.textContent='Output';this.outputPanel.append(outputHeading,this.output);
        this.error = document.createElement('div');
        this.error.className = 'vizcode-error';
        this.error.setAttribute('role', 'alert');
        this.root.append(this.error);
        this.root.addEventListener('compositionstart', event => { if (!(event.target as HTMLElement).closest('.vizcode-source')) return; this.composing = true; clearTimeout(this.timer); }, { signal: this.events.signal });
        this.root.addEventListener('compositionend', event => { if (!(event.target as HTMLElement).closest('.vizcode-source')) return; this.composing = false; this.schedule(); }, { signal: this.events.signal });
        const activate=()=>{Widget.active=this;};
        this.root.addEventListener('pointerdown',activate,{signal:this.events.signal});
        this.root.addEventListener('focusin',activate,{signal:this.events.signal});
        Widget.active ||= this;
        document.addEventListener('keydown',event=>{
            if(Widget.active!==this || event.ctrlKey || event.altKey || event.metaKey || !['ArrowLeft','ArrowRight'].includes(event.key) ||
                (event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
            if(this.stale || !this.visualization)return;
            event.preventDefault();const forward=event.key==='ArrowRight';
            if(event.shiftKey)this.jumpBreakpoint(forward);else this.step(this.visualization.curInstr+(forward?1:-1));
        },{signal:this.events.signal});
        this.updateStep();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(this.root);
        if (this.config.tracingEnabled !== false && this.config.autoTraceOnMount !== false && !this.config.readOnly && this.getCode().trim()) {this.stale=true;this.setStatus('Updating');this.schedule();}
    }

    private setStatus(label: string) {
        this.status.textContent='';this.status.setAttribute('aria-label',label);
        const text=document.createElement('span');text.className='vizcode-sr-only';text.textContent=label;
        this.status.append(text);
        const failed=['Debugging unavailable','Execution error'].includes(label);
        if(label==='Ready' || failed){const icon=createElement(failed?X:Check);icon.setAttribute('stroke-width','1.5');icon.setAttribute('aria-hidden','true');this.status.append(icon);}
        this.status.className='vizcode-status '+(failed?'vizcode-status-error':label==='Ready'?'vizcode-status-ready':['Updating','Tracing'].includes(label)?'vizcode-status-loading':'vizcode-status-message');
        if(!failed && !['Ready','Updating','Tracing'].includes(label))this.status.textContent=label;
    }
    private setError(message: string) {
        this.error.replaceChildren();if(!message)return;
        const ns='http://www.w3.org/2000/svg';const icon=document.createElementNS(ns,'svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
        const triangle=document.createElementNS(ns,'path');triangle.setAttribute('d','M12 2 L23 22 H1 Z');triangle.setAttribute('fill','#b3261e');triangle.setAttribute('stroke','white');triangle.setAttribute('stroke-width','1.5');
        const mark=document.createElementNS(ns,'path');mark.setAttribute('d','M12 8 V14 M12 17 V18');mark.setAttribute('stroke','white');mark.setAttribute('stroke-width','2');mark.setAttribute('stroke-linecap','round');icon.append(triangle,mark);
        const text=document.createElement('span');text.className='vizcode-error-message';text.textContent=message;this.error.append(icon,text);
    }
    private clearDrag() {
        this.dragPreview?.remove();this.dragPreview=undefined;
        this.dropTarget?.classList.remove('vizcode-drop-before');this.dropTarget=undefined;
        this.functionsPanel?.querySelectorAll('.vizcode-row-dragging').forEach(row=>row.classList.remove('vizcode-row-dragging'));
    }
    private renderFunctions(locked: boolean) {
        this.clearDrag();this.functionsPanel.replaceChildren();
        if(locked && this.functions.rows.length){const notice=document.createElement('p');notice.textContent='Calls are disabled while the answer contains executable top-level code or invalid syntax.';this.functionsPanel.append(notice);}
        const move=(from:number,to:number)=>{if(locked||from===to||from<0||from>=this.functions.rows.length||to<0||to>=this.functions.rows.length)return;
            const [row]=this.functions.rows.splice(from,1);this.functions.rows.splice(to,0,row);this.renderFunctions(false);this.auxiliaryChanged();};
        this.functions.rows.forEach((row,index)=>{
            const line=document.createElement('div');line.className='vizcode-function-row';line.dataset.function=row.id;
            const handle=this.action('☰',()=>{});handle.className='vizcode-function-handle';handle.setAttribute('aria-label','Move '+row.name);handle.disabled=locked;
            handle.title='Drag to reorder; use Up/Down to move';handle.draggable=!locked;
            handle.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();move(index,index+(event.key==='ArrowUp'?-1:1));}},{signal:this.events.signal});
            handle.addEventListener('dragstart',event=>{event.dataTransfer?.setData('text/plain',String(index));
                const box=line.getBoundingClientRect();event.dataTransfer?.setDragImage(line,event.clientX-box.left,event.clientY-box.top);
                line.classList.add('vizcode-row-dragging');},{signal:this.events.signal});
            handle.addEventListener('dragend',()=>this.clearDrag(),{signal:this.events.signal});
            line.addEventListener('dragover',event=>{if(locked)return;event.preventDefault();this.dropTarget?.classList.remove('vizcode-drop-before');this.dropTarget=line;line.classList.add('vizcode-drop-before');},{signal:this.events.signal});
            line.addEventListener('drop',event=>{event.preventDefault();const value=event.dataTransfer?.getData('text/plain');this.clearDrag();if(value && /^\d+$/.test(value))move(Number(value),index);},{signal:this.events.signal});
            handle.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'||locked)return;if(event.isTrusted)handle.setPointerCapture(event.pointerId);
                const box=line.getBoundingClientRect();this.dragPreview=line.cloneNode(true) as HTMLElement;this.dragPreview.removeAttribute('data-function');
                this.dragPreview.classList.add('vizcode-drag-preview');Object.assign(this.dragPreview.style,{position:'fixed',width:box.width+'px',left:box.left+'px',top:box.top+'px',pointerEvents:'none',zIndex:'10000'});document.body.append(this.dragPreview);line.classList.add('vizcode-row-dragging');},{signal:this.events.signal});
            handle.addEventListener('pointermove',event=>{if(!this.dragPreview)return;
                this.dragPreview.style.top=(event.clientY-16)+'px';this.dragPreview.style.left=(event.clientX-12)+'px';
                const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-function]');
                if(target && this.functionsPanel.contains(target)){this.dropTarget?.classList.remove('vizcode-drop-before');this.dropTarget=target;target.classList.add('vizcode-drop-before');}
            },{signal:this.events.signal});
            handle.addEventListener('pointercancel',()=>this.clearDrag(),{signal:this.events.signal});
            handle.addEventListener('pointerup',event=>{if(event.pointerType==='mouse'||locked)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-function]');const to=this.functions.rows.findIndex(r=>r.id===target?.dataset.function);this.clearDrag();move(index,to);},{signal:this.events.signal});
            const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=row.checked;checkbox.disabled=locked||!!row.reason;
            checkbox.addEventListener('change',()=>{row.checked=checkbox.checked;this.auxiliaryChanged();},{signal:this.events.signal});
            label.append(checkbox,document.createTextNode(row.name));line.append(handle,label);
            row.parameters.forEach((parameter,i)=>{const label=document.createElement('label');label.textContent=parameter.name;
                const input=document.createElement('input');input.type='text';input.value=row.args[i];input.disabled=locked||!!row.reason;
                input.placeholder=parameter.optional?'Default':'Argument';input.setAttribute('aria-label',row.name+' argument '+parameter.name);
                input.addEventListener('input',()=>{row.args[i]=input.value;this.auxiliaryChanged();},{signal:this.events.signal});label.append(input);line.append(label);});
            if(row.reason){const reason=document.createElement('small');reason.textContent=row.reason;line.append(reason);}
            this.functionsPanel.append(line);
        });
    }
    private diagnostic(event: string) { if (this.config.debug) console.debug(event); }
    private auxiliaryChanged() {
        this.config.onAuxiliaryChange?.(this.getAuxiliaryState());
        this.changed();
    }
    private clearTrace() {
        this.visualization?.dataViz?.jsPlumbInstance?.reset();
        this.visualization = undefined;
        this.traceRoot?.replaceChildren();
        this.inputRequest = undefined; this.inputVisible = false;
        if (this.inputPanel) { this.inputPanel.hidden = true; this.inputPanel.replaceChildren(); }
        this.editor?.setStepMarkers(null, null);
        this.editor?.setErrorLine(null);

        if (this.output) this.output.textContent = '';
        if (this.error) this.error.textContent = '';
        this.updateStep();
    }
    private changed() {
        if (this.config.readOnly || this.destroyed || this.config.tracingEnabled === false) return;
        this.resumeStep = 0;
        this.revision++;
        clearTimeout(this.timer);
        this.stale=true;
        this.inputRequest=undefined;this.inputVisible=false;this.inputPanel.hidden=true;
        this.editor.setStepMarkers(null,null);
        this.updateStep();
        this.provider?.cancel();
        this.setStatus('Updating');
        if (!this.getCode().trim()) {
            this.functions={version:1,rows:[]};this.functionsPanel.replaceChildren();this.clearTrace();this.stale=false;
            this.provider?.dispose();
            this.provider = undefined;
            this.setStatus('Ready');
            return;
        }
        this.schedule();
    }
    private schedule() {
        clearTimeout(this.timer);
        if (this.destroyed || this.config.readOnly || this.config.tracingEnabled === false || this.composing || !this.getCode().trim()) return;
        const revision = this.revision;
        this.timer = setTimeout(() => { void this.refresh(revision); }, 500);
    }
    private async refresh(revision: number) {
        if (this.destroyed || revision !== this.revision) return;
        try {
            const packages = await (this.config.loadPackages?.(this.config.language || 'python3') || Promise.resolve([]));
            if (this.destroyed || revision !== this.revision) return;
            const gradingOnly = packages.filter(item => item.mode !== 'both');
            this.packageNotice.textContent = gradingOnly.length ? 'Live debugging is unavailable for grading-only packages: ' + gradingOnly.map(item=>item.name).join(', ') + '. Use Check to run your answer.' : '';
            if (gradingOnly.length) { this.setStatus('Check only'); return; }
            if (!this.provider) {
                this.provider = new ExecutionProvider(this.config.brokerUrl, this.root, event => this.diagnostic(event), this.config.language);
                void this.provider.prepare().catch(() => {});
            }
            const discovery=discover(this.getCode(),this.config.language || 'python3',this.functions);
            const same=JSON.stringify(discovery.rows.map(r=>[r.id,r.reason]))===JSON.stringify(this.functions.rows.map(r=>[r.id,r.reason]));
            const locked=discovery.locked || !discovery.valid;
            if(!same || !this.functionsPanel.childElementCount || locked!==this.functionsLocked){this.functions={version:1,rows:discovery.rows};this.functionsLocked=locked;this.renderFunctions(locked);}
            const calls=discovery.valid?buildCalls(this.getCode(),this.config.language || 'python3',this.functions):{source:'',mapping:[]};
            this.callsMapping=calls.mapping;
            this.setStatus('Tracing');
            const request = { interactiveInput: true, code: this.getCode(), language: this.config.language || 'python3', ...this.getAuxiliaryState(), scratchCode:calls.source, functions:discovery.valid?this.functions:undefined, diagnose:!discovery.valid, packages };
            this.diagnostic('PYODIDE_RUN_START');
            const raw = await this.provider.execute(request, this.config.getJavaTicket);
            if (this.destroyed || revision !== this.revision) return;
            const result = JSON.parse(raw);
            validateTrace(result, request.code + (request.language === 'python3' ? '\n# Scratch (local only)\n' : '\n// Scratch (local only)\n') + request.scratchCode);
            const error = [...result.trace].reverse().find(entry => entry.exception_msg);
            if (result.trace[0]?.event === 'uncaught_exception') throw new Error(error?.exception_msg || 'The answer could not be traced.');
            this.clearTrace(); this.stale=false;
            this.setError(error?.exception_msg || '');
            this.inputRequest = result.inputRequest || undefined;
            this.setStatus(error ? 'Execution error' : 'Ready');
            if (this.inputRequest) { this.provider?.dispose(); this.provider = undefined; }
            if (result.trace.length && result.trace[0].event !== 'uncaught_exception') {
                const memory=document.createElement('div');memory.id=this.traceRoot.id+'-memory';memory.className='vizcode-memory-view';
                this.outputPanel.hidden=true;this.traceRoot.append(memory,this.outputPanel);
                this.visualization = new ExecutionVisualizer(memory.id, result, { hideCode: true,
                    compactMode: true, embeddedMode: true, normalizedTrace: true, lang: this.config.language === 'cpp' ? 'cpp' : this.config.language === 'java' ? 'java' : 'py3', startingInstruction: Math.min(this.resumeStep, result.trace.length - 1) });
                this.visualization.add_pytutor_hook('end_updateOutput', () => { this.updateStep(); return [false]; });
                this.updateStep();
            }
            // Package verification listens for completed executions, not input pauses.
            if (!this.inputRequest) {
                this.root.dispatchEvent(new CustomEvent('vizcode:execution', {bubbles:true, detail:{code:request.code, stdout:result.trace.at(-1)?.stdout || '', error:error?.exception_msg || ''}}));
            }
            this.diagnostic(this.inputRequest ? 'PYODIDE_RUN_WAITING_INPUT' : error ? 'PYODIDE_RUN_ERROR' : 'PYODIDE_RUN_SUCCESS');
        } catch (error) {
            if (this.destroyed || revision !== this.revision) return;
            this.animation?.cancel();this.clearTrace();this.stale=false;this.setError(String(error.message));this.updateStep();
            this.setStatus('Debugging unavailable');
            this.provider?.dispose();
            this.provider = undefined;
        }
    }
    private jumpBreakpoint(forward:boolean){
        if(!this.visualization || this.stale)return;
        const trace=this.visualization.curTrace,current=this.visualization.curInstr,points=new Set(this.editor.getBreakpoints());
        const direction=forward?1:-1;
        for(let i=current+direction;i>=0&&i<trace.length;i+=direction){
            const entry=trace[i],previous=trace[i-direction];
            if(entry.source_area==='answer' && points.has(entry.source_line) &&
                !(previous?.source_area==='answer' && previous.source_line===entry.source_line)) {this.step(i);return;}
        }
        this.step(forward?trace.length-1:0);
    }
    private step(index: number) {
        if (!this.visualization || this.stale) return;
        index=Math.max(0,Math.min(index,this.visualization.curTrace.length-1));
        if(index===this.visualization.curInstr)return;
        const forward=index>this.visualization.curInstr;
        this.animation?.cancel();
        // Calculate connector geometry without a transient transform on its ancestor.
        this.visualization.renderStep(index);
        this.updateStep();
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
            const animation=this.traceRoot.animate([{transform:`translateX(${forward?8:-8}px)`,opacity:.7},{transform:'translateX(0)',opacity:1}],{duration:140,easing:'ease-out'});
            this.animation=animation;
            animation.onfinish=()=>{if(this.animation===animation&&!this.destroyed){this.animation=undefined;this.visualization?.redrawConnectors();}};
        }

    }
    private updateStep() {
        if (!this.counter) return;
        const visualization = this.visualization;
        const index = visualization?.curInstr || 0;
        const count = visualization?.curTrace.length || 0;
        this.counter.textContent = count ? `${index + 1} / ${count}` : '';
        this.slider.disabled = !count || this.stale;
        this.slider.max = String(Math.max(0, count - 1));
        if(this.sliderTarget!==index){
            cancelAnimationFrame(this.sliderFrame);this.sliderTarget=index;
            const from=Number(this.slider.value),start=performance.now();
            if(!count || matchMedia('(prefers-reduced-motion: reduce)').matches)this.slider.value=String(index);
            else {const tick=(now:number)=>{const t=Math.min(1,(now-start)/140);this.slider.value=String(from+(index-from)*(1-Math.pow(1-t,3)));if(t<1)this.sliderFrame=requestAnimationFrame(tick);};this.sliderFrame=requestAnimationFrame(tick);}
        }
        this.buttons.forEach((button, position) => { button.disabled = this.stale || !count || (position < 2 ? index === 0 : index === count - 1); });
        const atInput = !!this.inputRequest && index >= this.inputRequest.step;
        if (this.inputPanel && atInput !== this.inputVisible) {
            this.inputVisible = atInput; this.inputPanel.hidden = !atInput;
            if (atInput) this.renderInput();
        }
        if (this.inputRequest) this.setStatus(atInput ? 'Waiting for input' : 'Ready');
        const entry = visualization?.curTrace[index];
        if (entry && !this.stale) {
            this.editor.setStepMarkers(entry.source_area === 'answer' ? entry.source_line - 1 : null, null);
            const callId=entry.source_area==='scratch'?this.callsMapping[entry.source_line-1]:null;
            this.functionsPanel.querySelectorAll<HTMLElement>('[data-function]').forEach(row=>row.classList.toggle('vizcode-function-active',row.dataset.function===callId));
            this.output.textContent = entry.stdout || '';
            const hidden=this.output.textContent==='';const changed=this.outputPanel.hidden!==hidden;this.outputPanel.hidden=hidden;
            if(changed && this.animation?.playState!=='running')this.visualization.redrawConnectors();
        }
    }
    private editorMode() { if(this.config.language==='java')return 'java'; return this.config.language === 'cpp' ? 'c_cpp' : 'python'; }
    setLanguage(language: 'python3' | 'cpp' | 'java', code: string, auxiliary: AuxiliaryState = { scratchCode: '', stdin: '' }) {
        if (this.config.readOnly) return;
        this.revision++;
        clearTimeout(this.timer);
        this.provider?.dispose();
        this.provider = undefined;
        this.config.language = language;
        this.stale=false;
        this.clearTrace();
        this.editor.setMode(this.editorMode());

        this.editor.setValue(code);
        this.editor.setBreakpoints(auxiliary.breakpoints || []);
        this.functions=auxiliary.functions?.version===1?auxiliary.functions:{version:1,rows:[]};
        this.functionsPanel.replaceChildren();
        this.restoreInput(auxiliary);
        this.changed();
    }
    getCode() { return this.editor ? this.editor.getValue() : this.config.initialCode; }
    setCode(code: string) {
        if (code === this.getCode()) return;
        if (this.editor) this.editor.setValue(code);
        else this.config.initialCode = code;
    }
    getAuxiliaryState(): AuxiliaryState {
        return { breakpoints:this.editor?.getBreakpoints() || [], scratchCode: '', functions: this.functions, stdin: this.inputHistory.join(''),
            inputHistory: [...this.inputHistory], inputEof: this.inputEof };
    }
    private restoreInput(state: Partial<AuxiliaryState>) {
        const history = state.inputHistory;
        this.inputHistory = Array.isArray(history) && history.every(value => typeof value === 'string') &&
            history.join('').length <= 100000 ? [...history] : (state.stdin ? [state.stdin] : []);
        // The removed textarea represented a complete, finite stdin stream.
        // Retain that EOF semantics when migrating it, including an unterminated last line.
        this.inputEof = typeof state.inputEof === 'boolean' ? state.inputEof : !Array.isArray(history) && !!state.stdin;
    }
    private action(label: string, callback: () => void) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('click', callback, {signal: this.events.signal}); return button;
    }
    private replayInput(step: number) {
        this.auxiliaryChanged(); this.resumeStep = step;
    }
    private renderInput() {
        this.inputPanel.replaceChildren();
        const request = this.inputRequest!;
        const label = document.createElement('label'); label.textContent = request.prompt || 'Program input';
        const row = document.createElement('div'); row.className = 'vizcode-input-row';
        const field = document.createElement('textarea'); field.rows = 1;
        field.setAttribute('aria-label', 'Program input');
        field.placeholder = 'Enter input';
        field.title = 'Enter to submit; Shift+Enter for a new line';
        const resize = () => { field.rows = Math.min(8, field.value.split('\n').length); };
        field.addEventListener('input', resize, {signal: this.events.signal});
        const send = () => {
            let value = field.value.replace(/\r\n?/g, '\n');
            const end = request.kind === 'all' || ((this.config.language==='cpp' && value==='') || (['cpp','java'].includes(this.config.language) && value.includes('\n')));
            if (!end && !value.endsWith('\n')) value += '\n';
            if (this.inputHistory.join('').length + value.length > 100000) {
                this.error.textContent = 'Input exceeds 100,000 characters.'; return;
            }
            this.inputHistory.push(value); this.inputEof = end;
            this.replayInput(request.step + 1);
        };
        const button = this.action('', send); button.className = 'vizcode-send-input';
        button.setAttribute('aria-label', 'Submit input'); button.title = 'Submit input';
        const icon = createElement(ArrowRight); icon.setAttribute('aria-hidden', 'true'); button.append(icon);
        field.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
                event.preventDefault(); event.stopPropagation(); send();
            }
        }, {signal: this.events.signal});
        row.append(field, button); label.append(row); this.inputPanel.append(label);
    }
    suspend() {
        this.revision++;clearTimeout(this.timer);this.provider?.dispose();this.provider=undefined;
        this.stale=!!this.visualization;this.updateStep();
    }
    resume() { if(!this.config.readOnly && this.config.tracingEnabled!==false && this.getCode().trim())this.changed(); }
    focus() { this.editor?.focus(); }
    hasFocus() { return !!this.root?.contains(document.activeElement); }
    resize() { this.editor?.resize(); if(this.animation?.playState!=='running')this.visualization?.redrawConnectors(); }
    destroy() {
        this.destroyed = true;
        this.observer?.disconnect();
        clearTimeout(this.timer);
        this.provider?.dispose();
        this.events.abort();
        this.clearTrace();
        this.editor?.destroy();
        this.clearDrag();cancelAnimationFrame(this.sliderFrame);this.animation?.cancel();
        if(Widget.active===this)Widget.active=undefined;
        this.root?.remove();
    }
}
export function create(config: Config) { return new Widget(config); }
