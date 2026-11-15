import { test, expect } from '@playwright/test';

test('edits trace automatically; controls are compact and Check is exact', async ({ page }) => {
    let executions = 0;
    page.on('worker', worker => { if (worker.url().endsWith('/live/worker.mjs')) executions++; });
    await page.goto('/live.html');
    await expect(page.locator('.vizcode-source .cm-content')).toBeVisible();
    await expect(page.locator('.ExecutionVisualizer')).toBeVisible({timeout:70000});
    expect(executions).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /^(Run|Stop)$/ })).toHaveCount(0);
    await expect(page.getByText('OPT Mentor', { exact: true })).toHaveCount(0);
    await page.evaluate(() => { widget.setCode('print(1)'); widget.setCode('values=[1]\nvalues.append(2)\nprint(values)\n\n'); });
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    expect(await page.evaluate(() => submittedValue)).toBe('values=[1]\nvalues.append(2)\nprint(values)\n\n');
    await expect(page.locator('.vizcode-trace .ExecutionVisualizer')).toBeVisible({ timeout: 70000 });
    await expect(page.locator('#uiControlsPane,#creditsPane')).toHaveCount(0);
    await page.getByRole('button', { name: 'Last step', exact: true }).click();
    await expect(page.locator('.vizcode-output')).toHaveText('[1, 2]\n');
    await page.evaluate(() => widget.setCode('print(3)'));
    await expect(page.locator('.vizcode-trace .ExecutionVisualizer')).toBeVisible({ timeout: 70000 });
    await page.getByRole('button', { name: 'Last step', exact: true }).click();
    await expect(page.locator('.vizcode-output')).toHaveText('3\n');
});

test('read-only mount does not execute and auxiliary fields are collapsed', async ({ page }) => {
    const workers = [];
    page.on('worker', worker => workers.push(worker.url()));
    await page.goto('/live.html?readonly');
    await expect(page.locator('.vizcode-source .cm-content')).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.vizcode-scratch')).toHaveCount(0);
    expect(workers).toEqual([]);
});

async function editAndFinish(page, code) {
    await page.evaluate(code => widget.setCode(code), code);
    await expect(page.locator('.vizcode-status')).not.toHaveAttribute('aria-label', /Updating|Tracing/, { timeout: 75000 });
    if (await page.locator('.ExecutionVisualizer').count()) {
        const last = page.getByRole('button', { name: 'Last step', exact: true });
        if (await last.isEnabled()) await last.click();
    }
}

test('warm workers remain bounded, disposable and isolated across live edits', async ({ page }) => {
    await page.addInitScript(() => {
        const OriginalWorker = window.Worker;
        window.workerStats = { live: 0, peak: 0, executions: [], initialized: 0 };
        window.Worker = class extends OriginalWorker {
            constructor(url, options) {
                super(url, options);
                this.retired = false;
                this.executions = 0;
                window.workerStats.live++;
                window.workerStats.peak = Math.max(window.workerStats.peak, window.workerStats.live);
            }
            postMessage(message) {
                if (message.type === 'initialize') window.workerStats.initialized++;
                if (message.type === 'execute') {
                    this.executions++;
                    window.workerStats.executions.push(this.executions);
                }
                super.postMessage(message);
            }
            terminate() {
                if (!this.retired) { window.workerStats.live--; this.retired = true; }
                super.terminate();
            }
        };
    });
    await page.goto('/live.html');
    await expect(page.locator('.vizcode-widget')).toBeVisible();
    await editAndFinish(page, 'import builtins, sys\nbuiltins.leaked=1\nsys.path.append("leaked-path")\nprint(1)');
    await editAndFinish(page, 'import builtins, sys\nprint(hasattr(builtins,"leaked"),"leaked-path" in sys.path)');
    await expect(page.locator('.vizcode-output')).toHaveText('False False\n');
    await page.evaluate(() => widget.setCode(widget.getCode()));
    await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready');
    const broker = page.frames().find(frame => frame.url().includes('/live/broker.html'));
    const stats = await broker.evaluate(() => window.workerStats);
    expect(stats.peak).toBeLessThanOrEqual(2);
    expect(stats.executions.length).toBeGreaterThanOrEqual(2);
    expect(stats.executions.every(count=>count===1)).toBe(true);
    await page.evaluate(() => widget.destroy());
    await expect(page.locator('iframe')).toHaveCount(0);
});

test('errors, limits and edits during execution recover without Run or Stop', async ({ page }) => {
    await page.goto('/live.html');
    await expect(page.locator('.vizcode-widget')).toBeVisible();
    await editAndFinish(page, 'if :');
    await expect(page.locator('.vizcode-error')).toContainText('syntax');
    await editAndFinish(page, 'print(1/0)');
    await expect(page.locator('.vizcode-error')).toContainText('ZeroDivisionError');
    await editAndFinish(page, 'while True:\n    pass');
    await expect(page.locator('.vizcode-error')).toContainText('Trace limit');
    await editAndFinish(page, 'print("x"*70000)');
    await expect(page.locator('.vizcode-error')).toContainText('Output exceeds');
    await page.evaluate(() => widget.setCode('import sys\nsys.settrace(None)\nwhile True:\n    pass'));
    await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Tracing');
    await editAndFinish(page, 'print(72)');
    await expect(page.locator('.vizcode-output')).toHaveText('72\n');
    await editAndFinish(page, 'import sys\nsys.settrace(None)\nwhile True:\n    pass');
    await expect(page.locator('.vizcode-error')).toContainText('timed out');
    await editAndFinish(page, 'print(73)');
    await expect(page.locator('.vizcode-output')).toHaveText('73\n');
});

test('suspending and resuming preserves the editor and restarts tracing', async ({ page }) => {
    await page.goto('/live.html');
    await expect(page.locator('.vizcode-widget')).toBeVisible();
    await page.evaluate(() => {widget.setCode('print(81)');widget.suspend();});
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('textbox',{name:'Answer source',exact:true})).toHaveText('print(81)');
    await page.evaluate(() => widget.resume());
    await expect(page.locator('.vizcode-widget')).toHaveCount(1);
    await expect(page.locator('.ExecutionVisualizer')).toBeVisible({ timeout: 70000 });
    await page.getByRole('button', { name: 'Last step', exact: true }).click();
    await expect(page.locator('.vizcode-output')).toHaveText('81\n');
});

test('initial tracing can be disabled until the answer changes',async({page})=>{
    await page.goto('/live.html?noautotrace');
    await expect(page.locator('.vizcode-widget')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.evaluate(()=>widget.setCode('print(11)'));
    await expect(page.locator('.ExecutionVisualizer')).toBeVisible({timeout:70000});
});
