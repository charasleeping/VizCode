import { test, expect } from '@playwright/test';

test('worker CSP blocks authenticated-origin requests and child workers', async ({ page, context }) => {
    await context.addCookies([{ name: 'MoodleSession', value: 'fixture', url: 'http://localhost:4100' }]);
    await page.goto('/');
    const before = await (await page.request.get('/probe-count')).json();
    const result = await page.evaluate(() => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Isolation probe timed out')), 10000);
        const frame = document.createElement('iframe');
        frame.sandbox = 'allow-scripts allow-same-origin';
        frame.src = 'http://127.0.0.1:4104/probe/probe.html';
        const listener = event => {
            if (event.origin !== 'http://127.0.0.1:4104' || event.source !== frame.contentWindow) return;
            clearTimeout(timer);
            window.removeEventListener('message', listener);
            frame.remove();
            resolve(event.data);
        };
        window.addEventListener('message', listener);
        document.body.append(frame);
    }));
    expect(result).toEqual({ networkBlocked: true, importBlocked: true, childWorkerBlocked: true, noDom: true });
    const after = await (await page.request.get('/probe-count')).json();
    expect(after.authenticatedHits).toBe(before.authenticatedHits);
    const cookies = await context.cookies('http://127.0.0.1:4104');
    expect(cookies.some(cookie => cookie.name === 'MoodleSession')).toBe(false);
});

test('widget rejects forged wrong-source and stale execution messages', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.widget);
    await page.evaluate(async () => {
        widget.setCode('print(37)');
        await new Promise(resolve => setTimeout(resolve, 600));
        const frame = document.querySelector('iframe');
        const instance = new URLSearchParams(new URL(frame.src).hash.slice(1)).get('instance');
        window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window,
            data: { version: 1, instance, type: 'result', id: 'old', payload: '{"code":"","trace":[]}' } }));
        const forged = new MessageEvent('message', { origin: 'http://127.0.0.1:4104',
            data: { version: 0, instance, type: 'error', id: 'old', payload: 'forged result' } });
        Object.defineProperty(forged, 'source', { value: frame.contentWindow });
        window.dispatchEvent(forged);
    });
    await expect(page.locator('.ExecutionVisualizer')).toBeVisible({ timeout: 70000 });
    await page.getByRole('button', { name: 'Last step', exact: true }).click();
    await expect(page.locator('.vizcode-output')).toHaveText('37\n');
});
