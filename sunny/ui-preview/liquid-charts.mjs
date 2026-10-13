import {chromium,browserOptions} from './browser.mjs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-charts';await mkdir(out,{recursive:true});const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 const route=async r=>{await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},r);};
 await route('/income');await page.getByRole('heading',{name:'Entrate',exact:true}).waitFor();await page.locator('[data-chart-bar]').first().waitFor();assert.equal(await page.locator('[data-chart-bar]').count(),12);
 await page.getByText('Vedi dati · Entrate',{exact:true}).click();assert.equal(await page.locator('tbody tr').count(),12);await page.screenshot({path:`${out}/income-${theme}.png`});
 await route('/wealth-history');await page.getByRole('button',{name:'Nascondi Liquidità'}).waitFor();assert.equal(await page.locator('[data-wealth-series]').count(),2);
 await page.getByRole('button',{name:'Nascondi Liquidità'}).click();assert.equal(await page.locator('[data-wealth-series="liq"]').count(),0);
 await page.getByRole('button',{name:'Nascondi Investimenti'}).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-wealth-series]').count(),0);
 await page.screenshot({path:`${out}/wealth-total-${theme}.png`});
 await page.getByRole('button',{name:'Mostra Liquidità'}).click();await page.getByRole('button',{name:'Mostra Investimenti'}).click();assert.equal(await page.locator('[data-wealth-series]').count(),2);
 assert.deepEqual(errors,[]);await page.close();console.log('PASS charts',theme,'monthly income bars/source table, optional wealth series and keyboard');
}}finally{await browser.close();}
