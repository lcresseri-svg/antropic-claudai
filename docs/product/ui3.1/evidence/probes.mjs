import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire((process.env.SUNNY_NODE_PACKAGES||'/workspace/cloud-setup/node_modules')+'/package.json');
const {chromium}=require('playwright');
const out=process.env.SUNNY_UI31_EVIDENCE||'/workspace/scratch/sunny-ui31-research/probes';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.SUNNY_BROWSER||'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
async function setup(theme='light',params='',width=390,route='/'){
 const p=await browser.newPage({viewport:{width,height:844}});p.setDefaultTimeout(12000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-10-12T10:00:00Z')});
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await p.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&${params}`);
 if(!params.includes('onboarding'))await p.locator('#preview-writes').waitFor();
 if(route!=='/'){
 await p.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);
 await p.locator('main h1').waitFor();
 }
 await p.waitForTimeout(300);return {p,errors};
}
async function probe(name,fn){try{await fn();}catch(e){results.push({name,error:e.message});}await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
for(const theme of ['light','dark']){
 await probe('home-information-'+theme,async()=>{
 const {p,errors}=await setup(theme);const hero=p.locator('.liquid-balance-overview');
 const before=await hero.innerText();await p.getByRole('button',{name:'Informazioni sul saldo',exact:true}).click();
 const detail=await p.getByRole('dialog').innerText();await p.screenshot({path:`${out}/balance-info-${theme}.png`});
 results.push({name:'home-information-'+theme,before,detail,errors});await p.close();
 });
 await probe('priorities-'+theme,async()=>{
 const {p,errors}=await setup(theme,'manyPriorities');const panel=p.locator('.liquid-today-priority');
 const before=await panel.innerText();const detail=p.locator('.liquid-priority-list');
 const isOpen=await detail.getAttribute('open');await p.screenshot({path:`${out}/priorities-closed-${theme}.png`});
 await detail.locator('summary').click();const after=await panel.innerText();await p.screenshot({path:`${out}/priorities-open-${theme}.png`});
 results.push({name:'priorities-'+theme,before,isOpen,after,errors});await p.close();
 });
 await probe('filter-and-search-'+theme,async()=>{
 const {p,errors}=await setup(theme,'',390,'/transactions?cat=ristoranti&from=2026-10-01&to=2026-10-31');
 const filter=p.getByRole('button',{name:'Filtri',exact:true});const box=await filter.boundingBox();
 await p.getByRole('button',{name:'Cerca',exact:true}).click();const input=p.getByPlaceholder('Cerca per nome, importo, data, conto…');await input.fill('Caffè');
 const before={h1:await p.locator('main h1').count(),search:await input.inputValue(),url:p.url()};
 await p.screenshot({path:`${out}/search-filtered-${theme}.png`});
 const chip=p.locator('button').filter({hasText:'Ristoranti'}).filter({has:p.locator('svg')});
 await chip.last().click();await p.waitForTimeout(200);
 const after={h1:await p.locator('main h1').count(),inputs:await p.getByPlaceholder('Cerca per nome, importo, data, conto…').count(),url:p.url(),main:(await p.locator('main').innerText()).slice(0,330)};
 results.push({name:'filter-and-search-'+theme,filterBox:box,viewport:390,before,after,errors});await p.close();
 });
 await probe('editor-'+theme,async()=>{
 const {p,errors}=await setup(theme,'editor');const input=p.getByRole('textbox',{name:'Importo',exact:true});await input.fill('24,90');
 await p.getByRole('button',{name:'Tocca per scrivere la descrizione',exact:true}).click();
 await p.getByRole('textbox',{name:'Descrizione facoltativa',exact:true}).fill('Spesa di esempio');
 const form=await p.getByRole('dialog').innerText();const amountStyle=await input.evaluate(el=>({fontSize:getComputedStyle(el).fontSize,inputMode:el.inputMode}));
 await p.screenshot({path:`${out}/editor-${theme}.png`});results.push({name:'editor-'+theme,form,amountStyle,writes:await p.locator('#preview-writes').innerText(),errors});await p.close();
 });
}
for(const width of [320,390,1440])await probe('filter-reach-'+width,async()=>{
 const {p,errors}=await setup('light','',width,'/transactions');const b=await p.getByRole('button',{name:'Filtri',exact:true}).boundingBox();
 const parent=await p.getByRole('button',{name:'Filtri',exact:true}).evaluate(el=>({parentWidth:el.parentElement.clientWidth,parentScrollWidth:el.parentElement.scrollWidth,overflow:getComputedStyle(el.parentElement).overflowX}));
 results.push({name:'filter-reach-'+width,width,box:b,parent,initialFullyVisible:b.x>=0&&b.x+b.width<=width,errors});await p.close();
});
for(const [name,params,route] of [['empty','empty','/'],['features-off','noAi&noInvest','/wealth'],['normal-user','user=normal','/'],['plan-error','loadError','/budget'],['onboarding','onboarding','/']])await probe(name,async()=>{
 const {p,errors}=await setup('light',params,390,route);await p.screenshot({path:`${out}/${name}.png`});
 results.push({name,ui:await p.locator('[data-ui-version]').first().getAttribute('data-ui-version').catch(()=>null),text:(await p.locator('body').innerText()).slice(0,2400),errors});await p.close();
});
await browser.close();console.log(JSON.stringify(results.map(r=>({name:r.name,error:r.error,errors:r.errors})),null,2));
if(results.some(r=>r.error||r.errors?.length))process.exitCode=1;
