import {test,expect} from '@playwright/test';
const base='http://localhost:4115';
async function finishTrace(scope){const button=scope.getByRole('button',{name:'Last step',exact:true});if(await button.isEnabled())await button.click();}
async function login(page,user='student_'+test.info().project.name,password='LocalStudentOnly1!'){
 await page.goto(base+'/login/index.php');await page.locator('.toggle-sensitive-btn').waitFor({state:'attached'});await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.locator('#loginbtn').click();await page.waitForURL(url=>!url.pathname.includes('/login/'));
}
async function openQuiz(page,name){
 await page.goto(base+'/course/view.php?id=2');await page.getByRole('link',{name:new RegExp(name)}).first().click();
 const resume=page.getByRole('button',{name:/Continue your attempt/});if(await resume.count())await resume.click();else await page.getByRole('button',{name:/Attempt quiz|Re-attempt quiz/}).click();
 const confirm=page.getByRole('button',{name:'Start attempt',exact:true});if(await confirm.count())await confirm.click();
}
async function attempt(page){
 await login(page);await openQuiz(page,'VizCode CodeRunner quiz');
 await expect(page.locator('.vizcode-widget')).toHaveCount(3,{timeout:60000});
}
test('teacher can apply Question Bank category filters without malformed JSON',async({page})=>{
 await login(page,'teacher','LocalTeacherOnly1!');await page.goto(base+'/question/edit.php?courseid=2');
 await page.waitForFunction(()=>window.M?.util?.pending_js?.length===0);
 const response=page.waitForResponse(r=>r.url().includes('core_get_fragment'));
 await page.getByRole('button',{name:'Apply filters',exact:true}).click();
 const result=await(await response).json();expect(result[0].error,JSON.stringify(result)).not.toBe(true);
 await expect(page.locator('.qnameidnumbertags [data-value="Python factorial"]')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('native CodeRunner Check updates feedback without navigating or replacing the editor',async({page})=>{
 await attempt(page);const question=page.locator('.que').filter({has:page.locator('[data-vizcode]')}).first();
 const editor=question.getByRole('textbox',{name:'Answer source',exact:true});await editor.fill('def print_factorial(n):\n return 1 if n < 2 else n * print_factorial(n-1)\n# browser test');
 const location=page.url();await editor.evaluate(node=>node.dataset.retained='yes');
 const response=page.waitForResponse(r=>r.url().includes('local_vizcode_check'));await question.locator('[name$="-submit"]').click();const result=await(await response).json();expect(result[0].error,JSON.stringify(result)).not.toBe(true);
 await expect(question.locator('.coderunner-test-results.good')).toBeVisible();expect(page.url()).toBe(location);await expect(editor).toHaveAttribute('data-retained','yes');
 await expect(question.locator('.outcome')).toContainText('Answer checked in Python');await expect(question.locator('.outcome')).toContainText('Student — CPU time:');
 expect(await question.locator('.coderunner-test-results td').first().evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(209, 231, 221)');
});
test('native changed-answer warning follows the latest Check and preserves newer edits',async({page})=>{
 await attempt(page);const question=page.locator('.que').filter({has:page.locator('[data-vizcode]')}).first();
 const editor=question.getByRole('textbox',{name:'Answer source',exact:true});
 const warning=question.locator('[data-id$="-changed-notice"]');
 const good='def print_factorial(n):\n return 1 if n < 2 else n * print_factorial(n-1)\n# warning regression';
 const bad='def print_factorial(n):\n return 0\n# warning regression';
 async function check(source){await editor.fill(source);const response=page.waitForResponse(r=>r.url().includes('local_vizcode_check'));await question.locator('[name$="-submit"]').click();expect((await(await response).json())[0].error).not.toBe(true);}
 await check(good);await expect(warning).toHaveCount(0);
 await editor.fill(bad);await expect(warning).toBeVisible();
 await check(bad);await expect(warning).toHaveCount(0);await expect(question.locator('.coderunner-test-results.bad')).toBeVisible();
 await editor.fill(good);await expect(warning).toBeVisible();
 let release;const hold=new Promise(resolve=>release=resolve);let received;const ready=new Promise(resolve=>received=resolve);
 await page.route('**/lib/ajax/service.php*',async route=>{if(!route.request().url().includes('local_vizcode_check'))return route.continue();const response=await route.fetch();received();await hold;await route.fulfill({response});});
 await question.locator('[name$="-submit"]').click();await ready;await editor.fill(bad);release();
 await expect(question.locator('.coderunner-test-results.good')).toBeVisible();await expect.poll(()=>question.locator('textarea[data-vizcode]').evaluate(n=>n.vizcodeWidget.getCode())).toBe(bad);await expect(warning).toBeVisible();
 await page.unroute('**/lib/ajax/service.php*');await check(bad);await expect(warning).toHaveCount(0);
});
test('Java methods trace through the same function rows and output panel',async({page})=>{
 test.setTimeout(180000);await attempt(page);const question=page.locator('.que').filter({has:page.locator('[data-vizcode]')}).nth(2);
 await expect(question.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:90000});
 const row=question.locator('.vizcode-function-row').first();await expect(row).toBeVisible();await row.getByRole('textbox').fill('5');await row.getByRole('checkbox').check();
 await expect(question.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:90000});
 await finishTrace(question);await expect(question.locator('.ExecutionVisualizer')).toBeVisible();
 await expect(question.locator('.vizcode-error')).toHaveText('');
 const editor=question.getByRole('textbox',{name:'Answer source',exact:true});await editor.fill('static int print_factorial(int n) { System.out.println(n); return n < 2 ? 1 : n * print_factorial(n-1); }\n// refresh '+Date.now());
 await expect(question.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:90000});await finishTrace(question);
 await expect(question.locator('.vizcode-output')).toContainText('5');
 const response=page.waitForResponse(r=>r.url().includes('local_vizcode_check'));await question.locator('[name$="-submit"]').click();await response;
 await expect(question.locator('.outcome')).toContainText('Answer checked in Java');
});

test('native multilingual selector, drafts and restored language remain synchronized',async({page})=>{
 await login(page);await openQuiz(page,'VizCode multilingual quiz');
 await expect(page.locator('.vizcode-widget')).toHaveCount(1);await expect(page.getByRole('button',{name:'JavaScript',exact:true})).toHaveCount(0);const editor=page.getByRole('textbox',{name:'Answer source',exact:true});
 await page.getByRole('button',{name:'Python',exact:true}).click();await editor.fill('print(120) # multilingual browser');
 await page.getByRole('button',{name:'Java',exact:true}).click();await editor.fill('public class Main {public static void main(String[] args){System.out.println(120);}}');
 await page.getByRole('button',{name:'Python',exact:true}).click();await expect(editor).toContainText('multilingual browser');
 await page.getByRole('button',{name:'Java',exact:true}).click();const response=page.waitForResponse(r=>r.url().includes('local_vizcode_check'));await page.locator('[name$="-submit"]').click();const result=await(await response).json();expect(result[0].error,JSON.stringify(result)).not.toBe(true);
 await expect(page.locator('.outcome')).toContainText('Answer checked in Java');await page.reload();
 await expect(page.getByRole('button',{name:'Java',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('textbox',{name:'Answer source',exact:true})).toContainText('System.out.println(120)');
});
test('teacher authoring uses native fields and does not execute answers',async({page})=>{
 let executions=0;page.on('worker',worker=>{if(worker.url().endsWith('/live/worker.mjs'))executions++;});await login(page,'teacher','LocalTeacherOnly1!');
 await page.goto(base+'/question/bank/editquestion/question.php?courseid=2&id=20');
 await expect(page.locator('select[name="uiplugin"]')).toHaveValue('vizcode');
 await expect(page.locator('[name="coderunnertype"]')).toBeVisible();
 await expect(page.locator('[name="penaltyregime"]')).toHaveCount(1);
 await expect(page.locator('[name="partialcredit"]')).toHaveCount(0);
 await expect(page.locator('.vizcode-widget').first()).toBeAttached();expect(executions).toBe(0);
});

test('Java console input pauses at the reached step and never submits Check',async({page})=>{
 test.setTimeout(150000);await login(page);await openQuiz(page,'VizCode multilingual quiz');
 await expect(page.locator('.vizcode-widget')).toHaveCount(1);await page.getByRole('button',{name:'Java',exact:true}).click();
 const source='import java.util.*; public class Main { public static void main(String[] args) { Scanner s=new Scanner(System.in); int n=s.nextInt(); System.out.println(n); } }';
 let checks=0;page.on('request',r=>{if(r.url().includes('local_vizcode_check'))checks++;});await page.getByRole('textbox',{name:'Answer source',exact:true}).fill(source);
 await expect(page.locator('.ExecutionVisualizer')).toBeVisible({timeout:90000});await finishTrace(page);
 const input=page.getByRole('textbox',{name:'Program input',exact:true});await expect(input).toBeVisible({timeout:30000});await input.fill('42');await input.press('Enter');
 await expect(page.locator('.vizcode-status')).toHaveAttribute('aria-label','Ready',{timeout:90000});await finishTrace(page);await expect(page.locator('.vizcode-output')).toHaveText('42\n');expect(checks).toBe(0);
 await expect(page.getByRole('textbox',{name:'Answer source',exact:true})).toHaveText(source);
});

test('all three checked responses remain complete on the attempt summary',async({page})=>{
 await attempt(page);
 const sources=['def print_factorial(n):\n\n return 1 if n < 2 else n * print_factorial(n-1)',
 'int print_factorial(int n) {\n\n return n < 2 ? 1 : n * print_factorial(n-1); }',
 'static int print_factorial(int n) {\n\n return n < 2 ? 1 : n * print_factorial(n-1); }'];
 const questions=page.locator('.que').filter({has:page.locator('[data-vizcode]')});
 for(let i=0;i<3;i++){
  const q=questions.nth(i);await q.getByRole('textbox',{name:'Answer source',exact:true}).fill(sources[i]);
  const response=page.waitForResponse(r=>r.url().includes('local_vizcode_check'));
  await q.locator('[name$="-submit"]').click();expect((await(await response).json())[0].error).not.toBe(true);
  await expect(q.locator('.coderunner-test-results.good')).toBeVisible();
 }
 await page.getByRole('button',{name:/Finish attempt/}).click();
 await expect(page).toHaveURL(/summary.php/);
 await expect(page.locator('table tbody tr td:nth-child(2)')).toHaveText(['Correct','Correct','Correct']);
 // Actual unchecked edits must still be reported as incomplete.
 await page.getByRole('button',{name:'Return to attempt',exact:true}).click();
 await page.locator('.que').filter({has:page.locator('[data-vizcode]')}).nth(1).getByRole('textbox',{name:'Answer source',exact:true}).fill('int print_factorial(int n) { return 0; }');
 await page.getByRole('button',{name:/Finish attempt/}).click();
 await expect(page.locator('table tbody tr td:nth-child(2)')).toHaveText(['Correct','Not complete','Correct']);
});
