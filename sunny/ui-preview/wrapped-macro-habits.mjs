import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,browserOptions} from './browser.mjs';
const out=process.env.SUNNY_EVIDENCE||'/workspace/wrapped-macro-habits';
await mkdir(out,{recursive:true});const results=[],errors=[];
const cases=[...[320,390,1440].flatMap(width=>['light','dark'].map(theme=>({ui:3,width,theme,mode:'rich'}))),...['light','dark'].map(theme=>({ui:2,width:390,theme,mode:'rich'})),...['long','unbroken','deleted','sparse','planned','series'].flatMap(mode=>['light','dark'].map(theme=>({ui:3,width:320,theme,mode})))];
const height=Number(process.env.SUNNY_HEIGHT||844);
const browser=await chromium.launch(browserOptions);
try{for(const scenario of cases.filter(s=>!process.env.SUNNY_MODES||process.env.SUNNY_MODES.split(',').includes(s.mode))){
 const {ui,width,theme,mode}=scenario,name=`ui${ui}-${theme}-${width}-${mode}`,page=await browser.newPage({viewport:{width,height}});
 page.on('pageerror',e=>errors.push({name,error:e.message}));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
 await page.goto(`http://127.0.0.1:4177/ui-preview/index.html?ui=${ui}&theme=${theme}&wrappedSpending=${mode}`);await page.locator('#preview-writes').waitFor();
 await page.evaluate(()=>{history.pushState({},'','/wrapped/2026');dispatchEvent(new PopStateEvent('popstate'));});
 const shell=page.locator('.wrapped-shell');await shell.waitFor();
 const labels=[];let summary=false;
 for(let step=0;step<20;step++){
  await page.clock.runFor(400);
  assert.ok(await shell.evaluate(el=>el.scrollWidth<=el.clientWidth),`${name} shell overflow`);
  if(await shell.getByRole('heading',{name:'Tutto in una schermata',exact:true}).count()){
   summary=true;const text=await shell.textContent();assert.ok(text.includes('Movimenti'));
   assert.equal(text.includes('Le tue macro aree'),mode!=='deleted');
   assert.equal(text.includes('La voce che torna più spesso'),mode!=='sparse');
   await page.screenshot({path:`${out}/${name}-summary.png`,animations:'disabled'});break;
  }
  const content=shell.locator('.overflow-y-auto'),labelElement=content.locator(':scope > div > p').first(),label=await labelElement.textContent();labels.push(label);
  const bounds=await content.boundingBox(),labelBounds=await labelElement.boundingBox();
  assert.ok(labelBounds.y>=bounds.y-1&&labelBounds.y+labelBounds.height<=bounds.y+bounds.height+1,`${name} ${label} starts visibly at scroll origin`);
  // Read the end of tall stories; the next story must start from its own top.
  await content.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  assert.ok(await content.evaluate(el=>el.scrollWidth<=el.clientWidth),`${name} ${label} content overflow`);
  if(['Le grandi aree del tuo anno','Categoria numero uno','La spesa più grande','La spesa più grande (già in programma)','La voce che torna più spesso'].includes(label)){
   const text=await content.textContent();
   if(label==='Le grandi aree del tuo anno'){
    assert.ok(text.includes('Senza macrocategoria')||text.includes('Un’altra area'));
    if(mode==='planned')assert.ok(text.includes('programmato è compreso'));
   }
   if(label==='La voce che torna più spesso'){
    assert.ok(text.includes('Solo spese già avvenute'));
    assert.ok(text.includes(mode==='series'?'stessa serie':'stessa descrizione e categoria'));
   }
   if(mode==='rich'||label==='Le grandi aree del tuo anno'||label==='La voce che torna più spesso')await page.screenshot({path:`${out}/${name}-${label==='Le grandi aree del tuo anno'?'macros':label==='Categoria numero uno'?'categories':label==='La voce che torna più spesso'?'frequent':'largest'}.png`,animations:'disabled'});
   if(mode==='rich'&&ui===3&&width===390&&label==='Le grandi aree del tuo anno'){
    // Hold pauses, automatic advance works, and the left zone returns to the same story.
    const x=width/2+80;await page.mouse.move(x,500);await page.mouse.down();await page.clock.runFor(16000);
    await shell.getByText('Le grandi aree del tuo anno',{exact:true}).waitFor();await page.mouse.up();
    await shell.getByText('Categoria numero uno',{exact:true}).waitFor();await page.mouse.click(width/2-80,500);
    await shell.getByText('Le grandi aree del tuo anno',{exact:true}).waitFor();
    await page.clock.runFor(15500);await shell.getByText('Categoria numero uno',{exact:true}).waitFor();
    await page.mouse.click(width/2-80,500);
    await page.mouse.move(width/2+60,500);await page.mouse.down();await page.mouse.move(width/2-60,500);await page.mouse.up();
    await shell.getByText('Categoria numero uno',{exact:true}).waitFor();
    await page.mouse.move(width/2-60,500);await page.mouse.down();await page.mouse.move(width/2+60,500);await page.mouse.up();
    await shell.getByText('Le grandi aree del tuo anno',{exact:true}).waitFor();
   }
  }
  await page.mouse.click(Math.min(width-50,width/2+150),500);
 }
 assert.ok(summary,`${name} summary reachable`);assert.ok(labels.length<=13,`${name} max 13 stories`);
 assert.equal(labels.includes('Le grandi aree del tuo anno'),mode!=='deleted');
 assert.equal(labels.includes('La voce che torna più spesso'),mode!=='sparse');
 const largest=labels.findIndex(l=>l.startsWith('La spesa più grande')),category=labels.indexOf('Categoria numero uno');assert.equal(largest,category+1);
 if(mode!=='sparse')assert.equal(labels.indexOf('La voce che torna più spesso'),largest+1);
 await shell.getByRole('button',{name:/Imposta l.obiettivo/}).click();await page.clock.runFor(400);
 const before=await shell.textContent();await shell.getByRole('button',{name:'Aggiungi 50 euro',exact:true}).click();await shell.getByRole('button',{name:'Togli 50 euro',exact:true}).click();assert.equal(await shell.textContent(),before);
 await page.keyboard.press('Escape');await shell.waitFor({state:'detached'});assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('light')),theme==='light');
 results.push({...scenario,height,status:'passed',labels,checks:['conditional-stories','macro-details','exact-frequency','largest-order','max-13','content-width','vertical-scroll-origin','summary','goal','escape','theme-restored']});
 await page.close();console.log('PASS',name);
}assert.deepEqual(errors,[]);}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));}
