import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/macro-settings';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{for(const ui of ['2','3'])for(const theme of ['light','dark'])for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 const route=async path=>page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
 await route('/settings');await page.getByRole('textbox',{name:'Cerca nelle impostazioni'}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Macrocategorie.*Raggruppa/}).count(),0);
 await page.getByRole('button',{name:/Conti e categorie.*Saldi/}).click();
 await page.getByRole('heading',{name:'Gestione',exact:true}).waitFor();
 const entry=page.getByRole('button',{name:/Macrocategorie.*Raggruppa/});await entry.click();
 const input=page.getByRole('combobox',{name:'Macrocategoria di Casa',exact:true});await input.fill('Essenziali');
 if(ui==='3'){
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Continua a modificare',exact:true}).click();assert.equal(await input.inputValue(),'Essenziali');
 }
 await page.getByRole('button',{name:'Salva raggruppamenti',exact:true}).click();await input.waitFor({state:'detached'});
 if(ui==='3')assert.equal(await entry.evaluate(e=>e===document.activeElement),true);
 await page.screenshot({path:`${out}/settings-ui${ui}-${theme}-${width}.png`});
 await route('/category-spending');await page.getByRole('button',{name:'Macro',exact:true}).click();await page.locator('summary').filter({hasText:'Essenziali'}).waitFor();
 await route('/settings?section=gestione');await page.getByRole('heading',{name:'Gestione',exact:true}).waitFor();
 await (ui==='3'?page.locator('.ui-settings-detail'):page).getByRole('button',{name:/Macrocategorie.*Raggruppa/}).click();assert.equal(await input.inputValue(),'Essenziali');
 await page.getByRole('button',{name:'Chiudi',exact:true}).last().click();await input.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 results.push({ui,theme,width,pass:true});await page.close();
}await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS macro settings',JSON.stringify(results));}finally{await browser.close();}
