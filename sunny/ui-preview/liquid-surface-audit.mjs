import {writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const browser=await chromium.launch(browserOptions),results=[];
const routes=['/','/wealth','/budget','/transactions','/investments','/income','/category-spending','/account-balance','/wealth-history','/settings','/insights','/ai-coach','/wealth-v2','/commitments','/monthly-plan','/forecast-v3','/metrics','/recap/2026-09'];
try {const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
for(const route of routes){
 await page.goto('http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=dark');await page.locator('#preview-writes').waitFor();await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);if(route!=='/'){await page.locator('.liquid-today,.ui-home').waitFor({state:'hidden'});await page.getByRole('status',{name:'Caricamento',exact:true}).waitFor({state:'hidden'});}await page.waitForTimeout(200);
 const panels=await page.locator('#page-content :is(div,section,article,button)').evaluateAll(es=>es.filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>180&&r.height>54&&parseFloat(s.borderTopLeftRadius)>8&&!el.closest('[data-liquid-preserve],.wrapped-shell,[role="dialog"],details:not([open])')&&(s.backgroundColor!=='rgba(0, 0, 0, 0)'||parseFloat(s.borderTopWidth)>0);}).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.trim().slice(0,90)})));
 results.push({route,panels});console.log(route,JSON.stringify(panels));
}}finally{await browser.close();await writeFile(process.env.SUNNY_AUDIT||'/workspace/surface-audit.json',JSON.stringify(results,null,2));}
