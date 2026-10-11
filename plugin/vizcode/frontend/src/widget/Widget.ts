import '../opt/js/_references';
import { OptCmEditor } from '../opt/js/cm-editor';
import { ExecutionVisualizer } from '../opt/js/pytutor';
import { createElement, ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide';
import { ExecutionProvider } from './ExecutionProvider';
import { validateTrace } from './validateTrace';
import './widget.css';

export interface Config {
    initialCode: string;
    readOnly?: boolean;
    brokerUrl: string;
    initialScratch?: string;
    initialInput?: string;
    onChange?: (code: string) => void;
    onAuxiliaryChange?: (state: { scratchCode: string; stdin: string }) => void;
    debug?: boolean;
}

export class Widget {
    private root: HTMLElement;
    private editor: OptCmEditor;
    private scratch: OptCmEditor;
    private input: HTMLTextAreaElement;
    private status: HTMLElement;
    private output: HTMLElement;
    private error: HTMLElement;
    private traceRoot: HTMLElement;
    private counter: HTMLElement;
    private slider: HTMLInputElement;
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
        this.root.setAttribute('aria-label', 'Python live debugger');
        container.append(this.root);
        const toolbar = document.createElement('div');
        toolbar.className = 'vizcode-steps';
        const commands = [
            ['First step', SkipBack, () => this.step(0)],
            ['Previous step', ChevronLeft, () => this.step((this.visualization?.curInstr || 0) - 1)],
            ['Next step', ChevronRight, () => this.step((this.visualization?.curInstr || 0) + 1)],
            ['Last step', SkipForward, () => this.step((this.visualization?.curTrace.length || 1) - 1)],
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
            this.buttons.push(button);
            toolbar.append(button);
        }
        this.slider = document.createElement('input');
        this.slider.type = 'range';
        this.slider.min = '0';
        this.slider.max = '0';
        this.slider.setAttribute('aria-label', 'Execution step');
        this.slider.addEventListener('input', () => this.step(Number(this.slider.value)), { signal: this.events.signal });
        this.counter = document.createElement('span');
        this.counter.className = 'vizcode-step-count';
        this.status = document.createElement('span');
        this.status.className = 'vizcode-status';
        this.status.setAttribute('role', 'status');
        this.status.textContent = this.config.readOnly ? 'Read-only' : 'Ready';
        toolbar.append(this.slider, this.counter, this.status);
        this.root.append(toolbar);
        const workspace = document.createElement('div');
        workspace.className = 'vizcode-workspace';
        const answer = document.createElement('div');
        answer.className = 'vizcode-source';
        this.traceRoot = document.createElement('div');
        this.traceRoot.id = 'vizcode-trace-' + crypto.randomUUID();
        this.traceRoot.className = 'vizcode-trace';
        workspace.append(answer, this.traceRoot);
        this.root.append(workspace);
        this.editor = new OptCmEditor({ container: answer, value: this.config.initialCode, preserveWhitespace: true,
            readOnly: this.config.readOnly, fontSize: '14px', onChange: code => {
                this.config.onChange?.(code);
                this.changed();
            } });
        answer.querySelector('.cm-content')?.setAttribute('aria-label', 'Answer source');
        const details = document.createElement('details');
        details.className = 'vizcode-auxiliary';
        const summary = document.createElement('summary');
        summary.textContent = 'Scratch and Input';
        details.append(summary);
        const scratchContainer = document.createElement('div');
        scratchContainer.className = 'vizcode-scratch';
        const inputLabel = document.createElement('label');
        inputLabel.textContent = 'Input';
        this.input = document.createElement('textarea');
        this.input.value = this.config.initialInput || '';
        this.input.readOnly = !!this.config.readOnly;
        this.input.setAttribute('aria-label', 'Input');
        this.input.addEventListener('input', () => this.auxiliaryChanged(), { signal: this.events.signal });
        inputLabel.append(this.input);
        details.append(scratchContainer, inputLabel);
        this.root.append(details);
        this.scratch = new OptCmEditor({ container: scratchContainer, value: this.config.initialScratch || '',
            preserveWhitespace: true, readOnly: this.config.readOnly, fontSize: '14px', onChange: () => this.auxiliaryChanged() });
        scratchContainer.querySelector('.cm-content')?.setAttribute('aria-label', 'Local scratch source');
        details.addEventListener('toggle', () => this.scratch.resize(), { signal: this.events.signal });
        this.output = document.createElement('pre');
        this.output.className = 'vizcode-output';
        this.output.setAttribute('aria-label', 'Execution output');
        this.error = document.createElement('div');
        this.error.className = 'vizcode-error';
        this.error.setAttribute('role', 'alert');
        this.root.append(this.error, this.output);
        this.root.addEventListener('compositionstart', () => { this.composing = true; clearTimeout(this.timer); }, { signal: this.events.signal });
        this.root.addEventListener('compositionend', () => { this.composing = false; this.schedule(); }, { signal: this.events.signal });
        this.updateStep();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(this.root);
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
        this.editor?.setStepMarkers(null, null);
        this.editor?.setErrorLine(null);
        this.scratch?.setStepMarkers(null, null);
        this.scratch?.setErrorLine(null);
        if (this.output) this.output.textContent = '';
        if (this.error) this.error.textContent = '';
        this.updateStep();
    }
    private changed() {
        if (this.config.readOnly || this.destroyed) return;
        this.revision++;
        clearTimeout(this.timer);
        this.clearTrace();
        this.provider?.cancel();
        this.status.textContent = 'Updating';
        if (!this.getCode().trim()) {
            this.provider?.dispose();
            this.provider = undefined;
            this.status.textContent = 'Ready';
            return;
        }
        this.schedule();
    }
    private schedule() {
        clearTimeout(this.timer);
        if (this.destroyed || this.config.readOnly || this.composing || !this.getCode().trim()) return;
        const revision = this.revision;
        this.timer = setTimeout(() => { void this.refresh(revision); }, 500);
    }
    private async refresh(revision: number) {
        if (this.destroyed || revision !== this.revision) return;
        try {
            if (!this.provider) {
                this.provider = new ExecutionProvider(this.config.brokerUrl, this.root, event => this.diagnostic(event));
                void this.provider.prepare().catch(() => {});
            }
            this.status.textContent = 'Tracing';
            const request = { code: this.getCode(), ...this.getAuxiliaryState() };
            this.diagnostic('PYODIDE_RUN_START');
            const raw = await this.provider.execute(request);
            if (this.destroyed || revision !== this.revision) return;
            const result = JSON.parse(raw);
            validateTrace(result, request.code + '\n# Scratch (local only)\n' + request.scratchCode);
            const error = [...result.trace].reverse().find(entry => entry.exception_msg);
            this.error.textContent = error?.exception_msg || '';
            if (result.trace.length && result.trace[0].event !== 'uncaught_exception') {
                this.visualization = new ExecutionVisualizer(this.traceRoot.id, result, { hideCode: true,
                    compactMode: true, embeddedMode: true, lang: 'py3', startingInstruction: 0 });
                this.visualization.add_pytutor_hook('end_updateOutput', () => { this.updateStep(); return [false]; });
                this.updateStep();
            }
            this.status.textContent = error ? 'Execution error' : 'Ready';
            this.diagnostic(error ? 'PYODIDE_RUN_ERROR' : 'PYODIDE_RUN_SUCCESS');
        } catch (error) {
            if (this.destroyed || revision !== this.revision) return;
            this.error.textContent = String(error.message);
            this.status.textContent = 'Debugging unavailable';
            this.provider?.dispose();
            this.provider = undefined;
        }
    }
    private step(index: number) {
        if (!this.visualization) return;
        this.visualization.renderStep(Math.max(0, Math.min(index, this.visualization.curTrace.length - 1)));
        this.updateStep();
    }
    private updateStep() {
        if (!this.counter) return;
        const visualization = this.visualization;
        const index = visualization?.curInstr || 0;
        const count = visualization?.curTrace.length || 0;
        this.counter.textContent = count ? `${index + 1} / ${count}` : '';
        this.slider.disabled = !count;
        this.slider.max = String(Math.max(0, count - 1));
        this.slider.value = String(index);
        this.buttons.forEach((button, position) => { button.disabled = !count || (position < 2 ? index === 0 : index === count - 1); });
        const entry = visualization?.curTrace[index];
        if (entry) {
            this.editor.setStepMarkers(entry.source_area === 'answer' ? entry.source_line - 1 : null, null);
            this.scratch.setStepMarkers(entry.source_area === 'scratch' ? entry.source_line - 1 : null, null);
            this.output.textContent = entry.stdout || '';
        }
    }
    getCode() { return this.editor ? this.editor.getValue() : this.config.initialCode; }
    setCode(code: string) {
        if (code === this.getCode()) return;
        if (this.editor) this.editor.setValue(code);
        else this.config.initialCode = code;
    }
    getAuxiliaryState() { return { scratchCode: this.scratch.getValue(), stdin: this.input.value }; }
    focus() { this.editor?.focus(); }
    hasFocus() { return !!this.root?.contains(document.activeElement); }
    resize() { this.editor?.resize(); this.scratch?.resize(); this.visualization?.redrawConnectors(); }
    destroy() {
        this.destroyed = true;
        this.observer?.disconnect();
        clearTimeout(this.timer);
        this.provider?.dispose();
        this.events.abort();
        this.clearTrace();
        this.editor?.destroy();
        this.scratch?.destroy();
        this.root?.remove();
    }
}
export function create(config: Config) { return new Widget(config); }