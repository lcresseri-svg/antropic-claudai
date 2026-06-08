import { useState, useMemo, useEffect } from 'react';
import { Transaction, TransactionType, TYPE_META, TYPE_ORDER, TransactionPatch, typeColor } from '../../types';
import { formatCurrency, formatDate, formatMonthLong, capitalize } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { isPending } from '../../shared/recurrence';
import { TransactionRow } from './TransactionRow';
import { OptionSheet } from '../../shared/components/OptionSheet';

const TODAY_ISO = new Date().toISOString().slice(0, 10);
// Upcoming = a synthetic recurring projection OR a real planned (future-dated)
// one-off. Both are forecasts for subtotal/styling purposes; only the planned
// one-off is a real, editable document.
const isUpcoming = (t: Transaction) => !!t.projected || isPending(t, TODAY_ISO);

interface Props {
  transactions: Transaction[];
  projected?: Transaction[]; // virtual future occurrences — display only
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onBulkUpdate: (ids: string[], patch: TransactionPatch) => void;
  onBulkDelete: (ids: string[]) => void;
  onAdd: () => void;
  uiV2?: boolean;
}

type GroupMode = 'month' | 'account' | 'category';
type SortKey = 'date' | 'amount';
type SortDir = 'desc' | 'asc';
type PeriodFilter = 'all' | '1m' | '3m' | '6m' | '1y';

const PERIOD_OPTS: { value: PeriodFilter; label: string }[] = [
  { value: 'all', label: 'Tutto' },
  { value: '1m', label: 'Ultimo mese' },
  { value: '3m', label: 'Ultimi 3 mesi' },
  { value: '6m', label: 'Ultimi 6 mesi' },
  { value: '1y', label: 'Ultimo anno' },
];

function periodCutoff(p: PeriodFilter, now: Date): Date | null {
  if (p === 'all') return null;
  const d = new Date(now);
  if (p === '1m') d.setMonth(d.getMonth() - 1);
  else if (p === '3m') d.setMonth(d.getMonth() - 3);
  else if (p === '6m') d.setMonth(d.getMonth() - 6);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
}

// How far ahead to show projected ("Programmato") occurrences. Default: 5 days.
type ProjView = '5d' | '30d' | '3m' | 'all' | 'off';
const PROJ_DEFAULT: ProjView = '5d';
const PROJ_OPTS: { value: ProjView; label: string }[] = [
  { value: '5d',  label: 'Prossimi 5 giorni' },
  { value: '30d', label: 'Prossimi 30 giorni' },
  { value: '3m',  label: 'Prossimi 3 mesi' },
  { value: 'all', label: 'Tutti i previsti' },
  { value: 'off', label: 'Nascondi previsti' },
];

