import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/compact-movement';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[],errors=[];
try{for(const ui of [2,3])for(const theme of ['light','dark'])for(const width of [320,390,834,1440]){
 const name=`ui${ui}-${theme}-${width}`,page=await browser.newPage({viewport:{width,height:width===834?1194:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}&editor`);const editor=page.locator('.movement-editor');await editor.waitFor();
 await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});
 const geometry=await editor.evaluate(el=>{const body=el.querySelector('form > .overflow-y-auto'),last=body.lastElementChild,footer=el.querySelector('.ui-editor-footer'),rect=el.getBoundingClientRect(),b=body.getBoundingClientRect(),end=last.getBoundingClientRect();return{height:rect.height,top:rect.top,bottom:rect.bottom,unused:b.bottom-end.bottom-parseFloat(getComputedStyle(body).paddingBottom),footerBottom:footer.getBoundingClientRect().bottom,overflow:el.scrollWidth>el.clientWidth};});
 assert.ok(geometry.unused<=3,`${name} unused vertical space: ${JSON.stringify(geometry)}`);assert.equal(geometry.overflow,false);assert.ok(geometry.bottom<=page.viewportSize().height+1);
 await editor.getByRole('button',{name:/Ricorrente, condivisa/}).click();await editor.getByRole('button',{name:'A rate',exact:true}).click();await editor.getByRole('textbox',{name:'Totale piano',exact:true}).fill('100');await editor.getByRole('textbox',{name:'Numero rate',exact:true}).fill('3');
 await page.setViewportSize({width,height:500});await page.waitForTimeout(300);const footer=await editor.locator('.ui-editor-footer').boundingBox();assert.ok(footer.y+footer.height<=501,`${name} expanded footer remains visible`);
 await page.screenshot({path:`${out}/${name}-expanded.png`,animations:'disabled'});
 results.push({ui,theme,width,status:'passed',geometry});await page.close();console.log('PASS',name);
}assert.deepEqual(errors,[]);}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));}
