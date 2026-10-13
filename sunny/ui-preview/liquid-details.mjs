import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-details';await mkdir(out,{recursive:true});const inventory=[];
const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark']){
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
const start=async(route,extra='')=>{await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&${extra}`);await page.locator('#preview-writes').waitFor();await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);};
const capture=async name=>{await page.screenshot({path:`${out}/${name}-${theme}.png`});inventory.push({name,theme,controls:await page.locator('button,a,input,select,summary').evaluateAll(els=>els.filter(e=>e.getClientRects().length&&!e.closest('[aria-label="Controlli anteprima locale"]')).map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder'),disabled:e.disabled??false}))) });};
for(const [route,label,name,param] of [['/category-spending',/Casa/,'category','cat'],['/account-balance',/Conto Corrente/,'account','account']]){
await start(route);await page.locator('#page-content').getByRole('button',{name:label}).first().click();await page.getByRole('dialog').waitFor();
await page.getByRole('dialog').getByText(/Vedi dati/).click();await capture(name);
await page.getByRole('dialog').getByRole('button',{name:/Vedi tutti i movimenti/}).click();
await page.waitForURL('**/transactions?*');const q=new URL(page.url()).searchParams;assert.ok(q.get(param));assert.ok(q.get('from'));assert.ok(q.get('to'));await page.getByRole('button',{name:'Azzera periodo'}).waitFor();
await capture(name+'-movements');
}
await start('/wealth-history');const chart=page.getByRole('group',{name:/Andamento patrimonio/});await chart.focus();await page.keyboard.press('End');
await page.getByRole('button',{name:'Mese',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);await chart.focus();await page.keyboard.press('End');
await page.getByText('Vedi dati · Patrimonio',{exact:true}).click();await capture('wealth-history-data');
await start('/investments');await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();await page.getByRole('dialog').waitFor();await capture('investment');
for(const [action,name] of [['✎ Controvalore','value'],['+ Versa','deposit'],['↓ Disinvesti','withdraw']]){
await page.getByRole('dialog').getByRole('button',{name:action,exact:true}).click();await capture(name);await page.getByRole('button',{name:'‹ Indietro',exact:true}).click();}
await page.getByRole('dialog').getByRole('button',{name:'Chiudi',exact:true}).click();
await start('/investments','failSave');await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();
await page.getByRole('dialog').getByRole('button',{name:'✎ Controvalore',exact:true}).click();
const value=page.getByRole('dialog').locator('input').first();await value.fill('12345');
await page.getByRole('button',{name:'Salva controvalore',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await value.inputValue(),'12345');
await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Scarta modifiche'}).click();
for(const section of ['generali','gestione','accounts','categories','dati','info','versioni','investimenti','aspetto','budget','ai','notifiche','avanzate','riserva']){
 await start('/settings?section='+section);await page.getByRole('heading').first().waitFor();await page.waitForTimeout(120);await capture('settings-'+section);
}
assert.deepEqual(errors,[]);console.log('PASS details',theme,': category/account context, wealth keyboard period change, investment hierarchy, settings sections');await page.close();
}}finally{await browser.close();}await writeFile(`${out}/controls.json`,JSON.stringify(inventory,null,2));
