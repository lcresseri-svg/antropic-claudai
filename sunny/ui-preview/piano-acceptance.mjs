import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium,browserOptions} from './browser.mjs';
const browser=await chromium.launch(browserOptions);
const output=new URL('../../docs/product/ui3-liquid-glass/evidence/piano-current/',import.meta.url);
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(2026,9,10,12)});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const start=async(q='')=>{
    await page.goto('http://127.0.0.1:4177/ui-preview/index.html?pianoCase&'+q);
    await page.locator('#preview-writes').waitFor();await page.evaluate(()=>localStorage.clear());
    await page.getByRole('link',{name:'Piano',exact:true}).first().click();
    await page.locator('.piano-page').waitFor();
  };
  const number=()=>page.locator('.plan-number').textContent();
  const edit=()=>page.getByRole('dialog',{name:'Modifica piano',exact:true});
  const savings=()=>edit().getByRole('textbox',{name:'Risparmio da mantenere',exact:true});
  await start('theme=light');
  assert.match(await number(),/550,00/);
  await page.getByRole('button',{name:'Come è calcolato',exact:true}).click();
  const arithmetic=page.getByRole('dialog',{name:'Come è calcolato'});
  assert.match(await arithmetic.textContent(),/100,00/);
  await page.screenshot({path:fileURLToPath(new URL('piano-formula.png',output))});
  await page.keyboard.press('Escape');
  await page.locator('.plan-category-list button').filter({hasText:/Spesa/}).first().click();
  await page.getByRole('button',{name:'Sposta budget',exact:true}).click();
  const transfer=page.getByRole('dialog',{name:'Sposta budget'});
  await transfer.getByRole('textbox',{name:'Importo da spostare'}).fill('50');
  await transfer.getByRole('button',{name:'Rivedi spostamento e salva'}).click();
  assert.equal(await page.locator('#preview-plan-writes').textContent(),'0');
  await edit().getByRole('button',{name:'Salva modifiche',exact:true}).click();
  await edit().waitFor({state:'detached'});
  assert.match(await number(),/550,00/,'transfer must not change global margin');
  assert.match(await page.locator('.plan-category-list').textContent(),/1.?250,00|1250,00/);
  assert.match(await page.locator('.plan-category-list').textContent(),/450,00/);
  // Copy targets/limits into a draft; no expense documents copied or created.
  await page.getByRole('button',{name:'Mese successivo',exact:true}).click();
  await page.getByRole('button',{name:'Modifica piano',exact:true}).click();
  await edit().getByRole('button',{name:'Copia dal mese precedente',exact:true}).click();
  await edit().getByRole('button',{name:'Applica copia alla bozza'}).click();
  await edit().getByRole('button',{name:'2. Obiettivi',exact:true}).click();
  assert.equal(await edit().getByRole('checkbox',{name:/Ho verificato/}).isChecked(),false);
  await edit().getByRole('checkbox',{name:/Ho verificato/}).check();
  await edit().getByRole('button',{name:'Salva bozza',exact:true}).click();await edit().waitFor({state:'detached'});
  assert.equal(await page.locator('#preview-writes').textContent(),'0');
  await page.getByRole('button',{name:'Mese precedente',exact:true}).click();
  assert.match(await number(),/550,00/);
  // Historical correction never presents a confirmation of a closed month.
  await page.getByRole('button',{name:'Mese precedente',exact:true}).click();
  await page.getByRole('button',{name:'Modifica piano storico',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Conferma piano',exact:true}).count(),0);
  await page.keyboard.press('Escape');
  // Deficit must be explicitly accepted before saving a confirmed plan.
  await start();
  await page.getByRole('button',{name:/Risparmio da mantenere/}).click();await savings().fill('3000');
  await edit().getByRole('button',{name:'Salva modifiche',exact:true}).click();
  assert.equal(await page.locator('#preview-plan-writes').textContent(),'0');
  await edit().getByRole('checkbox',{name:'Continua con piano in disavanzo'}).check();
  await edit().getByRole('button',{name:'Salva modifiche',exact:true}).click();await edit().waitFor({state:'detached'});
  assert.match(await number(),/−|-|–/);
  await page.screenshot({path:fileURLToPath(new URL('piano-deficit.png',output))});
  await start('noInvest');
  assert.match(await number(),/550,00/,'hidden investments do not release cash reserve');
  // Background user switch unmounts editor; no old draft shown to the next uid.
  await page.getByRole('button',{name:/Risparmio da mantenere/}).click();await savings().fill('123,45');
  await page.getByRole('button',{name:'Utente normale test'}).evaluate(e=>e.click());
  await edit().waitFor({state:'detached'});
  await page.getByRole('button',{name:/Risparmio da mantenere/}).click();
  assert.equal(await savings().inputValue(),'400');
  // Native modal contains keyboard focus; enlarged long names don't overflow.
  await page.setViewportSize({width:390,height:844});
  await page.addStyleTag({content:'.piano-page,.plan-dialog{font-size:150%}'});
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await edit().evaluate(e=>e.contains(document.activeElement)));}
  assert(await edit().evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.keyboard.press('Escape');
  await start('edgeCategories');
  assert.match(await number(),/450,00/);
  await page.getByText('Archiviata',{exact:true}).waitFor();
  await page.locator('.plan-category-list').getByText('Categoria unknown',{exact:true}).waitFor();
  await page.addStyleTag({content:'.piano-page{font-size:150%}'});
  assert(await page.locator('.piano-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:fileURLToPath(new URL('piano-archived-long-text.png',output))});
  await start();
  await page.clock.setFixedTime(new Date(2026,10,1,0,5));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('[aria-label="Mese del piano"]').value==='2026-11');
  await page.clock.setFixedTime(new Date(2026,9,10,12));
  await start('legacy');
  // New production path never uses the unreviewed legacy availability.
  // pianoCase intentionally seeds explicit review; separate legacy fixture below.
  await page.goto('http://127.0.0.1:4177/ui-preview/index.html?legacy');
  await page.locator('#preview-writes').waitFor();await page.getByRole('link',{name:'Piano',exact:true}).first().click();
  assert.equal(await page.locator('.plan-number').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Piano acceptance: formula550/cushion100/transfer/copy/future/past/deficit/hidden-investments/user-switch/focus passed.');
}finally{await browser.close();}
