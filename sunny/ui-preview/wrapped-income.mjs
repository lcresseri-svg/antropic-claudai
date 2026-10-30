import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||new URL('./artifacts/wrapped-income/',import.meta.url).pathname;
await mkdir(out,{recursive:true});const browser=await chromium.launch(browserOptions),results=[],errors=[];
const cases=[...[320,390,1440].flatMap(width=>['light','dark'].map(theme=>({ui:3,width,theme,mode:'growth'}))),...['light','dark'].map(theme=>({ui:2,width:390,theme,mode:'growth'})),...['decline','flat','noHistory','partial','planned','growthPlanned','large'].flatMap(mode=>['light','dark'].map(theme=>({ui:3,width:mode==='large'?320:390,theme,mode})))];
try{
for(const scenario of cases){
 const {ui,width,theme,mode}=scenario,name=`ui${ui}-${theme}-${width}-${mode}`;
 const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}&wrappedIncome=${mode}`);
 await page.locator('#preview-writes').waitFor();
 await page.evaluate(()=>{history.pushState({},'','/wrapped/2026');dispatchEvent(new PopStateEvent('popstate'));});
 const shell=page.locator('.wrapped-shell');await shell.waitFor();let incomeSeen=false,summarySeen=false;
 for(let index=0;index<25;index++){
  await page.clock.runFor(400);
  assert.ok(await shell.evaluate(el=>el.scrollWidth<=el.clientWidth),'no shell overflow');
  if(await page.getByRole('heading',{name:'Tutto in una schermata',exact:true}).count()){
   summarySeen=true;const expected=['growth','growthPlanned','large'].includes(mode);
   assert.equal((await shell.getByText('Una buona notizia',{exact:true}).count())>0,expected);
   if(expected)await page.screenshot({path:`${out}/${name}-summary.png`,animations:'disabled'});
   break;
  }
  const income=await shell.getByText(mode==='planned'?'Entrate in programma':'Entrate incassate',{exact:true}).count();
  if(income){
   incomeSeen=true;const positive=['growth','growthPlanned','large'].includes(mode);
   assert.equal((await shell.getByText('Beh dai: quest’anno sono entrati più soldi.',{exact:true}).count())>0,positive);
   if(mode==='planned')await shell.getByText('Sono in programma, non ancora in tasca.',{exact:true}).waitFor();
   if(mode==='growthPlanned')assert.ok((await shell.textContent()).includes('non ancora incassati'));
   const content=shell.locator('.overflow-y-auto');assert.ok(await content.evaluate(el=>el.scrollWidth<=el.clientWidth),'income story fits content width');
   await page.screenshot({path:`${out}/${name}-income.png`,animations:'disabled'});
   if(mode==='growth'&&ui===3&&width===390){
    await page.clock.runFor(15000);await shell.getByText('Categoria numero uno',{exact:true}).waitFor();continue;
   }
  }
  await page.mouse.click(Math.min(width-50,width/2+150),500);
 }
 assert.ok(incomeSeen&&summarySeen,'income and summary reachable');
 await shell.getByRole('button',{name:/Imposta l.obiettivo/}).click();await page.clock.runFor(400);
 await shell.getByRole('button',{name:'Aggiungi 50 euro',exact:true}).click();await shell.getByRole('button',{name:'Togli 50 euro',exact:true}).click();
 await shell.getByRole('button',{name:'Chiudi',exact:true}).click();await shell.waitFor({state:'detached'});
 assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('light')),theme==='light');
 results.push({...scenario,status:'passed',checks:['income-copy','actual-vs-planned','valid-comparison','width','summary','navigation','goal','close']});await page.close();console.log('PASS',name);
}
assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));}
