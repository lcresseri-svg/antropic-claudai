import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-entry';await mkdir(out,{recursive:true});const report=[];
const browser=await chromium.launch(browserOptions);
try{for(const ui of ['2','3'])for(const theme of ['light','dark']){
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await page.clock.install({time:new Date('2026-12-22T10:00:00Z')});
await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);
const entry=page.locator('.accent-card').filter({has:page.getByRole('button',{name:'Guarda il tuo 2026'})});
await entry.waitFor();await entry.screenshot({path:`${out}/entry-ui${ui}-${theme}.png`,animations:'disabled'});
report.push({ui,theme,styles:await entry.evaluate(el=>[el,...el.querySelectorAll('*')].map(e=>{const s=getComputedStyle(e);return {tag:e.tagName,color:s.color,background:s.background,border:s.border,font:s.font,shadow:s.boxShadow};}))});
await page.getByRole('button',{name:'Più tardi',exact:true}).click();assert.equal(await entry.count(),0);await page.reload();assert.equal(await entry.count(),0);
await page.close();console.log('PASS entry',ui,theme);
}}finally{await browser.close();}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
