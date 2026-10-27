import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out=process.env.SUNNY_EVIDENCE||'/workspace/investment-macros';
await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
const euros=text=>Number(text.replace(/[^\d,−-]/g,'').replace(',','.').replace('−','-'));
try{
 for(const ui of (process.env.SUNNY_MACRO_UIS||'2,3').split(','))for(const theme of ['light','dark'])for(const width of (process.env.SUNNY_WIDTHS||'320,390,1440').split(',').map(Number)){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}&investmentMacros=1`);
  await page.locator('#preview-writes').waitFor();
  const route=async path=>page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
  const save=async()=>{await page.getByRole('button',{name:'Salva',exact:true}).click();await page.getByRole('textbox',{name:'Nome',exact:true}).waitFor({state:'detached'});};
  const detail=()=>ui==='3'?page.locator('.ui-settings-detail'):page;
  const macro=()=>page.getByRole('combobox',{name:'Macrocategoria',exact:true});
  const name='Orizzonte futuro';
  await route('/investments');await page.getByRole('group',{name:'Raggruppa investimenti'}).waitFor();
  const hero=page.locator('.ui31-analysis-hero .balance-num').first(),total=await hero.innerText();
  assert.equal(euros(total),10975);
  await page.getByRole('button',{name:'Macro',exact:true}).click();
  const positionList=page.locator('.ui31-position-list');
  const groupButtons=positionList.locator('button[aria-expanded]');
  assert.equal(await groupButtons.count(),3);
  assert.equal((await groupButtons.locator('.balance-num').allTextContents()).reduce((sum,value)=>sum+euros(value),0),10975);
  const growth=groupButtons.filter({hasText:'Crescita e obiettivi di lungo periodo'});
  await growth.click();
  await page.getByRole('button',{name:'Apri dettaglio di Azioni / ETF',exact:true}).click();
  const investmentDetail=page.getByRole('dialog',{name:ui==='3'?'Dettaglio investimento':'Dettaglio investimento Azioni / ETF',exact:true});
  await investmentDetail.waitFor();
  for(const action of ['+ Versa','↓ Disinvesti','✎ Controvalore'])assert.equal(await investmentDetail.getByRole('button',{name:action,exact:true}).count(),1);
  await page.keyboard.press('Escape');await investmentDetail.waitFor({state:'hidden'});
  await page.screenshot({path:`${out}/groups-ui${ui}-${theme}-${width}.png`});
  assert.equal(await hero.innerText(),total);
  assert.equal(await positionList.getByText('Investimento archiviato',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

  // Real shared definition form: identical names can exist in the two scopes.
  await route('/settings?section=macros');
  for(const kind of ['Spese','Investimenti']){
   await page.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).click();
   await page.locator('.ui-def-type-picker').getByRole('button',{name:kind,exact:true}).click();
   await page.getByRole('textbox',{name:'Nome',exact:true}).fill(name);
   assert.equal(await macro().count(),0);
   assert.equal(await page.getByText('Saldo iniziale',{exact:true}).count(),0);
   await save();
  }
  await route('/settings?section=categories');
  await detail().getByRole('button',{name:/Azioni \/ ETF/}).click();
  const opening=await page.locator('input[type="number"]').first().inputValue();
  const subscription=await page.locator('input[type="date"]').inputValue();
  assert.equal(await macro().locator('option').filter({hasText:name}).count(),1);
  assert.equal(await macro().locator('option').filter({hasText:'Casa e vita'}).count(),0);
  await macro().selectOption({label:`🏷️ ${name}`});await save();
  await detail().getByRole('button',{name:/Azioni \/ ETF/}).click();
  assert.equal(await page.locator('input[type="number"]').first().inputValue(),opening);
  assert.equal(await page.locator('input[type="date"]').inputValue(),subscription);
  assert.ok(await macro().inputValue());await save();
  await page.getByRole('button',{name:'+ Aggiungi investimento',exact:true}).click();
  await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Posizione nuova');
  await macro().selectOption({label:`🏷️ ${name}`});await save();
  await route('/investments');await page.getByRole('button',{name:'Macro',exact:true}).click();
  await positionList.locator('button[aria-expanded]').filter({hasText:name}).click();
  assert.equal(await page.getByRole('button',{name:'Apri dettaglio di Posizione nuova',exact:true}).count(),1);
  assert.equal(await hero.innerText(),total);
  await page.screenshot({path:`${out}/assignment-ui${ui}-${theme}-${width}.png`});
  assert.deepEqual(errors,[]);
  assert.equal(await page.locator('#preview-writes').innerText(),'0');
  results.push({ui,theme,width,groupsMatchPortfolio:true,detailsRetained:true,scopeIsolation:true,categoryCreation:true,financialFieldsPreserved:true});
  await page.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
 console.log('PASS investment macro workflow',JSON.stringify(results));
}finally{await browser.close();}
