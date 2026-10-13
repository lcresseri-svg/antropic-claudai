import {chromium,browserOptions} from './browser.mjs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-import';await mkdir(out,{recursive:true});const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark'])for(const fail of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&import${fail?'&failSave':''}`);
 await page.locator('input[type=file]').setInputFiles({name:'sunny-test.csv',mimeType:'text/csv',buffer:Buffer.from('Data,Descrizione,Importo,Tipo,Categoria,Conto\n2026-10-05,Prova importazione,15,uscita,Spesa,Conto Corrente\n')});
 const submit=page.getByRole('button',{name:/Importa 1/});await submit.waitFor();
 await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Continua a modificare'}).click();await submit.click();
 if(fail){await page.getByText(/Importazione non riuscita/).waitFor();assert.equal(await page.locator('#preview-writes').textContent(),'0');assert.equal(await submit.isEnabled(),true);await page.screenshot({path:`${out}/error-${theme}.png`});await page.keyboard.press('Escape');await page.getByRole('button',{name:'Scarta modifiche'}).click();}
 else {await page.getByRole('button',{name:'Chiudi',exact:true}).last().waitFor();assert.equal(await page.locator('#preview-writes').textContent(),'1');await page.screenshot({path:`${out}/done-${theme}.png`});await page.getByRole('button',{name:'Chiudi',exact:true}).last().click();}
 assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('[inert]').count(),0);console.log('PASS import',theme,fail?'failure retains preview':'success one write');await page.close();
}}finally{await browser.close();}
