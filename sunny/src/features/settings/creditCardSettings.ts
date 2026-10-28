import type {AccountDef,CreditCardPolicy,Transaction} from '../../types';
import {creditCardPolicyForMonth} from '../../../../functions/src/domain/creditCards';
export interface CreditCardDraft {
 isCreditCard?:boolean;
 creditCardPaymentDay?:number;
 creditCardPaymentAccountId?:string;
 creditCardFromMonth?:string;
}
const validMonth=(value:string)=>/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
const hasPlannedCredit=(account:AccountDef,period:string)=>!!creditCardPolicyForMonth(account,period)?.enabled||!!account.creditCardPolicies?.some(p=>p.enabled&&p.fromMonth>period);
const sameConfig=(a:CreditCardPolicy|undefined,b:CreditCardPolicy)=>!!a&&a.enabled===b.enabled&&a.paymentDay===b.paymentDay&&a.paymentAccountId===b.paymentAccountId;
function linkedCards(account:AccountDef,accounts:AccountDef[],todayISO:string,transactions:Transaction[]=[]){
 const period=todayISO.slice(0,7);
 return accounts.filter(card=>card.id!==account.id&&(
  card.creditCardPolicies?.some(p=>p.enabled&&p.paymentAccountId===account.id&&(p.fromMonth>period||creditCardPolicyForMonth(card,period)===p))||
  transactions.some(t=>t.creditCardSettlement?.cardId===card.id&&t.creditCardSettlement.paymentAccountId===account.id&&t.date>=todayISO)
 ));
}
export function assertAccountCanBeRemoved(account:AccountDef,accounts:AccountDef[],todayISO:string,transactions:Transaction[]=[]):void{
 const linked=linkedCards(account,accounts,todayISO,transactions);
 if(linked.length)throw Error(`Questo conto è abbinato a ${linked.map(c=>c.label).join(', ')}. Scegli prima un altro conto di addebito per la carta.`);
}
/** Update one period without deleting earlier or later instructions. */
export function updateCreditCardPolicies(account:AccountDef,draft:CreditCardDraft,accounts:AccountDef[],todayISO:string,transactions:Transaction[]=[]):CreditCardPolicy[]|undefined{
 const history=[...(account.creditCardPolicies??[])].sort((a,b)=>a.fromMonth.localeCompare(b.fromMonth));
 if(!draft.isCreditCard&&!history.length)return undefined;
 const fromMonth=draft.creditCardFromMonth??todayISO.slice(0,7);
 if(!validMonth(fromMonth))throw Error('Scegli un mese di decorrenza valido.');
 const previous=creditCardPolicyForMonth(account,fromMonth);
 const day=draft.isCreditCard?draft.creditCardPaymentDay:previous?.paymentDay??history[history.length-1]?.paymentDay??10;
 const paymentAccountId=draft.isCreditCard?draft.creditCardPaymentAccountId:previous?.paymentAccountId??history[history.length-1]?.paymentAccountId??'';
 if(typeof day!=='number'||!Number.isInteger(day)||day<1||day>31)throw Error('Il giorno di addebito deve essere compreso tra 1 e 31.');
 const next:CreditCardPolicy={fromMonth,enabled:!!draft.isCreditCard,paymentDay:day,paymentAccountId:paymentAccountId??''};
 if(sameConfig(previous,next))return history;
 if(history.length&&fromMonth<todayISO.slice(0,7))throw Error('Le nuove impostazioni possono partire dal mese corrente o da un mese successivo; le distinte precedenti restano invariate.');
 if(next.enabled){
  if(account.isInvestment)throw Error('Un conto investimento non può essere una carta di credito.');
  const target=accounts.find(a=>a.id===next.paymentAccountId);
  if(!target||target.id===account.id||target.archived||target.isInvestment||hasPlannedCredit(target,fromMonth))throw Error('Scegli un conto di addebito attivo diverso dalla carta, che non sia una carta di credito o un conto investimento.');
  if(linkedCards(account,accounts,todayISO,transactions).length)throw Error('Questo conto è già abbinato come conto di addebito a un’altra carta. Cambia prima quell’abbinamento.');
 }
 return [...history.filter(p=>p.fromMonth!==fromMonth),next].sort((a,b)=>a.fromMonth.localeCompare(b.fromMonth));
}
