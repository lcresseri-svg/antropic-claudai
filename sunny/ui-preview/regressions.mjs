import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.SUNNY_NODE_PACKAGES+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const mode=process.argv[2]??'print';
  const start=async(query='')=>{await page.goto('http://127.0.0.1:4177/ui-preview/index.html?theme=dark&'+query);await page.locator('#preview-writes').waitFor({state:'attached'});};
  const route=async(path)=>{await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await page.waitForTimeout(350);};
  await start(mode==='category'?'editor':'');
  await page.locator('html[data-ui-version="3.0"]').waitFor();
  if(mode==='settings') {
    await page.setViewportSize({width:390,height:844}); await route('/settings');
    const entry=page.getByRole('button',{name:/Investimenti.*Portafoglio/});
    await entry.click(); await page.getByRole('heading',{name:'Investimenti',exact:true}).waitFor();
    await page.locator('.ui-settings-detail').getByRole('button',{name:'Indietro',exact:true}).click();
    assert.equal(await entry.evaluate(el=>el.tabIndex),0,'returning to Settings must retain the native menu tab stop');
    assert.equal(await entry.evaluate(el=>el===document.activeElement),true,'return focus to the original settings entry');
  }
  if(mode==='category') {
    const more=page.getByRole('button',{name:'altre ›',exact:true});
    await more.click(); await page.getByRole('button',{name:'‹ Indietro',exact:true}).click();
    assert.equal(await more.evaluate(el=>el===document.activeElement),true,'category Back restores its trigger, not BODY');
    await more.click(); await page.getByRole('button',{name:/Casa/}).first().click();
    assert.equal(await more.evaluate(el=>el===document.activeElement),true,'choosing a category also returns focus to the picker trigger');
  }
  if(mode==='budget') {
    await route('/budget');
    await page.getByRole('heading',{name:'Piano',exact:true}).waitFor();
    await page.getByRole('button',{name:'Mese precedente',exact:true}).click();
    const month=await page.getByRole('button',{name:'Torna al mese corrente',exact:true}).textContent();
    const archive=page.getByRole('button',{name:/Riepiloghi mensili/}); await archive.click();
    const recapRow=page.locator('.ui-family-budget .glass-card').filter({has:archive}).locator('button').nth(1);
    const rowText=await recapRow.textContent();
    await recapRow.focus(); await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Piano',exact:true}).waitFor();
    await page.getByRole('button',{name:'Piano',exact:true}).click();
    await page.getByRole('heading',{name:'Piano',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Torna al mese corrente',exact:true}).count(),1,'Budget returns to the selected historical month');
    assert.equal(await page.getByRole('button',{name:'Torna al mese corrente',exact:true}).textContent(),month);
    assert.equal(await archive.getAttribute('aria-expanded'),'true','Budget archive expansion survives child navigation');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),rowText,'restore the archived recap-row focus');
  }
  if(mode==='investment') {
    await route('/investments'); await page.getByRole('heading',{name:'Investimenti',exact:true}).waitFor();
    for (const label of ['✎ Controvalore','+ Versa','↓ Disinvesti']) {
      await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();
      const parent=page.getByRole('dialog',{name:'Dettaglio investimento',exact:true});
      const action=parent.getByRole('button',{name:label,exact:true}); await action.focus();
      const body=parent.locator('.overflow-y-auto').first();
      await body.evaluate(el=>el.scrollTop=160); const top=await body.evaluate(el=>el.scrollTop);
      await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'‹ Indietro',exact:true}).click();
      assert.equal(await parent.count(),1,`${label}: child Back must return to the original investment detail`);
      assert.equal(await page.getByRole('dialog').count(),1,'parent return has one active focus scope');
      assert.equal(await action.evaluate(el=>el===document.activeElement),true,'return focus to the original parent action');
      assert.equal(await body.evaluate(el=>el.scrollTop),top,'parent detail scroll survives the child flow');
      await parent.getByRole('button',{name:'Chiudi',exact:true}).last().click();
      assert.equal(await page.locator('[inert]').count(),0);
    }
    await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();
    await page.getByRole('dialog').getByRole('button',{name:'✎ Controvalore',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Chiudi',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0,'X closes the flow instead of returning to its parent');
    assert.equal(await page.locator('[inert]').count(),0,'X releases nested inert ownership');
  }
  if(mode==='print') {
  await page.emulateMedia({media:'print'});
  const palette=await page.evaluate(()=>{
    const styles=getComputedStyle(document.documentElement);
    return {background:styles.getPropertyValue('--c-card').trim(),ink:styles.getPropertyValue('--c-primary').trim()};
  });
  assert.equal(palette.background,'255 255 255','printing dark UI3 must keep the original white report palette');
  assert.equal(palette.ink,'23 20 15','printing dark UI3 must keep the original dark report ink');
  await page.evaluate(()=>document.documentElement.classList.add('light'));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--c-card').trim()),'255 255 255','UI3 light prints with the same original report palette');
  }
  console.log(`PASS regressions: ${mode}`);
} finally { await browser.close(); }
