import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||new URL('./artifacts/credit-cards-refunds/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try {
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&financeCase`);
  const trigger=page.getByRole('button',{name:'Rimborso multiplo test',exact:true});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Rimborso di più spese',exact:true});
  const amount=dialog.getByRole('textbox',{name:'Totale ricevuto',exact:true});
  await amount.fill('80');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page horizontal overflow');
  const dismissers=[()=>dialog.getByRole('button',{name:'Chiudi',exact:true}).click(),()=>page.keyboard.press('Escape'),()=>dialog.getByRole('button',{name:'‹ Indietro',exact:true}).click(),async()=>{
   const box=await dialog.boundingBox(); await page.mouse.click(width>600?box.x/2:2,8);
  }];
  for(let index=0;index<dismissers.length;index++){
   await dialog.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
   const before=await dialog.boundingBox();
   const scroll=await page.locator('#app-scroll').evaluate(el=>el.scrollTop);
   await dismissers[index]();
   const confirm=page.getByRole('alertdialog',{name:'Scartare le modifiche?'});
   await confirm.waitFor();
   const after=await dialog.boundingBox();
   assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1&&Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1,`confirmation preserves editor geometry: ${JSON.stringify({index,before,after})}`);
   assert.equal(await page.locator('#app-scroll').evaluate(el=>el.scrollTop),scroll,'confirmation preserves underlying scroll');
   assert.equal(await amount.inputValue(),'80','draft remains behind confirmation');
   if(index===0)await page.screenshot({path:`${out}/ui3-${theme}-${width}-discard.png`});
   await confirm.getByRole('button',{name:'Continua a modificare',exact:true}).click();
   await confirm.waitFor({state:'detached'});
   assert.equal(await amount.inputValue(),'80');
   assert.ok(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')),`focus stays in editor ${JSON.stringify({index,active:await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,300))})}`);
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Scarta modifiche',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  assert.equal(await page.locator('#preview-writes').textContent(),'0');
  assert.ok(await trigger.evaluate(el=>el===document.activeElement),`focus restored to trigger: ${await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,200))}`);
  assert.deepEqual(errors,[]);
  results.push({theme,width,status:'passed',checks:['X','Escape','Indietro','backdrop','geometry','scroll','draft','focus','no-horizontal-overflow']});
  await page.close();
 }
} finally {await browser.close();await writeFile(`${out}/dismiss-results.json`,JSON.stringify(results,null,2));}
console.log(`${results.length}/4 dismissal scenarios passed`);
