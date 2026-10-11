const worker = new Worker('/probe/probe-worker.mjs', { type: 'module' });
worker.onmessage = event => parent.postMessage(event.data, 'http://localhost:4100');
worker.onerror = () => parent.postMessage({ probeFailure: true }, 'http://localhost:4100');