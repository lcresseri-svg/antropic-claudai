import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/macro-categories';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try {
 for(const ui of ['3','2'])for(const theme of ['light','dark'])for(const width of (ui==='3'?[320,390,1440]:[390])) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);await page.locator('#preview-writes').waitFor();
  await page.evaluate(()=>{history.pushState({},'','/category-spending');dispatchEvent(new PopStateEvent('popstate'));});
  const total=await page.locator('.ui31-analysis-value').innerText();
  await page.getByRole('button',{name:'Macro',exact:true}).click();
  assert.equal(await page.getByText('Senza macrocategoria',{exact:true}).count(),2);
  await page.getByRole('button',{name:'Gestisci macro',exact:true}).click();
  const spesa=page.getByRole('combobox',{name:'Macrocategoria di Spesa',exact:true});await spesa.fill('Vita quotidiana');
  await page.getByRole('combobox',{name:'Macrocategoria di Casa',exact:true}).fill('Vita quotidiana');
  if(ui==='3'){
   await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();
   await page.getByRole('button',{name:'Continua a modificare',exact:true}).click();assert.equal(await spesa.inputValue(),'Vita quotidiana');
  }
  await page.getByRole('button',{name:'Salva raggruppamenti',exact:true}).click();await spesa.waitFor({state:'detached'});
  const group=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Vita quotidiana'})});
  await group.locator('summary').click();assert.equal(await group.locator('button').count(),2);
  assert.equal(await page.locator('.ui31-analysis-value').innerText(),total);
  await group.locator('summary').click();assert.equal(await group.getAttribute('open'),null);
  await group.locator('summary').click();await group.getByRole('button').filter({hasText:'Spesa'}).click();
  await page.getByRole('button',{name:'Chiudi',exact:true}).last().click();
  await page.evaluate(()=>{document.getElementById('app-scroll')?.scrollTo(0,0);});
  await page.screenshot({path:`${out}/macro-ui${ui}-${theme}-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  await page.getByRole('button',{name:'Categorie',exact:true}).click();assert.equal(await page.locator('.ui31-analysis-value').innerText(),total);
  assert.deepEqual(errors,[]);results.push({ui,theme,width,pass:true,total});await page.close();
 }
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=light&failSave=1');await page.locator('#preview-writes').waitFor();
 await page.evaluate(()=>{history.pushState({},'','/category-spending');dispatchEvent(new PopStateEvent('popstate'));});
 await page.getByRole('button',{name:'Gestisci macro',exact:true}).click();await page.getByRole('combobox',{name:'Macrocategoria di Casa',exact:true}).fill('Casa e famiglia');
 await page.getByRole('button',{name:'Salva raggruppamenti',exact:true}).click();await page.getByRole('alert').filter({hasText:'Salvataggio non riuscito'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Macrocategoria di Casa',exact:true}).inputValue(),'Casa e famiglia');results.push({saveFailureDraftRetained:true});await page.close();
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
}finally{await browser.close();}
