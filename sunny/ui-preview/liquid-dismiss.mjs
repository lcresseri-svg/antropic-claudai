import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const out=process.env.SUNNY_EVIDENCE||'/workspace/ui3-dismiss';await mkdir(out,{recursive:true});
const require=createRequire((process.env.SUNNY_NODE_PACKAGES||'/workspace/cloud-setup/node_modules')+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:process.env.SUNNY_BROWSER||'/usr/bin/chromium',args:['--no-sandbox']});
try{
for(const height of [844,500])for(const theme of ['light','dark'])for(const editor of ['transaction','plan']){
 const page=await browser.newPage({viewport:{width:390,height}});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=3&theme=${theme}${editor==='transaction'?'&editor':'&pianoCase'}`);
 if(editor==='plan'){
  await page.evaluate(()=>{history.pushState({},'', '/budget');dispatchEvent(new PopStateEvent('popstate'));});
  await page.getByRole('button',{name:/Modifica piano/}).first().click();
 }
 const field=page.getByRole('textbox',{name:editor==='transaction'?'Importo':'Entrate Stipendio',exact:true});
 await field.fill('1234');
 const container=editor==='transaction'?'form > .overflow-y-auto':'.plan-dialog-body';
 const sample=()=>page.locator(container).evaluate(el=>({top:el.scrollTop,height:el.scrollHeight,rect:el.getBoundingClientRect().toJSON(),page:document.getElementById('app-scroll').scrollTop}));
 await page.locator(container).evaluate(el=>el.scrollTop=100);
 await field.focus();
 const before=await sample();
 await page.keyboard.press('Escape');
 const confirm=page.getByRole('alertdialog',{name:'Scartare le modifiche?'});
 await confirm.waitFor({timeout:3000});
 const during=await sample();
 assert.equal(during.height,before.height,'form scrollHeight stays stable');
 assert.ok(Math.abs(during.top-before.top)<=2,'form scroll stays stable');
 assert.ok(Math.abs(during.page-before.page)<=2,'page scroll stays stable');
 assert.equal(await field.inputValue(),'1234');
 assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Continua a modificare');
 await page.keyboard.press('Escape');
 assert.equal(await confirm.count(),0);
 assert.equal(await field.inputValue(),'1234');
 assert.equal(await field.evaluate(el=>el===document.activeElement),true,'focus returns to field');
 // X and backdrop follow the same dirty path; Plan also exposes Annulla.
 const methods=editor==='plan'?['x','cancel','backdrop']:['x','backdrop'];
 for(const method of methods){
  if(method==='x')await page.getByRole('button',{name:'Chiudi',exact:true}).click();
  if(method==='cancel')await page.getByRole('button',{name:'Annulla',exact:true}).click();
  if(method==='backdrop')await page.mouse.click(2,2);
  await confirm.waitFor({timeout:3000});
  assert.equal(await field.inputValue(),'1234');
  await page.getByRole('button',{name:'Continua a modificare'}).click();
 }
 await field.focus();await page.keyboard.press('Escape');
 await page.screenshot({path:`${out}/${editor}-${theme}-${height}.png`});
 await page.getByRole('button',{name:'Scarta modifiche',exact:true}).click();
 assert.equal(await page.getByRole('dialog').count(),0);
 assert.equal(await page.locator('[inert]').count(),0);
 console.log(`PASS ${height} ${theme} ${editor}`);await page.close();
}
}finally{await browser.close();}
