import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-open-rows';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);const results=[];
try {for(const width of (process.env.SUNNY_STRESS?[320]:[390,834,1440]))for(const theme of ['light','dark']) {
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 for(const route of ['/investments','/account-balance','/wealth']) {
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}${process.env.SUNNY_STRESS?'&edgeCategories':''}`);await page.locator('#preview-writes').waitFor();
  await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);
  const rows=page.locator('#page-content button.glass-card');await rows.first().waitFor();
  if(process.env.SUNNY_STRESS)await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  for(const row of await rows.all()) {
   const style=await row.evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundColor,top:s.borderTopWidth,left:s.borderLeftWidth,right:s.borderRightWidth,bottom:s.borderBottomWidth};});
   assert.equal(style.radius,'0px',`${route}: rectangular card remains`);assert.equal(style.shadow,'none');assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.top,'1px');assert.equal(style.left,'0px');assert.equal(style.right,'0px');assert.equal(style.bottom,'0px');
  }
  assert.equal(await page.locator('#app-scroll').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  if(route==='/investments')await rows.first().evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:`${out}/${route.slice(1)}-${theme}-${width}.png`});
  if(route==='/investments') {await rows.first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}
  results.push({route,width,theme,rows:await rows.count(),errors:[...errors]});
 }
 assert.deepEqual(errors,[]);await page.close();console.log('PASS',width,theme);
}}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
