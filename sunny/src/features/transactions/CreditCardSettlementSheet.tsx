import type { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { capitalize, formatCurrency, formatDate, formatMonthLong } from '../../utils';
import { SheetShell } from '../investments/SheetShell';

/** Automatic bank/card settlements are explained here; corrections belong to sources. */
export function CreditCardSettlementSheet({ transaction, onClose }: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { getAcc } = useSettings();
  if (!transaction) return null;
  const settlement = transaction.creditCardSettlement;
  const card = getAcc(settlement?.cardId ?? transaction.toAccount ?? '');
  const bank = getAcc(settlement?.paymentAccountId ?? transaction.account);
  return <SheetShell open title="Addebito carta di credito" subtitle="Distinta automatica · sola lettura" onClose={onClose}>
    <dl className="rounded-2xl bg-elevated px-4 divide-y divide-divider">
      <Detail label="Carta" value={`${card.icon} ${card.label}`} />
      <Detail label="Periodo degli acquisti" value={settlement ? capitalize(formatMonthLong(settlement.period)) : 'Non disponibile'} />
      <Detail label="Conto di addebito" value={`${bank.icon} ${bank.label}`} />
      <Detail label="Data di pagamento" value={formatDate(transaction.date)} />
      <Detail label="Importo" value={formatCurrency(transaction.amount)} />
    </dl>
    <p className="text-[13px] text-secondary leading-relaxed">Il pagamento trasferisce il saldo dal conto alla carta. Per correggere la distinta modifica gli acquisti, i rimborsi o gli altri movimenti del periodo: l’importo viene ricalcolato automaticamente.</p>
    <button type="button" onClick={onClose} className="w-full py-3.5 rounded-2xl cta-gold-fill text-[14px] font-semibold">Chiudi dettaglio</button>
  </SheetShell>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <div className="py-3 flex items-baseline justify-between gap-4">
    <dt className="text-[12px] text-secondary">{label}</dt>
    <dd className="text-[13px] font-medium text-primary text-right balance-num">{value}</dd>
  </div>;
}
