import { formatCurrency } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { ProgressBar } from '../../shared/components';

interface Props {
  accountBalances: Record<string, number>;
  expenseByAccount: Record<string, number>;
  mode: 'balance' | 'spending';
  onToggle: () => void;
}

export function AccountsCard({ accountBalances, expenseByAccount, mode, onToggle }: Props) {
  const { accounts, getAcc } = useSettings();
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
  if (entries.length === 0) return null;

  const max = Math.max(...entries.map(e => Math.abs(e.value)));

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="label-caps text-secondary">{mode === 'balance' ? 'Saldo per conto' : 'Spese per conto'}</p>
        <button onClick={onToggle} className="text-xs font-medium text-gold">
          {mode === 'balance' ? 'Vedi spese' : 'Vedi saldi'}
        </button>
      </div>
      <ul className="space-y-3.5">
        {entries.map(({ acc, value }) => (
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
    </div>
  );
}
