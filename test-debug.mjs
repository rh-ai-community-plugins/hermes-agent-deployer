import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`CONSOLE ERROR: ${msg.text()}`);
});
page.on('pageerror', err => {
  errors.push(`PAGE ERROR: ${err.message}`);
});

await page.goto('http://localhost:9113', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const html = await page.evaluate(() => document.getElementById('root')?.innerHTML || 'ROOT IS EMPTY');
console.log('--- ROOT CONTENT ---');
console.log(html.substring(0, 500));
console.log('--- ERRORS ---');
errors.forEach(e => console.log(e));

await page.screenshot({ path: '/tmp/hermes-debug.png', fullPage: true });
await browser.close();
