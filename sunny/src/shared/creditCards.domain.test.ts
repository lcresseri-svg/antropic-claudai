import { describe, expect, it } from 'vitest';
import { buildCreditCardSettlements, creditCardPolicyForMonth, deferredCardDelta, resolveCreditCardTransactions, withCreditCardCashEffects, type CreditCardTransaction } from '../../../functions/src/domain/creditCards';
const policy = { fromMonth:'2026-10', enabled:true, paymentDay:31, paymentAccountId:'bank' };
const card = { id:'card', label:'Visa', creditCardPolicies:[policy] }, bank = { id:'bank' };
const tx = (id:string, amount:number, rest:Partial<CreditCardTransaction> = {}):CreditCardTransaction => ({id,date:'2026-10-10',description:id,amount,type:'expense',category:'food',account:'card',...rest});
describe('credit card calendar and ledger', () => {
  it('creates one aggregated bank-to-card payment and remains idempotent', () => {
    const source=[tx('a',10.01),tx('b',20.02)];
    const [row]=buildCreditCardSettlements(source,[card,bank],'2026-10-28');
    expect(row).toMatchObject({amount:30.03,date:'2026-11-30',type:'transfer',account:'bank',toAccount:'card',creditCardSettlement:{cardId:'card',period:'2026-10',policyFromMonth:'2026-10'}});
    expect(row.id.startsWith('__cc__')).toBe(true);
    expect(buildCreditCardSettlements([...source,row],[card,bank],'2026-10-28')).toEqual([row]);
  });
  it.each([['2027-01','2027-02-28'],['2028-01','2028-02-29'],['2026-12','2027-01-31'],['2026-03','2026-04-30']])('clamps %s without date drift', (period,due) => {
    const acc={...card,creditCardPolicies:[{...policy,fromMonth:'2026-01'}]};
    expect(buildCreditCardSettlements([tx('a',10,{date:`${period}-10`})],[acc,bank],`${period}-28`)[0].date).toBe(due);
  });
  it('leaves earlier history unchanged and includes persisted future purchases only in future statements', () => {
    const list=[tx('old',80,{date:'2026-09-20'}),tx('tpl',90,{recurring:{freq:'monthly'}}),tx('proj',90,{projected:true}),tx('future',80,{date:'2026-10-30'}),tx('new',30)];
    expect(buildCreditCardSettlements(list,[card,bank],'2026-10-28').map(t=>t.amount)).toEqual([110]);
    expect(deferredCardDelta(list[0],card)).toBe(0);
    expect(creditCardPolicyForMonth(card,'2026-09')).toBeUndefined();
  });
  it('includes shared quota transfers, refunds and non-TFR investment cash', () => {
    const list=[tx('own',60),tx('quota',40,{type:'transfer',toAccount:'other'}),tx('refund',20,{type:'refund'}),tx('invest',30,{type:'investment',tfr:10})];
    expect(buildCreditCardSettlements(list,[card,bank],'2026-10-28')[0].amount).toBe(100);
  });
  it('carries a credit into later periods without inventing bank income', () => {
    const list=[tx('refund',100,{type:'refund'}),tx('nov',40,{date:'2026-11-02'}),tx('dec',90,{date:'2026-12-02'})];
    expect(buildCreditCardSettlements(list,[card,bank],'2026-12-03').map(t=>[t.creditCardSettlement.period,t.amount])).toEqual([['2026-12',30]]);
  });
  it('freezes due payment route while new policies apply to later source months', () => {
    const source=tx('oct',100), [old]=buildCreditCardSettlements([source],[card,bank],'2026-10-28');
    const changed={...card,creditCardPolicies:[{...policy,paymentDay:10,paymentAccountId:'newbank'},{...policy,fromMonth:'2026-11',paymentDay:15,paymentAccountId:'newbank'}]};
    const rows=buildCreditCardSettlements([source,old,tx('nov',50,{date:'2026-11-05'})],[changed,bank,{id:'newbank'}],'2026-12-01');
    expect(rows.map(t=>[t.date,t.account])).toEqual([['2026-11-30','bank'],['2026-12-15','newbank']]);
  });
  it('does not cancel old due payments when the card is disabled or archived', () => {
    const source=tx('oct',100), [old]=buildCreditCardSettlements([source],[card,bank],'2026-10-28');
    const disabled={...card,archived:true,creditCardPolicies:[{...policy,enabled:false}]};
    expect(buildCreditCardSettlements([source,old],[disabled,bank],'2026-12-01')).toEqual([old]);
  });
  it('replaces stale managed rows and removes rows whose sources were deleted', () => {
    const a=tx('a',100), [row]=buildCreditCardSettlements([a],[card,bank],'2026-10-28');
    const updated=resolveCreditCardTransactions([{...a,amount:75},row],[card,bank],'2026-10-28');
    expect(updated.filter(t=>t.creditCardSettlement).map(t=>t.amount)).toEqual([75]);
    expect(resolveCreditCardTransactions([row],[card,bank],'2026-10-28')).toEqual([]);
  });
  it('defers card legs but still debits the bank at payment and keeps net worth unchanged', () => {
    const a=tx('a',100), [row]=buildCreditCardSettlements([a],[card,bank],'2026-10-28');
    expect(deferredCardDelta(a,card)).toBe(-100);
    expect(deferredCardDelta(row,card)).toBe(100);
    expect(withCreditCardCashEffects([a,row],[card,bank]).map(t=>t.cashDelta)).toEqual([0,-100]);
    expect(withCreditCardCashEffects([tx('old',50,{date:'2026-09-10'})],[card,bank])[0]).not.toHaveProperty('cashDelta');
  });
  it('removes a future statement when the same source-month policy is disabled without charging cash twice', () => {
    const source=tx('a',100), [old]=buildCreditCardSettlements([source],[card,bank],'2026-10-28');
    const disabled={...card,creditCardPolicies:[{...policy,enabled:false}]};
    const resolved=resolveCreditCardTransactions([source,old],[disabled,bank],'2026-10-28');
    expect(resolved.filter(t=>t.creditCardSettlement)).toEqual([]);
    expect(withCreditCardCashEffects(resolved,[disabled,bank])[0]).not.toHaveProperty('cashDelta');
  });
  it('preserves an already recorded future payment route if its bank becomes archived', () => {
    const source=tx('a',100), [old]=buildCreditCardSettlements([source],[card,bank],'2026-10-28');
    expect(buildCreditCardSettlements([source,old],[card,{...bank,archived:true}],'2026-10-28')).toEqual([old]);
  });
  it('ignores invalid day configuration instead of aborting other statements', () => {
    const invalid={...card,creditCardPolicies:[{...policy,paymentDay:NaN}]};
    expect(buildCreditCardSettlements([tx('a',100)],[invalid,bank],'2026-10-28')).toEqual([]);
  });
  it('rejects invalid new payment accounts', () => {
    for(const target of [{id:'card'},{id:'other',creditCardPolicies:[policy]},{id:'other',isInvestment:true},{id:'other',archived:true}]) {
      const bad={...card,creditCardPolicies:[{...policy,paymentAccountId:target.id}]};
      expect(buildCreditCardSettlements([tx('a',100)],[bad,target],'2026-10-28')).toEqual([]);
    }
    expect(buildCreditCardSettlements([tx('a',100)],[card],'2026-10-28')).toEqual([]);
  });
});
