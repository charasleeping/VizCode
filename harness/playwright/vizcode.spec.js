import { test, expect } from '@playwright/test';
test.skip(!process.env.VIZCODE_URL, 'Set VIZCODE_URL for independent plugin tests');
const base = process.env.VIZCODE_URL || 'http://localhost:4112';
async function check(page, name) {
    const navigation = page.waitForEvent('framenavigated', {
        predicate: frame => frame === page.mainFrame() && frame.url().includes('/mod/quiz/attempt.php')
    });
    await page.getByRole('button', { name, exact: true }).click();
    await navigation;
    await page.waitForLoadState('domcontentloaded');
}

test('independent student quiz traces edits, grades hidden tests, and reviews immutably', async ({ page }) => {
    const coderunnerRequests = [];
    page.on('request', request => { if (request.url().includes('coderunner')) coderunnerRequests.push(request.url()); });
    await page.goto(base + '/login/index.php');
    const token = await page.locator('#login input[name=logintoken]').inputValue();
    await page.request.post(base + '/login/index.php', { form: {
        username: 'student', password: 'LocalStudentOnly1!', logintoken: token
    } });
    await page.goto(base + '/mod/quiz/view.php?id=1');
    const resume = page.getByRole('button', { name: 'Continue your attempt', exact: true });
    if (await resume.count()) await resume.click();
    else await page.getByRole('button', { name: /^(Attempt quiz|Re-attempt quiz)$/ }).click();
    await expect(page.locator('.vizcode-widget')).toHaveCount(2);
    const program = page.locator('.que').first();
    const functionQuestion = page.locator('.que').nth(1);
    await expect(page.getByRole('button', { name: /^(Run|Stop)$/ })).toHaveCount(0);
    expect(await page.content()).not.toContain('HIDDEN_SENTINEL');
    expect(await page.content()).not.toContain('5040');
    await program.getByRole('textbox', { name: 'Answer source', exact: true }).fill('n=int(input())\nproduct=1\nfor number in range(1,n+1):\n    product*=number\nprint(product)');
    await program.locator('summary').click();
    await program.getByRole('textbox', { name: 'Input', exact: true }).fill('5');
    await expect(program.locator('.ExecutionVisualizer')).toBeVisible({ timeout: 70000 });
    await program.getByRole('button', { name: 'Last step', exact: true }).click();
    await expect(program.locator('.vizcode-output')).toContainText('120');
    await check(page, 'Check Question 1');
    await expect(program).toContainText('2 of 2 tests passed.', { timeout: 30000 });
    await expect(functionQuestion.locator('.vizcode-widget')).toBeVisible();
    await functionQuestion.getByRole('textbox', { name: 'Answer source', exact: true }).fill('def factorial(n):\n    return 1 if n < 2 else n*factorial(n-1)');
    await check(page, 'Check Question 2');
    await expect(functionQuestion).toContainText('2 of 2 tests passed.', { timeout: 30000 });
    const attempt = new URL(page.url()).searchParams.get('attempt');
    await page.goto(base + '/mod/quiz/summary.php?attempt=' + attempt);
    await page.getByRole('button', { name: 'Submit all and finish', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit all and finish', exact: true }).click();
    await expect(page).toHaveURL(/review\.php/);
    await expect(page.locator('.vizcode-source .cm-content').first()).toHaveAttribute('contenteditable', 'false');
    expect(coderunnerRequests).toEqual([]);
});

test('failed grading preflight keeps the student answer editable', async ({ page }) => {
    await page.goto(base + '/login/index.php');
    const token = await page.locator('#login input[name=logintoken]').inputValue();
    await page.request.post(base + '/login/index.php', { form: {
        username: 'student', password: 'LocalStudentOnly1!', logintoken: token
    } });
    await page.goto(base + '/mod/quiz/view.php?id=1');
    const resume = page.getByRole('button', { name: 'Continue your attempt', exact: true });
    if (await resume.count()) await resume.click();
    else await page.getByRole('button', { name: /^(Attempt quiz|Re-attempt quiz)$/ }).click();
    const program = page.locator('.que').first();
    await expect(program.locator('.vizcode-widget')).toBeVisible();
    await page.route('**/lib/ajax/service.php**', route => {
        if (route.request().postData()?.includes('qtype_vizcode_check')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
                { error: true, exception: { errorcode: 'gradingunavailable', message: 'Grading unavailable' } }
            ]) });
        }
        return route.continue();
    });
    const source = 'print(918)\n\n';
    await program.getByRole('textbox', { name: 'Answer source', exact: true }).fill(source);
    const url = page.url();
    await page.getByRole('button', { name: 'Check Question 1', exact: true }).click();
    await expect(program.getByText('Server grading is unavailable. Your answer remains editable; retry Check.')).toBeVisible();
    expect(page.url()).toBe(url);
    await expect(program.getByRole('textbox', { name: 'Answer source', exact: true })).toHaveAttribute('contenteditable', 'true');
    expect(await program.locator('textarea.vizcode-answer').inputValue()).toBe(source);
});