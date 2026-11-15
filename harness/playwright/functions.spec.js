import {test,expect} from '@playwright/test';
async function ready(page){await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:150000});}
async function last(page){const button=page.getByRole('button',{name:'Last step',exact:true});if(await button.isEnabled())await button.click();}
for(const [language,source,program]of[
 ['python3','def first(x,y=2):\n print(x+y)\ndef second():\n print(9)','\nprint(0)'],

 ['cpp','#include <iostream>\nvoid first(int x,int y=2){std::cout<<x+y<<"\\n";}\nvoid second(){std::cout<<9<<"\\n";}','\nint main(){return 0;}']]){
 test(language+' function rows run locally in order, use defaults and lock with executable code',async({page})=>{
  test.setTimeout(240000);await page.goto('/live.html?noautotrace&language='+language);await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(code=>widget.setCode(code),source);await ready(page);
  await expect(page.locator('.vizcode-scratch')).toHaveCount(0);const rows=page.locator('.vizcode-function-row');await expect(rows).toHaveCount(2);
  await rows.first().getByRole('textbox').first().fill('5');await rows.first().getByRole('checkbox').check();await ready(page);await last(page);await expect(page.locator('.vizcode-output')).toHaveText('7\n');
  await rows.nth(1).getByRole('checkbox').check();await ready(page);await last(page);await expect(page.locator('.vizcode-output')).toHaveText('7\n9\n');
  await rows.nth(1).getByRole('button',{name:'Move second',exact:true}).press('ArrowUp');await ready(page);await last(page);await expect(page.locator('.vizcode-output')).toHaveText('9\n7\n');
  expect(await page.locator('textarea').first().inputValue()).toBe(source);
  await page.evaluate(code=>widget.setCode(code),source+program);await ready(page);await expect(rows.getByRole('checkbox').first()).toBeDisabled();await expect(rows.getByRole('checkbox').first()).toBeChecked();
  await page.evaluate(code=>widget.setCode(code),source);await ready(page);await expect(rows.getByRole('checkbox').first()).toBeEnabled();await last(page);await expect(page.locator('.vizcode-output')).toHaveText('9\n7\n');
 });
}
test('reload keeps visualization stable; icons, keyboard and reduced motion work',async({page})=>{
 await page.goto('/live.html');await ready(page);await last(page);
 const retained=await page.evaluate(()=>{const root=document.querySelector('.vizcode-trace');const old=root.firstChild;const height=root.getBoundingClientRect().height;widget.setCode('x=2\nprint(x)');return {same:root.firstChild===old,height:root.getBoundingClientRect().height===height,disabled:document.querySelector('.vizcode-steps input').disabled};});expect(retained).toEqual({same:true,height:true,disabled:true});
 await ready(page);await page.locator('.vizcode-widget').click({position:{x:5,y:5}});await page.getByRole('button',{name:'Last step',exact:true}).click();await expect(page.locator('.vizcode-output')).toHaveText('2\n');
 await page.getByRole('button',{name:'First step',exact:true}).click();await expect(page.locator('.vizcode-step-count')).toHaveText(/^1 \/ /);
 await expect(page.locator('.vizcode-status')).toHaveClass(/status-ready/);await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('ArrowRight');
 expect(await page.locator('.vizcode-trace').evaluate(n=>n.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
 await page.evaluate(()=>widget.setCode('if :'));await expect(page.locator('.vizcode-error')).toContainText('syntax');await expect(page.locator('.ExecutionVisualizer')).toHaveCount(0);
});
test('keyboard shortcuts target one widget and leave argument typing alone',async({page})=>{
 await page.goto('/live.html');await ready(page);
 await page.evaluate(async()=>{const root=document.createElement('div');root.id='second-widget';document.body.append(root);window.secondWidget=VizCode.create({initialCode:'x=2\nprint(x)',brokerUrl:'http://127.0.0.1:4104/live/broker.html'});await secondWidget.mount(root);});
 const second=page.locator('#second-widget');await expect(second.locator('.ExecutionVisualizer')).toBeVisible({timeout:75000});await expect(second.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:75000});
 await second.locator('.vizcode-status').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await expect(second.locator('.vizcode-output')).toHaveText('2\n');
 await expect(page.locator('.vizcode-step-count').first()).toHaveText(/^1 \/ /);
 await page.evaluate(()=>widget.setCode('def f(x):\n print(x)'));await expect(page.locator('.vizcode-function-row')).toBeVisible();
 const argument=page.getByRole('textbox',{name:'f argument x'});await argument.fill('123');await argument.press('ArrowLeft');await expect(argument).toHaveValue('123');
});
