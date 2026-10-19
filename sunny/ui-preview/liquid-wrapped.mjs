import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-wrapped';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);const report=[];
try{
for(const width of (process.env.SUNNY_WIDTHS||'390').split(',').map(Number))for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height:844}});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.clock.install({time:new Date('2026-10-12T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-12T10:00:01Z'));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${process.env.SUNNY_UI||'3'}&theme=${theme}`);
 await page.locator('#preview-writes').waitFor();
 // Opening and closing an editor before Wrapped must release modal ownership.
 await page.getByRole('button',{name:'Apri editor test'}).click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('[inert]').count(),0);
 await page.evaluate(()=>{history.pushState({},'','/wrapped/2026');dispatchEvent(new PopStateEvent('popstate'));});
 await page.locator('.wrapped-shell').waitFor();
 const palette=await page.locator('.wrapped-shell').evaluate(el=>{
  const s=getComputedStyle(el),rgb=name=>s.getPropertyValue(name).trim().split(/\s+/).map(Number);
  const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  return {background:rgb('--c-bg'),paint:s.background,contrast:Object.fromEntries(['primary','secondary','tertiary','gold','green','red'].map(t=>[t,Math.min(...[[255,255,255],[255,244,223],[248,248,250]].map(bg=>contrast(rgb('--c-'+t),bg)))]))};
 });
 assert.deepEqual(palette.background,theme==='light'?[255,255,255]:[9,9,9]);
 assert.ok(palette.paint.includes(theme==='light'?'rgb(255, 255, 255)':'rgb(9, 9, 9)'));
 if(theme==='light')for(const [tone,ratio] of Object.entries(palette.contrast))assert.ok(ratio>=4.5,`${tone}: ${ratio}`);

 for(let i=0;i<30;i++){
  await page.clock.runFor(400);
  const summary=await page.getByRole('heading',{name:'Tutto in una schermata'}).count();
  await page.screenshot({path:`${out}/${width}-${theme}-${summary?'summary':String(i).padStart(2,'0')}.png`,animations:'disabled'});
  report.push({width,theme,palette,step:summary?'summary':i,text:await page.locator('.wrapped-shell').innerText(),styles:await page.locator('.wrapped-shell').evaluate(el=>{const s=getComputedStyle(el);return {background:s.background,color:s.color,font:s.font,border:s.border,radius:s.borderRadius};})});
  assert.equal(await page.locator('.wrapped-shell').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  if(summary)break;
  await page.mouse.click(Math.min(width-50,width/2+150),500);
 }
 const buttons=await page.locator('.wrapped-shell button').allTextContents();
 console.log(theme,buttons);
 const goal=page.locator('.wrapped-shell button').filter({hasText:/obiettivo/i}).first();
 await goal.click();await page.clock.runFor(400);
 await page.screenshot({path:`${out}/${width}-${theme}-goal.png`,animations:'disabled'});
 const amount=await page.locator('.wrapped-shell').innerText();
 await page.getByRole('button',{name:'Aggiungi 50 euro',exact:true}).click();
 await page.getByRole('button',{name:'Togli 50 euro',exact:true}).click();
 assert.equal(await page.locator('.wrapped-shell').innerText(),amount);
 if(theme==='light'){
  const cta=await page.getByRole('button',{name:'Imposta obiettivo',exact:true}).evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
  assert.deepEqual(cta,{color:'rgb(36, 23, 4)',background:'rgb(242, 196, 109)'});
 }
 assert.equal(await page.locator('.wrapped-shell').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.locator('.wrapped-shell').waitFor({state:'detached'});
 assert.equal(await page.locator('.wrapped-shell').count(),0);
 assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('light')),theme==='light');
 await page.close();
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('PASS Wrapped stories, summary, goal, close and editor cleanup');
}finally{await browser.close();}
