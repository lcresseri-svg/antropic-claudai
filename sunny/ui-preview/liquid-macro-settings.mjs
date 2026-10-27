import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/macro-definitions';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{for(const ui of (process.env.SUNNY_MACRO_UIS||'2,3').split(','))for(const theme of ['light','dark'])for(const width of process.env.SUNNY_WIDTHS?process.env.SUNNY_WIDTHS.split(',').map(Number):ui==='3'?[320,390,1440]:[390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 const route=async path=>page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
 const save=async()=>{await page.getByRole('button',{name:'Salva',exact:true}).click();await page.getByRole('textbox',{name:'Nome',exact:true}).waitFor({state:'detached'});};
 const detail=()=>ui==='3'?page.locator('.ui-settings-detail'):page;
 await route('/settings?section=gestione');await page.getByRole('heading',{name:'Gestione',exact:true}).waitFor();
 await page.getByRole('button',{name:/Macrocategorie.*Raggruppa/}).click();
 await page.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).click();
 await page.getByRole('heading',{name:'Nuova macrocategoria',exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Macrocategoria',exact:true}).count(),0);
 assert.equal(await page.getByText('Saldo iniziale',{exact:true}).count(),0);
 await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Essenziali');
 await page.locator('.ui-icon-picker').getByRole('button',{name:'🏠',exact:true}).click();
 await page.getByRole('button',{name:'Colore #6FA8DC',exact:true}).click();
 if(ui==='3'){
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Continua a modificare',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Nome',exact:true}).inputValue(),'Essenziali');
 }
 await page.screenshot({path:`${out}/macro-form-ui${ui}-${theme}-${width}.png`});await save();
 await detail().getByRole('button',{name:/Essenziali/}).click();
 await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Casa e vita');await save();
 await detail().getByRole('button',{name:'Indietro',exact:true}).click();
 await page.getByRole('button',{name:/Gestisci categorie/}).click();
 await detail().getByRole('button',{name:/Casa/}).first().click();
 if(ui==='3')assert.equal(await page.locator('.ui-def-type-picker button').evaluateAll(es=>es.some(e=>e.scrollWidth>e.clientWidth)),false);
 const macro=page.getByRole('combobox',{name:'Macrocategoria',exact:true});await macro.selectOption({label:'🏠 Casa e vita'});
 await page.screenshot({path:`${out}/category-assignment-ui${ui}-${theme}-${width}.png`});await save();
 // Creation also offers the existing definitions, never free text.
 await page.getByRole('button',{name:'+ Aggiungi uscita',exact:true}).click();
 await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Bollette test');await macro.selectOption({label:'🏠 Casa e vita'});await save();
 await detail().getByRole('button',{name:/Casa.*Casa e vita/}).first().click();assert.ok(await macro.inputValue());await save();
 await route('/category-spending');const total=await page.locator('.ui31-analysis-value').innerText();await page.getByRole('button',{name:'Macro',exact:true}).click();
 const group=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Casa e vita'})});await group.locator('summary').click();
 assert.ok((await group.locator('summary').innerText()).includes('🏠'));
 const legend=page.getByText('Casa e vita',{exact:true});assert.equal(await legend.locator('..').locator('span').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(111, 168, 220)');
 await page.screenshot({path:`${out}/analysis-ui${ui}-${theme}-${width}.png`});
 await route('/settings?section=macros');await detail().getByRole('button',{name:/Casa e vita/}).click();
 await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Essenziali rinominati');await save();
 await route('/category-spending');await page.getByRole('button',{name:'Macro',exact:true}).click();await page.locator('summary').filter({hasText:'Essenziali rinominati'}).waitFor();
 await route('/settings?section=macros');await detail().getByRole('button',{name:/Essenziali rinominati/}).click();await page.getByRole('button',{name:'Elimina',exact:true}).click();await page.getByRole('button',{name:'Conferma',exact:true}).click();
 await page.getByRole('textbox',{name:'Nome',exact:true}).waitFor({state:'detached'});
 await route('/category-spending');await page.getByRole('button',{name:'Macro',exact:true}).click();assert.equal(await page.locator('.ui31-analysis-value').innerText(),total);
 assert.equal(await page.locator('summary').filter({hasText:'Senza macrocategoria'}).count(),1);
 if(ui==='3'&&width===390){
  await route('/settings?section=accounts');await detail().getByRole('button',{name:/Conto Corrente/}).click();
  await page.getByRole('heading',{name:'Modifica conto',exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:/Escludi dal patrimonio/}).count(),1);
  assert.equal(await page.getByRole('combobox',{name:'Macrocategoria',exact:true}).count(),0);
  await save();
  await route('/settings?section=categories');await detail().getByRole('button',{name:/Azioni \/ ETF/}).click();
  await page.getByRole('heading',{name:'Modifica categoria',exact:true}).waitFor();
  assert.equal(await page.getByText('Capitale già investito',{exact:true}).count(),1);
  assert.equal(await page.locator('input[type="date"]').inputValue(),'2025-01-01');
  assert.equal(await page.getByRole('combobox',{name:'Macrocategoria',exact:true}).count(),0);
  await save();
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 results.push({ui,theme,width,pass:true});await page.close();
}
 const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=light&failSave=1');await page.locator('#preview-writes').waitFor();await page.evaluate(()=>{history.pushState({},'','/settings?section=macros');dispatchEvent(new PopStateEvent('popstate'));});
 await page.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).click();await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Rete test');await page.getByRole('button',{name:'Salva',exact:true}).click();await page.getByRole('alert').filter({hasText:/rete/}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Nome',exact:true}).inputValue(),'Rete test');results.push({saveFailureDraftRetained:true});await page.close();
 const loading=await browser.newPage();await loading.goto('http://127.0.0.1:4177/ui-preview/index.html?ui=3&loadingSettings=1');await loading.locator('#preview-writes').waitFor();await loading.evaluate(()=>{history.pushState({},'','/settings?section=macros');dispatchEvent(new PopStateEvent('popstate'));});await loading.getByRole('status').filter({hasText:'Caricamento macrocategorie'}).waitFor();assert.equal(await loading.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).count(),0);results.push({loadingBlocksCreation:true});await loading.close();
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS macro definitions and assignment',JSON.stringify(results));}finally{await browser.close();}
