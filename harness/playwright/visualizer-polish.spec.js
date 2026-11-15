import {test,expect} from '@playwright/test';
async function ready(page){await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:150000});}
async function last(page){const b=page.getByRole('button',{name:'Last step',exact:true});if(await b.isEnabled())await b.click();}
test('Output follows the selected step, sits beside Objects and wraps on narrow screens',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(()=>widget.setCode('items=[1,2]\nprint(items)\nitems.append(3)\nprint(items)'));await ready(page);
 await expect(page.locator('.vizcode-output-panel')).toBeHidden();await last(page);await expect(page.locator('.vizcode-output')).toHaveText('[1, 2]\n[1, 2, 3]\n');
 const position=await page.evaluate(()=>{const o=document.querySelector('.vizcode-output-panel').getBoundingClientRect(),m=document.querySelector('.vizcode-memory-view').getBoundingClientRect();return o.left>=m.right;});expect(position).toBe(true);
 await page.getByRole('button',{name:'First step',exact:true}).click();await expect(page.locator('.vizcode-output-panel')).toBeHidden();await last(page);await page.setViewportSize({width:500,height:800});
 expect(await page.evaluate(()=>{const o=document.querySelector('.vizcode-output-panel').getBoundingClientRect(),m=document.querySelector('.vizcode-memory-view').getBoundingClientRect();return o.top>=m.bottom;})).toBe(true);
});
for(const [language,source]of [['python3','print("MUST_NOT_RUN")\nif :'],['cpp','#include <iostream>\nint main( { std::cout<<"MUST_NOT_RUN"; }']]){
 test(language+' syntax diagnostics show the actual error and clear on empty answers',async({page})=>{
  test.setTimeout(180000);await page.goto('/live.html?noautotrace&language='+language);await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(s=>{window.completed=0;document.addEventListener('vizcode:execution',()=>window.completed++);widget.setCode(s);},source);
  await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Debugging unavailable',{timeout:150000});await expect(page.locator('.vizcode-error')).toContainText(language==='cpp'?'error:':'SyntaxError');
  await expect(page.getByRole('button',{name:'Retry debugging'})).toHaveCount(0);await expect(page.locator('.vizcode-error details')).toHaveCount(0);await expect(page.locator('.vizcode-error svg')).toHaveCount(1);await expect(page.locator('.vizcode-status')).toHaveClass(/status-error/);expect(await page.evaluate(()=>window.completed)).toBe(0);
  await page.evaluate(()=>widget.setCode(''));await expect(page.locator('.vizcode-error')).toBeEmpty();await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready');await expect(page.getByRole('button',{name:'Retry debugging'})).toBeHidden();
 });
}
test('mouse and touch dragging use the whole function row and retain arguments',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(()=>widget.setCode('def first(x=1):\n print(x)\ndef second(y=2):\n print(y)'));await ready(page);
 const rows=page.locator('.vizcode-function-row');await page.getByRole('textbox',{name:'first argument x'}).fill('5');await ready(page);
 const preview=await page.evaluate(()=>{const rows=document.querySelectorAll('.vizcode-function-row');const data=new DataTransfer();let whole=false;data.setDragImage=element=>{whole=element===rows[1];};rows[1].querySelector('button').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));rows[0].dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));return whole;});expect(preview).toBe(true);await ready(page);await expect(rows.first()).toContainText('second');await expect(page.getByRole('textbox',{name:'first argument x'})).toHaveValue('5');
 await rows.first().getByRole('button').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:20,clientY:20});await expect(page.locator('.vizcode-drag-preview')).toContainText('second');
 const target=await rows.nth(1).boundingBox();const point={pointerType:'touch',pointerId:7,clientX:target.x+target.width/2,clientY:target.y+target.height/2};await rows.first().getByRole('button').dispatchEvent('pointermove',point);await expect(rows.nth(1)).toHaveClass(/vizcode-drop-before/);await rows.first().getByRole('button').dispatchEvent('pointerup',point);await expect(page.locator('.vizcode-drag-preview')).toHaveCount(0);await expect(rows.first()).toContainText('first');await expect(page.getByRole('textbox',{name:'first argument x'})).toHaveValue('5');
});
