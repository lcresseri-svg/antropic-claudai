import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildWrites,UID} from './restore-admin-amounts.mjs';
const ids=['IesVmTQn37lRtyTGsri4','gRiRZwS2p5Cx2nNyHX27'];
const docs=(db,amounts)=>({project:'sunny-a2a98',uid:UID,database:db,documents:ids.map((id,i)=>({name:`projects/sunny-a2a98/databases/${db}/documents/users/${UID}/transactions/${id}`,updateTime:'2026-11-02T08:08:49Z',fields:{type:{stringValue:'expense'},amount:{doubleValue:amounts[i]}}}))});
test('patches exactly two expense amounts in one commit with original update preconditions',()=>{
 const writes=buildWrites(docs('prima-aggiornamento-ricorrenti',[1.24,234.33]),docs('(default)',[.74,.74]));
 assert.equal(writes.length,2);
 assert.deepEqual(writes.map(w=>w.update.fields),[{amount:{doubleValue:1.24}},{amount:{doubleValue:234.33}}]);
 for(const w of writes){assert.deepEqual(w.updateMask,{fieldPaths:['amount']});assert.deepEqual(w.currentDocument,{updateTime:'2026-11-02T08:08:49Z'});assert.ok(w.update.name.includes('/databases/(default)/'));}
});
test('rejects a different UID, amount, type or absent precondition before writing',()=>{
 const source=docs('prima-aggiornamento-ricorrenti',[1.24,234.33]),live=docs('(default)',[.74,.74]);
 assert.throws(()=>buildWrites({...source,uid:'other'},live));
 assert.throws(()=>buildWrites(docs('prima-aggiornamento-ricorrenti',[2,234.33]),live));
 const bad=structuredClone(live);bad.documents[0].fields.type.stringValue='investment';assert.throws(()=>buildWrites(source,bad));
 delete bad.documents[0].updateTime;assert.throws(()=>buildWrites(source,bad));
});

test('CLI preview has no network; apply saves backup then commits once and verifies both amounts',async()=>{
 const fs=await import('node:fs/promises');const {tmpdir}=await import('node:os');
 const {join,resolve}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const dir=await fs.mkdtemp(join(tmpdir(),'sunny-restore-test-'));
 try{
  await fs.mkdir(join(dir,'bin'));
  await fs.writeFile(join(dir,'ripristinato-transazioni.json'),JSON.stringify(docs('prima-aggiornamento-ricorrenti',[1.24,234.33])));
  await fs.writeFile(join(dir,'default-prima-del-recupero.json'),JSON.stringify(docs('(default)',[.74,.74])));
  const cmd=resolve('scripts/restore-admin-amounts.mjs');
  let result=spawnSync(process.execPath,[cmd,dir],{env:{...process.env,PATH:join(dir,'bin')},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/ANTEPRIMA/);
  await fs.writeFile(join(dir,'bin','gcloud'),'#!/bin/sh\nprintf test-only-token',{mode:0o700});
  await fs.writeFile(join(dir,'bin','curl'),`#!${process.execPath}
   const fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2);
   if(args.some(a=>a.includes('test-only-token')))throw new Error('Token leaked');
   const method=args[args.indexOf('--request')+1];
   fs.appendFileSync(${JSON.stringify(join(dir,'calls'))},method+'\\n');
   if(method==='POST'){
    const files=fs.readdirSync(${JSON.stringify(dir)});
    if(!files.some(f=>f.startsWith('prima-correzione-importi-')))throw new Error('Backup missing');
    const payload=JSON.parse(fs.readFileSync(args[args.indexOf('--data-binary')+1].slice(1),'utf8'));
    if(payload.writes.length!==2||payload.writes.some(w=>w.updateMask.fieldPaths.join()!=='amount'||!w.currentDocument.updateTime))throw new Error('Unsafe commit');
    process.stdout.write(JSON.stringify({writeResults:[{},{}],commitTime:'2026-11-02T09:00:00Z'})+'\\n200');
   }else{
    const amount=args.at(-1).endsWith('${ids[0]}')?1.24:234.33;
    process.stdout.write(JSON.stringify({fields:{amount:{doubleValue:amount}}})+'\\n200');
   }
  `,{mode:0o700});
  result=spawnSync(process.execPath,[cmd,dir,'--apply'],{env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/RECUPERO COMPLETATO/);
  assert.equal(await fs.readFile(join(dir,'calls'),'utf8'),'POST\nGET\nGET\n');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
