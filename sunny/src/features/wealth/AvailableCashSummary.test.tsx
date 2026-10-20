import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvailableCashSummary } from './AvailableCashSummary';
import { computeAvailableCash } from './availableCash';
import { formatCurrency } from '../../utils';
import type { Transaction } from '../../types';
describe('available liquidity in Patrimonio',()=>{
  it('keeps the included balance, actual upcoming payments and reserve separate from the plan',()=>{
    const cash=computeAvailableCash({liquidity:4820,reserve:500,horizon:'eom',now:new Date(2026,9,20,12),transactions:[{id:'due',type:'expense',amount:350,date:'2026-10-25',category:'bills',account:'bank'}] as Transaction[]});
    const html=renderToStaticMarkup(<AvailableCashSummary cash={cash}/>);
    expect(html).toContain(formatCurrency(3970));
    expect(html).toContain(formatCurrency(4820));
    expect(html).toContain('350,00');
    expect(html).toContain('500,00');
    expect(html).toContain('31/10/2026');
    expect(html).toContain('margine del piano');
  });
  it('explains a negative result without drawing a positive availability share',()=>{
    const cash=computeAvailableCash({liquidity:100,reserve:200,horizon:'eom',now:new Date(2026,9,20,12),transactions:[]});
    const html=renderToStaticMarkup(<AvailableCashSummary cash={cash}/>);
    expect(html).toContain('superano il saldo');
    expect(html).not.toContain('ui31-cash-track');
  });
});
