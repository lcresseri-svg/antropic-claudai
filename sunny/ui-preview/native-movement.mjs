import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/native-movement';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[],errors=[];
const cases=[2,3].flatMap(ui=>['light','dark'].flatMap(theme=>[320,390,834,1440].map(width=>({ui,theme,width}))));
async function start({ui,theme,width},extra=''){
 const page=await browser.newPage({viewport:{width,height:width===834?1194:844},hasTouch:width<1000});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>{const original=HTMLInputElement.prototype.showPicker;window.__pickerCalls=0;if(original)HTMLInputElement.prototype.showPicker=function(){window.__pickerCalls++;return original.call(this);};});
 await page.clock.install({time:new Date('2026-11-01T10:00:00Z')});
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}&editor${extra}`);
 await page.locator('.movement-editor').waitFor();return page;
}
const saved=page=>page.locator('#preview-last-save').evaluate(el=>JSON.parse(el.textContent));
const native=async(field,mode)=>{assert.equal(await field.count(),1);assert.equal(await field.getAttribute('readonly'),null);assert.equal(await field.getAttribute('inputmode'),mode);};
try{
 for(const scenario of (process.env.SUNNY_EXTRAS_ONLY?[]:cases)){
  const {ui,theme,width}=scenario,name=`ui${ui}-${theme}-${width}`,page=await start(scenario),editor=page.locator('.movement-editor'),amount=editor.getByRole('textbox',{name:'Importo',exact:true});
  await native(amount,'decimal');assert.equal(await page.locator('.ui-keypad-grid,.ui-keypad-toggle').count(),0);
  assert.equal(await editor.getByRole('button',{name:/^(Modifica|Dettagli avanzati)$/}).count(),0);
  assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'INPUT','opening does not summon a keyboard');
  await amount.click();assert.ok(await amount.evaluate(el=>el===document.activeElement));await amount.pressSequentially('12,50');assert.equal(await amount.inputValue(),'12,50');
  const account=editor.getByRole('combobox',{name:'Conto',exact:true});await account.click({position:{x:6,y:6}});await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  const accountValue=await account.inputValue();assert.notEqual(accountValue,'conto_corrente','tile opens a real selectable account list');
  const date=editor.getByLabel('Data',{exact:true});await date.click({position:{x:6,y:6}});assert.ok(await page.evaluate(()=>window.__pickerCalls>0),'date tile directly requests native calendar');
  await date.fill('2026-11-15');await amount.click();await editor.getByText('Data futura:',{exact:false}).waitFor();
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:450});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:30});visualViewport.dispatchEvent(new Event('resize'));});await page.clock.runFor(400);
  const footerBox=await editor.locator('.ui-editor-footer').boundingBox();assert.ok(footerBox.y>=30&&footerBox.y+footerBox.height<=481,`${name} footer above keyboard: ${JSON.stringify(footerBox)}`);assert.equal(await amount.inputValue(),'12,50');
  await page.screenshot({path:`${out}/${name}-keyboard.png`,animations:'disabled'});
  await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});await page.clock.runFor(400);
  if(ui===3&&width===390){
   await amount.focus();const body=editor.locator('form > .overflow-y-auto');const sample=()=>body.evaluate(el=>({height:el.scrollHeight,top:el.scrollTop,page:document.getElementById('app-scroll').scrollTop}));const before=await sample();
   await page.keyboard.press('Escape');const discard=page.getByRole('alertdialog',{name:'Scartare le modifiche?'});await discard.waitFor();assert.deepEqual(await sample(),before);
   await page.keyboard.press('Escape');await discard.waitFor({state:'detached'});assert.ok(await amount.evaluate(el=>el===document.activeElement));assert.equal(await amount.inputValue(),'12,50');
  }
  await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});
  await editor.getByRole('button',{name:"Salva e aggiungi un'altra",exact:true}).click();await page.locator('#preview-writes').getByText('1',{exact:true}).waitFor();
  const payload=await saved(page);assert.equal(payload.length,1);assert.equal(payload[0].amount,12.5);assert.equal(payload[0].account,accountValue);assert.equal(payload[0].date,'2026-11-15');
  assert.equal(await amount.inputValue(),'');assert.equal(await account.inputValue(),accountValue);assert.equal(await date.inputValue(),'2026-11-15');
  await page.keyboard.press('Escape');await editor.waitFor({state:'detached'});assert.equal(await page.locator('[inert]').count(),0);
  results.push({...scenario,status:'passed',checks:['native-amount','account-dropdown','calendar-full-tile','future-date','keyboard-viewport','draft-focus','save-next-context','clean-close']});await page.close();console.log('PASS',name);
 }
 for(const ui of [2,3])for(const theme of ['light','dark']){
  const scenario={ui,theme,width:390},page=await start(scenario,'&generic'),editor=page.locator('.movement-editor');
  await editor.getByRole('textbox',{name:'Importo',exact:true}).fill('100');await editor.getByRole('button',{name:/Ricorrente, condivisa/}).click();await editor.getByRole('button',{name:/Spesa condivisa/}).click();await editor.getByRole('button',{name:'+ Aggiungi quota rimborsata',exact:true}).click();
  const quote=editor.getByRole('textbox',{name:'Quota rimborsata 1',exact:true});await native(quote,'decimal');await quote.fill('40');await editor.getByRole('button',{name:'Aggiungi uscita',exact:true}).click();await editor.waitFor({state:'detached'});let rows=await saved(page);assert.equal(rows.find(t=>t.type==='expense').amount,60);assert.equal(rows.find(t=>t.type==='transfer').amount,40);await page.close();
  const investment=await start(scenario,'&edit=investment&pensionEditor&sourceLessEditor'),inv=investment.locator('.movement-editor');await inv.getByRole('button',{name:/Ricorrente, condivisa/}).click();assert.equal(await inv.getByRole('combobox',{name:'Conto',exact:true}).inputValue(),'');await inv.getByRole('combobox',{name:'Conto',exact:true}).selectOption('conto_corrente');
  for(const [label,value] of [['Di cui TFR','30'],['Commissione','1,50']]){const field=inv.getByRole('textbox',{name:label,exact:true});await native(field,'decimal');await field.fill(value);}
  await inv.getByRole('button',{name:'Personal.',exact:true}).click();const spread=inv.getByRole('textbox',{name:'Mesi di distribuzione',exact:true});await native(spread,'numeric');await spread.fill('6');
  const acc=inv.getByRole('combobox',{name:'Conto',exact:true});await acc.selectOption('');await inv.getByText('Questo versamento non esce da nessun conto:',{exact:false}).waitFor();await acc.selectOption('conto_corrente');await inv.getByRole('textbox',{name:'Importo',exact:true}).fill('120');await inv.getByRole('button',{name:'Salva modifiche',exact:true}).click();await inv.waitFor({state:'detached'});rows=await saved(investment);assert.equal(rows.find(t=>t.type==='investment').tfr,30);assert.equal(rows.find(t=>t.type==='investment').statsSpreadMonths,6);assert.equal(rows.find(t=>t.type==='expense').amount,1.5);await investment.close();
  const installments=await start(scenario,'&generic'),inst=installments.locator('.movement-editor');await inst.getByRole('button',{name:/Ricorrente, condivisa/}).click();await inst.getByRole('button',{name:'A rate',exact:true}).click();const total=inst.getByRole('textbox',{name:'Totale piano',exact:true}),count=inst.getByRole('textbox',{name:'Numero rate',exact:true});await native(total,'decimal');await native(count,'numeric');await total.fill('100');await count.fill('3');await inst.getByRole('button',{name:'Aggiungi uscita',exact:true}).click();await inst.waitFor({state:'detached'});rows=await saved(installments);assert.equal(rows[0].amount,33.33);assert.equal(rows[0].seriesMeta.installment.totalInstallments,3);await installments.close();
  const archived=await start(scenario,'&edit=expense&archivedEditorAccount'),arch=archived.locator('.movement-editor');assert.equal(await arch.getByRole('combobox',{name:'Conto',exact:true}).inputValue(),'conto_corrente');await arch.getByRole('button',{name:'Salva modifiche',exact:true}).click();await arch.waitFor({state:'detached'});rows=await saved(archived);assert.equal(rows[0].account,'conto_corrente');await archived.close();
  const failure=await start(scenario,'&awaitSave&singleSave&failSave'),fail=failure.locator('.movement-editor');await fail.getByRole('textbox',{name:'Importo',exact:true}).fill('25,40');await fail.getByRole('button',{name:'Aggiungi uscita',exact:true}).click();await fail.getByRole('button',{name:'Riprova',exact:true}).waitFor();assert.equal(await fail.getByRole('textbox',{name:'Importo',exact:true}).inputValue(),'25,40');assert.equal(await failure.locator('#preview-writes').textContent(),'0');await failure.close();
  const fallback=await start(scenario,'&generic'),fb=fallback.locator('.movement-editor');await fallback.evaluate(()=>{HTMLInputElement.prototype.showPicker=undefined;});await fb.getByLabel('Data',{exact:true}).click({position:{x:6,y:6}});await fb.getByLabel('Data',{exact:true}).fill('2026-11-16');await fb.getByRole('textbox',{name:'Importo',exact:true}).fill('18.25');await fb.getByRole('button',{name:'Aggiungi uscita',exact:true}).click();await fb.waitFor({state:'detached'});rows=await saved(fallback);assert.equal(rows[0].date,'2026-11-16');assert.equal(rows[0].amount,18.25);await fallback.close();
  const transfer=await start(scenario,'&generic'),tr=transfer.locator('.movement-editor');await tr.getByRole('button',{name:'Movimento',exact:true}).click();await tr.getByRole('textbox',{name:'Importo',exact:true}).fill('55,75');await tr.getByRole('combobox',{name:'Da conto',exact:true}).selectOption('conto_corrente');await tr.getByRole('combobox',{name:'A conto',exact:true}).selectOption('contanti');await tr.getByLabel('Data',{exact:true}).click();await tr.getByLabel('Data',{exact:true}).fill('2026-11-17');await tr.getByRole('button',{name:'Aggiungi movimento',exact:true}).click();await tr.waitFor({state:'detached'});rows=await saved(transfer);assert.equal(rows[0].type,'transfer');assert.equal(rows[0].account,'conto_corrente');assert.equal(rows[0].toAccount,'contanti');assert.equal(rows[0].date,'2026-11-17');assert.equal(rows[0].amount,55.75);await transfer.close();
  results.push({...scenario,status:'passed',checks:['shared-quotes','native-TFR-fee-statistical-months','source-less-investment','installment-integer','archived-account-edit','failed-save-retains-draft','calendar-fallback','transfer-direct-controls']});console.log('PASS extras',ui,theme);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));}
