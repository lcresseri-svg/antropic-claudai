/**
 * Persistent prompt shown when the CURRENT month's budget isn't confirmed yet
 * (section 17.4). Re-appears every session until the month is confirmed; the
 * "remind me later" action snoozes it for 24h. This is a logical (non-
 * destructive) month reset — the previous month stays in history.
 */
import { useState } from 'react';

interface Props {
  /** YYYY-MM of the month being prompted. */
  month: string;
  /** True when the current month was copied from the previous month. */
  copiedFromPrevious: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}

const snoozeKey = (month: string) => `sunny:budgetPromptSnooze:${month}`;

function isSnoozed(month: string): boolean {
  try {
    const until = Number(localStorage.getItem(snoozeKey(month)) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

export function BudgetSetupBanner({ month, copiedFromPrevious, onConfirm, onEdit }: Props) {
  const [hidden, setHidden] = useState(() => isSnoozed(month));
  if (hidden) return null;

  const remindLater = () => {
    try { localStorage.setItem(snoozeKey(month), String(Date.now() + 24 * 3600 * 1000)); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <div className="glass-card rounded-2xl p-4 border border-gold/25 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ backgroundColor: 'rgba(230,185,92,0.12)' }}>🗓️</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Imposta il budget di questo mese</p>
          <p className="text-[13px] text-secondary leading-snug mt-0.5">
            {copiedFromPrevious
              ? 'Il nuovo mese è iniziato. Ho copiato il budget precedente come base, ma confermalo o modificalo per migliorare le previsioni di Sunny.'
              : 'Il nuovo mese è iniziato. Conferma o imposta il budget per migliorare le previsioni di Sunny.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onConfirm}
          className="px-3 py-1.5 rounded-xl bg-gold/15 text-gold text-[13px] font-medium hover:bg-gold/25 transition-colors">
          Conferma budget
        </button>
        <button onClick={onEdit}
          className="px-3 py-1.5 rounded-xl bg-elevated text-secondary text-[13px] font-medium hover:bg-card-hover transition-colors">
          Modifica budget
        </button>
        <button onClick={remindLater}
          className="px-3 py-1.5 rounded-xl text-tertiary text-[13px] font-medium hover:text-secondary transition-colors">
          Ricordamelo più tardi
        </button>
      </div>
    </div>
  );
}
