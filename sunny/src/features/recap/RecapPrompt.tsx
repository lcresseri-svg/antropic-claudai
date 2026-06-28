import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { monthKey } from '../insights/insightsEngine';
import { recapMonthLabel } from './monthlyRecap';

/** Once-per-month, per-device nudge. Stored in localStorage (NOT Firestore) to
 *  keep Firebase cost at zero. Mounted in the authenticated shell (post-onboarding). */
const SEEN_KEY = 'sunny:recapPromptSeen';

export function RecapPrompt({ transactions }: { transactions: Transaction[] }) {
  const navigate = useNavigate();
  const [prevYM, setPrevYM] = useState<string | null>(null);

  useEffect(() => {
    const currentYM = monthKey(0);
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
    if (seen === currentYM) return;                 // already handled this month on this device
    const prev = monthKey(1);
    if (!transactions.some(t => t.date.startsWith(prev))) return; // no history → no empty recap
    setPrevYM(prev);
  }, [transactions]);

  const dismiss = (go: boolean) => {
    try { localStorage.setItem(SEEN_KEY, monthKey(0)); } catch { /* ignore */ }
    setPrevYM(null);
    if (go && prevYM) navigate(`/recap/${prevYM}`);
  };

  if (!prevYM) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 animate-fade-in"
      onClick={() => dismiss(false)}>
      <div className="w-full max-w-sm bg-elevated rounded-3xl p-6 shadow-float animate-sheet-up" onClick={e => e.stopPropagation()}>
        <div className="text-3xl mb-3">📊</div>
        <h2 className="text-lg font-bold text-primary tracking-[-0.02em]">Il tuo riepilogo di {recapMonthLabel(prevYM)} è pronto</h2>
        <p className="text-[13px] text-secondary mt-1.5 leading-relaxed">
          Uno sguardo riflessivo a com'è andato il mese: risparmio, confronti col tuo solito e cosa è cambiato.
        </p>
        <div className="flex flex-col gap-2 mt-5">
          <button onClick={() => dismiss(true)}
            className="w-full py-3 rounded-2xl bg-gold text-bg font-semibold text-sm active:opacity-90 transition-opacity">
            Vai a vederlo
          </button>
          <button onClick={() => dismiss(false)}
            className="w-full py-3 rounded-2xl bg-card text-secondary font-medium text-sm hover:bg-card-hover transition-colors">
            Più tardi
          </button>
        </div>
      </div>
    </div>
  );
}
