import type {FunctionState} from './functionDiscovery';
export interface Request { diagnose?: boolean; functions?: FunctionState; language?: string; adapterId?: string; adapterVersion?: string; sourceProfile?: string; operation?: string; code: string; scratchCode: string; stdin: string; interactiveInput?: boolean; inputEof?: boolean; javaTicket?: string; traceTicket?: string; }

export class ExecutionProvider {
    private adapters: any[] = [];
    private frame: HTMLIFrameElement;
    private ready: Promise<void>;
    private rejectReady: (error: Error) => void;
    private origin: string;
    private instance = crypto.randomUUID();
    private epoch = 0;
    private language = 'python3';
    private disposed = false;
    private listener: (event: MessageEvent) => void;
    private timer: ReturnType<typeof setTimeout>;
    private readyTimer: ReturnType<typeof setTimeout>;
    private pending?: { id: string; resolve: (raw: string) => void; reject: (error: Error) => void };

    constructor(brokerUrl: string, container: HTMLElement, private diagnostic: (event: string) => void = () => {}, initialLanguage = 'python3') {
        this.language=initialLanguage;
        const url = new URL(brokerUrl, location.href);
        if (url.hostname === location.hostname || !['https:', 'http:'].includes(url.protocol) ||
            (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
            throw new Error('A separate execution host is required');
        }
        this.origin = url.origin;
        this.frame = document.createElement('iframe');
        this.frame.hidden = true;
        this.frame.title = 'Isolated code execution';
        this.frame.referrerPolicy = 'no-referrer';
        this.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        url.hash = new URLSearchParams({ host: location.origin, instance: this.instance }).toString();
        this.frame.src = url.href;
        this.ready = new Promise((resolve, reject) => {
            this.rejectReady = reject;
            this.readyTimer = setTimeout(() => reject(new Error('Execution broker unavailable')), 15000);
            this.listener = event => {
                const message = event.data;
                if (event.origin !== this.origin || event.source !== this.frame.contentWindow || !message ||
                    message.version !== 1 || message.instance !== this.instance) return;
                if (message.type === 'ready' && message.id === '') { clearTimeout(this.readyTimer); this.adapters=message.payload?.adapters || [];message.payload?.error?reject(new Error(message.payload.error)):resolve(); }
                else if (this.pending && message.id === this.pending.id) {
                    if (message.type === 'runtime-ready') this.diagnostic('PYODIDE_READY');
                    else if (['result', 'error'].includes(message.type) && typeof message.payload === 'string') {
                        const pending = this.pending;
                        this.pending = undefined;
                        clearTimeout(this.timer);
                        if (message.type === 'error' || message.payload.length > 2097152) {
                            pending.reject(new Error(message.payload.length > 2097152 ? 'Trace exceeds limit' : message.payload));
                        } else pending.resolve(message.payload);
                    }
                }
            };
            window.addEventListener('message', this.listener);
            container.append(this.frame);
        });
    }
    private send(type: string, id: string, payload?: Request) {
        this.frame.contentWindow?.postMessage({ version: 1, instance: this.instance, type, id, payload, language: this.language }, this.origin);
    }
    async describe(language: string) {await this.ready;const adapter=this.adapters.find(a=>a.languages.some(l=>l.toLowerCase()===language.toLowerCase()));if(!adapter)throw new Error('Visualization is not configured for '+language);return adapter;}
    async prepare() { await this.ready; if (!this.disposed) this.send('prepare', ''); }
    async execute(request: Request, ticket?: (request: Request)=>Promise<string>): Promise<string> {
        this.language = request.language || 'python3';
        const epoch = ++this.epoch;
        const adapter=await this.describe(this.language);
        request={...request,adapterId:adapter.id,adapterVersion:adapter.version,sourceProfile:'auto'};
        if(adapter.transport!=='browser'){if(!ticket)throw new Error('Server tracing is not configured.');request={...request,traceTicket:await ticket(request)} as Request;}
        await this.ready;
        if (this.disposed || epoch !== this.epoch) throw new Error('Execution canceled');
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            this.pending = { id, resolve, reject };
            this.timer = setTimeout(() => this.cancel(), this.language === 'cpp' ? 150000 : 75000);
            this.send('execute', id, request);
        });
    }
    cancel() {
        this.epoch++;
        if (this.pending) this.send('cancel', this.pending.id);
        this.pending?.reject(new Error('Execution canceled'));
        this.pending = undefined;
        clearTimeout(this.timer);
    }
    dispose() {
        this.cancel();
        clearTimeout(this.readyTimer);
        this.disposed = true;
        this.rejectReady?.(new Error('Widget destroyed'));
        this.send('dispose', '');
        window.removeEventListener('message', this.listener);
        this.frame.remove();
    }
}
