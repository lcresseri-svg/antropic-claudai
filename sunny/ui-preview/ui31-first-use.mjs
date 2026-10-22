import assert from 'node:assert/strict';
import {chromium,browserOptions} from './browser.mjs';
const b=await chromium.launch(browserOptions);
try{for(const width of [320,390,834,1440])for(const theme of ['light','dark']){
  const p=await b.newPage({viewport:{width,height:900}});
  await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  for(const zero of [false,true]){
    await p.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}&empty&unknownBalance${zero?'&openingZero':''}`,{waitUntil:'domcontentloaded'});
    const balance=p.locator('.ui31-today-balance');await balance.waitFor();
    assert.equal(await balance.getByRole('link',{name:/Indica un saldo iniziale/}).count(),zero?0:1);
    assert.equal(await balance.locator(':scope > strong').count(),zero?1:0,'declared zero is distinct from missing data');
    await p.locator('[data-ui31-primary][href="/wealth"]').click();await p.getByRole('heading',{name:'Patrimonio',exact:true}).waitFor();
    if(!zero){await p.getByRole('heading',{name:'Saldo iniziale non indicato',exact:true}).waitFor();assert.equal(await p.locator('.liquid-headline-value,.ui31-cash-value').count(),0);}
    else {await p.locator('.ui31-cash-value').waitFor();assert.match(await p.locator('.ui31-cash-value').innerText(),/−|-|–/,'explicit zero supports the real negative reserve calculation');}
    assert.equal(await p.locator('#app-scroll').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  }
  console.log('PASS first use',width,theme,'missing and declared zero');await p.close();
}}finally{await b.close();}
