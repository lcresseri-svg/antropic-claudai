/** Synthetic fixtures only; run with FIRESTORE_EMULATOR_HOST=127.0.0.1:8087. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '../../../../firestore-tests/node_modules/@firebase/rules-unit-testing';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, runTransaction, getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { doc as seedDoc, setDoc as seedSetDoc } from '../../../../firestore-tests/node_modules/firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Transaction } from '../../types';
import { saveRefundReceipt, deleteRefundReceipt, saveSingleRefund, deleteSingleRefund, assertRefundSourceMutation } from './refundReceiptStore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const run = host ? describe : describe.skip;
let env: RulesTestEnvironment;
let db: Firestore;
let app: FirebaseApp;
const uid='refund-test-user';
const expense=(id:string,amount:number,extra:Record<string,unknown>={})=>({id,type:'expense',amount,date:'2026-10-01',description:id,category:'food',account:'bank',...extra});
const txRef=(id:string)=>doc(db,'users',uid,'transactions',id);
const controlRef=(id:string)=>doc(db,'users',uid,'refundControls',id);
const draft=(receiptId:string,amount=80,expenseIds=['a','b'])=>({receiptId,amount,expenseIds,date:'2026-10-10',account:'bank'});
const seed=async(id:string,amount:number,extra:Record<string,unknown>={})=>{
  const {id:_,...data}=expense(id,amount,extra);
  await env.withSecurityRulesDisabled(async c=>seedSetDoc(seedDoc(c.firestore(),'users',uid,'transactions',id),data));
};
run('refund receipt repository — real emulator and production rules',()=>{
  beforeAll(async()=>{
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host!))throw new Error('Local emulator required.');
    const [hostname,port]=host!.split(':');
    env=await initializeTestEnvironment({projectId:'demo-sunny-refunds',firestore:{host:hostname,port:Number(port),rules:readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8')}});
    app=initializeApp({projectId:'demo-sunny-refunds',apiKey:'synthetic'},'refund-tests');
    db=getFirestore(app);
    connectFirestoreEmulator(db,hostname,Number(port),{mockUserToken:{sub:uid,user_id:uid}});
  });
  afterAll(async()=>{await env?.cleanup();if(app)await deleteApp(app);});
  beforeEach(async()=>{await env.clearFirestore();await seed('a',60);await seed('b',40);});
  it('creates exact allocations and retries without changing balance, row count or control totals',async()=>{
    await saveRefundReceipt(db,uid,draft('receipt'));
    await saveRefundReceipt(db,uid,draft('receipt'));
    const rows=(await getDocs(collection(db,'users',uid,'transactions'))).docs.map(d=>d.data());
    expect(rows.filter(r=>r.refundGroupId==='receipt').map(r=>r.amount).sort()).toEqual([32,48]);
    expect((await getDoc(controlRef('a'))).data()?.allocatedCents).toBe(4800);
    expect((await getDoc(controlRef('b'))).data()?.allocatedCents).toBe(3200);
    expect((await getDoc(txRef('a'))).data()).not.toHaveProperty('refundedTotal');
  });
  it('creates separate gain and edits/deletes the complete receipt atomically',async()=>{
    await saveRefundReceipt(db,uid,draft('receipt',120));
    expect((await getDoc(txRef('receipt__gain'))).data()).toMatchObject({type:'income',category:'__refund_gain__',amount:20});
    await saveRefundReceipt(db,uid,{...draft('receipt',80),account:'other',date:'2026-10-12',notes:'Edited'});
    expect((await getDoc(txRef('receipt__gain'))).exists()).toBe(false);
    expect((await getDoc(txRef('receipt__refund__a'))).data()).toMatchObject({amount:48,account:'other',date:'2026-10-12',notes:'Edited'});
    await deleteRefundReceipt(db,uid,'receipt');
    await deleteRefundReceipt(db,uid,'receipt');
    expect((await getDoc(controlRef('a'))).data()?.allocatedCents).toBe(0);
    expect((await getDocs(collection(db,'users',uid,'transactions'))).size).toBe(2);
  });
  it('coordinates legacy baseline, shared portions, new singles and multis',async()=>{
    await seed('a',100,{shared:40});
    await seed('legacy',20,{type:'refund',refundOf:'a'});
    await saveRefundReceipt(db,uid,draft('receipt',40));
    expect((await getDoc(txRef('receipt__refund__a'))).data()?.amount).toBe(20);
    await saveSingleRefund(db,uid,'single',{type:'refund',refundOf:'a',amount:20,date:'2026-10-12',account:'bank',description:'Single',category:'food'});
    expect((await getDoc(controlRef('a'))).data()?.allocatedCents).toBe(6000);
    await expect(saveSingleRefund(db,uid,'over',{type:'refund',refundOf:'a',amount:0.01,date:'2026-10-12',account:'bank',description:'Over',category:'food'})).rejects.toThrow();
    await deleteSingleRefund(db,uid,'legacy');
    expect((await getDoc(controlRef('a'))).data()?.allocatedCents).toBe(4000);
  });
  it('two concurrent receipts or a single and multi cannot allocate beyond source amounts',async()=>{
    const single={type:'refund' as const,refundOf:'a',amount:60,date:'2026-10-12',account:'bank',description:'Single',category:'food'};
    const results=await Promise.allSettled([saveRefundReceipt(db,uid,draft('receipt',100)),saveSingleRefund(db,uid,'single',single)]);
    expect(results.some(r=>r.status==='fulfilled')).toBe(true);
    const controls=await Promise.all(['a','b'].map(async id=>(await getDoc(controlRef(id))).data()?.allocatedCents??0));
    expect(controls[0]).toBeLessThanOrEqual(6000);expect(controls[1]).toBeLessThanOrEqual(4000);
    const all=(await getDocs(collection(db,'users',uid,'transactions'))).docs.map(d=>d.data());
    for(const id of ['a','b'])expect(all.filter(t=>t.type==='refund'&&t.refundOf===id).reduce((n,t)=>n+Math.round(t.amount*100),0)).toBe(controls[id==='a'?0:1]);
  });
  it('two distinct full receipts cannot both claim the same source capacity',async()=>{
    const results=await Promise.allSettled([saveRefundReceipt(db,uid,draft('one',100)),saveRefundReceipt(db,uid,draft('two',100))]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await getDoc(controlRef('a'))).data()?.allocatedCents).toBe(6000);
    expect((await getDoc(controlRef('b'))).data()?.allocatedCents).toBe(4000);
  });
  it('a concurrent source deletion cannot leave a receipt allocation orphaned',async()=>{
    const remove=()=>runTransaction(db,async trx=>{
      const snap=await trx.get(txRef('a'));
      const before={...snap.data(),id:'a'} as Transaction;
      await assertRefundSourceMutation(db,uid,before,null,trx);
      trx.delete(txRef('a'));
    });
    const results=await Promise.allSettled([saveRefundReceipt(db,uid,draft('race',100)),remove()]);
    const exists=(await getDoc(txRef('a'))).exists();
    if(results[0].status==='fulfilled') {
      expect(exists).toBe(true);expect(results[1].status).toBe('rejected');
    } else {
      expect(exists).toBe(false);
      expect((await getDoc(txRef('race__refund__a'))).exists()).toBe(false);
      expect((await getDoc(controlRef('a'))).data()?.allocatedCents??0).toBe(0);
    }
  });
  it('moves a single refund between sources without leaving stale capacity claimed',async()=>{
    const single={type:'refund' as const,refundOf:'a',amount:20,date:'2026-10-12',account:'bank',description:'Single',category:'food'};
    await saveSingleRefund(db,uid,'single',single);
    await saveSingleRefund(db,uid,'single',{...single,refundOf:'b',amount:30});
    expect((await getDoc(controlRef('a'))).data()?.allocatedCents).toBe(0);
    expect((await getDoc(controlRef('b'))).data()?.allocatedCents).toBe(3000);
    expect((await getDoc(txRef('single'))).data()?.refundOf).toBe('b');
  });
  it('concurrent receipt edits keep one authoritative membership and exact controls',async()=>{
    await seed('c',50);
    await saveRefundReceipt(db,uid,draft('receipt',40));
    await Promise.allSettled([saveRefundReceipt(db,uid,draft('receipt',30,['a','c'])),saveRefundReceipt(db,uid,draft('receipt',70,['b','c']))]);
    const rows=(await getDocs(collection(db,'users',uid,'transactions'))).docs.map(d=>d.data());
    for(const id of ['a','b','c'])expect((await getDoc(controlRef(id))).data()?.allocatedCents??0).toBe(rows.filter(t=>t.type==='refund'&&t.refundOf===id).reduce((n,t)=>n+Math.round(t.amount*100),0));
  });
  it('rejects missing/retyped/reduced sources without partial receipt writes',async()=>{
    await expect(saveRefundReceipt(db,uid,draft('bad',30,['a','missing']))).rejects.toThrow();
    expect((await getDoc(txRef('bad__refund__a'))).exists()).toBe(false);
    await saveRefundReceipt(db,uid,draft('receipt',80));
    const edit=async(patch:Record<string,unknown>)=>runTransaction(db,async trx=>{
      const before={...(await trx.get(txRef('a'))).data(),id:'a'} as Transaction;
      const {id:_,...next}={...before,...patch};
      await assertRefundSourceMutation(db,uid,before,next,trx);
      trx.set(txRef('a'),next);
    });
    await expect(edit({amount:40})).rejects.toThrow();
    await expect(edit({type:'income'})).rejects.toThrow();
    expect((await getDoc(txRef('a'))).data()?.amount).toBe(60);
  });
  it('keeps source ids named gain distinct from the gain income row',async()=>{
    await seed('gain',10);
    await saveRefundReceipt(db,uid,draft('special',30,['gain','b']));
    expect((await getDoc(txRef('special__refund__gain'))).data()?.refundOf).toBe('gain');
    // Add a real excess: allocation must survive alongside the gain row.
    await saveRefundReceipt(db,uid,draft('special',60,['gain','b']));
    const rows=(await getDocs(collection(db,'users',uid,'transactions'))).docs.map(d=>d.data()).filter(t=>t.refundGroupId==='special');
    expect(rows.filter(t=>t.type==='refund').reduce((sum,t)=>sum+t.amount,0)).toBe(50);
    expect(rows.find(t=>t.type==='income')?.amount).toBe(10);
  });
  it('stores the single receipt cash amount in the same cents used by its control',async()=>{
    await saveSingleRefund(db,uid,'decimal',{type:'refund',refundOf:'a',amount:1.005,date:'2026-10-12',account:'bank',description:'Single',category:'food'});
    expect((await getDoc(txRef('decimal'))).data()?.amount).toBe(1.01);
    expect((await getDoc(controlRef('a'))).data()?.allocatedCents).toBe(101);
  });
  it('supports an atomic maximum-size receipt without silent chunks',async()=>{
    const ids=Array.from({length:100},(_,i)=>'large'+i);
    await Promise.all(ids.map(id=>seed(id,1)));
    await saveRefundReceipt(db,uid,draft('large',100,ids));
    expect((await getDoc(doc(db,'users',uid,'refundReceipts','large'))).data()?.rowIds).toHaveLength(100);
    expect((await getDoc(controlRef('large99'))).data()?.allocatedCents).toBe(100);
  },30000);
});
