import assert from 'node:assert/strict';
const driver = 'http://localhost:4103';
async function call(path, method = 'GET', data) {
    const response = await fetch(driver + path, { method, headers: { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data) });
    const result = await response.json();
    if (result.value?.error) throw new Error(result.value.message || result.value.error);
    return result.value;
}
const session = await call('/session', 'POST', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
const prefix = '/session/' + session.sessionId;
try {
    await call(prefix + '/timeouts', 'POST', { script: 90000, pageLoad: 60000 });
    await call(prefix + '/url', 'POST', { url: 'http://localhost:4100/live.html' });
    const result = await call(prefix + '/execute/async', 'POST', { script: `
        const done = arguments[arguments.length - 1];
        const end = Date.now() + 70000;
        let edited = false;
        const poll = () => {
            if (window.widget && !edited) { edited = true; widget.setCode('value=21\\nprint(value*2)\\n'); }
            if (document.querySelector('.ExecutionVisualizer')) {
                document.querySelector('[aria-label="Last step"]').click();
                done({ output: document.querySelector('.vizcode-output').textContent,
                    run: !!document.querySelector('button[title="Run"],button[title="Stop"]') });
            } else if (Date.now() > end) done({ error: document.body.innerText });
            else setTimeout(poll, 50);
        }; poll();`, args: [] });
    assert.equal(result.output, '42\n', JSON.stringify(result));
    assert.equal(result.run, false);
    const submitted = await call(prefix + '/execute/sync', 'POST', { script: `
        widget.setCode('print(9)\\n\\n'); document.querySelector('form').requestSubmit(); return window.submittedValue;`, args: [] });
    assert.equal(submitted, 'print(9)\n\n');
    console.log('Actual Safari: automatic tracing, compact step navigation and immediate exact Check passed.');
} finally {
    await call(prefix, 'DELETE');
}