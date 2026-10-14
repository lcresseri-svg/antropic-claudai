import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-keyboard';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);
try {for(const theme of ['light','dark'])for(const mode of ['applePay','generic']) {
 const page=await browser.newPage({viewport:{width:393,height:852},reducedMotion:'reduce'});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&editor&${mode}`);
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 if(mode==='applePay')assert.equal(await dialog.getByRole('heading',{name:'Conferma Apple Pay',exact:true}).count(),1,'single title');
 const description=dialog.getByRole('textbox',{name:'Descrizione facoltativa'});
 if(!await description.isVisible())await dialog.getByRole('button',{name:'Tocca per scrivere la descrizione'}).click();
 await description.fill('Bozza tastiera');await description.focus();
 // iOS keyboard shrinks visualViewport without changing the layout viewport.
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:390});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:45});visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>innerHeight),852);
 const geometry=await dialog.evaluate(el=>{const body=el.querySelector('form > .overflow-y-auto');return {top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,bodyHeight:body.clientHeight,bodyScroll:body.scrollHeight,overflow:getComputedStyle(el).overflowY};});
 assert.ok(geometry.top>=45&&geometry.bottom<=436,JSON.stringify(geometry));
 assert.equal(geometry.overflow,'auto','short visual viewport uses whole-dialog scrolling');
 assert.ok(geometry.bodyHeight>=geometry.bodyScroll-2,'fields are not squeezed inside a second scroll window');
 await description.scrollIntoViewIfNeeded();assert.equal(await description.evaluate(el=>document.activeElement===el),true);
 await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();
 await page.getByRole('button',{name:'Continua a modificare'}).click();assert.equal(await description.inputValue(),'Bozza tastiera');
 assert.equal(await description.evaluate(el=>document.activeElement===el),true);
 await page.screenshot({path:`${out}/${mode}-${theme}-keyboard.png`});
 const save=dialog.locator('.ui-keyboard-footer button[type="submit"]');await save.scrollIntoViewIfNeeded();assert.ok(await save.isVisible());
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:852});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:0});visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForTimeout(100);assert.equal(await description.inputValue(),'Bozza tastiera');
 console.log('PASS',theme,mode,geometry);await page.close();
}}finally{await browser.close();}
