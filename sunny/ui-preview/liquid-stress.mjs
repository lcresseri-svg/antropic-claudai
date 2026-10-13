import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-stress';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark'])for(const state of ['empty','edgeCategories']){
const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
for(const route of ['/','/wealth','/budget','/transactions','/category-spending','/account-balance','/income','/settings']){
await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&${state}`);await page.locator('#preview-writes').waitFor();
if(route!=='/')await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);
const titles={'/wealth':'Patrimonio','/budget':'Piano','/transactions':'Movimenti','/category-spending':'Spese per categoria','/account-balance':'Saldo per conto','/income':'Entrate','/settings':'Impostazioni'};
if(titles[route])await page.getByRole('heading',{name:titles[route],exact:true}).first().waitFor();
await page.waitForTimeout(100);await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
const overflow=await page.locator('#app-scroll').evaluate(el=>el.scrollWidth>el.clientWidth+1);
const name=route==='/'?'home':route.slice(1);await page.screenshot({path:`${out}/${name}-${state}-${theme}.png`});results.push({route,theme,state,width:320,textSize:'200% root',overflow,errors:[...errors]});
console.log(overflow?'FAIL overflow':'PASS',route,state,theme);
}
await page.emulateMedia({forcedColors:'active'});await page.screenshot({path:`${out}/forced-colors-${state}-${theme}.png`});await page.close();
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));if(results.some(r=>r.errors.length||r.overflow))process.exitCode=1;
