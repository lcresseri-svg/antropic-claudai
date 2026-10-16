import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/group-bands';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark'])for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 await page.evaluate(()=>{history.pushState({},'','/transactions');dispatchEvent(new PopStateEvent('popstate'));});
 for(const mode of ['mese','conto','categoria']){
  await page.getByRole('button',{name:'Filtri',exact:true}).click();
  await page.getByRole('button',{name:`Per ${mode}`,exact:true}).click();
  const summaries=page.locator('[data-transaction-group-summary]');await summaries.first().waitFor();
  const summary=summaries.first();const toggle=summary.getByRole('button',{name:/Chiudi gruppo/});
  const id=await toggle.getAttribute('aria-controls');const rows=page.locator(`[id="${id}"]`);
  const count=await rows.locator('.ui-ledger-row').count();assert.ok(count>0);
  // Adjacent rows share a divider; no per-day containers or inter-row gaps.
  if(count>1){const boxes=await rows.locator('.ui-ledger-row').evaluateAll(es=>es.slice(0,2).map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})));assert.ok(boxes[1].top-boxes[0].bottom<=2);}
  const bands=await summary.locator('[data-group-summary-band]').count();assert.equal(bands,1);
  await toggle.focus();await page.keyboard.press('Enter');assert.equal(await rows.isVisible(),false);
  assert.equal(await summary.locator('[data-group-summary-band]').count(),bands);
  await summary.getByRole('button',{name:/Espandi gruppo/}).click();assert.equal(await rows.locator('.ui-ledger-row').count(),count);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(await summaries.count()>1){
    await page.getByRole('button',{name:'Filtri',exact:true}).click();
    await page.getByRole('button',{name:'Comprimi tutti i gruppi',exact:true}).click();
    assert.equal(await summaries.getByRole('button',{name:/Chiudi gruppo/}).count(),0);
    await page.getByRole('button',{name:'Filtri',exact:true}).click();
    await page.getByRole('button',{name:'Espandi tutti i gruppi',exact:true}).click();
    assert.equal(await summaries.getByRole('button',{name:/Espandi gruppo/}).count(),0);
  }
  await page.getByRole('button',{name:'Seleziona',exact:true}).click();
  await summary.getByRole('button',{name:'Seleziona gruppo',exact:true}).click();
  assert.match(await page.locator('body').innerText(),new RegExp(`${count} sel\\.`));
  await page.getByRole('button',{name:'Annulla selezione',exact:true}).click();
  await summary.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${mode}-${theme}-${width}.png`});
  results.push({mode,theme,width,count,passed:true});
 }
 assert.deepEqual(errors,[]);await page.close();
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS',results.length,'group views: bands, keyboard collapse, reopening, compact rows, no overflow');
