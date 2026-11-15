import {test,expect} from '@playwright/test';
async function mount(page,language='python3',source='x=0\nfor i in range(3):\n x+=i\nprint(x)'){
 await page.goto('/live.html?noautotrace&language='+language);await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(s=>widget.setCode(s),source);await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:150000});
}
test('breakpoints stop jumps at repeated visits and Shift shortcuts preserve typing',async({page})=>{
 await mount(page);await page.getByRole('button',{name:'Breakpoint line 3',exact:true}).click();await expect(page.getByRole('button',{name:'Breakpoint line 3',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Last step',exact:true}).click();let step=await page.locator('.vizcode-step-count').textContent();expect(await page.evaluate(()=>widget.visualization.curTrace[widget.visualization.curInstr].source_line)).toBe(3);
 await page.locator('.vizcode-status').click();await page.keyboard.press('Shift+ArrowRight');await expect(page.locator('.vizcode-step-count')).not.toHaveText(step);expect(await page.evaluate(()=>widget.visualization.curTrace[widget.visualization.curInstr].source_line)).toBe(3);
 await page.keyboard.press('Shift+ArrowLeft');await expect(page.locator('.vizcode-step-count')).toHaveText(step);
 const source=await page.evaluate(()=>widget.getCode());await page.getByRole('textbox',{name:'Answer source'}).click();await page.keyboard.press('Shift+ArrowRight');expect(await page.evaluate(()=>widget.getCode())).toBe(source);
 await page.getByRole('button',{name:'Breakpoint line 3',exact:true}).click();await page.getByRole('button',{name:'Last step',exact:true}).click();expect(await page.evaluate(()=>widget.visualization.curInstr)).toBe(await page.evaluate(()=>widget.visualization.curTrace.length-1));
});
test('line-number click/drag select complete lines; markers map across edits',async({page})=>{
 await mount(page);const lines=page.locator('.cm-lineNumbers .cm-gutterElement').filter({hasText:/^[1-4]$/});await lines.nth(1).click();expect(await page.evaluate(()=>widget.editor.view.state.sliceDoc(widget.editor.view.state.selection.main.from,widget.editor.view.state.selection.main.to))).toBe('for i in range(3):\n');
 const a=await lines.nth(1).boundingBox(),b=await lines.nth(3).boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});await page.mouse.up();expect(await page.evaluate(()=>widget.editor.view.state.selection.main.from)).toBe(4);expect(await page.evaluate(()=>widget.editor.view.state.selection.main.to)).toBe((await page.evaluate(()=>widget.getCode())).length);
 await page.getByRole('button',{name:'Breakpoint line 3',exact:true}).click();await page.evaluate(()=>widget.editor.view.dispatch({changes:{from:0,insert:'# note\n'}}));await expect(page.getByRole('button',{name:'Breakpoint line 4',exact:true})).toHaveAttribute('aria-pressed','true');
});
for(const [language,source]of[['cpp','#include <iostream>\nint main(){\n int n=1;\n n++;\n std::cout<<n;\n}']])test(language+' breakpoint jump works',async({page})=>{await mount(page,language,source);const line=language==='cpp'?4:2;await page.getByRole('button',{name:'Breakpoint line '+line,exact:true}).click();await page.getByRole('button',{name:'Last step',exact:true}).click();expect(await page.evaluate(()=>widget.visualization.curTrace[widget.visualization.curInstr].source_line)).toBe(line);});
test('breakpoints restore per language and remain keyboard operable',async({page})=>{
 await mount(page,'python3','values = [1]\nprint(values)');const point=page.getByRole('button',{name:'Breakpoint line 2',exact:true});await point.focus();await page.keyboard.press('Space');await expect(point).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'C++',exact:true}).click();await page.getByRole('button',{name:'Python',exact:true}).click();await expect(point).toHaveAttribute('aria-pressed','true');
 await page.reload();await expect(point).toHaveAttribute('aria-pressed','true');
});
