import { chromium, browserOptions } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const out = process.env.SUNNY_EVIDENCE || '/workspace/ui3-admin-production';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    // No ui override: exercise the actual production resolver with fixture identities.
    await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?theme=${theme}`);
    await page.waitForFunction(() => document.documentElement.dataset.uiVersion === '3.0');
    await page.getByRole('button', { name: 'Utente normale test', exact: true }).waitFor();
    await page.screenshot({ path: `${out}/admin-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Utente normale test', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.uiVersion === '2.0');
    await page.getByRole('button', { name: 'Admin test', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.uiVersion === '3.0');
    await page.getByRole('button', { name: 'Logout test', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.uiVersion === '2.0');
    assert.deepEqual(errors, []);
    console.log(`PASS production default ${theme}: admin UI3, ordinary UI2, admin UI3, logout UI2; no page errors`);
    await page.close();
  }
} finally {
  await browser.close();
}
