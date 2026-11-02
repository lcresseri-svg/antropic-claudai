import {test} from 'node:test';
import assert from 'node:assert/strict';
import { compare, readTransactions, UID } from './export-admin-recovery.mjs';
const row=(id,fields)=>({name:`projects/sunny-a2a98/databases/(default)/documents/users/${UID}/transactions/${id}`,fields});
const str=stringValue=>({stringValue});
const num=doubleValue=>({doubleValue});
test('reports overwritten, missing and newer IDs separately without deleting or mutating data',()=>{
 const source=[row('same',{amount:num(10)}),row('changed',{amount:num(20)}),row('missing',{amount:num(5)})];
 const live=[row('same',{amount:num(10)}),row('changed',{amount:num(30)}),row('new',{amount:num(40)})];
 const before=JSON.stringify([source,live]);
 const report=compare(source,live);
 assert.deepEqual(report.changed.map(t=>t.id),['changed']);
 assert.deepEqual(report.changed[0].fields,['amount']);
 assert.deepEqual(report.missing,['missing']);assert.deepEqual(report.liveOnly,['new']);
 assert.equal(JSON.stringify([source,live]),before);
});
test('detects rules, managed investments and refunds needing reconciliation',()=>{
 const source=[row('rule',{recurring:{mapValue:{fields:{freq:str('monthly')}}}}),row('fund',{type:str('investment'),amount:num(10)}),row('refund',{type:str('refund'),refundOf:str('expense')})];
 const live=[row('rule',{recurring:{mapValue:{fields:{freq:str('yearly')}}}}),row('fund',{type:str('income'),amount:num(10)})];
 const report=compare(source,live);
 assert.deepEqual(report.recurringTemplates,['rule']);assert.deepEqual(report.investments,['fund']);assert.deepEqual(report.refundRows,['refund']);
});
test('compares Firestore maps semantically and preserves typed values',()=>{
 assert.equal(compare([row('x',{a:str('x'),b:{timestampValue:'2026-01-01T00:00:00Z'}})],[row('x',{b:{timestampValue:'2026-01-01T00:00:00Z'},a:str('x')})]).changed.length,0);
});
test('reads both pages exclusively via GET inside the fixed UID',async()=>{
 const calls=[];
 const request=async(url,opts)=>{calls.push([url,opts]);return{ok:true,json:async()=>calls.length===1?{documents:[row('a',{})],nextPageToken:'next token'}:{documents:[row('b',{})]}};};
 const docs=await readTransactions('(default)',request);
 assert.equal(docs.length,2);assert.equal(calls.length,2);
 assert.ok(calls.every(([u,o])=>u.includes(`/users/${UID}/transactions?`)&&o.method==='GET'));
 assert.match(calls[1][0],/pageToken=next\+token/);
 await assert.rejects(()=>readTransactions('another-db',request),/Database/);
 assert.equal(calls.length,2);
});

test('rejects documents from another user before saving them',async()=>{
 await assert.rejects(()=>readTransactions('(default)',async()=>({ok:true,json:async()=>({documents:[{name:'projects/sunny-a2a98/databases/(default)/documents/users/another-user/transactions/private',fields:{}}]})})),/fuori dal percorso/);
});

test('main exports the live backup and restored documents with no write request',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const temp=await mkdtemp(join(tmpdir(),'sunny-export-test-'));
 try{
  await mkdir(join(temp,'bin'));
  await writeFile(join(temp,'bin','gcloud'),'#!/bin/sh\nprintf test-only-token',{mode:0o700});
  const preload=join(temp,'fetch.mjs');
  await writeFile(preload,`globalThis.fetch=async(url,options)=>{
   if(options.method!=='GET')throw new Error('Firestore write attempted');
   const database=url.includes('/databases/(default)/')?'(default)':'prima-aggiornamento-ricorrenti';
   const name='projects/sunny-a2a98/databases/'+database+'/documents/users/${UID}/transactions/example';
   return {ok:true,json:async()=>({documents:[{name,fields:{amount:{doubleValue:database==='(default)'?20:10},date:{timestampValue:'2026-01-01T00:00:00Z'}}}]})};
  };`);
  const output=join(temp,'export');
  const run=()=>spawnSync(process.execPath,['--import',preload,resolve('scripts/export-admin-recovery.mjs'),output],{env:{...process.env,PATH:join(temp,'bin')+':'+process.env.PATH},encoding:'utf8'});
  const result=run();assert.equal(result.status,0,result.stderr);
  const before=JSON.parse(await readFile(join(output,'default-prima-del-recupero.json'),'utf8'));
  const source=JSON.parse(await readFile(join(output,'ripristinato-transazioni.json'),'utf8'));
  assert.equal(before.documents[0].fields.amount.doubleValue,20);assert.equal(source.documents[0].fields.amount.doubleValue,10);
  assert.equal(source.documents[0].fields.date.timestampValue,'2026-01-01T00:00:00Z');
  assert.match(result.stdout,/Scritture Firestore eseguite: 0/);
  assert.notEqual(run().status,0,'must not overwrite an existing recovery directory');
  assert.equal(JSON.parse(await readFile(join(output,'default-prima-del-recupero.json'),'utf8')).documents[0].fields.amount.doubleValue,20);
 }finally{await rm(temp,{recursive:true,force:true});}
});
