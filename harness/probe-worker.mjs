const result = {};
try {
    await fetch('http://localhost:4100/authenticated-action', { credentials: 'include', mode: 'no-cors', method: 'POST' });
    result.networkBlocked = false;
} catch {
    result.networkBlocked = true;
}
try {
    await import('http://localhost:4100/authenticated-action');
    result.importBlocked = false;
} catch {
    result.importBlocked = true;
}
try {
    const child = new Worker('/probe/probe-worker.mjs', { type: 'module' });
    result.childWorkerBlocked = await new Promise(resolve => {
        child.onerror = () => { child.terminate(); resolve(true); };
        child.onmessage = () => { child.terminate(); resolve(false); };
        setTimeout(() => { child.terminate(); resolve(false); }, 2000);
    });
} catch {
    result.childWorkerBlocked = true;
}
result.noDom = typeof document === 'undefined';
postMessage(result);