import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/density-controls';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);const results=[];
try {for(const width of [320,390,834,1440])for(const theme of ['light','dark']) {
 const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 const row=page.locator('.liquid-spending-row').first();const height=await row.evaluate(el=>el.getBoundingClientRect().height);
 assert.ok(height>=44&&height<=76,`category row ${height}`);
 await page.evaluate(()=>{history.pushState({},'','/settings');dispatchEvent(new PopStateEvent('popstate'));});
 await page.locator('.ui-settings-row').first().waitFor();
 assert.ok(await page.locator('.ui-settings-caption').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=13));
 await page.screenshot({path:`${out}/settings-${theme}-${width}.png`});
 await page.evaluate(()=>{history.pushState({},'','/settings?section=accounts');dispatchEvent(new PopStateEvent('popstate'));});
 await page.getByRole('button',{name:'+ Aggiungi conto',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 const fields=dialog.locator('input:not([type="checkbox"]):not([type="range"]),select,textarea');
 for(const field of await fields.all())assert.ok(await field.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'input must not trigger iOS text zoom');
 const bounds=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));
 const icons=dialog.locator('.ui-icon-picker button');assert.ok(await icons.count()>0);
 for(const icon of await icons.all())assert.ok(await icon.evaluate(el=>el.getBoundingClientRect().width>=44),'icon touch target');
 await page.screenshot({path:`${out}/account-editor-${theme}-${width}.png`});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
 results.push({width,theme,categoryRowHeight:height,dialog:bounds,errors});console.log('PASS',width,theme,height);await page.close();
}}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
