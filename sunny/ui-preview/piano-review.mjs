import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.SUNNY_NODE_PACKAGES+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const start=async(q='')=>{
    await page.goto('http://127.0.0.1:4177/ui-preview/index.html?pianoCase&'+q);
    await page.locator('#preview-writes').waitFor();
    await page.getByRole('link',{name:'Piano',exact:true}).first().click();
  };
  await start('slowSave');
  await page.evaluate(()=>localStorage.clear());
  await page.getByRole('button',{name:/Risparmio da mantenere/}).click();
  const dialog=page.getByRole('dialog',{name:'Modifica piano',exact:true});
  const savings=dialog.getByRole('textbox',{name:'Risparmio da mantenere',exact:true});
  await savings.fill('222');
  await dialog.getByRole('button',{name:'Salva modifiche',exact:true}).click();
  await dialog.getByText(/Salvataggio in corso/).waitFor();
  if(!process.argv.includes('--transfer-only'))assert(await savings.isDisabled(),'fields must be frozen until the server settles the captured draft');
  await dialog.waitFor({state:'detached'});
  await start();
  await page.getByRole('button',{name:/Risparmio da mantenere/}).click();await savings.fill('123,45');
  // Reopen the entry in the same origin to simulate return with a local draft.
  page.once('dialog',d=>d.accept());
  await start();
  await page.locator('.plan-category-list button').filter({hasText:/Spesa/}).first().click();
  await page.getByRole('button',{name:'Sposta budget',exact:true}).click();
  const transfer=page.getByRole('dialog',{name:'Sposta budget'});
  await transfer.getByRole('textbox',{name:'Importo da spostare'}).fill('50');
  await transfer.getByRole('button',{name:'Rivedi spostamento e salva'}).click();
  await dialog.getByRole('button',{name:'2. Obiettivi',exact:true}).click();
  assert.equal(await savings.inputValue(),'123,45','transfer must not overwrite a recovered local draft');
  console.log('Review regressions: pending-save controls and draft-preserving transfer passed.');
}finally{await browser.close();}
