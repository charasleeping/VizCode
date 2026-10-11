define(['core/ajax'], function(Ajax) {
    let bundle;
    const memory = new Map();
    function load(url) {
        if (window.VizCode) return Promise.resolve(window.VizCode);
        if (!bundle) bundle = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(() => reject(new Error('Debugger unavailable')), 15000);
            script.src = url;
            script.onload = () => { clearTimeout(timer); window.VizCode ? resolve(window.VizCode) : reject(new Error('Debugger unavailable')); };
            script.onerror = () => { clearTimeout(timer); reject(new Error('Debugger unavailable')); };
            document.head.append(script);
        }).catch(error => { bundle = undefined; throw error; });
        return bundle;
    }
    async function init(id, widgetUrl, brokerUrl, userId) {
        const textarea = document.getElementById(id);
        if (!textarea || textarea.vizcodeWidget) return;
        const root = document.createElement('div');
        textarea.after(root);
        const key = JSON.stringify(['vizcode-v1', location.origin, userId, id]);
        const legacyKey = JSON.stringify(['coodleviz-v1', location.origin, userId, id]);
        let state = memory.get(key) || {};
        try {
            const stored = sessionStorage.getItem(key) || sessionStorage.getItem(legacyKey);
            state = JSON.parse(stored || JSON.stringify(state));
            if (stored) sessionStorage.setItem(key, JSON.stringify(state));
        }
        catch (error) { state = memory.get(key) || {}; }
        if (!state || typeof state !== 'object') state = {};
        const controller = new AbortController();
        let widget;
        const sync = () => { if (widget && !textarea.readOnly) textarea.value = widget.getCode(); };
        const destroy = () => {
            sync();
            widget?.destroy();
            textarea.vizcodeWidget = undefined;
            textarea.hidden = false;
            root.remove();
            controller.abort();
        };
        try {
            const api = await load(widgetUrl);
            if (!root.isConnected) return;
            widget = api.create({ initialCode: textarea.value, readOnly: textarea.readOnly || textarea.disabled, brokerUrl,
                initialScratch: typeof state.scratchCode === 'string' ? state.scratchCode : '',
                initialInput: typeof state.stdin === 'string' ? state.stdin : '',
                onChange: code => {
                    textarea.value = code;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                },
                onAuxiliaryChange: auxiliary => {
                    memory.set(key, auxiliary);
                    try { sessionStorage.setItem(key, JSON.stringify(auxiliary)); } catch (error) { memory.set(key, auxiliary); }
                }
            });
            await widget.mount(root);
            textarea.vizcodeWidget = widget;
            textarea.hidden = true;
            textarea.form?.addEventListener('submit', sync, { capture: true, signal: controller.signal });
            const identity = /^q(\d+):(\d+)_answer$/.exec(id);
            if (identity && Ajax) {
                let checking = false;
                let submitReady = false;
                const notice = document.createElement('p');
                notice.setAttribute('role', 'alert');
                root.after(notice);
                textarea.form?.addEventListener('click', async event => {
                    const button = event.target.closest('input[type=submit],button[type=submit]');
                    if (!button || !button.name.endsWith('-submit') || submitReady) return;
                    if (button.closest('.que') !== textarea.closest('.que')) return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    if (checking) return;
                    checking = true;
                    sync();
                    const answer = textarea.value;
                    try {
                        await Ajax.call([{ methodname: 'qtype_vizcode_check', args: {
                            usageid: Number(identity[1]), slot: Number(identity[2]), answer
                        } }])[0];
                        sync();
                        if (textarea.value !== answer) { notice.textContent = 'Answer changed.'; return; }
                        submitReady = true;
                        button.click();
                    } catch (error) {
                        notice.textContent = 'Server grading is unavailable. Your answer remains editable; retry Check.';
                    } finally { checking = false; }
                }, { capture: true, signal: controller.signal });
            }
            window.addEventListener('pagehide', () => {
                destroy();
                window.addEventListener('pageshow', event => {
                    if (event.persisted) void init(id, widgetUrl, brokerUrl, userId);
                }, { once: true });
            }, { once: true, signal: controller.signal });
        } catch (error) {
            destroy();
            const status = document.createElement('span');
            status.setAttribute('role', 'status');
            status.textContent = 'Live debugging is unavailable. The answer field remains available.';
            textarea.after(status);
        }
        return widget;
    }
    return { init };
});