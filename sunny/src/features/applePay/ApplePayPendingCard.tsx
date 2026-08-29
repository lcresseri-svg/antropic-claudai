import { useState } from 'react';
import type { ApplePayPendingPayment } from '../../types';
import { formatDate } from '../../utils';
import { useSettings } from '../../shared/providers/settings';

interface Props {
  payments: ApplePayPendingPayment[];
  loading?: boolean;
  error?: string | null;
  onReview: (payment: ApplePayPendingPayment) => void;
  onIgnore: (id: string) => Promise<void>;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function ApplePayPendingCard({ payments, loading, error, onReview, onIgnore }: Props) {
  const { getAcc } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [confirmIgnore, setConfirmIgnore] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && payments.length === 0) return null;
  if (!error && payments.length === 0) return null;
  const shown = expanded ? payments : payments.slice(0, 4);

  const ignore = async (id: string) => {
    if (ignoring) return;
    setIgnoring(id);
    setActionError(null);
    try {
      await onIgnore(id);
      setConfirmIgnore(null);
    } catch {
      setActionError('Non è stato possibile ignorare il pagamento. Riprova.');
    } finally {
      setIgnoring(null);
    }
  };

  return (
    <section className="glass-card rounded-[22px] shadow-elev-1 overflow-hidden mb-3.5 md:mb-4 border border-gold/15">
      <div className="px-4 py-3.5 flex items-center gap-3 border-b border-divider">
        <div className="w-9 h-9 rounded-xl bg-gold/15 text-gold flex items-center justify-center flex-none">⌁</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-primary">Pagamenti Apple Pay da confermare</h2>
          <p className="text-[11.5px] text-secondary mt-0.5">
            {payments.length === 1 ? '1 pagamento non ancora registrato' : `${payments.length} pagamenti non ancora registrati`}
          </p>
        </div>
        <span className="min-w-6 h-6 px-1.5 rounded-full bg-gold text-bg text-[11px] font-bold flex items-center justify-center">
          {payments.length}
        </span>
      </div>

      {error ? (
        <p className="px-4 py-4 text-[12.5px] text-red">{error}</p>
      ) : (
        <div className="divide-y divide-divider">
          {shown.map(p => (
            <div key={p.id} className="px-4 py-3">
              <button type="button" onClick={() => onReview(p)} className="w-full flex items-center gap-3 text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-primary truncate">
                    {p.merchant || p.description || 'Pagamento Apple Pay'}
                  </p>
                  <p className="text-[11px] text-secondary mt-0.5 truncate">
                    {formatDate(p.date)} · {p.cardLabel}
                  </p>
                  <p className={`text-[11px] mt-0.5 ${p.accountId ? 'text-secondary' : 'text-gold'}`}>
                    {p.accountId ? getAcc(p.accountId).label : 'Conto da scegliere'}
                  </p>
                </div>
                <div className="text-right flex-none">
                  <p className={`text-[14px] font-semibold balance-num ${p.amount > 0 ? 'text-primary' : 'text-red'}`}>
                    {p.amount > 0 ? money(p.amount, p.currency) : 'Da inserire'}
                  </p>
                  <span className="text-[11px] font-semibold text-gold">Rivedi ›</span>
                </div>
              </button>

              <div className="flex justify-end mt-1">
                {confirmIgnore === p.id ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setConfirmIgnore(null)}
                      className="text-[11px] text-secondary px-2 py-1">Annulla</button>
                    <button type="button" disabled={ignoring === p.id} onClick={() => ignore(p.id)}
                      className="text-[11px] font-semibold text-red px-2 py-1 disabled:opacity-50">
                      {ignoring === p.id ? '…' : 'Ignora pagamento'}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmIgnore(p.id)}
                    className="text-[11px] text-tertiary px-2 py-1">Ignora</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {payments.length > 4 && (
        <button type="button" onClick={() => setExpanded(v => !v)}
          className="w-full py-2.5 border-t border-divider text-[12px] font-semibold text-gold">
          {expanded ? 'Mostra meno' : `Mostra tutti (${payments.length})`}
        </button>
      )}
      {actionError && (
        <p className="px-4 py-2.5 border-t border-divider text-[11.5px] text-red">{actionError}</p>
      )}
    </section>
  );
}
