/** Run only against the local Firestore emulator, never a live project. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (emulator && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error('Credit-card tests require a LOCAL Firestore emulator');
if (emulator) process.env.GCLOUD_PROJECT = 'sunny-credit-cards-test';
let reconcile: typeof import('../functions/src/creditCards').reconcileCreditCardsForUser;
let db: typeof import('../functions/src/shared').db;
let uid: string;
const policy={fromMonth:'2026-10',enabled:true,paymentDay:31,paymentAccountId:'bank'};
const accounts=[{id:'card',label:'Visa',creditCardPolicies:[policy]},{id:'bank'},{id:'other'}];
const expense=(amount:number,date='2026-10-10',account='card')=>({date,amount,account,type:'expense',description:'Purchase',category:'food'});
describe.skipIf(!emulator)('credit-card backend emulator',()=>{
  beforeAll(async()=>{
    ({reconcileCreditCardsForUser:reconcile}=await import('../functions/src/creditCards'));
    ({db}=await import('../functions/src/shared'));
  });
  beforeEach(async()=>{
    uid=`credit-${randomUUID()}`;
    await db.doc(`users/${uid}`).set({test:true});
    await db.doc(`users/${uid}/meta/settings`).set({accounts});
  });
  afterEach(async()=>{if(db&&uid)await db.recursiveDelete(db.doc(`users/${uid}`));});
  afterAll(async()=>{if(db)await db.terminate();});
  const rows=async()=> (await db.collection(`users/${uid}/transactions`).get()).docs.map(d=>({id:d.id,...d.data()}));
  it('does not read ordinary ledger documents when no account has card policy history',async()=>{
    await db.doc(`users/${uid}/meta/settings`).set({accounts:[{id:'bank'}]});
    const ordinary={source:expense(100,'2026-10-10','bank'),zzz:expense(25,'2026-09-15','bank')};
    for(const [id,row] of Object.entries(ordinary))await db.doc(`users/${uid}/transactions/${id}`).set(row);
    const queryReads:string[][]=[];
    const run=db.runTransaction.bind(db);
    // Keep real emulator reads/writes, recording the documents returned by
    // transaction queries so the optimization has a regression assertion.
    const recorder=vi.spyOn(db,'runTransaction').mockImplementation(update=>run(async trx=>{
      const get=trx.get.bind(trx);
      trx.get=(async(ref:any)=>{
        const snapshot=await get(ref);
        if('docs' in snapshot)queryReads.push(snapshot.docs.map((d:any)=>d.id));
        return snapshot;
      }) as typeof trx.get;
      return update(trx);
    }));
    try {
      expect(await reconcile(uid,'2026-10-28')).toEqual({written:0,deleted:0});
      expect(queryReads).toEqual([[]]);
    } finally {recorder.mockRestore();}
    expect(await rows()).toEqual(Object.entries(ordinary).map(([id,row])=>({id,...row})));
  });
  it.each([{label:'all accounts',accounts:[]},{label:'only policies',accounts:[{id:'card'},{id:'bank'}]}])('cleans reserved statements after removing $label',async({accounts:nextAccounts})=>{
    const source=expense(100);
    await db.doc(`users/${uid}/transactions/source`).set(source);
    expect(await reconcile(uid,'2026-10-28')).toEqual({written:1,deleted:0});
    await db.doc(`users/${uid}/meta/settings`).set({accounts:nextAccounts});
    expect(await reconcile(uid,'2026-10-28')).toEqual({written:0,deleted:1});
    expect(await rows()).toEqual([{id:'source',...source}]);
    expect(await reconcile(uid,'2026-10-28')).toEqual({written:0,deleted:0});
  });
  it('creates the same single payment under concurrent invocations and retry',async()=>{
    await db.doc(`users/${uid}/transactions/source`).set(expense(100.01));
    await Promise.all(Array.from({length:4},()=>reconcile(uid,'2026-10-28')));
    let payments=(await rows()).filter((t:any)=>t.creditCardSettlement);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({id:'__cc__card__2026-10',amount:100.01,date:'2026-11-30',account:'bank',toAccount:'card'});
    const rerun=await reconcile(uid,'2026-10-28');
    expect(rerun).toEqual({written:0,deleted:0});
  });
  it('reconciles edits to amount, date and account in place and deletes obsolete months',async()=>{
    const ref=db.doc(`users/${uid}/transactions/source`);
    await ref.set(expense(100)); await reconcile(uid,'2026-10-28');
    await ref.update({amount:70}); await reconcile(uid,'2026-10-28');
    expect((await rows()).find((t:any)=>t.creditCardSettlement)).toMatchObject({amount:70,id:'__cc__card__2026-10'});
    await ref.update({date:'2026-11-05'}); await reconcile(uid,'2026-11-06');
    expect((await rows()).filter((t:any)=>t.creditCardSettlement)).toMatchObject([{id:'__cc__card__2026-11',amount:70}]);
    await ref.update({account:'other'}); await reconcile(uid,'2026-11-06');
    expect((await rows()).filter((t:any)=>t.creditCardSettlement)).toEqual([]);
  });
  it('freezes a paid route after settings changes, then removes payment after all sources are removed',async()=>{
    const ref=db.doc(`users/${uid}/transactions/source`);
    await ref.set(expense(100)); await reconcile(uid,'2026-10-28');
    await db.doc(`users/${uid}/meta/settings`).update({accounts:[{id:'card',label:'Visa',creditCardPolicies:[{...policy,paymentDay:10,paymentAccountId:'other'}]},{id:'bank'},{id:'other'}]});
    await ref.update({amount:150}); await reconcile(uid,'2026-12-01');
    expect((await rows()).find((t:any)=>t.creditCardSettlement)).toMatchObject({amount:150,account:'bank',date:'2026-11-30'});
    await ref.delete(); await reconcile(uid,'2026-12-01');
    await reconcile(uid,'2027-02-01');
    expect(await rows()).toEqual([]);
  });
  it('catches up closed-app periods with credits and shared quota transfers',async()=>{
    const col=db.collection(`users/${uid}/transactions`);
    await col.doc('oct-exp').set(expense(60));
    await col.doc('oct-share').set({...expense(40),type:'transfer',toAccount:'other'});
    await col.doc('nov-refund').set({...expense(120,'2026-11-02'),type:'refund'});
    await col.doc('dec-exp').set(expense(150,'2026-12-02'));
    await reconcile(uid,'2027-01-31');
    expect((await rows()).filter((t:any)=>t.creditCardSettlement).map((t:any)=>[t.id,t.amount]).sort()).toEqual([['__cc__card__2026-10',100],['__cc__card__2026-12',30]]);
  });
  it('chunks more than 500 settlements and removes them after source reset',async()=>{
    await db.doc(`users/${uid}/meta/settings`).update({accounts:[{...accounts[0],creditCardPolicies:[{...policy,fromMonth:'1980-01'}]},accounts[1]]});
    const col=db.collection(`users/${uid}/transactions`);
    for(let start=0;start<501;start+=300){
      const batch=db.batch();
      for(let i=start;i<Math.min(501,start+300);i++){
        const date=new Date(Date.UTC(1980, i, 10)).toISOString().slice(0,10);
        batch.set(col.doc(`source-${i}`),expense(1,date));
      }
      await batch.commit();
    }
    expect(await reconcile(uid,'2026-10-28')).toEqual({written:501,deleted:0});
    expect((await rows()).filter((t:any)=>t.creditCardSettlement)).toHaveLength(501);
    expect(await reconcile(uid,'2026-10-28')).toEqual({written:0,deleted:0});
    for(let start=0;start<501;start+=300){
      const batch=db.batch();
      for(let i=start;i<Math.min(501,start+300);i++)batch.delete(col.doc(`source-${i}`));
      await batch.commit();
    }
    expect(await reconcile(uid,'2026-10-28')).toEqual({written:0,deleted:501});
    expect(await rows()).toEqual([]);
  },20000);

});
