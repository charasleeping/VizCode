import {test,expect} from '@playwright/test';

test('native CodeRunner answer and Check remain usable without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});
 try {
  const page=await context.newPage();await page.goto('http://localhost:4115/login/index.php');
  await page.locator('#username').fill('student');await page.locator('#password').fill('LocalStudentOnly1!');
  await page.locator('#loginbtn').click();await page.waitForURL(url=>!url.pathname.includes('/login/'));
  await page.goto('http://localhost:4115/course/view.php?id=2');
  await page.getByRole('link',{name:/VizCode CodeRunner quiz/}).first().click();
  const resume=page.getByRole('button',{name:/Continue your attempt/});
  // Exercise native keyboard submission too; WebKit can wait indefinitely for
  // pointer geometry on Moodle's no-JavaScript quiz landing page.
  if(await resume.count())await resume.press('Enter');else await page.getByRole('button',{name:/Attempt quiz|Re-attempt quiz/}).press('Enter');
  const confirm=page.getByRole('button',{name:'Start attempt',exact:true});if(await confirm.count())await confirm.click();
  const question=page.locator('.que').first(),answer=question.locator('textarea[name$="_answer"]');
  await expect(answer).toBeVisible();await answer.fill('def print_factorial(n):\n return 1 if n < 2 else n * print_factorial(n-1)\n# no JavaScript fallback');
  await question.locator('[name$="-submit"]').click();
  await expect(page.locator('.que').first().locator('.coderunner-test-results.good')).toBeVisible();
  await expect(page.locator('.vizcode-widget')).toHaveCount(0);
 } finally {await context.close();}
});
