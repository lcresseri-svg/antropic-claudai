// Riga di ingresso agli Impegni fissi.
//
// `/commitments` esisteva ma non si raggiungeva: ci si arrivava solo scrivendo
// l'URL. Non merita una voce di nav — non è una destinazione quotidiana —
// quindi va agganciata dove la domanda nasce, e con lo stesso formato ovunque:
// questa riga è quel formato.
//
// Quando non c'è nessun impegno la riga si mostra lo stesso, con 0,00 €/mese e
// il perché: "non hai costi fissi" è informazione utile, non un vuoto.
import { formatCurrency } from '../../utils';

export function CommitmentsEntryRow({ fixedMonthlyCost, onClick }: {
  fixedMonthlyCost: number;
  onClick: () => void;
}) {
  const none = fixedMonthlyCost <= 0;
  return (
    <button type="button" onClick={onClick}
      className="row-tap w-full flex items-center gap-3 px-1 py-2.5 text-left rounded-xl transition-colors">
      <span className="w-7 h-7 rounded-[10px] flex items-center justify-center flex-none"
        style={{ background: 'rgba(var(--c-gold) / 0.14)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--c-gold))"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-primary">Impegni fissi</span>
        {none && <span className="block text-[11px] text-tertiary">Nessun costo fisso rilevato</span>}
      </span>
      <span className="text-[13.5px] font-semibold text-primary balance-num flex-none">
        {formatCurrency(fixedMonthlyCost)}<span className="text-secondary font-normal">/mese</span>
      </span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" className="text-tertiary flex-none">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
