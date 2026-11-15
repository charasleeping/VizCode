import {test,expect} from '@playwright/test';
async function last(page){const b=page.getByRole('button',{name:'Last step',exact:true});if(await b.isEnabled())await b.click();}
test('legacy saved stdin remains a finite stream including its last unterminated line',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();
 await page.evaluate(async()=>{widget.destroy();const root=document.createElement('div');document.body.append(root);
  window.widget=VizCode.create({initialCode:'a=int(input())\nb=int(input())\nprint(a+b)',initialInput:'5\n7',brokerUrl:'http://127.0.0.1:4104/live/broker.html'});await widget.mount(root);
 });
 await expect(page.locator('.ExecutionVisualizer')).toBeVisible({timeout:75000});await last(page);
 await expect(page.locator('.vizcode-output')).toHaveText('12\n');await expect(page.locator('.vizcode-input-request')).toBeHidden();
 expect(await page.evaluate(()=>widget.getAuxiliaryState().inputEof)).toBe(true);
});
