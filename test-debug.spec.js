const { test, expect } = require('@playwright/test');

test('page renders with PF6 styling', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:9113');
  await page.waitForTimeout(2000);

  // Verify page rendered
  await expect(page.locator('h1')).toContainText('Hermes Agent Deployer');
  await expect(page.getByText('No instances deployed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deploy New Instance' }).first()).toBeVisible();

  // Check PF6 button has proper styling
  const btnBg = await page.getByRole('button', { name: 'Deploy New Instance' }).first().evaluate(
    el => getComputedStyle(el).backgroundColor
  );
  console.log(`Button background: ${btnBg}`);

  // Check no React crashes
  const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML.length);
  console.log(`Root HTML length: ${rootHtml}`);
  console.log(`Page errors: ${errors.length}`);
  errors.forEach(e => console.log(`  - ${e}`));

  await page.screenshot({ path: '/tmp/hermes-final.png', fullPage: true });
  expect(errors).toHaveLength(0);
});
