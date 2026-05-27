import { useState } from 'react';
import { Transaction, Category, CATEGORY_META, ALL_CATEGORIES } from '../types';
import { TransactionItem } from './TransactionItem';

interface Props {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onAdd: () => void;
}

type Filter = 'all' | 'income' | 'expense';

export function TransactionList({ transactions, onDelete, onAdd }: Props) {
  const [typeFilter, setTypeFilter] = useState<Filter>('all');
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all');

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const filtered = sorted.filter(tx => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (catFilter !== 'all' && tx.category !== catFilter) return false;
    return true;
  });

  // Group by month
  const groups: Map<string, Transaction[]> = new Map();
  filtered.forEach(tx => {
    const key = tx.date.slice(0, 7); // YYYY-MM
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  });

  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(
      new Date(key + '-01'),
    );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex gap-2">
          {(['all', 'income', 'expense'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                typeFilter === f
                  ? 'bg-dark text-cream'
                  : 'bg-black/5 text-dark/60 hover:text-dark'
              }`}
            >
              {f === 'all' ? 'Tutte' : f === 'income' ? 'Entrate' : 'Uscite'}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCatFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              catFilter === 'all'
                ? 'bg-dark text-cream'
                : 'bg-black/5 text-dark/60 hover:text-dark'
            }`}
          >
            Tutte
          </button>
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                catFilter === cat
                  ? 'text-cream'
                  : 'bg-black/5 text-dark/60 hover:text-dark'
              }`}
              style={catFilter === cat ? { backgroundColor: CATEGORY_META[cat].color } : {}}
            >
              {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-dark/40 px-1">
        {filtered.length} transazion{filtered.length === 1 ? 'e' : 'i'}
      </p>

      {/* Grouped list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm text-dark/40">Nessuna transazione trovata</p>
          <button
            onClick={onAdd}
            className="mt-3 text-sm font-medium text-sage hover:text-sage/70"
          >
            + Aggiungi una transazione
          </button>
        </div>
      ) : (
        Array.from(groups.entries()).map(([month, txs]) => (
          <div key={month} className="bg-white rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-semibold text-dark/40 uppercase tracking-widest mb-2 capitalize">
              {monthLabel(month)}
            </h4>
            <div className="divide-y divide-black/5">
              {txs.map(tx => (
                <TransactionItem key={tx.id} tx={tx} onDelete={onDelete} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
