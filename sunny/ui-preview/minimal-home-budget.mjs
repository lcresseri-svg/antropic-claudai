import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/minimal-home-budget';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);const results=[];
try{for(const theme of ['light','dark'])for(const width of [390,834,1440]){
 const page=await browser.newPage({viewport:{width,height:width===834?1194:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&manyCategories`);await page.locator('.liquid-spending-row').first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Apri impostazioni',exact:true}).count(),0);
 assert.equal(await page.locator('.liquid-movement-row').count(),0);
 for(const text of ['Liquidità sui conti inclusi','conti inclusi nel patrimonio','Impegni e deposito di sicurezza'])assert.equal(await page.getByText(text,{exact:true}).count(),0);
 assert.doesNotMatch(await page.locator('.liquid-month-summary').textContent(),/registrato/);
 const saldo=await page.locator('.liquid-headline-value').first().textContent();
 assert.equal(await page.locator('.liquid-spending-row').count(),6);
 await page.screenshot({path:`${out}/home-${theme}-${width}.png`,fullPage:true});
 const info=page.getByRole('button',{name:'Informazioni sul saldo',exact:true});await info.click();
 const detail=page.getByRole('dialog',{name:'Informazioni sul saldo'});await detail.waitFor();assert.equal(await detail.locator('dd').first().textContent(),saldo);
 await page.keyboard.press('Escape');assert.equal(await info.evaluate(el=>el===document.activeElement),true);
 const first=page.locator('.liquid-spending-row').first();const label=await first.locator('.liquid-spending-label > span').nth(1).textContent();await first.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();assert.ok((await page.getByRole('dialog').textContent()).includes(label));await page.keyboard.press('Escape');await page.getByRole('button',{name:'Indietro',exact:true}).click();await info.waitFor();
 await page.getByRole('link',{name:'Piano',exact:true}).first().click();await page.locator('.plan-category-edit').first().waitFor();
 const generalKey=await page.evaluate(()=>{const key='sunny:piano-draft:qPtCOJGRrwOZ2EfjxMHwW6ZISXX2:'+new Date().toISOString().slice(0,7);localStorage.setItem(key,'unchanged');return key;});
 const trigger=page.locator('.plan-category-edit').first();const reopenLabel=(await trigger.getAttribute('aria-label')).replace('Imposta','Modifica');await trigger.click();const editor=page.getByRole('dialog',{name:/Limite ·/});await editor.waitFor();
 assert.equal(await editor.getByRole('textbox').count(),1);assert.equal(await editor.getByRole('navigation',{name:'Passi del piano'}).count(),0);
 const input=editor.getByRole('textbox');const old=await input.inputValue();await input.fill('777');const before=await editor.boundingBox();await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();assert.deepEqual(await editor.boundingBox(),before);
 await page.getByRole('button',{name:'Continua a modificare'}).click();assert.equal(await input.inputValue(),'777');assert.equal(await input.evaluate(el=>el===document.activeElement),true);
 await page.screenshot({path:`${out}/category-editor-${theme}-${width}.png`});
 if(await editor.getByRole('checkbox',{name:'Continua con piano in disavanzo'}).count())await editor.getByRole('checkbox',{name:'Continua con piano in disavanzo'}).check();await editor.getByRole('button',{name:'Salva limite',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(await page.locator('#preview-plan-writes').textContent(),'1');
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),generalKey),'unchanged');
 if(!await page.getByRole('button',{name:reopenLabel,exact:true}).count())await page.getByRole('button',{name:'Mostra tutte',exact:true}).click();await page.getByRole('button',{name:reopenLabel,exact:true}).click();assert.equal(await page.getByRole('dialog',{name:/Limite ·/}).getByRole('textbox').inputValue(),'777');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Imposta un limite',exact:true}).click();await page.getByRole('dialog',{name:'Scegli categoria'}).waitFor();assert.equal(await page.getByRole('dialog').getByRole('textbox').count(),0);await page.keyboard.press('Escape');
 assert.equal(await page.locator('#app-scroll').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.deepEqual(errors,[]);results.push({theme,width,pass:true});console.log('PASS home and category editor',theme,width);await page.close();
}
for(const mode of ['failSave','conflict']){
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&${mode}`);await page.locator('#preview-writes').waitFor();await page.getByRole('link',{name:'Piano',exact:true}).first().click();await page.locator('.plan-category-edit').first().click();const editor=page.getByRole('dialog',{name:/Limite ·/});const input=editor.getByRole('textbox');await input.fill('777');if(await editor.getByRole('checkbox',{name:'Continua con piano in disavanzo'}).count())await editor.getByRole('checkbox',{name:'Continua con piano in disavanzo'}).check();await editor.getByRole('button',{name:'Salva limite',exact:true}).click();await editor.getByRole('alert').waitFor();assert.equal(await input.inputValue(),'777');assert.equal(await page.locator('#preview-plan-writes').textContent(),'0');
 if(mode==='conflict'){await editor.getByRole('button',{name:'Ricarica piano',exact:true}).click();assert.equal(await input.inputValue(),'777');if(await editor.getByRole('checkbox',{name:'Continua con piano in disavanzo'}).count())await editor.getByRole('checkbox',{name:'Continua con piano in disavanzo'}).check();await editor.getByRole('button',{name:'Salva limite',exact:true}).click();await editor.waitFor({state:'hidden'});await page.getByRole('button',{name:/Risparmio da mantenere/}).click();assert.equal(await page.getByRole('textbox',{name:'Risparmio da mantenere',exact:true}).inputValue(),'525');}
 await page.close();console.log('PASS',mode);results.push({mode,pass:true});
}
}finally{await browser.close();}await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