/** Upper bound (inclusive, YYYY-MM-DD) for projected rows; null = no limit. */
function projectedCutoffISO(v: ProjView, now: Date): string | null {
  if (v === 'all' || v === 'off') return null;
  const d = new Date(now);
  if (v === '5d') d.setDate(d.getDate() + 5);
  else if (v === '30d') d.setDate(d.getDate() + 30);
  else d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export function TransactionList({ transactions, projected = [], onEdit, onDelete, onBulkUpdate, onBulkDelete, onAdd, uiV2 = false }: Props) {
  const { categories, accounts, getAcc, getCat, theme } = useSettings();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('month');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [projView, setProjView] = useState<ProjView>(PROJ_DEFAULT);
  const [filterOpen, setFilterOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<'category' | 'account' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Esc chiude il pannello filtri; finché è aperto blocca lo scroll di sfondo.
  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [filterOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const cutoff = periodCutoff(period, now);
    const projCut = projectedCutoffISO(projView, now);

    // Future-dated one-off "previsti" are real documents that live in
    // `transactions`, but for display they're forecasts just like the synthetic
    // recurring projections — so they obey the very same horizon filter
    // (5gg / 30gg / 3 mesi / tutti / nascondi). Realized rows always show.
    const realized = transactions.filter(t => !isPending(t, TODAY_ISO));
    const pendingOneOffs = transactions.filter(t => isPending(t, TODAY_ISO));
    const withinHorizon = (t: Transaction) => !projCut || t.date <= projCut;
    const visibleProjected = projView === 'off'
      ? []
      : [...projected, ...pendingOneOffs].filter(withinHorizon);

    // Search across everything the user can see: description, notes, category &
    // account names (incl. transfer destination), type, date (ISO + "2 giu 2026"
    // + "giugno 2026") and amount (raw, 2-decimals, comma form and formatted).
    const matches = (t: Transaction): boolean => {
      if (!q) return true;
      const cat = categories.find(c => c.id === t.category);
      const acc = accounts.find(a => a.id === t.account);
      const toAcc = t.toAccount ? accounts.find(a => a.id === t.toAccount) : undefined;
      const hay = [
        t.description,
        t.notes ?? '',
        cat?.label ?? '',
        acc?.label ?? '',
        toAcc?.label ?? '',
        TYPE_META[t.type].label,
        t.date,
        formatDate(t.date),
        formatMonthLong(t.date.slice(0, 7)),
        String(t.amount),
        t.amount.toFixed(2),
        t.amount.toFixed(2).replace('.', ','),
        formatCurrency(t.amount),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    };

    return [...realized, ...visibleProjected]
      .filter(t => typeFilter === 'all' || t.type === typeFilter)
      .filter(t => !cutoff || new Date(t.date) >= cutoff)
      .filter(matches)
      .sort((a, b) => {
        let diff: number;
        if (sortKey === 'amount') {
          diff = b.amount - a.amount;
        } else {
          diff = new Date(b.date).getTime() - new Date(a.date).getTime();
          // Same date: break the tie by creation time so the order is stable
          // and the most-recently-added movement surfaces first.
          if (diff === 0) diff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
        }
        return sortDir === 'desc' ? diff : -diff;
      });
  }, [transactions, projected, projView, typeFilter, period, search, sortKey, sortDir, categories, accounts]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = groupMode === 'month' ? t.date.slice(0, 7) : groupMode === 'account' ? t.account : t.category;
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return Array.from(map.entries());
  }, [filtered, groupMode]);

  const groupTitle = (key: string) =>
    groupMode === 'month' ? capitalize(formatMonthLong(key))
      : groupMode === 'account' ? `${getAcc(key).icon} ${getAcc(key).label}`
      : `${getCat(key).icon} ${getCat(key).label}`;

  // Subtotals reflect only realized (actual) transactions — projected occurrences
  // and planned future-dated one-offs are forecasts and must not inflate the total.
  const signed = (t: Transaction) => t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0;
  const groupSum = (txs: Transaction[]) =>
    txs.filter(t => !isUpcoming(t)).reduce((s, t) => s + signed(t), 0);
  const groupHasReal = (txs: Transaction[]) => txs.some(t => !isUpcoming(t));
  const groupProjectedSum = (txs: Transaction[]) =>
    txs.filter(isUpcoming).reduce((s, t) => s + signed(t), 0);

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allCollapsed = groups.length > 0 && groups.every(([key]) => collapsed.has(key));
  const toggleAll = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map(([key]) => key)));
  };

  // cambiando raggruppamento le chiavi non corrispondono più: ripulisco
  const changeGroup = (m: GroupMode) => { setGroupMode(m); setCollapsed(new Set()); };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Whole-group selection (real rows only — projected occurrences aren't selectable).
  const groupRealIds = (txs: Transaction[]) => txs.filter(t => !t.projected).map(t => t.id);
  const groupAllSelected = (txs: Transaction[]) => {
    const gIds = groupRealIds(txs);
    return gIds.length > 0 && gIds.every(id => selected.has(id));
  };
  const toggleGroup = (txs: Transaction[]) => {
    const gIds = groupRealIds(txs);
    setSelected(prev => {
      const next = new Set(prev);
      const all = gIds.every(id => next.has(id));
      gIds.forEach(id => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); setConfirmDelete(false); };

  const usedTypes = TYPE_ORDER.filter(t => transactions.some(tx => tx.type === t));
  // There are forecasts to govern if we have recurring projections OR any
  // future-dated one-off "previsti" — both feed the "Previsti" horizon filter.
  const hasUpcoming = projected.length > 0 || transactions.some(t => isPending(t, TODAY_ISO));
  const ids = [...selected];

  const applyPatch = (patch: TransactionPatch) => {
    onBulkUpdate(ids, patch);
    setPicker(null);
    exitSelect();
  };

  const filterActive = period !== 'all' || sortKey !== 'date' || sortDir !== 'desc' || projView !== PROJ_DEFAULT || groupMode !== 'month';
  const periodLabel = PERIOD_OPTS.find(o => o.value === period)!.label;
  const projLabel = PROJ_OPTS.find(o => o.value === projView)!.label;
  const dirLabels: [SortDir, string][] = sortKey === 'amount'
    ? [['desc', 'Più alto'], ['asc', 'Più basso']]
    : [['desc', 'Più recenti'], ['asc', 'Meno recenti']];

  return (
    <div className="space-y-4 pb-28">
      {/* Controls */}
      <div className="space-y-3">
        {/* Search + filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome, importo, data, conto…"
              className="w-full bg-card rounded-2xl pl-9 pr-9 py-2.5 text-sm text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setFilterOpen(o => !o)} aria-label="Filtri e ordinamento"
              className={`relative h-full px-3 rounded-2xl flex items-center gap-1.5 text-sm transition-colors ${
                filterActive || filterOpen ? 'bg-gold/10 text-gold' : 'bg-card text-secondary hover:text-primary'
              }`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              {filterActive && <span className="w-1.5 h-1.5 rounded-full bg-gold" />}
            </button>

            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 z-50 glass-elevated rounded-2xl shadow-float p-2.5 max-h-[70dvh] overflow-y-auto overscroll-contain animate-fade-in-fast">
                  <p className="label-caps text-secondary mb-1.5 px-1">Ordina per</p>
                  <div className="flex gap-1 bg-card rounded-xl p-1 mb-2">
                    {([['date', 'Data'], ['amount', 'Importo']] as [SortKey, string][]).map(([key, lbl]) => (
                      <button key={key} onClick={() => setSortKey(key)}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          sortKey === key ? 'bg-elevated text-primary' : 'text-secondary'
                        }`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-card rounded-xl p-1 mb-2.5">
                    {dirLabels.map(([dir, lbl]) => (
                      <button key={dir} onClick={() => setSortDir(dir)}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          sortDir === dir ? 'bg-elevated text-primary' : 'text-secondary'
                        }`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <p className="label-caps text-secondary mb-1.5 px-1">Raggruppa per</p>
                  <div className="space-y-1 mb-2.5">
                    {([['month', 'Per mese'], ['account', 'Per conto'], ['category', 'Per categoria']] as [GroupMode, string][]).map(([m, lbl]) => (
                      <button key={m} onClick={() => { changeGroup(m); setFilterOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-[13px] transition-colors ${
                          groupMode === m ? 'bg-gold/10 text-gold font-medium' : 'text-primary hover:bg-card'
                        }`}>
                        {lbl}
                        {groupMode === m && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="label-caps text-secondary mb-1.5 px-1">Periodo</p>
                  <div className="space-y-1">
                    {PERIOD_OPTS.map(opt => (
                      <button key={opt.value} onClick={() => { setPeriod(opt.value); setFilterOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-[13px] transition-colors ${
                          period === opt.value ? 'bg-gold/10 text-gold font-medium' : 'text-primary hover:bg-card'
                        }`}>
                        {opt.label}
                        {period === opt.value && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>

                  {hasUpcoming && (
                    <>
                      <p className="label-caps text-secondary mb-1.5 mt-2.5 px-1">Previsti</p>
                      <div className="space-y-1">
                        {PROJ_OPTS.map(opt => (
                          <button key={opt.value} onClick={() => { setProjView(opt.value); setFilterOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-[13px] transition-colors ${
                              projView === opt.value ? 'bg-gold/10 text-gold font-medium' : 'text-primary hover:bg-card'
                            }`}>
                            {opt.label}
                            {projView === opt.value && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6 9 17l-5-5"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filtri attivi — pill rimovibili */}
        {(period !== 'all' || projView !== PROJ_DEFAULT) && (
          <div className="flex flex-wrap gap-2">
            {period !== 'all' && (
              <button onClick={() => setPeriod('all')}
                className="inline-flex items-center gap-1.5 bg-gold/10 text-gold rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                {periodLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
            {projView !== PROJ_DEFAULT && (
              <button onClick={() => setProjView(PROJ_DEFAULT)}
                className="inline-flex items-center gap-1.5 bg-gold/10 text-gold rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                🗓️ {projLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Type filter + action buttons — one row */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1 -mx-1 px-1">
            <PillBtn active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>Tutte</PillBtn>
            {usedTypes.map(t => (
              <PillBtn key={t} active={typeFilter === t} dot={typeColor(t, theme)}
                onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
                {TYPE_META[t].label}
              </PillBtn>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {groups.length > 1 && (
              <button onClick={toggleAll}
                className="text-xs font-medium text-secondary px-2 py-1.5 active:bg-card-hover rounded-lg transition-colors">
                {allCollapsed ? 'Espandi' : 'Comprimi'}
              </button>
            )}
            {uiV2 ? (
              <button onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
                aria-label={selectMode ? 'Annulla selezione' : 'Seleziona'}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                  selectMode ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary'
                }`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                  <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                  <path d="m14 17.5 2 2 4-4"/>
                </svg>
              </button>
            ) : (
              <button onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
                className="text-xs font-medium text-gold px-2 py-1.5 active:bg-card-hover rounded-lg transition-colors">
                {selectMode ? 'Annulla' : 'Seleziona'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Groups */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3 opacity-60">🔍</p>
          <p className="text-sm text-secondary">{search ? `Nessun risultato per "${search}"` : 'Nessuna transazione'}</p>
          {!search && <button onClick={onAdd} className="mt-3 text-sm font-medium text-gold">+ Aggiungi</button>}
        </div>
      ) : (
        groups.map(([key, txs]) => {
          const isCollapsed = collapsed.has(key);
          return (
            <div key={key} className="bg-card rounded-2xl p-4">
              <div className="w-full flex items-center justify-between mb-1 px-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {selectMode && groupHasReal(txs) && (
                    <button onClick={() => toggleGroup(txs)} aria-label="Seleziona gruppo"
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors mr-0.5 ${
                        groupAllSelected(txs) ? 'bg-gold border-gold' : 'border-divider'
                      }`}>
                      {groupAllSelected(txs) && <span className="text-bg text-xs font-bold">✓</span>}
                    </button>
                  )}
                  <button onClick={() => toggleCollapse(key)} className="flex items-center gap-1.5 min-w-0 group">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-secondary flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                    <h4 className="label-caps text-secondary truncate group-hover:text-primary transition-colors">{groupTitle(key)}</h4>
                    {isCollapsed && <span className="text-[11px] text-secondary/60 flex-shrink-0">· {txs.length}</span>}
                  </button>
                </div>
                {groupHasReal(txs) ? (
                  <span className={`text-xs font-medium balance-num flex-shrink-0 ${groupSum(txs) >= 0 ? 'text-green' : 'text-secondary'}`}>
                    {formatCurrency(groupSum(txs), { sign: true })}
                  </span>
                ) : (
                  <span className="text-xs font-medium balance-num flex-shrink-0 text-secondary/70">
                    previsto {formatCurrency(groupProjectedSum(txs), { sign: true })}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <div className="divide-y divide-divider">
                  {txs.map(tx => (
                    <TransactionRow key={tx.id} tx={tx} upcoming={isUpcoming(tx)}
                      selectable={selectMode && !tx.projected} selected={selected.has(tx.id)}
                      onToggle={toggle} onClick={onEdit} />
                  ))}
                </div>
              )}
            </div>
          );
        })
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

function PillBtn({ children, active, dot, onClick }: { children: React.ReactNode; active: boolean; dot?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        active ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary active:bg-card-hover'
      }`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />}
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
