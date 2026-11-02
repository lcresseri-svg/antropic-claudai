#!/usr/bin/env node
/** Read-only export: no Firestore write endpoint is used. Node >=18, gcloud. */
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
export const UID='qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';
const PROJECT='sunny-a2a98';
const SOURCE='prima-aggiornamento-ricorrenti';
const TARGET='(default)';
const ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/`;
const idOf=d=>d.name.split('/').at(-1);
const val=(d,k)=>d?.fields?.[k];
const type=d=>val(d,'type')?.stringValue;
export function compare(source,live){
 const current=new Map(live.map(d=>[idOf(d),d]));
 const original=new Map(source.map(d=>[idOf(d),d]));
 const changed=[],missing=[];
 for(const [id,before] of original){
  const after=current.get(id);
  if(!after){missing.push(id);continue;}
  const fields=[...new Set([...Object.keys(before.fields??{}),...Object.keys(after.fields??{})])]
   .filter(key=>!isDeepStrictEqual(val(before,key),val(after,key))).sort();
  if(fields.length) changed.push({id,fields});
 }
 const candidates=new Set([...missing,...changed.map(d=>d.id)]);
 const relevant=[...candidates].map(id=>[id,original.get(id),current.get(id)]);
 return {sourceCount:source.length,liveCount:live.length,unchanged:source.length-missing.length-changed.length,
  changed,missing,liveOnly:[...current.keys()].filter(id=>!original.has(id)),
  recurringTemplates:relevant.filter(([,a,b])=>val(a,'recurring')||val(b,'recurring')).map(([id])=>id),
  investments:relevant.filter(([,a,b])=>type(a)==='investment'||type(b)==='investment'||val(a,'valueEffect')||val(b,'valueEffect')).map(([id])=>id),
  refundRows:relevant.filter(([,a,b])=>[a,b].some(d=>type(d)==='refund'||val(d,'refundGroupId')||val(d,'refundOf'))).map(([id])=>id),
  automaticSettlements:relevant.filter(([id,a,b])=>id.startsWith('__cc__')||val(a,'creditCardSettlement')||val(b,'creditCardSettlement')).map(([id])=>id),
 };
}
export async function readTransactions(database,request){
 if(![SOURCE,TARGET].includes(database)) throw new Error('Database non previsto.');
 const prefix=`projects/${PROJECT}/databases/${database}/documents/users/${UID}/transactions/`;
 const docs=[];let token='';const seenTokens=new Set();const ids=new Set();
 do{
  const params=new URLSearchParams({pageSize:'1000'});if(token)params.set('pageToken',token);
  const response=await request(`${ROOT}${database}/documents/users/${UID}/transactions?${params}`,{method:'GET'});
  if(!response.ok)throw new Error(`Lettura ${database} fallita: HTTP ${response.status}. Controlla account Google e permessi Firestore.`);
  const body=await response.json();
  for(const doc of body.documents??[]){
   if(!doc.name?.startsWith(prefix)||doc.name.slice(prefix.length).includes('/'))throw new Error('Documento fuori dal percorso previsto.');
   if(ids.has(doc.name))throw new Error('Pagina duplicata: ripeti esportazione.');
   ids.add(doc.name);docs.push(doc);
  }
  token=body.nextPageToken??'';
  if(token&&seenTokens.has(token))throw new Error('Paginazione non valida.');
  seenTokens.add(token);
 }while(token);
 return docs;
}
async function main(){
 if(process.argv.length>3||process.argv[2]?.startsWith('--'))throw new Error('Uso: node export-admin-recovery.mjs [cartella-output]');
 const output=resolve(process.argv[2]??`sunny-recovery-${new Date().toISOString().replace(/[:.]/g,'-')}`);
 await mkdir(output,{mode:0o700}); // fail rather than overwrite an earlier backup
 const credential=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(!credential)throw new Error('Accesso Google non disponibile.');
 const request=(url,opts)=>fetch(url,{...opts,headers:{Authorization:`Bearer ${credential}`},signal:AbortSignal.timeout(60000)});
 const save=async(name,body)=>{const temp=join(output,name+'.tmp');await writeFile(temp,JSON.stringify(body,null,2),{mode:0o600,flag:'wx'});await rename(temp,join(output,name));};
 const metadata={project:PROJECT,uid:UID,exportedAt:new Date().toISOString(),format:'firestore-rest-v1',scope:'transactions-only'};
 // Save current production transactions BEFORE reading the restored source.
 const live=await readTransactions(TARGET,request);
 await save('default-prima-del-recupero.json',{...metadata,database:TARGET,documents:live});
 const source=await readTransactions(SOURCE,request);
 await save('ripristinato-transazioni.json',{...metadata,database:SOURCE,documents:source});
 if(!source.length)throw new Error('Nessuna transazione nel clone per questo UID. Copia live salvata; verifica UID e database.');
 const report=compare(source,live);
 await save('confronto.json',{...metadata,source:SOURCE,target:TARGET,...report});
 const summary=[`UID: ${UID}`,`Transazioni clone: ${report.sourceCount}`,`Transazioni live: ${report.liveCount}`,
  `Uguali: ${report.unchanged}`,`ID presenti in entrambi con campi diversi: ${report.changed.length}`,
  `ID solo nel clone: ${report.missing.length}`,`ID solo nel live (piu recenti o assenti nel clone): ${report.liveOnly.length}`,
  `Regole ricorrenti da valutare: ${report.recurringTemplates.length}`,`Investimenti da riconciliare: ${report.investments.length}`,
  `Righe rimborso da riconciliare: ${report.refundRows.length}`,`Addebiti carta automatici da valutare: ${report.automaticSettlements.length}`,
  `File salvati: ${output}`,'Scritture Firestore eseguite: 0'].join('\n');
 await save('riepilogo.json',summary.split('\n'));
 console.log(summary);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{console.error(error instanceof Error?error.message:'Esportazione fallita.');process.exitCode=1;});
}
