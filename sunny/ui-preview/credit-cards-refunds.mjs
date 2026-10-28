import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, browserOptions } from './browser.mjs';

// Run only after the source is frozen. All requests are restricted to the
// fixture server; save/delete actions update React memory, never Firestore.
const out = process.env.SUNNY_EVIDENCE || new URL('./artifacts/credit-cards-refunds/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const results = [];
const errors = [];
const snapshot = async page => JSON.parse(await page.locator('#preview-finance-snapshot').textContent());
const routeTo = (page, route) => page.evaluate(route => {
  history.pushState({}, '', route); dispatchEvent(new PopStateEvent('popstate'));
}, route);
const start = async (page, ui, theme, date = '2026-10-28', extra = '') => {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}&financeCase&financeMonth=2026-10&financeDate=${date}&noAi&noBudget&${extra}`);
  await page.locator('#preview-finance-snapshot').waitFor();
};
const closeClean = async page => {
  await page.keyboard.press('Escape');
  await page.locator('.fixed.inset-0.z-50 > .glass-elevated').waitFor({ state: 'detached' });
};
const assertPositions = (state, cash, wealth, bank, card) => {
  assert.equal(state.liquidity, cash, 'liquidity');
  assert.equal(state.netWorth, wealth, 'net worth retains card liability');
  assert.equal(state.accountBalances.conto_corrente, bank, 'bank ledger');
  assert.equal(state.accountBalances.carta_fixture ?? 0, card, 'card ledger');
};

try {
  for (const ui of [2, 3]) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', request => new URL(request.request().url()).hostname === '127.0.0.1' ? request.continue() : request.abort());
    const name = `ui${ui}-${theme}-${width}`;
    await start(page, ui, theme);
    let state = await snapshot(page);
    assertPositions(state, 1000, 900, 1000, -100);
    assert.equal(state.monthlyExpenses, 100);
    assert.equal(state.monthlyFlow.cashOut, 0);
    assert.equal(state.settlements.length, 1);
    assert.equal(state.settlements[0].date, '2026-11-10');
    assert.equal(state.settlements[0].amount, 100);
    await page.getByRole('button', { name: 'Apri distinta test', exact: true }).click();
    const statement = page.locator('.fixed.inset-0.z-50 > .glass-elevated');
    await statement.getByText('Distinta automatica · sola lettura').waitFor();
    assert.equal(await statement.locator('input,select,textarea').count(), 0);
    assert.equal(await statement.getByRole('button', { name: /Salva|Elimina/ }).count(), 0);
    await page.screenshot({ path: `${out}/${name}-statement.png` });
    await closeClean(page);

    // Exercise the actual Movimenti selection action, rather than only the
    // extra local controls that make individual scenarios easy to reproduce.
    await routeTo(page, '/transactions');
    await page.getByRole('button', { name: 'Seleziona', exact: true }).click();
    await page.getByRole('button', { name: /Acquisto carta 60/ }).click();
    await page.getByRole('button', { name: /Acquisto carta 40/ }).click();
    await page.getByRole('button', { name: 'Rimborso', exact: true }).click();
    const amount = page.getByRole('textbox', { name: 'Totale ricevuto', exact: true });
    await amount.fill('80');
    await page.getByText(/Costi residui/, { exact: true }).waitFor();
    if (ui === 3) {
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), true, 'focus stays within receipt');
    }
    await page.screenshot({ path: `${out}/${name}-refund80.png` });
    await page.getByRole('button', { name: 'Registra rimborso', exact: true }).click();
    await page.locator('.fixed.inset-0.z-50 > .glass-elevated').waitFor({ state: 'detached' });
    state = await snapshot(page);
    assertPositions(state, 1080, 980, 1080, -100);
    assert.deepEqual(state.expenses.map(row => row.ownShare), [12, 8]);
    assert.deepEqual(state.expenses.map(row => row.date), ['2026-10-02', '2026-10-03']);
    assert.equal(state.receipts.reduce((sum, row) => sum + row.amount, 0), 80);
    assert.equal(new Set(state.receipts.map(row => row.refundGroupId)).size, 1);
    assert.equal(state.settlements[0].amount, 100, 'bank refund does not rewrite card debt');
    const receiptId = state.receipts[0].refundGroupId;

    await page.getByRole('button', { name: 'Modifica ricevuta test', exact: true }).click();
    await amount.fill('120');
    await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click();
    await page.locator('.fixed.inset-0.z-50 > .glass-elevated').waitFor({ state: 'detached' });
    state = await snapshot(page);
    assertPositions(state, 1120, 1020, 1120, -100);
    assert.deepEqual(state.expenses.map(row => row.ownShare), [0, 0]);
    assert.equal(state.receipts.reduce((sum, row) => sum + row.amount, 0), 120);
    assert.equal(state.receipts.find(row => row.type === 'income').amount, 20);
    assert.ok(state.receipts.every(row => row.refundGroupId === receiptId), 'editing preserves receipt identity');
    await page.getByRole('button', { name: 'Modifica ricevuta test', exact: true }).click();
    await page.screenshot({ path: `${out}/${name}-refund120.png` });
    await page.getByRole('button', { name: 'Elimina ricevuta', exact: true }).click();
    await page.getByRole('button', { name: 'Conferma eliminazione ricevuta', exact: true }).click();
    await page.locator('.fixed.inset-0.z-50 > .glass-elevated').waitFor({ state: 'detached' });
    state = await snapshot(page);
    assertPositions(state, 1000, 900, 1000, -100);
    assert.deepEqual(state.expenses.map(row => row.ownShare), [60, 40]);
    assert.equal(state.receipts.length, 0);
    await page.getByRole('button', { name: 'Rimborso singolo test', exact: true }).click();
    await page.getByRole('heading', { name: 'Registra storno', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Totale ricevuto', exact: true }).count(), 0);
    await closeClean(page);

    await start(page, ui, theme, '2026-11-09');
    assertPositions(await snapshot(page), 1000, 900, 1000, -100);
    await start(page, ui, theme, '2026-11-10');
    state = await snapshot(page);
    assertPositions(state, 900, 900, 900, 0);
    assert.equal(state.monthlyExpenses, 0, 'bank settlement is not another expense');
    assert.equal(state.monthlyFlow.cashOut, 100);
    await page.screenshot({ path: `${out}/${name}-paid.png` });

    // Failed saves preserve draft values and never increase fixture writes.
    await start(page, ui, theme, '2026-10-28', 'failSave');
    await page.getByRole('button', { name: 'Rimborso multiplo test', exact: true }).click();
    await amount.fill('80');
    await page.getByRole('button', { name: 'Registra rimborso', exact: true }).click();
    await page.getByRole('button', { name: 'Riprova', exact: true }).waitFor();
    assert.equal(await amount.inputValue(), '80');
    assert.equal(await page.locator('#preview-writes').textContent(), '0');
    await page.screenshot({ path: `${out}/${name}-failed-save.png` });
    await start(page, ui, theme, '2026-10-28', 'failSave');
    await routeTo(page, '/settings?section=accounts');
    await page.getByText('Carta di credito · addebito mensile', { exact:true }).waitFor();
    await page.getByRole('button', { name: /Carta test/ }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Carta di credito', exact: true }).isChecked(), true);
    await page.getByLabel('Giorno di addebito', { exact: true }).fill('15');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.getByText('Fixture: rete non disponibile', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Giorno di addebito', { exact: true }).inputValue(), '15');
    await page.screenshot({ path: `${out}/${name}-settings-failed-save.png` });
    assert.equal(await page.evaluate(() => window.__previewServiceWrites.count), 0, 'no remote service writes');
    results.push({ ui, theme, width, status: 'passed', checks: ['purchase-date-statistics', 'deferred-cash', 'readonly-statement', 'selection-multi-refund', '80-proportional', '120-gain', 'receipt-edit-delete', 'single-refund', 'due-day-cash', 'save-failure', 'settings-save-failure'] });
    await page.close();
    console.log('PASS credit cards/refunds', name);
  }
  assert.deepEqual(errors, [], 'browser errors');
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
}
