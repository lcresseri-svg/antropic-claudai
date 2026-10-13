import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium,browserOptions} from './browser.mjs';
const browser=await chromium.launch(browserOptions);
const output=process.env.SUNNY_EVIDENCE?pathToFileURL(process.env.SUNNY_EVIDENCE.replace(/\/$/,'')+'/'):new URL('../../docs/product/ui3-liquid-glass/evidence/piano-style-current/',import.meta.url);
mkdirSync(output,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
  await page.clock.install({time:new Date('2026-10-10T12:00:00')});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const surface=el=>{const s=getComputedStyle(el);return {background:s.backgroundImage,color:s.backgroundColor,shadow:s.boxShadow,border:parseFloat(s.borderTopWidth)>0?s.borderTopColor:'none'};};
  for(const theme of ['dark','light']) {
    await page.setViewportSize({width:390,height:900});
    await page.goto('http://127.0.0.1:4177/ui-preview/index.html?pianoCase&theme='+theme);
    await page.locator('.liquid-balance-overview').waitFor();
    const homeSurface=await page.locator('.liquid-balance-overview').evaluate(surface);
    await page.screenshot({path:fileURLToPath(new URL('home-'+theme+'.png',output))});
    await page.getByRole('link',{name:'Piano',exact:true}).first().click();
    await page.locator('.plan-summary').waitFor();
    assert.deepEqual(await page.locator('.plan-summary').evaluate(surface),homeSurface,'Piano hero must use the same theme surfaces and elevation as Dashboard');
    for(const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      await page.locator('#app-scroll').evaluate(e=>e.scrollTop=0);
      assert(await page.locator('.piano-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'page horizontal overflow');
      assert(await page.locator('.plan-hero-stats strong').evaluateAll(items=>items.every(e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)*1.2)),'hero statistics must not break amounts across lines');
      await page.screenshot({path:fileURLToPath(new URL('piano-'+width+'-'+theme+'.png',output))});
    }
    await page.setViewportSize({width:390,height:900});
    await page.getByRole('heading',{name:'Categorie',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:fileURLToPath(new URL('categories-'+theme+'.png',output))});
    await page.locator('#app-scroll').evaluate(e=>e.scrollTop=0);
    await page.getByRole('button',{name:'Modifica piano',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Modifica piano'});
    await dialog.waitFor();
    assert.equal(await page.locator('#app-scroll').evaluate(e=>getComputedStyle(e).overflowY),'hidden','sheet must lock background scroll');
    assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'dialog horizontal overflow');
    const box=await dialog.boundingBox();
    assert(box.y+box.height>=880,'mobile dialog should sit at the bottom, like Sunny sheets');
    await dialog.getByRole('button',{name:'2. Obiettivi',exact:true}).click();
    const visibleFooter=()=>dialog.evaluate(e=>[...e.querySelectorAll('footer button')].every(b=>b.getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom-4));
    assert(await visibleFooter(),'all footer actions must stay inside the visible sheet');
    await dialog.evaluate(e=>e.scrollTop=e.scrollHeight);
    assert(await visibleFooter(),'footer stays visible at the end of the form');
    await dialog.evaluate(e=>e.scrollTop=0);
    await page.screenshot({path:fileURLToPath(new URL('editor-'+theme+'.png',output))});
    await page.keyboard.press('Escape');
    assert.notEqual(await page.locator('#app-scroll').evaluate(e=>getComputedStyle(e).overflowY),'hidden','closing restores scrolling');
    assert(await page.getByRole('button',{name:'Modifica piano',exact:true}).evaluate(e=>e===document.activeElement),'closing restores focus');
  }
  console.log('Piano visual consistency, responsive layout and sheet scroll/focus checks passed.');
} finally {await browser.close();}
