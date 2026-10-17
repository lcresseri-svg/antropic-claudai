import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/portfolio-history';await mkdir(out,{recursive:true});const results=[];const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark'])for(const width of [320,390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-17T12:00:00Z'));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}${process.env.SUNNY_INVALID_DATE?'&invalidPortfolioDate':''}`);await page.locator('#preview-writes').waitFor();
 await page.evaluate(()=>{history.pushState({},'','/investments');dispatchEvent(new PopStateEvent('popstate'));});
 const chart=page.locator('[data-portfolio-history]');await chart.waitFor();
 assert.equal(await chart.getByRole('button',{name:'Tutto',exact:true}).getAttribute('aria-pressed'),'true');
 await chart.getByText('Vedi dati · Capitale investito',{exact:true}).click();
 const rows=chart.locator('tbody tr');assert.equal(await rows.count(),22);assert.match(await rows.first().innerText(),/2025-01/);
 const last=await rows.last().innerText();
 for(const [label,n] of [['6 mesi',6],['1 anno',12],['Tutto',22]]){
  await chart.getByRole('button',{name:label,exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await rows.count(),n);assert.equal(await rows.last().innerText(),last);
 }
 await chart.getByText('Vedi dati · Capitale investito',{exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 await page.waitForTimeout(350);await page.screenshot({path:`${out}/portfolio-${theme}-${width}.png`});
 results.push({theme,width,months:22,last,passed:true});await page.close();
}}finally{await browser.close();}await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS six portfolio views, full history, periods, source data, keyboard, no overflow');
