import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(process.env.SUNNY_NODE_PACKAGES+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const results=[];
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
try {
  for(const theme of ['light','dark']) {
    await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?theme=${theme}`);
    await page.locator('.ui-free-cash').waitFor();await page.waitForTimeout(350);
    const contrast=await page.evaluate(()=>{
      const rgb=s=>s.match(/[\d.]+/g)?.map(Number)??[0,0,0,0];
      const composite=(fg,bg)=>{const alpha=fg[3]??1;return fg.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));};
      const lum=c=>c.map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      return ['.ui3-month-line','.ui3-nav-link[aria-current]','.ui3-add','.ui3-more','.ui-free-cash .text-secondary','.ui-free-cash .text-gold'].map(selector=>{
        const el=document.querySelector(selector),s=getComputedStyle(el);let nodes=[];
        for(let node=el;node;node=node.parentElement)nodes.unshift(node);
        let background=[255,255,255];for(const node of nodes)background=composite(rgb(getComputedStyle(node).backgroundColor),background);
        const foreground=composite(rgb(s.color),background);const a=lum(foreground),b=lum(background);
        return {selector,foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      });
    });
    results.push({theme,contrast});for(const row of contrast)assert.ok(row.ratio>=4.5,`${theme} ${row.selector} ${row.ratio.toFixed(2)}:1`);
    await page.getByRole('button',{name:'Apri editor test'}).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:'Aggiungi uscita',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'Importo',exact:true}).getAttribute('aria-invalid'),'true');
    assert.equal(await page.getByRole('textbox',{name:'Importo',exact:true}).evaluate(el=>el===document.activeElement),true);
    for(let i=0;i<40;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')),true);}
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.setViewportSize({width:1194,height:500});
    await page.getByRole('button',{name:'Aggiungi uscita',exact:true}).scrollIntoViewIfNeeded();
    const footer=await page.getByRole('button',{name:'Aggiungi uscita',exact:true}).boundingBox();
    assert.ok(footer.y>=0 && footer.y+footer.height<=500,'low-height footer remains reachable');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[inert]').count(),0);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
    assert.equal(await page.locator('#app-scroll').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'200% root text size reflows');
    const targets=await page.locator('.ui3-primary-nav > *').evaluateAll(els=>els.map(el=>({label:el.getAttribute('aria-label'),w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
    for(const target of targets)assert.ok(target.w>=44 && target.h>=44,JSON.stringify(target));
    await page.evaluate(()=>{document.documentElement.style.fontSize='';});
  }
  console.log('PASS accessibility: sampled composited contrast, 40-step focus containment, invalid amount focus, reduced motion, low-height footer, 200% text-size reflow, primary touch targets');
} finally {
  await writeFile(new URL('./artifacts/accessibility-results.json',import.meta.url),JSON.stringify(results,null,2));
  await browser.close();
}
