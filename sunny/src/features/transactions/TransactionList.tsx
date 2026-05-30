import { useState, useMemo } from 'react';
import { Transaction, TransactionType, TYPE_META, TYPE_ORDER, TransactionPatch } from '../../types';
import { formatCurrency, formatMonthLong, capitalize } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { TransactionRow } from './TransactionRow';
import { OptionSheet } from '../../shared/components/OptionSheet';

interface Props {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onBulkUpdate: (ids: string[], patch: TransactionPatch) => void;
  onBulkDelete: (ids: string[]) => void;
  onAdd: () => void;
}

type GroupMode = 'month' | 'account';

export function TransactionList({ transactions, onEdit, onDelete, onBulkUpdate, onBulkDelete, onAdd }: Props) {
  const { categories, accounts, getAcc } = useSettings();
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('month');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<'category' | 'account' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filtered = useMemo(() => {
    return [...transactions]
      .filter(t => typeFilter === 'all' || t.type === typeFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, typeFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = groupMode === 'month' ? t.date.slice(0, 7) : t.account;
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return Array.from(map.entries());
  }, [filtered, groupMode]);

  const groupTitle = (key: string) =>
    groupMode === 'month' ? capitalize(formatMonthLong(key)) : `${getAcc(key).icon} ${getAcc(key).label}`;

  const groupSum = (txs: Transaction[]) =>
    txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); setConfirmDelete(false); };

  const usedTypes = TYPE_ORDER.filter(t => transactions.some(tx => tx.type === t));
  const ids = [...selected];

  const applyPatch = (patch: TransactionPatch) => {
    onBulkUpdate(ids, patch);
    setPicker(null);
    exitSelect();
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Controls */}
      <div className="space-y-3">
        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>Tutte</Chip>
          {usedTypes.map(t => (
            <Chip key={t} active={typeFilter === t} color={TYPE_META[t].color}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
              {TYPE_META[t].label}
            </Chip>
          ))}
        </div>

        {/* Group + select */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-card rounded-xl p-1">
            {(['month', 'account'] as GroupMode[]).map(m => (
              <button key={m} onClick={() => setGroupMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  groupMode === m ? 'bg-elevated text-primary' : 'text-secondary'
                }`}>
                {m === 'month' ? 'Per mese' : 'Per conto'}
              </button>
            ))}
          </div>
          <button onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
            className="text-xs font-medium text-gold px-2 py-1.5">
            {selectMode ? 'Annulla' : 'Seleziona'}
          </button>
        </div>
      </div>

      {/* Groups */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3 opacity-60">🔍</p>
          <p className="text-sm text-secondary">Nessuna transazione</p>
          <button onClick={onAdd} className="mt-3 text-sm font-medium text-gold">+ Aggiungi</button>
        </div>
      ) : (
        groups.map(([key, txs]) => (
          <div key={key} className="bg-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1 px-1">
              <h4 className="label-caps text-secondary">{groupTitle(key)}</h4>
              <span className="text-xs font-medium balance-num" style={{ color: groupSum(txs) >= 0 ? '#8A9270' : '#8B8B8B' }}>
                {formatCurrency(groupSum(txs), { sign: true })}
              </span>
            </div>
            <div className="divide-y divide-divider">
              {txs.map(tx => (
                <TransactionRow key={tx.id} tx={tx}
                  selectable={selectMode} selected={selected.has(tx.id)}
                  onToggle={toggle} onClick={onEdit} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 safe-bottom animate-sheet-up">
          <div className="max-w-2xl mx-auto bg-elevated/95 backdrop-blur rounded-2xl shadow-float p-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-primary px-2 whitespace-nowrap">{selected.size} sel.</span>
            <div className="flex-1 flex gap-2 justify-end">
              <BarBtn onClick={() => setPicker('category')}>Categoria</BarBtn>
              <BarBtn onClick={() => setPicker('account')}>Conto</BarBtn>
              {confirmDelete
                ? <BarBtn danger onClick={() => { onBulkDelete(ids); exitSelect(); }}>Conferma ({selected.size})</BarBtn>
                : <BarBtn danger onClick={() => setConfirmDelete(true)}>Elimina</BarBtn>
              }
            </div>
          </div>
        </div>
      )}

      <OptionSheet
        open={picker === 'category'} title="Sposta in categoria"
        options={categories}
        onPick={id => applyPatch({ category: id })}
        onClose={() => setPicker(null)}
      />
      <OptionSheet
        open={picker === 'account'} title="Sposta su conto"
        options={accounts}
        onPick={id => applyPatch({ account: id })}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}

function Chip({ children, active, color, onClick }: { children: React.ReactNode; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
        active ? 'text-bg' : 'bg-card text-secondary'
      }`}
      style={active ? { backgroundColor: color ?? '#F5F5F5' } : {}}>
      {children}
    </button>
  );
}

function BarBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
        danger ? 'bg-[#E08B8B]/15 text-[#E08B8B]' : 'bg-card text-primary hover:bg-card-hover'
      }`}>
      {children}
    </button>
  );
}
