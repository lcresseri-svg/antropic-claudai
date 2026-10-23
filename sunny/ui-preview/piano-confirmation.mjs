import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/scratch/sunny-plan-confirmation';
await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
const origin=`http://127.0.0.1:${process.env.SUNNY_PORT||4177}`;
const open=async(page,extra='',month='2026-10',empty=true)=>{
  await page.goto(`${origin}/ui-preview/index.html?ui=3&${empty?'empty&':''}${extra}`);
  await page.locator('.ui31-today').waitFor();
  await page.evaluate(month=>{history.pushState({},'',`/budget?view=plan&month=${month}`);dispatchEvent(new PopStateEvent('popstate'));},month);
  await page.locator('.piano-page').waitFor();
  await page.waitForFunction(month=>document.querySelector('[aria-label="Mese selezionato"]')?.value===month,month);
};
const edit=async(page)=>{
  await page.getByRole('button',{name:'Modifica piano',exact:true}).click();
  return page.getByRole('dialog',{name:'Modifica piano',exact:true});
};
const complete=async(dialog,income='2400',savings='300')=>{
  await dialog.getByRole('textbox').first().fill(income);
  await dialog.getByRole('button',{name:'2. Obiettivi',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Risparmio da mantenere',exact:true}).fill(savings);
  await dialog.getByRole('checkbox',{name:/Ho verificato/}).check();
};
try {
  for(const width of [320,390,834,1440])for(const theme of ['light','dark']) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.clock.install({time:new Date('2026-10-23T12:00:00Z')});
    await open(page,`theme=${theme}`);
    let dialog=await edit(page);
    let confirm=dialog.getByRole('button',{name:'Conferma piano',exact:true});
    assert.equal(await confirm.isEnabled(),true);
    await confirm.click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await page.locator('#preview-plan-writes').innerText(),'0');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-plan-field')==='income');
    assert.equal(await dialog.locator('[data-plan-field="income"]').first().evaluate(e=>e===document.activeElement),true);
    assert.match(await dialog.locator('#plan-confirmation-help').innerText(),/entrate attese/);
    await complete(dialog);
    assert.equal(await confirm.isEnabled(),true,'confirmation is available before optional limits');
    const box=await confirm.boundingBox();assert.ok(box.width>=44&&box.height>=44);
    assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
    await dialog.screenshot({path:`${out}/ready-${width}-${theme}.png`});
    await dialog.getByRole('button',{name:'Salva bozza',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('.plan-status').innerText(),'Bozza');
    await page.getByRole('button',{name:'Rivedi e conferma',exact:true}).click();
    dialog=page.getByRole('dialog',{name:'Modifica piano',exact:true});
    await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('.plan-status').innerText(),'Confermato');
    assert.equal(await page.locator('#preview-plan-writes').innerText(),'2');
    dialog=await edit(page);
    assert.equal(await dialog.getByRole('button',{name:'Conferma piano',exact:true}).count(),0);
    assert.equal(await dialog.getByRole('button',{name:'Salva modifiche',exact:true}).count(),1);
    assert.deepEqual(errors,[]);results.push({width,theme,passed:true});
    await page.close();
  }
  for(const scenario of ['retry','deficit','future','historical']) {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.clock.install({time:new Date('2026-10-23T12:00:00Z')});
    const month=scenario==='future'?'2026-11':scenario==='historical'?'2026-09':'2026-10';
    await open(page,scenario==='retry'?'failSave':'',month);
    if(scenario==='historical') {
      await page.getByRole('button',{name:'Modifica piano storico',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Conferma piano',exact:true}).count(),0);
    }else {
      let dialog=await edit(page);
      await complete(dialog,scenario==='deficit'?'0':'2400',scenario==='deficit'?'100':'300');
      await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();
      if(scenario==='retry') {
        await dialog.getByRole('alert').waitFor();
        assert.equal(await page.locator('#preview-plan-writes').innerText(),'0');
        await open(page,'',month);dialog=await edit(page);
        assert.equal(await dialog.getByRole('textbox').first().inputValue(),'2400');
        await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();
      }else if(scenario==='deficit') {
        await dialog.getByRole('alert').waitFor();
        await page.waitForFunction(()=>document.activeElement?.getAttribute('data-plan-field')==='deficit');
        assert.equal(await page.locator('#preview-plan-writes').innerText(),'0');
        await dialog.getByRole('checkbox',{name:'Continua con piano in disavanzo',exact:true}).check();
        await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();
      }
      await dialog.waitFor({state:'hidden'});
      assert.equal(await page.locator('.plan-status').innerText(),'Confermato');
      assert.equal(await page.locator('#preview-plan-writes').innerText(),'1');
    }
    results.push({scenario,passed:true});await page.close();
  }
  for(const scenario of ['legacy','reviewNeeded','legacyRecovered']) {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.clock.install({time:new Date('2026-10-23T12:00:00Z')});
    await open(page,scenario==='legacyRecovered'?'legacy':scenario,'2026-10',false);
    assert.equal(await page.locator('.plan-status').innerText(),'Da completare');
    if(scenario==='legacyRecovered')await page.evaluate(()=>{
      const base={month:'2026-10',status:'confirmed',source:'manual',savingsTarget:300,incomeBudgets:{stipendio:2400},
        categoryBudgets:{casa:700,spesa:300,ristoranti:180},investmentBudgets:{azioni_etf:350},suggestionAccepted:true,
        planningV3:{schemaVersion:1,inputsReviewedAt:1,cashInvestmentBudgets:{azioni_etf:200}}};
      localStorage.setItem('sunny:piano-draft:qPtCOJGRrwOZ2EfjxMHwW6ZISXX2:2026-10',JSON.stringify({revision:1,
        draft:{base,income:{stipendio:'2400'},savings:'300',cash:{azioni_etf:'200'},limits:{casa:'700',spesa:'300',ristoranti:'180'},cashReviewed:true}}));
    });
    let dialog=await edit(page);
    assert.equal(await dialog.getByRole('button',{name:'Conferma piano',exact:true}).isEnabled(),true);
    if(scenario!=='legacyRecovered'){
      await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();
      await dialog.getByRole('alert').waitFor();
      assert.equal(await page.locator('#preview-plan-writes').innerText(),'0');
      await page.waitForFunction(()=>document.activeElement?.getAttribute('data-plan-field')==='cashReviewed');
      assert.equal(await dialog.locator('[data-plan-field="cashReviewed"]').evaluate(e=>e===document.activeElement),true);
    }
    await complete(dialog);
    assert.equal(await dialog.getByRole('button',{name:'Conferma piano',exact:true}).isEnabled(),true);
    assert.equal(await dialog.getByRole('button',{name:'Salva modifiche',exact:true}).count(),0);
    await dialog.screenshot({path:`${out}/${scenario}-ready.png`});
    await dialog.getByRole('button',{name:'Salva bozza',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('.plan-status').innerText(),'Bozza','review alone does not silently confirm');
    dialog=await edit(page);
    await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('.plan-status').innerText(),'Confermato');
    assert.equal(await page.locator('#preview-plan-writes').innerText(),'2');
    results.push({scenario,passed:true});await page.close();
  }
  for(const field of ['income','savings','cash','limits']) {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.clock.install({time:new Date('2026-10-23T12:00:00Z')});
    await open(page);const dialog=await edit(page);await complete(dialog);
    let input;
    if(field==='income'){
      await dialog.getByRole('button',{name:'1. Entrate',exact:true}).click();input=dialog.locator('[data-plan-field="income"]').first();
    }else if(field==='savings')input=dialog.locator('[data-plan-field="savings"]');
    else if(field==='cash'){
      await dialog.getByRole('button',{name:/^\+ Azioni/}).click();input=dialog.locator('[data-plan-field="cash"]').first();
    }else {
      await dialog.getByRole('button',{name:'3. Spese',exact:true}).click();
      await dialog.locator('.plan-limit-picker button').first().click();
      await dialog.getByRole('button',{name:/· Imposta limite$/}).click();input=dialog.locator('[data-plan-field="limits"]').first();
    }
    await input.fill('12,345');
    await dialog.getByRole('button',{name:field==='income'||field==='savings'?'3. Spese':'1. Entrate',exact:true}).click();
    await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();
    await dialog.getByRole('alert').waitFor();
    const target=dialog.locator(`[data-plan-field="${field}"][aria-invalid="true"]`);
    await page.waitForFunction(field=>document.activeElement?.getAttribute('data-plan-field')===field,field);
    assert.equal(await target.evaluate(e=>e===document.activeElement),true,'confirmation guides to the precise missing input');
    assert.equal(await target.inputValue(),'12,345','invalid edits are preserved');
    assert.equal(await page.locator('#preview-plan-writes').innerText(),'0','incomplete plans are never saved as confirmed');
    await dialog.screenshot({path:`${out}/validation-${field}.png`});
    await target.fill(field==='income'?'2400':'100');
    await dialog.getByRole('button',{name:'Conferma piano',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('.plan-status').innerText(),'Confermato');
    assert.equal(await page.locator('#preview-plan-writes').innerText(),'1');
    results.push({scenario:`validation-${field}`,passed:true});console.log('PASS validation',field);await page.close();
  }
  console.log(`PASS ${results.length} plan confirmation scenarios`);
} finally {await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
