import assert from 'node:assert/strict';
import {chromium,browserOptions} from './browser.mjs';
const b=await chromium.launch(browserOptions);
try {for(const width of [390,834,1024,1440])for(const theme of ['light','dark']) {
 const p=await b.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await p.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}`);await p.locator('#preview-writes').waitFor();
 assert.equal(await p.getByRole('button',{name:/^Altro/}).count(),1);
 assert.equal(await p.locator('nav').getByRole('button',{name:/Altro/}).count(),0);
 await p.locator('#ui3-more-trigger').click();await p.getByRole('button',{name:'Impostazioni',exact:true}).click();await p.getByRole('heading',{name:'Impostazioni',exact:true}).first().waitFor();
 assert.equal(await p.getByRole('button',{name:/^Altro/}).count(),1);console.log('PASS',width,theme);await p.close();
}}finally{await b.close();}
