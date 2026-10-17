import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/filter-panel';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark'])for(const width of [320,390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&allMovementTypes`);await page.locator('#preview-writes').waitFor();
 await page.evaluate(()=>{history.pushState({},'','/transactions');dispatchEvent(new PopStateEvent('popstate'));});
 await page.getByRole('button',{name:'Filtri',exact:true}).click();
 const panel=page.getByRole('region',{name:'Opzioni movimenti'});await panel.waitFor();
 const metrics=await panel.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,bottom:r.bottom,overflow:el.scrollWidth-el.clientWidth};});
 assert.ok(metrics.width>=280);assert.ok(metrics.left>=0&&metrics.right<=width+1);assert.ok(metrics.overflow<=1);assert.ok(metrics.bottom<= (width<768?800:876));
 const type=panel.getByRole('button',{name:'Tipo movimento',exact:true});
 assert.equal(await type.evaluate(el=>getComputedStyle(el).fontSize),'16px');
 const height=await type.evaluate(el=>el.getBoundingClientRect().height);assert.ok(height>=44);
 await page.waitForTimeout(350);
 await page.screenshot({path:`${out}/filters-${theme}-${width}.png`});
 await type.focus();await page.keyboard.press('Enter');await panel.waitFor({state:'hidden'});
 const summaries=page.locator('[data-transaction-group-summary]');assert.equal(await summaries.count(),5);
 for(const label of ['Uscita','Entrata','Investimento','Movimento','Storno']){
  const toggle=page.getByRole('button',{name:`Chiudi gruppo ${label}`,exact:true});
  const id=await toggle.getAttribute('aria-controls');const rows=page.locator(`[id="${id}"]`);
  assert.ok(await rows.locator('.ui-ledger-row').count()>0);
  if(label==='Movimento'||label==='Storno')assert.equal(await rows.locator('.ui-ledger-row').count(),1);
  await toggle.click();assert.equal(await rows.isVisible(),false);
  await page.getByRole('button',{name:`Espandi gruppo ${label}`,exact:true}).click();assert.equal(await rows.isVisible(),true);
 }
 await page.getByRole('button',{name:'Filtri',exact:true}).click();await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 results.push({theme,width,...metrics,passed:true});await page.close();
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS',results.length,'filter panels, 5 movement types, keyboard, collapse, viewport bounds');
