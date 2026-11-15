import {test,expect} from '@playwright/test';
async function finish(page){await expect(page.locator('.ExecutionVisualizer')).toBeVisible({timeout:150000});await expect(page.locator('.vizcode-status')).not.toHaveAttribute('aria-label', /Updating|Tracing/,{timeout:150000});const last=page.getByRole('button',{name:'Last step',exact:true});if(await last.isEnabled())await last.click();}
for(const [language,source]of[
 ['python3','a=int(input())\nb=int(input())\nprint(a+b)'],

 ['cpp','#include <iostream>\nint main(){int a,b;std::cin>>a;std::cin>>b;std::cout<<a+b<<"\\n";}']]){
 test(language+' compact input submits with Enter and arrow',async({page})=>{
  test.setTimeout(240000);await page.goto('/live.html?noautotrace&language='+language);await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(s=>widget.setCode(s),source);await finish(page);
  const input=page.getByRole('textbox',{name:'Program input',exact:true});await input.fill('5');await input.press('Enter');
  await expect(page.locator('.vizcode-status')).not.toHaveAttribute('aria-label', /Updating|Tracing/,{timeout:150000});
  await expect(input).toBeVisible();await input.fill('7');await page.getByRole('button',{name:'Submit input',exact:true}).click();await finish(page);
  await expect(page.locator('.vizcode-output')).toContainText('12\n');await expect(page.locator('.vizcode-input-history')).toHaveCount(0);
  expect(await page.evaluate(()=>window.submittedValue)).toBeUndefined();
 });
}
test('Shift+Enter expands input and deletion contracts it; whole input has one button',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(()=>widget.setCode('import sys\nprint(sum(map(int,sys.stdin.read().split())))'));await finish(page);
 const input=page.getByRole('textbox',{name:'Program input',exact:true});await input.fill('5');await input.press('Shift+Enter');await expect(input).toHaveAttribute('rows','2');await input.fill('5');await expect(input).toHaveAttribute('rows','1');await input.press('Shift+Enter');await input.press('7');
 await expect(page.locator('.vizcode-input-request button')).toHaveCount(1);await input.press('Enter');await finish(page);await expect(page.locator('.vizcode-output')).toHaveText('12\n');
});
