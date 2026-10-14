import {chromium,browserOptions} from './browser.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark']){
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?theme=${theme}`);await page.locator('#preview-writes').waitFor();
const route=async r=>page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},r);
for(const [path,title,source] of [['/account-balance','Saldo per conto',/Saldo:/],['/income','Entrate','Analizza entrate'],['/category-spending','Spese per categoria','Analizza uscite']]){
 await route(path);await page.getByRole('heading',{name:title,exact:true}).waitFor();
 await page.getByRole('button',{name:'Periodo precedente',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Periodo successivo',exact:true}).isDisabled(),false);
 await page.getByRole('link',{name:'Oggi',exact:true}).click();await page.locator('.liquid-today').waitFor();
 await page.getByRole('button',{name:source}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Periodo successivo',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Indietro',exact:true}).click();await page.locator('.liquid-today').waitFor();
 await route(path);await page.getByRole('heading',{name:title,exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Periodo successivo',exact:true}).isDisabled(),false,'prior analysis context retained');
 await page.getByRole('link',{name:'Oggi',exact:true}).click();await page.locator('.liquid-today').waitFor();
}
await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?theme=${theme}&manyPriorities`);await page.locator('#preview-writes').waitFor();
const priorities=page.locator('.liquid-priority-list');await priorities.locator('summary').click();
assert.ok(await priorities.getByText('Scadenza test 1',{exact:false}).count()>0);
assert.ok(await priorities.getByText('Scadenza test 2',{exact:false}).count()>0);
await priorities.getByRole('button',{name:'Rivedi pagamenti (1)'}).click();
await priorities.getByText('Negozio test',{exact:true}).waitFor();
const bar=page.locator('[data-chart-bar][role="button"]').first();await bar.focus();await page.keyboard.press('Enter');
await page.getByRole('heading',{name:'Movimenti',exact:true}).waitFor();assert.ok(page.url().includes('date='));
console.log('PASS current summary and previous context',theme);await page.close();
}}finally{await browser.close();}
