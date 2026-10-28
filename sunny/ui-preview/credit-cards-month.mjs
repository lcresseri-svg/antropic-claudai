import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||new URL('./artifacts/credit-cards-refunds/',import.meta.url).pathname;
await mkdir(out,{recursive:true});const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  for(const [date,month,expected] of [['2026-10-28','2026-10','0,00'],['2026-11-10','2026-11','-100,00']]){
   await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
   await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&financeCase&financeMonth=2026-10&financeDate=${date}`);
   await page.locator('#preview-finance-snapshot').waitFor();
   await page.evaluate(month=>{history.pushState({},'',`/budget?view=overview&month=${month}`);dispatchEvent(new PopStateEvent('popstate'));},month);
   const flow=page.locator('.ui31-flow-chart');await flow.waitFor();
   const actual=(await flow.locator('.ui31-flow-net strong').textContent()).replace('−','-');
   assert.ok(actual.includes(expected),`cash in ${month}: expected ${expected}, got ${actual}`);
   if(month==='2026-11'){
    await flow.getByText('Addebiti carte',{exact:true}).waitFor();
    assert.ok((await flow.locator('dl > div').filter({hasText:'Addebiti carte'}).locator('dd').textContent()).includes('100,00'));
   }else assert.equal(await flow.getByText('Addebiti carte',{exact:true}).count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await flow.scrollIntoViewIfNeeded();
   await page.screenshot({path:`${out}/ui3-${theme}-${width}-month-${month}.png`});
  }
  await page.evaluate(()=>{history.pushState({},'','/budget?view=due&month=2026-11');dispatchEvent(new PopStateEvent('popstate'));});
  await page.locator('.ui31-due').getByText('Addebito carta · Carta test · 2026-10',{exact:true}).waitFor();
  assert.ok((await page.locator('.ui31-due').textContent()).includes('10/11/2026'));
  assert.deepEqual(errors,[]);
  results.push({theme,width,status:'passed',checks:['purchase-statistics-vs-cash','payment-cash-chart','card-payment-due-row','no-horizontal-overflow']});
  await page.close();
 }
}finally{await browser.close();await writeFile(`${out}/month-results.json`,JSON.stringify(results,null,2));}
console.log(`${results.length}/4 monthly cash scenarios passed`);
