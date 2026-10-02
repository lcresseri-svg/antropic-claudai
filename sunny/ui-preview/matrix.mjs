import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require=createRequire(process.env.SUNNY_NODE_PACKAGES+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const out=new URL('./artifacts/',import.meta.url); await mkdir(out,{recursive:true});
const errors=[],results=[];
const sizes=[[320,568],[360,800],[390,844],[430,932],[639,800],[640,800],[744,800],[834,1194],[1194,834],[1279,900],[1280,900],[1440,900],[1920,1080],[2560,1440],[1194,500],[1440,599],[1440,600]];
const page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
try {
  for(const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4177/ui-preview/index.html?theme=light');
    await page.locator('.ui-free-cash').waitFor();
    const layout=await page.evaluate(()=>{
      const nav=document.querySelector('.ui3-nav'), main=document.querySelector('#app-scroll');
      return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
        mainOverflow:main.scrollWidth>main.clientWidth+1,nav:Math.round(nav.getBoundingClientRect().width),position:getComputedStyle(nav).position,
        visiblePrimary:[...nav.querySelectorAll('.ui3-primary-nav > *')].filter(el=>el.getClientRects().length).length};
    });
    results.push({size:[width,height],...layout});
    assert.equal(layout.overflow,false,`document overflow ${width}x${height}`);
    assert.equal(layout.mainOverflow,false,`content overflow ${width}x${height}`);
    assert.ok(layout.visiblePrimary>=5,`primary navigation ${width}`);
    assert.equal(layout.position,width<640?'fixed':'static');
    if(width>=640) assert.equal(layout.nav,height<600?64:width<1280?80:240);
  }
  for(const [width,height,name] of [[390,844,'phone'],[834,1194,'tablet'],[1440,900,'desktop']]) {
    await page.setViewportSize({width,height});
    for(const theme of ['light','dark']) for(const ui of ['2','3']) {
      await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?theme=${theme}&ui=${ui}`);
      await page.locator('#preview-writes').waitFor();
      assert.equal(await page.locator('html').getAttribute('data-ui-version'),ui+'.0');
      await page.waitForTimeout(350);
      await page.screenshot({path:fileURLToPath(new URL(`${name}-${theme}-ui${ui}.png`,out))});
    }
  }
  const previousMonth=new Date();previousMonth.setDate(1);previousMonth.setMonth(previousMonth.getMonth()-1);
  const recap=`${previousMonth.getFullYear()}-${String(previousMonth.getMonth()+1).padStart(2,'0')}`;
  const routes=['/wealth','/budget','/transactions','/investments','/income','/category-spending','/account-balance','/wealth-history','/settings','/insights','/ai-coach','/wealth-v2','/commitments','/monthly-plan','/forecast-v3','/metrics',`/recap/${recap}`,`/wrapped/${new Date().getFullYear()}`];
  for(const route of routes) for(const [width,height] of [[390,844],[834,1194],[1440,900]]) {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4177/ui-preview/index.html?theme=light');
    await page.locator('#preview-writes').waitFor();
    await page.evaluate(route=>{history.pushState({},'',route+'?theme=light');dispatchEvent(new PopStateEvent('popstate'));},route);
    await page.locator('#preview-writes').waitFor();
    await page.waitForTimeout(350);
    const overflow=await page.locator('#app-scroll').evaluate(el=>el.scrollWidth>el.clientWidth+1);
    if(overflow) console.log(await page.locator('main').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(el=>({tag:el.tagName,classes:el.className,right:el.getBoundingClientRect().right,text:el.textContent?.slice(0,70)}))));
    results.push({route,size:[width,height],overflow}); assert.equal(overflow,false,`overflow route ${route} width${width}`);
    await page.screenshot({path:fileURLToPath(new URL(`route-${route.split('/').filter(Boolean).join('-')}-${width}.png`,out))});
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(`PASS matrix: ${sizes.length} viewports, UI2/UI3 light/dark, ${routes.length} routes x3 sizes`);
} finally {
  await writeFile(new URL('matrix-results.json',out),JSON.stringify({results,errors},null,2));
  await browser.close();
}
