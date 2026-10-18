import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ux-polish';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions);
const ratio=async locator=>locator.evaluate(el=>{
 const rgb=s=>s.match(/[\d.]+/g).map(Number),over=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1))),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 let parents=[];for(let p=el;p;p=p.parentElement)parents.push(p);let bg=[255,255,255];for(const p of parents.reverse())bg=over(rgb(getComputedStyle(p).backgroundColor),bg);
 const a=lum(over(rgb(getComputedStyle(el).getPropertyValue(el.tagName.toLowerCase()==='line'?'stroke':'color')),bg)),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
});
try{for(const theme of ['light','dark'])for(const width of (process.env.SUNNY_WIDTHS||'390').split(',').map(Number)){
 const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const checks=[];const check=async(name,fn)=>{try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}};
 const start=async route=>{await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();if(route!=='/')await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);await page.getByRole('status',{name:'Caricamento',exact:true}).waitFor({state:'hidden'});await page.waitForTimeout(350);};
 await start('/investments');const history=page.locator('[data-portfolio-history]');
 await check('selected period contrast',async()=>assert.ok(await ratio(history.getByRole('button',{name:'Tutto',exact:true}))>=4.5));
 await check('valuation reference line contrast',async()=>assert.ok(await ratio(history.locator('line[stroke-dasharray="5 4"]'))>=3));
 await check('responsive portfolio chart',async()=>{const h=await history.locator('svg').first().evaluate(e=>e.getBoundingClientRect().height);assert.ok(h>=(width>=1024?200:140),String(h));});
 await check('last known valuation labelled',async()=>assert.equal(await history.getByText('Ultimo valore noto',{exact:false}).count(),1));
 await check('period change preserves selected month',async()=>{
  await history.getByRole('button',{name:'6 mesi',exact:true}).click();
  const chart=history.getByRole('group',{name:/Capitale versato/});await chart.focus();await page.keyboard.press('End');
  const selected=await history.getByRole('status').innerText();
  await history.getByRole('button',{name:'Tutto',exact:true}).click();assert.equal(await history.getByRole('status').innerText(),selected);
 });
 await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('button',{name:'+ Versa',exact:true}).click();
 const amount=page.getByRole('dialog').getByRole('textbox',{name:'Importo del versamento',exact:true});
 await check('amount display size',async()=>assert.ok(await amount.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=32));
 await amount.fill('123456,78');await check('amount input retained',async()=>assert.equal(await amount.inputValue(),'123456,78'));
 await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Continua a modificare',exact:true}).click();
 await check('discard preserves draft',async()=>assert.equal(await amount.inputValue(),'123456,78'));
 await page.screenshot({path:`${out}/amount-${theme}-${width}.png`});
 await start('/transactions');await page.getByRole('button',{name:'Filtri',exact:true}).click();const panel=page.getByRole('region',{name:'Opzioni movimenti'});await panel.getByRole('button',{name:'Categoria',exact:true}).focus();await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 await check('Escape restores filter trigger',async()=>assert.equal(await page.getByRole('button',{name:'Filtri',exact:true}).evaluate(e=>e===document.activeElement),true));
 await start('/');
 await check('daily chart large keyboard surface',async()=>{const area=page.getByRole('group',{name:/Spese giornaliere/});assert.equal(await area.count(),1);await area.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');const open=page.getByRole('button',{name:/Apri movimenti.*2/});assert.equal(await open.count(),1);await open.click();await page.waitForURL('**/transactions?*');assert.equal(new URL(page.url()).searchParams.get('date')?.slice(-2),'02');});
 assert.deepEqual(errors,[]);results.push({theme,width,checks});await page.close();
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
for(const r of results)for(const c of r.checks)console.log(c.pass?'PASS':'FAIL',r.theme,r.width,c.name,c.error||'');
if(results.some(r=>r.checks.some(c=>!c.pass)))process.exitCode=1;
