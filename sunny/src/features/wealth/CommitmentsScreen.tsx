// Impegni (admin-only, flag `commitments`): abbonamenti, rate e ricorrenti con
// costo mensile equivalente, prossime scadenze, residui e fine prevista.
// Tutti i numeri vengono dal modulo puro commitments.ts (una voce per serie —
// niente doppioni fra template, istanze e proiezioni).
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { buildCommitments, Commitment } from './commitments';

interface Props {
  /** FULL set (allTransactions): expired templates still resolve series. */
  transactions: Transaction[];
}

const FREQ_LABEL: Record<string, string> = {
  daily: 'giornaliero', weekly: 'settimanale', monthly: 'mensile', yearly: 'annuale',
};

function Row({ c }: { c: Commitment }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 border-b border-divider last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm text-primary truncate">{c.description}</p>
        <p className="text-[11px] text-secondary">
          {formatCurrency(c.amount)}{c.freq ? ` · ${FREQ_LABEL[c.freq]}` : ''}
          {c.nextDate ? ` · prossima: ${formatDate(c.nextDate)}` : ''}
        </p>
        {c.remainingInstallments != null && (
          <p className="text-[11px] text-secondary">
            {c.remainingInstallments} rate residue · {formatCurrency(c.remainingAmount ?? 0)} da pagare
            {c.expectedEnd ? ` · fine prevista ${formatDate(c.expectedEnd)}` : ''}
          </p>
        )}
        {c.kind !== 'installment' && c.expectedEnd && (
          <p className="text-[11px] text-secondary">fino al {formatDate(c.expectedEnd)}</p>
        )}
      </div>
      <p className="text-sm font-semibold text-primary whitespace-nowrap">
        {formatCurrency(c.monthlyEquivalent)}<span className="text-[11px] text-secondary font-normal">/mese</span>
      </p>
    </li>
  );
}

function Group({ title, items, empty }: { title: string; items: Commitment[]; empty: string }) {
  return (
    <section className="bg-card rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        <p className="text-xs text-secondary">
          {formatCurrency(items.reduce((s, c) => s + c.monthlyEquivalent, 0))}/mese
        </p>
      </div>
      {items.length === 0
        ? <p className="text-xs text-secondary py-2">{empty}</p>
        : <ul>{items.map(c => <Row key={c.seriesId} c={c} />)}</ul>}
    </section>
  );
}

export function CommitmentsScreen({ transactions }: Props) {
  const navigate = useNavigate();
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const c = useMemo(() => buildCommitments(transactions, todayISO), [transactions, todayISO]);

  return (
    <div className="pb-32 space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Indietro"
          className="w-11 h-11 -ml-2 flex items-center justify-center text-secondary hover:text-primary rounded-full">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Impegni</h1>
          <p className="text-xs text-secondary">Anteprima admin · una voce per serie, nessun doppione</p>
        </div>
      </div>

      <section className="bg-card rounded-2xl p-5">
        <p className="text-xs text-secondary">Costi fissi mensili (abbonamenti + rate + ricorrenti, quote annuali incluse)</p>
        <p className="text-3xl font-bold text-primary tracking-[-0.03em]">{formatCurrency(c.fixedMonthlyCost)}<span className="text-sm text-secondary font-normal">/mese</span></p>
      </section>

      {c.upcoming.length > 0 && (
        <section className="bg-card rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-primary mb-2">Prossime scadenze (30 giorni)</h2>
          <ul className="space-y-1.5">
            {c.upcoming.map((u, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-secondary">{formatDate(u.date)} · {u.description}</span>
                <span className="text-primary">{formatCurrency(u.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Group title="Abbonamenti" items={c.subscriptions} empty="Nessun abbonamento attivo." />
      <Group title="Rate" items={c.installments} empty="Nessun piano a rate attivo." />
      <Group title="Ricorrenti" items={c.recurring} empty="Nessuna spesa ricorrente attiva." />
    </div>
  );
}
