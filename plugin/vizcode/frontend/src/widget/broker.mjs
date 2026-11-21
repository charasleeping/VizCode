const params = new URLSearchParams(location.hash.slice(1));
const host = params.get('host');
const instance = params.get('instance');
let spare;
let active;
let queued;
let generation = 0;
let language = 'python3';
let adapters=[];
const forLanguage=value=>adapters.find(a=>a.languages.some(l=>l.toLowerCase()===String(value).toLowerCase()));
const send = (type, id, payload) => parent.postMessage({ version: 1, instance, type, id, payload }, host);
const retire = record => {
    if(!record)return;clearTimeout(record.timer);
    if(record.job)void fetch(new URL('../v1/traces/'+record.job.id,import.meta.url),{method:'DELETE',keepalive:true,headers:{Authorization:'Bearer '+record.job.token}}).catch(()=>{});
    if(record.remote && record.executing && !record.finished && !record.job){
        // Keep the trusted transport worker alive long enough to cancel a job
        // whose creation response is still in flight. Student WASM is killed immediately.
        record.worker.postMessage({type:'cancel'});
        record.timer=setTimeout(()=>record.worker.terminate(),15000);
    }else record.worker.terminate();
};

function prepare() {
    if (spare) return;
    const record = { worker: new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }),
        ready: false, id: 'warm-' + ++generation, timer: undefined };
    const selected=forLanguage(language);record.remote=selected?.transport!=='browser';
    record.worker.addEventListener('message',event=>{if(event.data?.type==='cancelled'){clearTimeout(record.timer);record.worker.terminate();}});
    spare = record;
    const fail = reason => {
        if (spare !== record) return;
        retire(record);
        spare = undefined;
        if (queued) { const id = queued.id; queued = undefined; send('error', id, 'Runtime unavailable' + (typeof reason === 'string' ? ': ' + reason : reason?.message ? ': ' + reason.message : '')); }
    };
    record.timer = setTimeout(fail, 60000);
    record.worker.onerror = fail;
    record.worker.onmessage = event => {
        if (spare !== record || event.data?.id !== record.id) return;
        if (event.data.type === 'ready') {
            clearTimeout(record.timer);
            record.ready = true;
            record.timer = setTimeout(() => {
                if (spare === record && !queued) { retire(record); spare = undefined; }
            }, 60000);
            drain();
        } else if (event.data.type === 'error') fail(event.data.payload);
    };
    record.worker.postMessage({ type: 'initialize', id: record.id, language, adapter:forLanguage(language) });
}

function drain() {
    if (active || !queued || !spare?.ready) return;
    const request = queued;
    queued = undefined;
    const record = spare;
    clearTimeout(record.timer);
    spare = undefined;
    active = record;
    record.id = request.id;record.executing=true;
    const finish = (type, payload) => {
        if (active !== record) return;
        active = undefined;
        record.finished=true;retire(record);
        send(type, request.id, payload);
        drain();
    };
    record.timer = setTimeout(() => finish('error', record.remote ? 'Tracing timed out (60 seconds)' : 'Execution timed out (10 seconds)'), record.remote ? 60000 : 10000);
    record.worker.onerror = () => finish('error', 'Execution unavailable');
    record.worker.onmessage = event => {
        const result = event.data;
        if (result?.id !== request.id) return;
        if (result.type === 'job') { record.job=result.payload; return; }
        if (result.type === 'compiled') { clearTimeout(record.timer); record.timer = setTimeout(() => finish('error', 'Execution timed out (10 seconds)'), 10000); return; }
        if (typeof result.payload !== 'string') return;
        if (result.type === 'result') {
            if (result.payload.length > 2097152) finish('error', 'Trace exceeds limit');
            else finish('result', result.payload);
        } else if (result.type === 'error') finish('error', result.payload.slice(0, 4096));
    };
    send('runtime-ready', request.id, undefined);
    record.worker.postMessage({ type: 'execute', id: request.id, payload: request.payload });
    prepare();
}

function cancel(id) {
    if (queued?.id === id) queued = undefined;
    if (active?.id === id) { retire(active); active = undefined; }
}
function dispose() {
    retire(active);
    retire(spare);
    active = spare = queued = undefined;
}
window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== parent || event.origin !== host || !message || message.version !== 1 ||
        message.instance !== instance || typeof message.id !== 'string') return;
    if (message.type === 'prepare') { if(forLanguage(message.language) && message.language!==language){dispose();language=message.language;} prepare(); return; }
    if (message.type === 'cancel') { cancel(message.id); return; }
    if (message.type === 'dispose') { dispose(); return; }
    if (message.type !== 'execute') return;
    const request = message.payload;
    const nextLanguage = request?.language || 'python3';
    if (!forLanguage(nextLanguage)) { send('error', message.id, 'Unsupported language'); return; }
    if (nextLanguage !== language) { dispose(); language = nextLanguage; }
    if (!request || !['code', 'stdin', 'scratchCode'].every(key => typeof request[key] === 'string' && request[key].length <= 100000)) {
        send('error', message.id, 'Source or Input exceeds limit');
        return;
    }
    if ((request.interactiveInput !== undefined && typeof request.interactiveInput !== 'boolean') ||
        (request.inputEof !== undefined && typeof request.inputEof !== 'boolean')) { send('error', message.id, 'Invalid input request'); return; }
    if(request.diagnose!==undefined && typeof request.diagnose!=='boolean'){send('error',message.id,'Invalid diagnostics request');return;}
    if (request.functions && (request.functions.version !== 1 || !Array.isArray(request.functions.rows) ||
        request.functions.rows.length > 5000 || request.functions.rows.some(row=>!row || typeof row.id !== 'string' ||
            typeof row.checked !== 'boolean' || !Array.isArray(row.args) || row.args.some(arg=>typeof arg !== 'string')) ||
        JSON.stringify(request.functions).length > 500000)) {send('error',message.id,'Invalid function selections');return;}
    if (request.packages !== undefined) { send('error',message.id,'Trace package uploads are not supported'); return; }
    if(forLanguage(nextLanguage).transport!=='browser' &&
        !['adapterId','adapterVersion','sourceProfile'].every(key=>typeof request[key]==='string'&&request[key])) {
        send('error',message.id,'The editor and debugger versions do not match. Reload this page to update VizCode.');return;
    }
    if (active) cancel(active.id);
    queued = message;
    prepare();
    drain();
});
window.addEventListener('pagehide', dispose);
fetch(new URL('../v1/adapters',import.meta.url)).then(r=>{if(!r.ok)throw Error('Adapter registry unavailable');return r.json();}).then(c=>{adapters=c.adapters;send('ready','',{adapters});}).catch(error=>send('ready','',{adapters:[],error:error.message}));
