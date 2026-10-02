import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.SUNNY_NODE_PACKAGES+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
await page.goto('http://127.0.0.1:4177/ui-preview/index.html?theme=light&editor');
await page.getByRole('button',{name:'Chiudi',exact:true}).waitFor();
assert.equal(errors.length,0,errors.join('\n'));
const mode=process.argv[2]??'dialog';
if(mode==='backdrop') {
  await page.mouse.click(5,5);
  assert.equal(await page.getByRole('dialog').count(),0,'clicking the scrim closes a clean editor');
  assert.equal(await page.locator('[inert]').count(),0);
}
if(mode==='draft') {
  await page.getByRole('textbox',{name:'Importo',exact:true}).fill('12,50');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Continua a modificare'}).click();
  assert.equal(await page.getByRole('textbox',{name:'Importo',exact:true}).inputValue(),'12,50');
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await page.getByRole('textbox',{name:'Importo',exact:true}).inputValue(),'12,50');
  await page.getByRole('button',{name:'Tocca per scrivere la descrizione'}).click();
  assert.notEqual(await page.evaluate(()=>document.activeElement?.getAttribute('placeholder')),'Spesa','description opening must not autofocus');
  const description=page.getByRole('textbox').filter({hasNot:page.locator('[aria-label="Importo"]')});
  await page.getByRole('button',{name:'Chiudi',exact:true}).click();
  await page.getByRole('button',{name:'Abbandona',exact:true}).click();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.locator('[inert]').count(),0);
  await page.getByRole('button',{name:'Utente normale test',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-ui-version'),'2.0');
  assert.equal(await page.locator('.ui3-nav').count(),0);
  await page.getByRole('button',{name:'Admin test',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-ui-version'),'3.0');
}
if(mode==='keypad') {
  await page.getByRole('button',{name:'Mostra tastierino'}).click();
  const amount=page.getByRole('textbox',{name:'Importo',exact:true});
  await amount.focus(); await page.keyboard.type('12,34'); await page.keyboard.press('Backspace');
  assert.equal(await amount.inputValue(),'12,3');
  await page.getByRole('button',{name:'Salva',exact:true}).click();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.locator('#preview-writes').textContent(),'1');
}
if(mode==='failure') {
  await page.goto('http://127.0.0.1:4177/ui-preview/index.html?theme=light&editor&awaitSave&singleSave&failSave');
  await page.getByRole('textbox',{name:'Importo',exact:true}).fill('100');
  await page.getByRole('button',{name:'Aggiungi uscita',exact:true}).click();
  await page.getByRole('button',{name:'Riprova',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Importo',exact:true}).inputValue(),'100');
  assert.equal(await page.locator('#preview-writes').textContent(),'0');
  assert.equal(await page.getByRole('button',{name:"Salva e aggiungi un'altra"}).count(),0);
}
assert.equal(errors.length,0,errors.join('\n'));
if(mode==='dialog') {
  const dialog=page.getByRole('dialog');
  assert.equal(await dialog.count(),1,'UI3 needs one named dialog scope');
  assert.equal(await dialog.getAttribute('aria-modal'),'true');
  assert.equal(await page.locator('#app-scroll').evaluate(el=>getComputedStyle(el).overflow),'hidden');
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')),true,'opening focus inside dialog');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')),true,'focus cannot escape dialog');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),0);
  assert.notEqual(await page.locator('#app-scroll').evaluate(el=>getComputedStyle(el).overflowY),'hidden','closing must release the page scroll lock');
}
await browser.close();
console.log(`PASS ${mode}`);
