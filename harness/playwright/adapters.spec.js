import {test,expect} from '@playwright/test';
async function ready(page){await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:90000});}
test('native C++ captures one-line returns and renders object aliases without Internet requests',async({page})=>{
 test.setTimeout(180000);const external=[];
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){external.push(url.origin);return route.abort();}return route.continue();});
 await page.goto('/live.html?noautotrace&language=cpp');await expect(page.locator('.vizcode-widget')).toBeVisible();
 await page.evaluate(()=>widget.setCode('int fact(int n){return n<2?1:n*fact(n-1);}'));await ready(page);
 const row=page.locator('.vizcode-function-row');await row.getByRole('textbox').fill('5');await row.getByRole('checkbox').check();await ready(page);
 const returns=await page.evaluate(()=>widget.visualization.curTrace.filter(t=>t.event==='return').map(t=>t.stack_to_render.at(-1).encoded_locals.__return__));expect(returns).toEqual([1,2,6,24,120]);
 await page.evaluate(()=>{const i=widget.visualization.curTrace.findIndex(t=>t.event==='return'&&t.stack_to_render.at(-1).encoded_locals.__return__===120);widget.step(i);});
 await expect(page.locator('.vizcode-trace')).toContainText('120');
 await page.evaluate(()=>widget.setCode('struct Box{int value;};\nint main(){\n Box b{7};\n Box* p=&b;\n Box* q=p;\n b.value=9;\n std::cout<<q->value<<"\\n";\n}'));await ready(page);
 const alias=await page.evaluate(()=>widget.visualization.curTrace.findIndex(t=>t.stack_to_render.some(f=>{const v=f.encoded_locals;return Array.isArray(v.b)&&JSON.stringify(v.b)===JSON.stringify(v.p)&&JSON.stringify(v.p)===JSON.stringify(v.q)&&t.heap[v.b[1]]?.some(x=>Array.isArray(x)&&x[0]==='value'&&x[1]===9);})));expect(alias).toBeGreaterThanOrEqual(0);
 await page.evaluate(i=>widget.step(i),alias);await expect(page.locator('.vizcode-trace .heapObject')).toHaveCount(1);expect(external).toEqual([]);
});
test('Python object inspection preserves slots and does not execute student formatters',async({page})=>{
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();
 await page.evaluate(()=>widget.setCode('class Box:\n __slots__=("value","next")\n def __str__(self):\n  raise RuntimeError("formatter must not run")\n @property\n def computed(self):\n  raise RuntimeError("property must not run")\nb=Box()\nb.value=9007199254740993\nb.next=b\nalias=b\nprint(b.value)'));await ready(page);
 await page.getByRole('button',{name:'Last step',exact:true}).click();await expect(page.locator('.vizcode-output')).toHaveText('9007199254740993\n');await expect(page.locator('.vizcode-error')).toHaveText('');
 expect(await page.evaluate(()=>widget.visualization.curTrace.some(t=>Object.values(t.heap).some(v=>v[0]==='INSTANCE'&&v[1]==='Box'&&v.some(f=>Array.isArray(f)&&f[0]==='next'))))).toBe(true);
 await page.evaluate(()=>widget.setCode('first=[1]\nalias=first\nfirst.append(2)\nprint(alias)\ndel first\ndel alias\nsecond=[3]\nprint(second)'));await ready(page);
 const ids=await page.evaluate(()=>{const trace=widget.visualization.curTrace;return [trace.find(t=>t.globals.first)?.globals.first[1],trace.find(t=>t.globals.second)?.globals.second[1]];});expect(ids[0]).toBeDefined();expect(ids[1]).toBeDefined();expect(ids[0]).not.toBe(ids[1]);
});
test('registered executable language works without frontend changes',async({page,request})=>{
 const catalog=await request.get('http://127.0.0.1:4104/v1/adapters').then(r=>r.json());test.skip(!catalog.adapters.some(a=>a.id==='counter-example'),'Install the documented example adapter and include it in the registry');
 await page.goto('/live.html?noautotrace');await expect(page.locator('.vizcode-widget')).toBeVisible();await page.evaluate(()=>widget.setLanguage('counter','2\n3\n9007199254740993'));await ready(page);
 await expect(page.locator('.vizcode-adapter-notice')).toContainText('return');await expect(page.locator('.vizcode-function-row')).toHaveCount(0);
 await page.getByRole('button',{name:'Last step',exact:true}).click();await expect(page.locator('.vizcode-trace')).toContainText('9007199254740998');
});
