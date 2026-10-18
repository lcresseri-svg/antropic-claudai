import {chromium,browserOptions} from '/workspace/antropic-claudai/sunny/ui-preview/browser.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch(browserOptions);const results=[];
try{for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const start=async route=>{await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);await page.getByRole('status',{name:'Caricamento',exact:true}).waitFor({state:'hidden'});};
 await start('/transactions');await page.getByRole('button',{name:'Filtri',exact:true}).click();
 const panel=page.getByRole('region',{name:'Opzioni movimenti'});await panel.getByRole('button',{name:'Categoria',exact:true}).focus();
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 const focus=await page.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label')||document.activeElement.innerText.slice(0,50)}));
 await start('/investments');await page.getByRole('button',{name:/Apri dettaglio di/}).first().click();await page.getByRole('dialog').waitFor();
 await page.getByRole('dialog').getByRole('button',{name:'+ Versa',exact:true}).click();await page.waitForTimeout(350);
 const inputs=await page.getByRole('dialog').locator('input,button.ui-amount-input').evaluateAll(els=>els.map(el=>({tag:el.tagName,cls:el.className,placeholder:el.getAttribute('placeholder'),type:el.getAttribute('type'),font:getComputedStyle(el).fontSize,color:getComputedStyle(el).color,placeholderColor:getComputedStyle(el,'::placeholder').color,bg:getComputedStyle(el).backgroundColor,rect:{width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}})));
 await page.getByRole('dialog').getByRole('button',{name:'‹ Indietro',exact:true}).click();await page.waitForTimeout(150);
 const hierarchyFocus=await page.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.innerText}));
 results.push({theme,filterEscapeFocus:focus,depositInputs:inputs,childBackFocus:hierarchyFocus});await page.close();
}}finally{await browser.close();}
await writeFile('/workspace/uiux-study/interaction-probes.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
