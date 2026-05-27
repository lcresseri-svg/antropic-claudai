import { useState } from 'react';
import { Transaction, TransactionType, Account, Category, CATEGORY_META, TYPE_META, ACCOUNT_META, ALL_ACCOUNTS, ALL_CATEGORIES } from '../types';
import { TransactionItem } from './TransactionItem';

interface Props {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function TransactionList({ transactions, onDelete, onAdd }: Props) {
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<Account | 'all'>('all');
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all');
  const [showAllFilters, setShowAllFilters] = useState(false);

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const filtered = sorted.filter(tx => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (accountFilter !== 'all' && tx.account !== accountFilter) return false;
    if (catFilter !== 'all' && tx.category !== catFilter) return false;
    return true;
  });

  const groups = new Map<string, Transaction[]>();
  filtered.forEach(tx => {
    const k = tx.date.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(tx);
  });

  const monthLabel = (k: string) =>
    new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(k + '-01'));

  const usedAccounts = ALL_ACCOUNTS.filter(a => transactions.some(tx => tx.account === a));
  const usedTypes = (['income','expense','investment','transfer'] as TransactionType[]).filter(
    t => transactions.some(tx => tx.type === t),
  );

  const activeFilters = [typeFilter, accountFilter, catFilter].filter(f => f !== 'all').length;

  return (
    <div className="space-y-4">
      {/* Filter card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        {/* Type filter */}
        <div className="flex gap-2 flex-wrap">
          <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>Tutte</FilterPill>
          {usedTypes.map(t => (
            <FilterPill
              key={t} active={typeFilter === t}
              color={typeFilter === t ? TYPE_META[t].color : undefined}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
            >
              {TYPE_META[t].icon} {TYPE_META[t].label}
            </FilterPill>
          ))}
        </div>

        {/* Toggle more filters */}
        <button
          onClick={() => setShowAllFilters(v => !v)}
          className="text-xs text-dark/40 hover:text-dark/70 flex items-center gap-1 transition-colors"
        >
          <span>{showAllFilters ? '▲' : '▼'}</span>
          Filtri aggiuntivi {activeFilters > 0 && <span className="bg-dark text-cream rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{activeFilters}</span>}
        </button>

        {showAllFilters && (
          <div className="space-y-2 pt-1 border-t border-black/5">
            {/* Account filter */}
            {usedAccounts.length > 1 && (
              <div>
                <p className="text-xs text-dark/40 mb-1.5">Conto</p>
                <div className="flex gap-2 flex-wrap">
                  <FilterPill active={accountFilter === 'all'} onClick={() => setAccountFilter('all')}>Tutti</FilterPill>
                  {usedAccounts.map(a => (
                    <FilterPill
                      key={a} active={accountFilter === a}
                      color={accountFilter === a ? ACCOUNT_META[a].color : undefined}
                      onClick={() => setAccountFilter(accountFilter === a ? 'all' : a)}
                    >
                      {ACCOUNT_META[a].icon} {ACCOUNT_META[a].label}
                    </FilterPill>
                  ))}
                </div>
              </div>
            )}

            {/* Category filter */}
            <div>
              <p className="text-xs text-dark/40 mb-1.5">Categoria</p>
              <div className="flex gap-2 flex-wrap">
                <FilterPill active={catFilter === 'all'} onClick={() => setCatFilter('all')}>Tutte</FilterPill>
                {ALL_CATEGORIES.filter(c => transactions.some(tx => tx.category === c)).map(c => (
                  <FilterPill
                    key={c} active={catFilter === c}
                    color={catFilter === c ? CATEGORY_META[c].color : undefined}
                    onClick={() => setCatFilter(catFilter === c ? 'all' : c)}
                  >
                    {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
                  </FilterPill>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-dark/40 px-1">
        {filtered.length} transazion{filtered.length === 1 ? 'e' : 'i'}
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm text-dark/40">Nessuna transazione trovata</p>
          <button onClick={onAdd} className="mt-3 text-sm font-medium text-sage hover:text-sage/70">
            + Aggiungi
          </button>
        </div>
      ) : (
        Array.from(groups.entries()).map(([month, txs]) => (
          <div key={month} className="bg-white rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-semibold text-dark/40 uppercase tracking-widest mb-2 capitalize">
              {monthLabel(month)}
            </h4>
            <div className="divide-y divide-black/5">
              {txs.map(tx => <TransactionItem key={tx.id} tx={tx} onDelete={onDelete} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function FilterPill({
  children, active, color, onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active ? 'text-cream' : 'bg-black/5 text-dark/60 hover:text-dark'
      }`}
      style={active ? { backgroundColor: color ?? '#1C1C1E' } : {}}
    >
      {children}
    </button>
  );
}
