import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/emoji-catalog';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const ui of (process.env.SUNNY_CATALOG_UIS||'2,3').split(','))for(const theme of ['light','dark'])for(const width of (process.env.SUNNY_WIDTHS||'320,390,1440').split(',').map(Number)){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const go=async path=>page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`);await page.locator('#preview-writes').waitFor();
  await go('/settings?section=gestione');await page.getByRole('heading',{name:'Gestione',exact:true}).waitFor();
  const entry=page.getByRole('button',{name:/Catalogo emoji \(admin\)/});assert.equal(await entry.count(),1,'admin catalog entry is available');await entry.click();
  const input=page.getByRole('textbox',{name:'Nuova emoji',exact:true}),add=page.getByRole('button',{name:'Aggiungi emoji',exact:true});await input.waitFor();
  await page.getByRole('status').filter({hasText:'Caricamento emoji aggiunte'}).waitFor({state:'hidden'});
  for(const [value,reason] of [['testo','emoji'],['😀🥳','emoji'],['😀‍😀','emoji'],['💅','già']]){
   await input.fill(value);await add.click();await page.getByRole('alert').filter({hasText:reason}).waitFor();assert.equal(await input.inputValue(),value);
  }
  await input.fill('🪷');await add.click();await page.getByRole('status').filter({hasText:'disponibile a tutti'}).waitFor();
  assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('.emoji-catalog-added [role="listitem"]').filter({hasText:'🪷'}).count(),1);
  await page.screenshot({path:`${out}/catalog-ui${ui}-${theme}-${width}.png`});
  await page.locator('header.app-header').getByRole('button',{name:'Indietro',exact:true}).click();await page.locator('header.app-header').getByRole('heading',{name:'Gestione',exact:true}).waitFor();
  await page.getByRole('button',{name:'Utente normale test',exact:true}).click();
  await go('/settings?section=gestione');await page.getByRole('heading',{name:'Gestione',exact:true}).waitFor();assert.equal(await entry.count(),0);
  await go('/settings?section=emoji');await page.locator('header.app-header').getByRole('heading',{name:'Impostazioni',exact:true}).waitFor();assert.equal(await input.count(),0);
  await go('/settings?section=macros');await page.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).click();
  const name=page.getByRole('textbox',{name:'Nome',exact:true});await name.fill('Emoji condivisa');await page.getByRole('button',{name:'Mostra altre icone',exact:true}).click();
  await page.locator('.ui-icon-picker').getByRole('button',{name:'🪷',exact:true}).click();await page.getByRole('button',{name:'Salva',exact:true}).click();await name.waitFor({state:'detached'});
  await page.getByRole('button',{name:/Emoji condivisa/}).click();await page.getByRole('button',{name:'Mostra altre icone',exact:true}).click();assert.equal(await page.locator('.ui-icon-picker').getByRole('button',{name:'🪷',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.equal(await page.locator('#preview-writes').innerText(),'0');
  results.push({ui,theme,width,adminOnly:true,globalConsumption:true,validation:true,pass:true});await page.close();
 }
 for(const failure of ['failCatalogSave','catalogUnavailable','catalogSlow']){
  const page=await browser.newPage({viewport:{width:390,height:900}});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=light&${failure}=1`);await page.locator('#preview-writes').waitFor();await page.evaluate(()=>{history.pushState({},'','/settings?section=emoji');dispatchEvent(new PopStateEvent('popstate'));});
  const input=page.getByRole('textbox',{name:'Nuova emoji',exact:true});await input.waitFor();
  if(failure==='failCatalogSave'){
   await input.fill('🪷');await page.getByRole('button',{name:'Aggiungi emoji',exact:true}).click();await page.getByRole('alert').filter({hasText:'non riuscito'}).waitFor();assert.equal(await input.inputValue(),'🪷');assert.equal(await page.locator('.emoji-catalog-added [role="listitem"]').count(),0);
  }else if(failure==='catalogUnavailable'){
   await page.getByRole('alert').filter({hasText:'caricare'}).waitFor();assert.equal(await page.getByRole('button',{name:'Aggiungi emoji',exact:true}).isDisabled(),true);assert.equal(await page.locator('.emoji-catalog-builtins [role="listitem"]').count(),262);
   await page.getByRole('button',{name:'Riprova',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});await input.fill('🪷');await page.getByRole('button',{name:'Aggiungi emoji',exact:true}).click();await page.getByRole('status').filter({hasText:'disponibile a tutti'}).waitFor();
  }else{
   await input.fill('🪷');assert.equal(await page.getByRole('button',{name:'Aggiungi emoji',exact:true}).isDisabled(),true);assert.equal(await page.locator('.emoji-catalog-builtins [role="listitem"]').count(),262);
   await page.getByRole('status').filter({hasText:'Caricamento emoji aggiunte'}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Aggiungi emoji',exact:true}).isDisabled(),false);
  }
  results.push({failure,pass:true});await page.close();
 }
 for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:390,height:900}});
  await page.addInitScript(()=>{globalThis.RegExp=new Proxy(RegExp,{construct(target,args){if(String(args[1]).includes('v'))throw new SyntaxError('Fixture: Unicode sets unsupported');return Reflect.construct(target,args);}});});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=2&user=normal&theme=${theme}&catalogZwj=1`);await page.locator('#preview-writes').waitFor();
  await page.evaluate(()=>{history.pushState({},'','/settings?section=macros');dispatchEvent(new PopStateEvent('popstate'));});
  await page.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).click();await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Emoji composta condivisa');
  await page.getByRole('button',{name:'Mostra altre icone',exact:true}).click();await page.locator('.ui-icon-picker').getByRole('button',{name:'👩🏽‍🚀',exact:true}).click();
  await page.getByRole('button',{name:'Salva',exact:true}).click();await page.getByRole('textbox',{name:'Nome',exact:true}).waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:/Emoji composta condivisa/}).count(),1);
  results.push({fallbackWithoutUnicodeSets:true,theme,globalZwjPreserved:true,pass:true});await page.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS admin emoji catalog',JSON.stringify(results));
}finally{await browser.close();}
