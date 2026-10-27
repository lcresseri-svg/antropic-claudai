import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/page-headers';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions);
try{for(const ui of ['2','3'])for(const theme of ['light','dark'])for(const width of [320,390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 const ym=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
 const routes=[['/wealth','Patrimonio'],['/investments','Investimenti'],['/insights','Consigli'],['/budget',ui==='3'?'Il tuo mese':'Piano'],['/transactions','Movimenti'],['/income','Entrate'],['/category-spending','Spese per categoria'],['/account-balance','Saldo per conto'],['/wealth-history','Andamento patrimonio'],['/ai-coach','AI Coach'],[`/recap/${ym}`,'Riepilogo mensile'],['/forecast-v3','Previsione V3'],['/wealth-v2','Patrimonio V2'],['/commitments','Impegni'],['/monthly-plan','Piano di'],['/metrics','Metriche']];
 const route=async path=>{await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);};
 const bar=page.locator('header.app-header-settings');
 for(const [path,title] of routes){
  await route(path);await bar.getByRole('heading',{level:1}).filter({hasText:title}).waitFor();
  await page.getByRole('status',{name:'Caricamento',exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.locator('#page-content h1').count(),0,`${path} duplicates heading`);
  assert.equal(await bar.getByRole('button',{name:'Indietro',exact:true}).count(),1);
  assert.equal(await bar.evaluate(el=>el.scrollWidth>el.clientWidth),false,`${path} header overflow`);
  const style=await bar.evaluate(el=>{const s=getComputedStyle(el);return[s.backgroundImage,s.boxShadow,s.backdropFilter];});assert.deepEqual(style,['none','none','none']);
  if(path==='/transactions'){
   if(ui==='2'){await bar.getByRole('button',{name:'Cerca',exact:true}).click();const input=page.getByPlaceholder('Cerca per nome, importo, data, conto…');await input.fill('Spesa');assert.equal(await input.inputValue(),'Spesa');await bar.getByRole('button',{name:'Chiudi la ricerca',exact:true}).click();}
   await bar.getByRole('button',{name:'Seleziona',exact:true}).click();await bar.getByRole('button',{name:'Annulla selezione',exact:true}).click();
  }
  if(path==='/investments'){await bar.getByRole('button',{name:'Menu',exact:true}).click();await bar.getByRole('button',{name:'Gestisci categorie',exact:true}).waitFor();await page.mouse.click(8,300);await bar.getByRole('button',{name:'Gestisci categorie',exact:true}).waitFor({state:'hidden'});}
  if(path==='/budget')assert.ok(await page.getByRole('button',{name:/Modifica piano/}).count()>0);
  if(['/wealth','/transactions','/budget','/investments'].includes(path))await page.screenshot({path:`${out}/${path.slice(1)}-ui${ui}-${theme}-${width}.png`});
 }
 // Native in-app push/back preserves the originating screen, also in UI2.
 await route('/wealth');const historyTrigger=bar.getByRole('button',{name:'Storico ›',exact:true});await historyTrigger.focus();await page.keyboard.press('Enter');await page.waitForURL('**/wealth-history');await bar.getByRole('heading',{name:'Andamento patrimonio',exact:true}).waitFor();await bar.getByRole('button',{name:'Indietro',exact:true}).click();await page.waitForURL('**/wealth');await bar.getByRole('heading',{name:'Patrimonio',exact:true}).waitFor();
 if(ui==='3')await page.waitForFunction(()=>document.activeElement?.textContent==='Storico ›');
 await bar.getByRole('button',{name:ui==='3'?'Profilo e impostazioni':'Menu rapido',exact:true}).click();await bar.getByRole('button',{name:'Impostazioni',exact:true}).waitFor();await page.mouse.click(8,300);await bar.getByRole('button',{name:'Impostazioni',exact:true}).waitFor({state:'hidden'});
 await route('/wrapped/2026');await page.locator('.wrapped-shell').waitFor();assert.equal(await bar.count(),0);
 assert.deepEqual(errors,[]);results.push({ui,theme,width,routes:routes.length,toolbars:true,originBack:true,wrappedExcluded:true,pass:true});await page.close();
}await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS all page headers',JSON.stringify(results));}finally{await browser.close();}
