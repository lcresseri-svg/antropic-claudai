import { createRequire } from 'node:module';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
const require=createRequire((process.env.SUNNY_NODE_PACKAGES||'/workspace/cloud-setup/node_modules')+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:process.env.SUNNY_BROWSER||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-baseline';await mkdir(out,{recursive:true});
const defaultRoutes=['/','/wealth','/budget','/transactions','/investments','/income','/category-spending','/account-balance','/wealth-history','/settings','/insights','/ai-coach','/wealth-v2','/commitments','/monthly-plan','/forecast-v3','/metrics','/recap/2026-09','/wrapped/2026'];
const routes=process.env.SUNNY_ROUTES?JSON.parse(process.env.SUNNY_ROUTES):defaultRoutes;
const results=[];
for(const width of (process.env.SUNNY_MATRIX?'390,768,1440':'390').split(',').map(Number))for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height:width===1440?900:844}});
 await page.clock.install({time:new Date('2026-10-12T10:00:00Z')});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 for(const route of routes){
  console.log('VISIT',width,theme,route);
  const errors=[];const onError=e=>{errors.push(e.message);console.log('PAGEERROR',e.message);};page.on('pageerror',onError);
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);
  await page.locator('#preview-writes').waitFor();
  if(route!=='/')await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);
  await page.waitForTimeout(650);
  const controls=await page.locator('button,a,input,select,summary').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||e.getAttribute('title'),href:e.getAttribute('href'),disabled:e.disabled??false})));
  const name=route==='/'?'home':route.slice(1).replaceAll('/','-');
  await page.screenshot({path:`${out}/${name}-${theme}-${width}.png`});
  results.push({route,theme,width,errors,controls,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  page.off('pageerror',onError);
 }
 await page.close();
}
let combined=results;
if(process.env.SUNNY_ROUTES){try{const old=JSON.parse(await readFile(`${out}/routes.json`,'utf8'));combined=[...old.filter(a=>!results.some(b=>a.route===b.route&&a.theme===b.theme&&a.width===b.width)),...results];}catch{}}
await writeFile(`${out}/routes.json`,JSON.stringify(combined,null,2));await browser.close();
console.log(JSON.stringify(results.map(({route,theme,errors,controls,overflow})=>({route,theme,errors,controls:controls.length,overflow})),null,2));

if(results.some(r=>r.errors.length||r.overflow))process.exitCode=1;
