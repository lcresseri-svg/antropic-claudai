import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-safe-area';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark'])for(const insets of [[0,0],[59,34]]){
 const page=await browser.newPage({viewport:{width:393,height:852},reducedMotion:'reduce'});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 for(const [route,label,name] of [['/category-spending',/Casa/,'category'],['/account-balance',/Conto Corrente/,'account']]){
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();
  // Chromium desktop has zero env() insets. Reproduce the computed overlay
  // padding from an iPhone, without changing the dialog sizing under test.
  await page.addStyleTag({content:`html[data-ui-version="3.0"] .ui-dialog-overlay {padding-top:${Math.max(12,insets[0])}px;padding-bottom:${Math.max(12,insets[1])}px}`});
  await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);
  await page.locator('#page-content').getByRole('button',{name:label}).first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  const bounds=await dialog.evaluate(el=>{const p=el.parentElement,s=getComputedStyle(p),r=p.getBoundingClientRect(),d=el.getBoundingClientRect();return {top:d.top,bottom:d.bottom,safeTop:r.top+parseFloat(s.paddingTop),safeBottom:r.bottom-parseFloat(s.paddingBottom)};});
  assert.ok(bounds.top>=bounds.safeTop-1,`${name} ${theme}: top clipped ${JSON.stringify(bounds)}`);
  assert.ok(bounds.bottom<=bounds.safeBottom+1,`${name} ${theme}: bottom clipped`);
  await dialog.getByRole('button',{name:'‹ Indietro',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('[inert]').count(),0);
  console.log('PASS',theme,insets,name,bounds);
  if(insets[0]){await page.locator('#page-content').getByRole('button',{name:label}).first().click();await dialog.waitFor();await page.screenshot({path:`${out}/${name}-${theme}.png`});await page.keyboard.press('Escape');}
 }
 await page.close();
}}finally{await browser.close();}
