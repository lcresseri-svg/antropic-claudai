import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/definition-pickers';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const ui of (process.env.SUNNY_PICKER_UIS||'2,3').split(','))for(const theme of ['light','dark'])for(const width of (process.env.SUNNY_WIDTHS||'320,390,1440').split(',').map(Number)){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);await page.locator('#preview-writes').waitFor();
  const route=async path=>page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
  await route('/settings?section=macros');await page.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).click();
  const name=page.getByRole('textbox',{name:'Nome',exact:true});await name.fill('Cura personale');
  const moreIcons=page.getByRole('button',{name:'Mostra altre icone',exact:true});
  const moreColors=page.getByRole('button',{name:'Mostra altri colori',exact:true});
  assert.equal(await moreColors.count(),1,'colors must be expandable');
  assert.equal(await moreIcons.getAttribute('aria-expanded'),'false');
  const compactColors=await page.locator('.ui-color-picker button').count();
  await moreColors.click();
  const colors=page.locator('.ui-color-picker button');
  assert.ok(await colors.count()>compactColors);
  const palette=await colors.evaluateAll(es=>es.map(e=>e.getAttribute('aria-label').replace('Colore ','')));
  assert.ok(palette.indexOf('#E08B8B')<palette.indexOf('#E6B95C'));
  assert.ok(palette.indexOf('#E6B95C')<palette.indexOf('#6FA8DC'));
  assert.ok(palette.indexOf('#6FA8DC')<palette.indexOf('#B5A8C8'));
  await page.getByRole('button',{name:'Colore #DB2777',exact:true}).click();
  await page.getByRole('button',{name:'Mostra meno colori',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Colore #DB2777',exact:true}).getAttribute('aria-pressed'),'true');
  await moreIcons.click();
  const icons=page.locator('.ui-icon-picker');
  for(const emoji of ['💅','💇‍♀️','💇‍♂️','👩🏻','👨🏻','🥢','🥡','🧖‍♀️'])assert.equal(await icons.getByRole('button',{name:emoji,exact:true}).count(),1);
  await icons.getByRole('button',{name:'💅',exact:true}).click();
  assert.equal(await moreIcons.getAttribute('aria-expanded'),'false');
  assert.equal(await moreIcons.evaluate(el=>el===document.activeElement),true,'selection collapse keeps keyboard focus');
  assert.equal(await name.inputValue(),'Cura personale');
  await page.getByRole('button',{name:'Salva',exact:true}).click();await name.waitFor({state:'detached'});
  const rows=ui==='3'?page.locator('.ui-settings-detail'):page;
  await rows.getByRole('button',{name:/Cura personale/}).click();
  assert.equal(await page.getByRole('button',{name:'Colore #DB2777',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Mostra altre icone',exact:true}).click();
  assert.equal(await icons.getByRole('button',{name:'💅',exact:true}).getAttribute('aria-pressed'),'true');
  await icons.getByRole('button',{name:'💇‍♂️',exact:true}).click();await page.getByRole('button',{name:'Salva',exact:true}).click();await name.waitFor({state:'detached'});
  await rows.getByRole('button',{name:/Cura personale/}).click();await page.getByRole('button',{name:'Mostra altre icone',exact:true}).click();
  assert.equal(await icons.getByRole('button',{name:'💇‍♂️',exact:true}).getAttribute('aria-pressed'),'true');
  await icons.getByRole('button',{name:'💇‍♀️',exact:true}).click();await page.getByRole('button',{name:'Salva',exact:true}).click();await name.waitFor({state:'detached'});
  // Same shared controls are reachable in accounts and investment categories.
  for(const [path,row] of [['accounts',/Conto Corrente/],['categories',/Azioni \/ ETF/]]){
   await route(`/settings?section=${path}`);await rows.getByRole('button',{name:row}).first().click();
   await page.getByRole('button',{name:'Mostra altri colori',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Colore #DB2777',exact:true}).count(),1);
   await page.getByRole('button',{name:'Mostra meno colori',exact:true}).click();
   if(path==='categories'){
    await page.getByRole('button',{name:'Mostra altre icone',exact:true}).click();
    await icons.getByRole('button',{name:'👩🏻',exact:true}).click();
    await page.getByRole('button',{name:'Mostra altri colori',exact:true}).click();
    await page.screenshot({path:`${out}/palette-ui${ui}-${theme}-${width}.png`});
    await page.getByRole('button',{name:'Mostra meno colori',exact:true}).click();
   }
   await page.getByRole('button',{name:'Salva',exact:true}).click();await name.waitFor({state:'detached'});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.equal(await page.locator('#preview-writes').innerText(),'0');
  results.push({ui,theme,width,expandedChoices:true,selectionSaved:true,focusRetained:true,sharedForms:true,pass:true});await page.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS definition pickers',JSON.stringify(results));
}finally{await browser.close();}
