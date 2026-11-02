#!/usr/bin/env node
/** Incident-specific recovery. Default: preview. Explicit --apply: atomic two-field commit. */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export const UID='qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';
const PROJECT='sunny-a2a98', SOURCE='prima-aggiornamento-ricorrenti', TARGET='(default)';
const PREFIX=`projects/${PROJECT}/databases/${TARGET}/documents/users/${UID}/transactions/`;
const FIXES=[['IesVmTQn37lRtyTGsri4',1.24],['gRiRZwS2p5Cx2nNyHX27',234.33]];
const amount=d=>Number(d?.fields?.amount?.doubleValue??d?.fields?.amount?.integerValue);
export function buildWrites(source,live){
 for(const [snapshot,database] of [[source,SOURCE],[live,TARGET]]){
  assert.equal(snapshot.project,PROJECT,'Progetto inatteso');assert.equal(snapshot.uid,UID,'UID inatteso');assert.equal(snapshot.database,database,'Database inatteso');
 }
 return FIXES.map(([id,value])=>{
  const old=source.documents.find(d=>d.name===`projects/${PROJECT}/databases/${SOURCE}/documents/users/${UID}/transactions/${id}`);
  const before=live.documents.find(d=>d.name===PREFIX+id);
  assert.equal(old?.fields?.type?.stringValue,'expense','Tipo sorgente inatteso');
  assert.equal(before?.fields?.type?.stringValue,'expense','Tipo live inatteso');
  assert.equal(amount(old),value,'Importo clone inatteso');assert.ok([.74,value].includes(amount(before)),'Importo live inatteso: fermato per proteggere una modifica successiva');
  assert.ok(before.updateTime,'Manca updateTime: esportazione non valida');
  for(const doc of [old,before])for(const key of ['valueEffect','refundOf','refundGroupId','creditCardSettlement','recurring'])assert.ok(!doc.fields[key],`Campo incompatibile: ${key}`);
  if(amount(before)===value)return null;
  return {update:{name:PREFIX+id,fields:{amount:old.fields.amount}},updateMask:{fieldPaths:['amount']},currentDocument:{updateTime:before.updateTime}};
 }).filter(Boolean);
}
function main(){
 const [directory,mode]=process.argv.slice(2);
 if(!directory||![undefined,'--apply'].includes(mode)||process.argv.length>4)throw new Error('Uso: node restore-admin-amounts.mjs CARTELLA_EXPORT [--apply]');
 const dir=resolve(directory),read=name=>JSON.parse(fs.readFileSync(join(dir,name),'utf8'));
 const source=read('ripristinato-transazioni.json'),live=read('default-prima-del-recupero.json');
 let writes=buildWrites(source,live);
 for(const [id,value] of FIXES)console.log(`${id}: 0,74 EUR -> ${value.toFixed(2)} EUR`);
 console.log('Termine serie conservato: 30 ottobre 2026. Transazioni nuove conservate.');
 if(!mode){console.log('ANTEPRIMA: nessuna scrittura. Aggiungi --apply per eseguire le due correzioni.');return;}
 const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}).trim();
 if(!token)throw new Error('Autenticazione non disponibile.');
 const request=(method,url,file)=>{
  const args=['--silent','--show-error','--request',method,'--connect-timeout','15','--max-time','60','--write-out','\\n%{http_code}','--config','-'];
  if(file)args.push('--data-binary',`@${file}`);
  args.push(url);
  const raw=execFileSync('curl',args,{input:`header = ${JSON.stringify(`Authorization: Bearer ${token}`)}\nheader = "Content-Type: application/json"\n`,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:65000,maxBuffer:8*1024*1024});
  const split=raw.lastIndexOf('\n'),status=Number(raw.slice(split+1));
  if(split<0||status<200||status>=300)throw new Error(`Firestore HTTP ${status}: ${raw.slice(0,split)}`);
  return JSON.parse(raw.slice(0,split));
 };
 const base=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${TARGET}/documents`;
 console.log('Lettura dei due documenti live prima del recupero...');
 const fresh={project:PROJECT,uid:UID,database:TARGET,documents:FIXES.map(([id])=>request('GET',base+`/users/${UID}/transactions/${id}`))};
 for(const document of fresh.documents)console.log(`LIVE ${document.name.split('/').at(-1)}: ${amount(document).toFixed(2)} EUR`);
 writes=buildWrites(source,fresh);
 if(!writes.length){console.log('RECUPERO COMPLETATO: entrambi gli importi sono già corretti, verificati sul live. Nessuna scrittura.');return;}
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=join(dir,`prima-correzione-importi-${stamp}.json`);
 fs.writeFileSync(backup,JSON.stringify({project:PROJECT,uid:UID,documents:fresh.documents},null,2),{mode:0o600,flag:'wx'});
 const payload=join(dir,`commit-importi-${stamp}.json`);
 fs.writeFileSync(payload,JSON.stringify({writes}),{mode:0o600,flag:'wx'});
 console.log(`Invio di ${writes.length} correzioni atomiche con updateTime appena letto...`);
 let result;
 try{result=request('POST',base+':commit',payload);}
 catch(error){throw new Error(`${error.message}\nSe compare FAILED_PRECONDITION, i documenti sono cambiati: non forzare il recupero. In caso di timeout l’esito può essere incerto: verificare i due importi prima di riprovare.`);}
 fs.writeFileSync(join(dir,`esito-importi-${stamp}.json`),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
 assert.equal(result.writeResults?.length,writes.length,'Risposta commit inattesa: verificare i due importi');
 for(const [id,value] of FIXES){
  const document=request('GET',base+`/users/${UID}/transactions/${id}`);
  assert.equal(amount(document),value,`Verifica live fallita per ${id}`);
  console.log(`VERIFICATO ${id}: ${value.toFixed(2)} EUR`);
 }
 console.log(`RECUPERO COMPLETATO: ${writes.length} correzioni applicate, entrambi gli importi verificati sul live.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{main();}catch(error){console.error(error.message??'Recupero non completato');process.exitCode=1;}
}
