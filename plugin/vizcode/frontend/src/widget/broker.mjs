const params = new URLSearchParams(location.hash.slice(1));
const host = params.get('host');
const instance = params.get('instance');
let spare;
let active;
let queued;
let generation = 0;
const send = (type, id, payload) => parent.postMessage({ version: 1, instance, type, id, payload }, host);
const retire = record => { if (record) { clearTimeout(record.timer); record.worker.terminate(); } };

function prepare() {
    if (spare) return;
    const record = { worker: new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }),
        ready: false, id: 'warm-' + ++generation, timer: undefined };
    spare = record;
    const fail = () => {
        if (spare !== record) return;
        retire(record);
        spare = undefined;
        if (queued) { const id = queued.id; queued = undefined; send('error', id, 'Python runtime unavailable'); }
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
        } else if (event.data.type === 'error') fail();
    };
    record.worker.postMessage({ type: 'initialize', id: record.id });
}

function drain() {
    if (active || !queued || !spare?.ready) return;
    const request = queued;
    queued = undefined;
    const record = spare;
    clearTimeout(record.timer);
    spare = undefined;
    active = record;
    record.id = request.id;
    const finish = (type, payload) => {
        if (active !== record) return;
        active = undefined;
        retire(record);
        send(type, request.id, payload);
        drain();
    };
    record.timer = setTimeout(() => finish('error', 'Execution timed out (10 seconds)'), 10000);
    record.worker.onerror = () => finish('error', 'Python execution unavailable');
    record.worker.onmessage = event => {
        const result = event.data;
        if (result?.id !== request.id || typeof result.payload !== 'string') return;
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
    if (message.type === 'prepare') { prepare(); return; }
    if (message.type === 'cancel') { cancel(message.id); return; }
    if (message.type === 'dispose') { dispose(); return; }
    if (message.type !== 'execute') return;
    const request = message.payload;
    if (!request || !['code', 'stdin', 'scratchCode'].every(key => typeof request[key] === 'string' && request[key].length <= 100000)) {
        send('error', message.id, 'Source or Input exceeds limit');
        return;
    }
    if (active) cancel(active.id);
    queued = message;
    prepare();
    drain();
});
window.addEventListener('pagehide', dispose);
send('ready', '', undefined);