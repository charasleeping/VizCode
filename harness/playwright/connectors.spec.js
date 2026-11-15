import {test,expect} from '@playwright/test';
async function geometry(page){return page.evaluate(()=>{
 const results=[];widget.visualization.dataViz.jsPlumbInstance.select().each(c=>{
  const path=c.connector.canvas.querySelector('path');const target=document.getElementById(c.targetId);if(!path||!target)return;
  const p=path.getPointAtLength(path.getTotalLength());const end=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());const box=target.getBoundingClientRect();
  results.push(Math.hypot(end.x-box.left,end.y-(box.top+box.height/2)));
 });return results;
});}
test('frame arrows remain anchored after animation, layout movement and resize',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(()=>widget.setCode('items=[1,2]\nalias=items\nitems.append(3)\nprint(items)'));
 await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:75000});await page.getByRole('button',{name:'Last step',exact:true}).click();await page.waitForTimeout(200);
 const distances=await geometry(page);expect(distances.length).toBeGreaterThan(0);expect(Math.max(...distances)).toBeLessThan(3);
 await page.getByRole('button',{name:'Previous step',exact:true}).click();await page.waitForTimeout(70);expect(Math.max(...await geometry(page))).toBeLessThan(3);
 await page.waitForTimeout(150);await page.evaluate(()=>{const memory=document.querySelector('.vizcode-memory-view');memory.style.maxHeight='70px';memory.scrollTop=35;});expect(Math.max(...await geometry(page))).toBeLessThan(3);await page.evaluate(()=>document.querySelector('.vizcode-widget').style.marginTop='90px');await page.setViewportSize({width:700,height:900});await page.waitForTimeout(200);expect(Math.max(...await geometry(page))).toBeLessThan(3);
});
test('missing arguments do not offer Retry and updating the argument traces automatically',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(()=>widget.setCode('def show(x):\n print(x)'));
 await expect(page.locator('.vizcode-function-row')).toBeVisible();await page.getByRole('checkbox',{name:'show',exact:true}).check();await expect(page.locator('.vizcode-error')).toContainText('Enter an argument');await expect(page.getByRole('button',{name:'Retry debugging'})).toBeHidden();
 await page.getByRole('textbox',{name:'show argument x'}).fill('7');await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:75000});await page.getByRole('button',{name:'Last step',exact:true}).click();await expect(page.locator('.vizcode-output')).toHaveText('7\n');
});
