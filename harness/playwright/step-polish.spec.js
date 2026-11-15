import {test,expect} from '@playwright/test';
test('step boundaries, slider motion, Ctrl preservation and error reset',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(()=>widget.setCode('x=1\ny=2\nprint(x+y)'));await expect(page.locator('.ExecutionVisualizer')).toBeVisible({timeout:75000});
 await page.locator('.vizcode-status').click();await page.keyboard.press('ArrowLeft');expect(await page.locator('.vizcode-trace').evaluate(n=>n.getAnimations().length)).toBe(0);
 await page.keyboard.press('Control+ArrowRight');await expect(page.locator('.vizcode-step-count')).toHaveText(/^1 \/ /);
 const motion=await page.evaluate(()=>{document.querySelector('[aria-label="Last step"]').click();return Number(document.querySelector('[aria-label="Execution step"]').value)<Number(document.querySelector('[aria-label="Execution step"]').max);});expect(motion).toBe(true);
 await expect.poll(()=>page.locator('[aria-label="Execution step"]').evaluate(n=>Number(n.value)===Number(n.max))).toBe(true);
 await page.waitForTimeout(160);await page.keyboard.press('ArrowRight');expect(await page.locator('.vizcode-trace').evaluate(n=>n.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
 await page.evaluate(()=>widget.setCode('if :'));await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Debugging unavailable',{timeout:75000});await expect(page.locator('.ExecutionVisualizer')).toHaveCount(0);await expect(page.locator('[aria-label="Execution step"]')).toBeDisabled();
});
