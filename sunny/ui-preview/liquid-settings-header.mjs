import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/settings-header';await mkdir(out,{recursive:true});
const cases=[['generali','Generali'],['aspetto','Aspetto'],['budget','Piano e budget'],['riserva','Deposito di sicurezza'],['investimenti','Investimenti'],['avanzate','AI abilitata'],['ai','Analisi e AI'],['notifiche','Notifiche'],['gestione','Gestione'],['dati','Dati'],['accounts','Conti'],['categories','Categorie'],['macros','Macrocategorie'],['info','Come funziona'],['versioni','Registro versioni'],['shortcut','Comandi rapidi e Apple Pay']];
const browser=await chromium.launch(browserOptions),results=[];
try{for(const ui of ['2','3'])for(const theme of ['light','dark'])for(const width of ui==='3'?[320,390,834,1440]:[390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 const route=async section=>{await page.evaluate(section=>{history.pushState({},'','/settings'+(section?'?section='+section:''));dispatchEvent(new PopStateEvent('popstate'));},section);};
 const bar=page.locator('header.app-header-settings'),title=bar.getByRole('heading',{level:1});
 await route('');await title.filter({hasText:/^Impostazioni$/}).waitFor();
 assert.equal(await page.locator('#page-content h1').count(),0);
 const styles=await bar.evaluate(el=>{const s=getComputedStyle(el);return{backgroundImage:s.backgroundImage,shadow:s.boxShadow,blur:s.backdropFilter,color:s.backgroundColor};});
 assert.deepEqual([styles.backgroundImage,styles.shadow,styles.blur],['none','none','none']);assert.ok(!styles.color.includes('rgba'));
 await page.screenshot({path:`${out}/root-ui${ui}-${theme}-${width}.png`});
 for(const [section,label] of cases){
  await route(section);await title.filter({hasText:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).waitFor();
  assert.equal(await page.locator('#page-content h1').count(),0);
  if(section==='accounts'||section==='categories'){
   await bar.getByRole('button',{name:'Riordina',exact:true}).click();await bar.getByRole('button',{name:'Fine',exact:true}).click();
  }
  if(section==='categories')await page.screenshot({path:`${out}/categories-ui${ui}-${theme}-${width}.png`});
  const y=(await bar.boundingBox()).y;await page.locator('#app-scroll').evaluate(el=>el.scrollTop=300);assert.equal((await bar.boundingBox()).y,y);
  await bar.getByRole('button',{name:'Indietro',exact:true}).click();
  const parent=['accounts','categories','macros'].includes(section)?'Gestione':'Impostazioni';
  await title.filter({hasText:new RegExp('^'+parent+'$')}).waitFor();
 }
 await route('');await title.filter({hasText:/^Impostazioni$/}).waitFor();
 await bar.getByRole('button',{name:'Indietro',exact:true}).click();await page.waitForURL(url=>url.pathname==='/');
 await page.locator('header.app-header-settings').waitFor({state:'detached'});
 assert.equal(await page.locator('header.app-header-settings').count(),0);
 const home=page.locator('header.app-header');const flat=await home.evaluate(el=>({background:getComputedStyle(el).backgroundImage,shadow:getComputedStyle(el).boxShadow,blur:getComputedStyle(el).backdropFilter}));assert.deepEqual(flat,{background:'none',shadow:'none',blur:'none'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 results.push({ui,theme,width,sections:cases.length+1,parents:true,noDuplicateHeading:true,toolbar:true,flatHeader:true,resetOnExit:true});await page.close();
}await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS contextual settings header',JSON.stringify(results));}finally{await browser.close();}
