import { chromium, browserOptions } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.env.SUNNY_EVIDENCE || '/workspace/investment-history';
await mkdir(out, {recursive:true});
const results=[];
const browser=await chromium.launch(browserOptions);
try {
 for (const theme of ['light','dark']) for (const width of [320,390,1440]) for (const short of [false,true]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00Z'));
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}${short?'&shortInvestmentHistory':''}`);
  await page.locator('#preview-writes').waitFor();
  await page.evaluate(()=>{history.pushState({},'', '/investments');dispatchEvent(new PopStateEvent('popstate'));});
  await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();
  const chart=page.getByRole('region',{name:'Storico del capitale versato'});
  await chart.waitFor();
  assert.equal(await chart.getByRole('button',{name:'Tutto',exact:true}).getAttribute('aria-pressed'),'true');
  await chart.getByText('Vedi dati · Capitale versato',{exact:true}).click();
  const rows=chart.locator('tbody tr');
  const fullCount=await rows.count();
  assert.ok(fullCount>=4);
  const first=await rows.first().innerText();
  assert.match(first,short?/1 ott 2026/:/1 gen 2025/);
  const last=await rows.last().innerText();
  for(const label of ['6 mesi','1 anno','Tutto']) {
    await chart.getByRole('button',{name:label,exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await chart.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await rows.last().innerText(),last);
    if(!short&&label!=='Tutto')assert.match(await rows.first().innerText(),label==='6 mesi'?/1 mag 2026/:/1 nov 2025/);
    if(short)assert.equal(await rows.count(),fullCount);
  }
  await chart.getByText('Vedi dati · Capitale versato',{exact:true}).click();
  await chart.scrollIntoViewIfNeeded();
  const overflow=await page.getByRole('dialog').evaluate(el=>el.scrollWidth-el.clientWidth);
  assert.ok(overflow<=1,`dialog overflow ${overflow}`);
  assert.deepEqual(errors,[]);
  const name=`fund-${short?'short':'all'}-${theme}-${width}`;
  await page.screenshot({path:`${out}/${name}.png`});
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  results.push({name,fullCount,first,last,overflow,passed:true});await page.close();
 }
} finally {await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
console.log('PASS',results.length,'fund history views: full/short history, range switching, capital invariance, keyboard, dismissal, overflow');
