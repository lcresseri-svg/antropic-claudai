import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-wrapped';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);const report=[];
try{
for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.clock.install({time:new Date('2026-10-12T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-12T10:00:01Z'));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);
 await page.locator('#preview-writes').waitFor();
 // Opening and closing an editor before Wrapped must release modal ownership.
 await page.getByRole('button',{name:'Apri editor test'}).click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('[inert]').count(),0);
 await page.evaluate(()=>{history.pushState({},'','/wrapped/2026');dispatchEvent(new PopStateEvent('popstate'));});
 await page.locator('.wrapped-shell').waitFor();
 for(let i=0;i<30;i++){
  await page.clock.runFor(400);
  const summary=await page.getByRole('heading',{name:'Tutto in una schermata'}).count();
  await page.screenshot({path:`${out}/${theme}-${summary?'summary':String(i).padStart(2,'0')}.png`,animations:'disabled'});
  report.push({theme,step:summary?'summary':i,text:await page.locator('.wrapped-shell').innerText(),styles:await page.locator('.wrapped-shell').evaluate(el=>{const s=getComputedStyle(el);return {background:s.background,color:s.color,font:s.font,border:s.border,radius:s.borderRadius};})});
  if(summary)break;
  await page.mouse.click(340,500);
 }
 const buttons=await page.locator('.wrapped-shell button').allTextContents();
 console.log(theme,buttons);
 const goal=page.locator('.wrapped-shell button').filter({hasText:/obiettivo/i}).first();
 await goal.click();await page.clock.runFor(400);
 await page.screenshot({path:`${out}/${theme}-goal.png`,animations:'disabled'});
 const amount=await page.locator('.wrapped-shell').innerText();
 await page.getByRole('button',{name:'Aggiungi 50 euro',exact:true}).click();
 await page.getByRole('button',{name:'Togli 50 euro',exact:true}).click();
 assert.equal(await page.locator('.wrapped-shell').innerText(),amount);
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.locator('.wrapped-shell').waitFor({state:'detached'});
 assert.equal(await page.locator('.wrapped-shell').count(),0);
 await page.close();
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('PASS Wrapped stories, summary, goal, close and editor cleanup');
}finally{await browser.close();}
