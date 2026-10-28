import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { CreditCardSettlementSheet } from './CreditCardSettlementSheet';
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({getAcc:(id:string)=>({label:id==='card'?'Carta viaggi':id==='bank'?'Conto stipendio':id,icon:'💳'})})}));
function nodes(node:ReactNode):ReactElement<any>[] {
  if(!node||typeof node!=='object')return[];
  if(Array.isArray(node))return node.flatMap(nodes);
  const element=node as ReactElement<any>;return[element,...nodes(element.props?.children)];
}
describe('automatic card settlement detail',()=>{
  it('shows the saved card, source month, bank, payment date and amount in read-only form',()=>{
    const onClose=vi.fn();
    const tree=nodes(CreditCardSettlementSheet({onClose,transaction:{id:'__cc__card__2026-09',type:'transfer',date:'2026-10-15',description:'Addebito carta',amount:123.45,category:'',account:'bank',toAccount:'card',creditCardSettlement:{cardId:'card',period:'2026-09',paymentDay:15,paymentAccountId:'bank',policyFromMonth:'2026-09'}}}));
    expect(tree[0].props.subtitle).toContain('sola lettura');
    const details=Object.fromEntries(tree.filter(el=>typeof el.type==='function'&&el.props.label).map(el=>[el.props.label,el.props.value]));
    expect(details.Carta).toContain('Carta viaggi');expect(details['Conto di addebito']).toContain('Conto stipendio');
    expect(details['Periodo degli acquisti']).toMatch(/settembre 2026/i);expect(details['Data di pagamento']).toMatch(/15 ott/);expect(details.Importo).toContain('123,45');
    expect(tree.some(el=>['input','select','textarea'].includes(el.type as string))).toBe(false);
    const buttons=tree.filter(el=>el.type==='button');expect(buttons).toHaveLength(1);buttons[0].props.onClick();expect(onClose).toHaveBeenCalledOnce();
  });
});
