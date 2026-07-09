import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { buildSeriesSummary } from '../../shared/recurrence';
import { formatCurrency, formatDateFull } from '../../utils';
import { ProgressBar } from '../../shared/components/ProgressBar';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { useScrollLock } from '../../shared/useScrollLock';

interface Props {
  open: boolean;
  /** Template, recorded occurrence, or projected virtual row of the series. */
  anchor: Transaction | null;
  allTransactions: Transaction[];
  onClose: () => void;
  onEditSingle: (t: Transaction) => void;
  onEditSeries: (t: Transaction) => void;
  onViewMovements: (seriesId: string) => void;
}

const FREQ_LABEL: Record<string, string> = {
  daily: 'al giorno', weekly: 'a settimana', monthly: 'al mese', yearly: "all'anno",
};

const KIND_BADGE: Record<string, string> = {
  recurring: '🔁 Ricorrente', subscription: '💳 Abbonamento', installment: '🧾 A rate',
};

/** Bottom sheet with the runtime summary of a series (recurring / subscription /
 *  installment). All figures come from buildSeriesSummary — nothing persisted. */
export function SeriesDetailSheet({ open, anchor, allTransactions, onClose, onEditSingle, onEditSeries, onViewMovements }: Props) {
  const { getCat } = useSettings();
  useScrollLock(open);
  useEscapeKey(onClose, open);
  if (!open || !anchor) return null;

  const todayISO = new Date().toISOString().slice(0, 10);
  const s = buildSeriesSummary(allTransactions, anchor, todayISO);
  const cat = getCat(s.category);
  // "Edit this occurrence" only makes sense on a REAL recorded occurrence.
  const canEditSingle = !anchor.projected && !anchor.recurring;
  const recent = [...s.occurrences].reverse().slice(0, 4);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float max-h-[85vh] overflow-hidden flex flex-col animate-sheet-up">

        {/* Header */}
        <div className="shrink-0 flex items-start gap-3.5 px-6 pt-6 pb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ backgroundColor: cat.color + '18' }}>
            {cat.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-primary leading-snug truncate">{s.description}</h3>
            <span className="mt-1 inline-flex items-center rounded-full bg-gold/15 text-gold text-[10px] font-semibold px-1.5 py-0.5 leading-none">
              {KIND_BADGE[s.kind]}
            </span>
            {s.ended && <span className="ml-1.5 text-[10px] text-tertiary">· serie conclusa</span>}
          </div>
          <button onClick={onClose} aria-label="Chiudi"
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary text-sm flex-shrink-0">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-6 pb-4 space-y-4">

          {/* Importo / frequenza */}
          <div className="bg-card rounded-2xl px-4 py-3 flex items-baseline justify-between">
            <span className="text-[13px] text-secondary">
              {s.kind === 'installment' ? 'Importo rata' : 'Importo'}
            </span>
            <span className="text-[17px] font-semibold text-primary balance-num">
              {formatCurrency(s.amount)}
              {s.freq && <span className="text-[12px] font-normal text-secondary"> {FREQ_LABEL[s.freq]}</span>}
            </span>
          </div>

          {s.kind === 'subscription' && (
            <div className="bg-card rounded-2xl px-4 py-3 space-y-2">
              <Line label="Equivalente mensile" value={formatCurrency(s.monthlyEquivalent ?? 0)} />
              <Line label="Equivalente annuale" value={formatCurrency(s.annualEquivalent ?? 0)} />
              <Line label="Prossimo pagamento" value={s.nextDate ? formatDateFull(s.nextDate) : '—'} />
              <Line label="Pagato quest'anno" value={formatCurrency(s.paidThisYear)} />
              <Line label="Totale pagato" value={`${formatCurrency(s.paidAmount)} · ${s.paidCount} pagament${s.paidCount === 1 ? 'o' : 'i'}`} />
            </div>
          )}

          {s.kind === 'installment' && s.installment && (
            <div className="bg-card rounded-2xl px-4 py-3 space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] text-secondary">Rate pagate</span>
                  <span className="text-[13px] font-semibold text-primary balance-num">
                    {Math.min(s.paidCount, s.installment.totalInstallments)} / {s.installment.totalInstallments}
                  </span>
                </div>
                <ProgressBar value={s.installment.progress} max={1} />
              </div>
              <Line label="Totale piano" value={formatCurrency(s.installment.totalAmount)} />
              <Line label="Totale pagato" value={formatCurrency(s.paidAmount)} />
              <Line label="Residuo" value={formatCurrency(s.installment.remainingAmount)} />
              <Line label="Prossima rata" value={s.nextDate ? formatDateFull(s.nextDate) : '—'} />
            </div>
          )}

          {s.kind === 'recurring' && (
            <div className="bg-card rounded-2xl px-4 py-3 space-y-2">
              <Line label="Prossima occorrenza" value={s.nextDate ? formatDateFull(s.nextDate) : '—'} />
              <Line label="Totale registrato" value={`${formatCurrency(s.paidAmount)} · ${s.paidCount} occorrenz${s.paidCount === 1 ? 'a' : 'e'}`} />
              {s.until && <Line label="Fine serie" value={formatDateFull(s.until)} />}
            </div>
          )}

          {/* Ultime occorrenze */}
          {recent.length > 0 && (
            <div>
              <p className="label-caps text-secondary mb-2 px-1">Ultime occorrenze</p>
              <div className="bg-card rounded-2xl px-4 divide-y divide-divider">
                {recent.map(o => (
                  <div key={o.id} className="py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[13px] text-secondary">{formatDateFull(o.date)}</span>
                    <span className="text-[13px] font-medium text-primary balance-num">{formatCurrency(o.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="shrink-0 px-6 pt-3 pb-6 bg-[var(--modal-hdr-bg)] space-y-2">
          <button onClick={() => onViewMovements(s.seriesId)}
            className="w-full py-3 rounded-2xl glass-cta-gold text-sm font-semibold">
            Vedi movimenti della serie
          </button>
          <div className="flex gap-2">
            <button onClick={() => onEditSeries(anchor)}
              className="flex-1 py-2.5 rounded-2xl text-sm font-medium text-primary bg-elevated active:bg-card-hover transition-colors">
              Modifica serie
            </button>
            {canEditSingle && (
              <button onClick={() => onEditSingle(anchor)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-medium text-primary bg-elevated active:bg-card-hover transition-colors">
                Modifica occorrenza
              </button>
            )}
          </div>
          <button onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-sm font-medium text-secondary">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-secondary">{label}</span>
      <span className="text-[13px] font-medium text-primary balance-num text-right">{value}</span>
    </div>
  );
}
