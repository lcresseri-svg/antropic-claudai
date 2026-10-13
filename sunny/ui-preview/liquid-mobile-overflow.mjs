import {chromium,browserOptions} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-mobile-fix';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);const results=[];
try {
for(const width of [320,390,430])for(const theme of ['light','dark']) {
 const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?theme=${theme}&manyCategories`);
 await page.locator('#preview-writes').waitFor();
 const section=page.locator('section:visible').filter({has:page.getByText('Dove vanno i soldi',{exact:true})});
 await section.scrollIntoViewIfNeeded();
 const dimensions=await page.locator('#app-scroll').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
 const color=await page.locator('[data-liquid-ui].app-shell').evaluate(el=>getComputedStyle(el).backgroundColor);
 const visibleLegends=await section.locator('ul:visible').count();
 await page.screenshot({path:`${out}/categories-${theme}-${width}.png`});
 const rows=await section.locator('dl > div').count();
 await section.getByRole('button',{name:'Tutte ›'}).click();
 await page.getByRole('heading',{name:'Spese per categoria',exact:true}).waitFor();
 const detailHasTail=await page.getByText('Categoria 11',{exact:true}).count()>0;
 const pass=rows===6&&detailHasTail&&dimensions.scrollWidth<=dimensions.width+1&&visibleLegends===0&&(theme!=='dark'||color==='rgb(0, 0, 0)')&&!errors.length;
 results.push({width,theme,...dimensions,color,visibleLegends,rows,detailHasTail,errors,pass});console.log(pass?'PASS':'FAIL',results.at(-1));
 await page.close();
}
}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
