import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(process.env.SUNNY_NODE_PACKAGES+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const output=new URL('../../docs/product/piano-style-evidence/',import.meta.url);
mkdirSync(output,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(2026,9,10,12)});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const start=async(q)=>{
    await page.goto('http://127.0.0.1:4177/ui-preview/index.html?pianoCase&'+q);
    await page.getByRole('link',{name:'Piano',exact:true}).first().click();
    await page.locator('.plan-category-list').waitFor();
  };
  await start('theme=dark');
  assert.match(await page.locator('.plan-category-list').textContent(),/Stima non disponibile/,'insufficient history is not an invented zero');
  for(const theme of ['dark','light']) {
    await start('categoryForecast&theme='+theme);
    const grocery=page.locator('.plan-category-list button').filter({hasText:/Spesa/}).first();
    const forecast=grocery.locator('.plan-category-forecast');
    // 900 recorded + 250 scheduled + 1600 historical tail = 2750, not 3900.
    assert.match(await forecast.textContent(),/Previsto a fine mese 2750,00/);
    assert.match(await forecast.textContent(),/1550,00.*oltre il limite/);
    const listValue=await forecast.locator('strong').first().textContent();
    const historyOnly=page.locator('.plan-category-list button').filter({hasText:/Trasporti/});
    assert.match(await historyOnly.textContent(),/Previsto a fine mese 75,00/,'forecast-only category stays visible');
    assert.match(await page.locator('.plan-number').textContent(),/550,00/,'forecast cannot change available margin');
    for(const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      await page.getByRole('heading',{name:'Categorie',exact:true}).scrollIntoViewIfNeeded();
      assert(await page.locator('.piano-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      await page.screenshot({path:fileURLToPath(new URL(`forecast-${width}-${theme}.png`,output))});
    }
    await grocery.click();
    const detail=page.getByRole('dialog',{name:'Spesa',exact:true});
    assert.equal(await detail.locator('.plan-category-forecast strong').first().textContent(),listValue,'list and detail use the same estimate');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Mese successivo',exact:true}).click();
    assert.equal(await page.locator('.plan-category-forecast strong').count(),0,'future never reuses current forecast');
    await page.getByRole('button',{name:'Mese precedente',exact:true}).click();
    await page.getByRole('button',{name:'Mese precedente',exact:true}).click();
    assert.equal(await page.locator('.plan-category-forecast').count(),0,'past remains actual spending');
    assert.equal(await page.locator('#preview-plan-writes').textContent(),'0');
    assert.equal(await page.locator('#preview-writes').textContent(),'0');
  }
  assert.deepEqual(errors,[]);
  console.log('Category forecast: current/missing/history-only/overrun/detail/month isolation/responsive/no writes passed.');
} finally {await browser.close();}
