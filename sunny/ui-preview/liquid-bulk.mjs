import {chromium,browserOptions} from './browser.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch(browserOptions);
try{
const page=await browser.newPage();
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await page.goto('http://127.0.0.1:4177/ui-preview/index.html?ui=3&failBulk');
await page.locator('#preview-writes').waitFor();
await page.getByRole('link',{name:'Movimenti',exact:true}).click();
await page.getByRole('button',{name:'Seleziona',exact:true}).click();
await page.getByRole('button',{name:'Seleziona il giorno',exact:true}).first().click();
await page.getByRole('button',{name:'Elimina',exact:true}).click();
await page.getByRole('button',{name:/Conferma \(/}).click();
await page.getByRole('alert').waitFor({timeout:3000});
assert.equal(await page.getByRole('button',{name:'Annulla selezione',exact:true}).count(),1,'failed delete retains selection');
assert.equal(await page.locator('#preview-writes').textContent(),'0');
console.log('PASS bulk failure preserves selection');
}finally{await browser.close();}
