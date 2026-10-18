import {chromium,browserOptions} from '/workspace/antropic-claudai/sunny/ui-preview/browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='/workspace/uiux-study';await mkdir(out,{recursive:true});const browser=await chromium.launch(browserOptions);
const records=[];
async function inspect(page,name,theme){
 await page.waitForTimeout(350);
 const data=await page.evaluate(()=>{
  const visible=e=>{const s=getComputedStyle(e);return e.getClientRects().length&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[aria-label="Controlli anteprima locale"]');};
  const rgba=s=>{const n=s.match(/[\d.]+/g)?.map(Number);return n&&n.length>=3?[n[0],n[1],n[2],n[3]??1]:null;};
  const over=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
  const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const background=e=>{let chain=[];for(let p=e;p;p=p.parentElement)chain.push(p);let c=[255,255,255,1],uncertain=false;for(const p of chain.reverse()){const s=getComputedStyle(p),n=rgba(s.backgroundColor);if(s.backgroundImage!=='none')uncertain=true;if(n)c=over(n,c);if(n?.[3]===1)uncertain=false;}return {c,uncertain};};
  const texts=[],controls=[];
  for(const e of document.querySelectorAll('#page-content *,[data-ui-dialog] *, .ui3-nav *, .ui3-header *')){
   if(!visible(e))continue;
   const text=[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(' ').trim();
   const s=getComputedStyle(e),r=e.getBoundingClientRect();
   if(text){const bg=background(e),color=rgba(s.color);if(color){const fg=over(color,bg.c),a=luminance(fg),b=luminance(bg.c),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);texts.push({text:text.slice(0,120),tag:e.tagName,cls:e.getAttribute('class'),font:parseFloat(s.fontSize),weight:s.fontWeight,color:s.color,bg:bg.c.slice(0,3),contrast:+contrast.toFixed(2),uncertain:bg.uncertain,svg:!!e.closest('svg'),opacity:s.opacity});}}
   if(e.matches('button,a,input,select,summary,[role="button"]'))controls.push({tag:e.tagName,label:e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder'),width:+r.width.toFixed(1),height:+r.height.toFixed(1)});
  }
  return {texts,controls,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 records.push({name,theme,...data});
}
try{for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const start=async route=>{await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();if(route!=='/')await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);await page.getByRole('status',{name:'Caricamento',exact:true}).waitFor({state:'hidden'});};
 for(const route of ['/','/wealth','/budget','/transactions','/investments','/account-balance','/category-spending','/insights','/settings','/forecast-v3']){await start(route);await inspect(page,route,theme);}
 await start('/investments');await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();await page.getByRole('dialog').waitFor();await inspect(page,'fund-detail',theme);await page.screenshot({path:`${out}/fund-detail-${theme}-390.png`});
 await page.getByRole('dialog').getByRole('button',{name:'+ Versa',exact:true}).click();await inspect(page,'deposit-editor',theme);await page.screenshot({path:`${out}/deposit-editor-${theme}-390.png`});
 await start('/transactions');await page.getByRole('button',{name:'Filtri',exact:true}).click();await inspect(page,'filters',theme);await page.screenshot({path:`${out}/filters-${theme}-390.png`});
 await start('/settings?section=aspetto');await inspect(page,'settings-appearance',theme);await page.screenshot({path:`${out}/settings-appearance-${theme}-390.png`});
 await page.close();
}}finally{await browser.close();}
await writeFile(`${out}/measurements.json`,JSON.stringify(records,null,2));
console.log(JSON.stringify(records.map(r=>({name:r.name,theme:r.theme,texts:r.texts.length,small:r.texts.filter(t=>t.font<12&&!t.svg).length,contrastCandidates:r.texts.filter(t=>!t.uncertain&&t.contrast<(t.font>=24||t.font>=18.66&&+t.weight>=700?3:4.5)).length,targetsUnder24:r.controls.filter(c=>c.width<24||c.height<24).length})),null,2));
