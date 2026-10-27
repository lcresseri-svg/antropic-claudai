import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.SUNNY_EVIDENCE||'/workspace/macro-release';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
const title='Sono arrivate le macrocategorie';
try{
 for(const role of ['normal','admin'])for(const theme of ['light','dark'])for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const url=`http://127.0.0.1:4177/ui-preview/index.html?whatsNew=1&ui=${role==='normal'?'2':'3'}&user=${role}&theme=${theme}`;
  await page.goto(url);const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.waitFor();
  const text=await dialog.innerText();assert.ok(text.toLowerCase().includes('v2.1.0'));assert.ok(text.includes('Casa'));assert.ok(text.includes('850 €'));assert.ok(text.includes('Affitto'));assert.ok(text.includes('Macrocategoria'));
  assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await page.screenshot({path:`${out}/announcement-${role}-${theme}-${width}.png`});
  await dialog.getByRole('button',{name:'Configura le macrocategorie',exact:true}).click();await page.getByRole('heading',{name:'Macrocategorie',exact:true}).waitFor();
  await page.getByRole('button',{name:'+ Aggiungi macrocategoria',exact:true}).click();await page.getByRole('textbox',{name:'Nome',exact:true}).fill('Casa test');await page.getByRole('button',{name:'Salva',exact:true}).click();await page.getByRole('textbox',{name:'Nome',exact:true}).waitFor({state:'detached'});
  await page.goto(url);await page.locator('#preview-writes').waitFor();assert.equal(await page.getByRole('dialog',{name:title,exact:true}).count(),0);
  assert.deepEqual(errors,[]);results.push({role,theme,width,announcement:true,example:true,settingsCTA:true,canCreate:true,once:true});await context.close();
 }
 // Acknowledging on a shared browser must not silence the other account.
 const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:4177/ui-preview/index.html?whatsNew=1&ui=2&user=normal');await page.getByRole('dialog',{name:title,exact:true}).getByRole('button',{name:'Ho capito',exact:true}).click();
 await page.getByRole('button',{name:'Admin test',exact:true}).click();await page.getByRole('dialog',{name:title,exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog',{name:title,exact:true}).waitFor({state:'detached'});
 await page.getByRole('button',{name:'Utente normale test',exact:true}).click();await page.locator('#preview-writes').waitFor();assert.equal(await page.getByRole('dialog',{name:title,exact:true}).count(),0);results.push({perUserOnSameBrowser:true,escape:true});await page.close();
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS universal macro release',JSON.stringify(results));
}finally{await browser.close();}
