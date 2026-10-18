import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ux-polish-preservation';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions);
try{for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);await page.clock.setFixedTime(new Date('2026-12-26T10:00:00Z'));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await page.locator('#preview-writes').waitFor();
 const label=page.getByText('Sunny Wrapped',{exact:true});await label.waitFor();
 const font=await label.evaluate(e=>getComputedStyle(e).fontSize);
 await page.getByRole('button',{name:'Ritmo e calendario ›',exact:true}).click();
 const legend=page.getByRole('dialog').getByText(/^meno/).last();
 const fills=await legend.locator('span[style]').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number).join(' ')));
 const colors=await page.getByRole('dialog').locator('.ui-rhythm-cell[style]').evaluateAll(es=>[...new Set(es.filter(e=>e.style.background.includes('rgba')).map(e=>getComputedStyle(e).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number).join(' ')))]);
 const pass=font==='10px'&&fills.every(c=>colors.includes(c));
 results.push({theme,font,fills,colors,pass});console.log(pass?'PASS':'FAIL',JSON.stringify(results.at(-1)));
 await page.close();
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
