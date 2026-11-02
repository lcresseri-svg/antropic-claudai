import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/series-occurrence';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[],errors=[];
try{
 for(const ui of [2,3])for(const theme of ['light','dark'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}&seriesOccurrence`);
  await page.getByRole('button',{name:'Apri occorrenza',exact:true}).click();
  await page.getByText('Questa occorrenza',{exact:true}).waitFor();
  const amount=page.locator('p.text-\\[26px\\]');assert.match(await amount.textContent(),/1,24/);
  await page.getByRole('button',{name:'Modifica occorrenza',exact:true}).click();
  const editor=page.locator('.movement-editor');await editor.waitFor();
  await editor.getByRole('textbox',{name:'Importo',exact:true}).fill('7,50');
  await editor.getByRole('button',{name:'Salva modifiche',exact:true}).click();await editor.waitFor({state:'detached'});
  let rows=JSON.parse(await page.locator('#series-preview-rows').textContent());
  assert.equal(rows.find(t=>t.id==='past').amount,7.5);assert.equal(rows.find(t=>t.id==='sibling').amount,234.33);assert.equal(rows.find(t=>t.id==='template').amount,.74);
  assert.equal(rows.find(t=>t.id==='template').recurring.until,'2026-10-30');
  await page.getByRole('button',{name:'Apri occorrenza',exact:true}).click();await page.getByText('Questa occorrenza',{exact:true}).waitFor();
  assert.match(await amount.textContent(),/7,50/);
  await page.screenshot({path:`${out}/ui${ui}-${theme}-${width}.png`,animations:'disabled'});
  results.push({ui,theme,width,status:'passed',amount:7.5,templateAmount:.74,siblingAmount:234.33});console.log('PASS',ui,theme,width);await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));}
