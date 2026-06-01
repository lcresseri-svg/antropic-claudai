import { useState } from 'react';
import { formatCurrency } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { ProgressBar } from '../../shared/components';

interface Props {
  accountBalances: Record<string, number>;
  expenseByAccount: Record<string, number>;
  mode: 'balance' | 'spending';
  onToggle: () => void;
}

const COLLAPSED_COUNT = 3;

export function AccountsCard({ accountBalances, expenseByAccount, mode, onToggle }: Props) {
  const { accounts, getAcc } = useSettings();
  const [showAll, setShowAll] = useState(false);
  const source = mode === 'balance' ? accountBalances : expenseByAccount;

  const entries = accounts
    .map(a => ({ acc: a, value: source[a.id] ?? 0 }))
    .filter(e => Math.abs(e.value) > 0.005)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  // also include unknown account ids that may exist in data
  for (const id of Object.keys(source)) {
    if (!accounts.some(a => a.id === id) && Math.abs(source[id]) > 0.005) {
      entries.push({ acc: getAcc(id), value: source[id] });
    }
  }

  // Hide the whole card only when there's no data in EITHER mode — otherwise
  // keep the header + toggle visible so the user can switch back.
  const hasAnyData =
    Object.values(accountBalances).some(v => Math.abs(v) > 0.005) ||
    Object.values(expenseByAccount).some(v => Math.abs(v) > 0.005);
  if (!hasAnyData) return null;

  const max = entries.length ? Math.max(...entries.map(e => Math.abs(e.value))) : 0;
  const visible = showAll ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hiddenCount = entries.length - visible.length;

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="label-caps text-secondary">{mode === 'balance' ? 'Saldo per conto' : 'Spese per conto'}</p>
        <button onClick={onToggle} className="text-xs font-medium text-gold">
          {mode === 'balance' ? 'Vedi spese' : 'Vedi saldi'}
        </button>
      </div>
      {entries.length === 0 && (
        <p className="text-[13px] text-secondary py-4 text-center">
          {mode === 'spending' ? 'Nessuna spesa in questo periodo' : 'Nessun saldo da mostrare'}
        </p>
      )}
      <ul className="space-y-3.5">
        {visible.map(({ acc, value }) => (
          <li key={acc.id}>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: acc.color + '18' }}>{acc.icon}</span>
              <span className="text-[13px] text-primary flex-1 truncate">{acc.label}</span>
              <span className={`text-[13px] font-semibold balance-num ${value < 0 && mode === 'balance' ? 'text-[#E08B8B]' : 'text-primary'}`}>
                {formatCurrency(value)}
              </span>
            </div>
            <ProgressBar value={Math.abs(value)} max={max} color={acc.color} />
          </li>
        ))}
      </ul>
      {entries.length > COLLAPSED_COUNT && (
        <button onClick={() => setShowAll(s => !s)}
          className="mt-4 w-full text-xs font-medium text-gold flex items-center justify-center gap-1.5">
          {showAll ? 'Mostra meno' : `Mostra tutti (${hiddenCount} in più)`}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${showAll ? 'rotate-180' : ''}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
