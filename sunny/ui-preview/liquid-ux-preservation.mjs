import assert from 'node:assert/strict';
import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ux-polish-preservation';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions);
try {for(const theme of ['light','dark']) {
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
  await page.clock.install({time:new Date('2026-12-26T10:00:00Z')});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const snapshots=[];
  for(const ui of ['2','3']) {
    await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}`,{waitUntil:'domcontentloaded'});
    const label=page.getByText('Sunny Wrapped',{exact:true});await label.waitFor();
    assert.equal(await label.evaluate(e=>getComputedStyle(e).fontSize),'10px','entry keeps its original typography');
    await page.getByRole('button',{name:'Guarda il tuo 2026',exact:true}).click();
    const wrapped=page.locator('.wrapped-shell');await wrapped.waitFor();
    snapshots.push(await wrapped.evaluate(e=>{
      const s=getComputedStyle(e);return {background:s.getPropertyValue('--c-bg').trim(),ink:s.color,gold:s.getPropertyValue('--c-gold').trim(),duration:s.getPropertyValue('--wrapped-ms').trim(),cover:s.backgroundImage};
    }));
    assert.equal(await wrapped.getByText(/1\s*\/\s*\d+/).count()>0,true,'stories remain available');
    await page.screenshot({path:`${out}/wrapped-${theme}-ui${ui}.png`});
  }
  assert.deepEqual(snapshots[1],snapshots[0],'Wrapped theme and timing foundations are identical in UI2 and UI3.1');
  results.push({theme,pass:true,...snapshots[1]});console.log('PASS Wrapped preservation',theme);await page.close();
}} finally {await writeFile(`${out}/wrapped-results.json`,JSON.stringify(results,null,2));await browser.close();}
