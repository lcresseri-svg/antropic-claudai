import {PageToolbar} from '../../shared/components/PageToolbar';
import { readTransactionRange } from '../../shared/transactionRoute';
import { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUiSessionState, useUiVersion, useUiNavigationMemory } from '../../shared/providers/UiVersionProvider';
import { Transaction, TransactionType, TYPE_META, TYPE_ORDER, TransactionPatch, typeColor, ownShare } from '../../types';
import { formatCurrency, formatDate, formatDateFull, formatMonthLong, capitalize } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { isPending } from '../../shared/recurrence';
import { aggregateFlow, statisticalNetDelta } from '../../shared/financialFlow';
import { OutflowInfo, FlowInfoLine } from '../../shared/components/OutflowInfo';
import { TransactionRow } from './TransactionRow';
import { MonthSummaryHeader } from './MonthSummaryHeader';
import { buildMonthSections, dayLabel, longDayLabel } from './listGrouping';
import { OptionSheet } from '../../shared/components/OptionSheet';
import './transactions-ui31.css';

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
  onBulkUpdate: (ids: string[], patch: TransactionPatch) => void | Promise<void>;
  onBulkDelete: (ids: string[]) => void | Promise<void>;
  onAdd: () => void;
}

type GroupMode = 'day' | 'month' | 'account' | 'category' | 'type';
type SortKey = 'date' | 'amount';
type SortDir = 'desc' | 'asc';
type PeriodFilter = 'all' | '1m' | '3m' | '6m' | '1y' | 'ytd';

const PERIOD_OPTS: { value: PeriodFilter; label: string }[] = [
  { value: 'all', label: 'Da sempre' },
  { value: '1m', label: 'Ultimo mese' },
  { value: '3m', label: 'Ultimi 3 mesi' },
  { value: '6m', label: 'Ultimi 6 mesi' },
  { value: '1y', label: 'Ultimo anno' },
  { value: 'ytd', label: "Quest'anno" },
];

function periodCutoff(p: PeriodFilter, now: Date): Date | null {
  if (p === 'all') return null;
  const d = new Date(now);
  if (p === 'ytd') d.setMonth(0, 1);
  else if (p === '1m') d.setMonth(d.getMonth() - 1);
  else if (p === '3m') d.setMonth(d.getMonth() - 3);
  else if (p === '6m') d.setMonth(d.getMonth() - 6);
  else d.setFullYear(d.getFullYear() - 1);
  if (p === 'ytd') d.setHours(0, 0, 0, 0);
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

export function TransactionList({ transactions, projected = [], onEdit, onDelete, onBulkUpdate, onBulkDelete, onAdd }: Props) {
  const ui3 = useUiVersion() === '3.0';
  const session = useUiNavigationMemory();
  const { categories, accounts, getAcc, getCat, theme } = useSettings();
  // Optional category filter driven by the URL (?cat=<id>) — set when arriving
  // from the "Vedi tutti i movimenti" CTA of the Categorie analytics screen.
  const [searchParams, setSearchParams] = useSearchParams();
  const explicitRange=readTransactionRange(searchParams);
  const rangeFrom=explicitRange?.from,rangeTo=explicitRange?.to;
  const queryType=searchParams.get('type');
  const initialType:TransactionType|'all'=queryType&&queryType in TYPE_META?queryType as TransactionType:'all';
  const viewKey=searchParams.toString();
  const catFilter = searchParams.get('cat');
  const clearCatFilter = () => clearCriteria(['cat']);
  // Optional investment-position filter (?investment=<categoryId>) — set by the
  // "Vedi tutti i movimenti" CTA of the InvestmentDetailSheet. Stable URL param.
  const investFilter = searchParams.get('investment');
  const clearInvestFilter = () => clearCriteria(['investment']);
  // Optional account filter (?account=<id>) — set when arriving from the "Vedi
  // tutti i movimenti" CTA of the Saldo-per-conto analytics. Matches either leg
  // of a transfer (account or toAccount).
  const accFilter = searchParams.get('account');
  const clearAccFilter = () => clearCriteria(['account']);
  // Optional series filter (?series=<seriesId>) — set by the SeriesDetailSheet's
  // "Vedi movimenti della serie". Matches instances (seriesId), the template
  // (seriesId, or its own id for legacy templates) and projected rows.
  const seriesFilter = searchParams.get('series');
  const clearSeriesFilter = () => clearCriteria(['series']);
  // Optional single-day filter (?date=YYYY-MM-DD) — set by the home calendar
  // "Ritmo del mese" when you tap a square. Matches the date exactly, così il
  // giorno tappato mostra esattamente i movimenti che hanno riempito la cella.
  const dateFilter = searchParams.get('date');
  const clearDateFilter = () => clearCriteria(['date']);
  const [search, setSearch] = useUiSessionState(`transactions.search:${viewKey}`,'');
  // UI2 keeps its compact search; UI3 exposes the field below a stable title.
  const [searchOpen, setSearchOpen] = useUiSessionState(`transactions.searchOpen:${viewKey}`,false);
  const [typeFilter, setTypeFilter] = useUiSessionState<TransactionType | 'all'>(`transactions.type:${viewKey}`,initialType);
  // Per giorno è la vista di default: è come si guarda il mese in corso.
  const [groupMode, setGroupMode] = useUiSessionState<GroupMode>(`transactions.group:${viewKey}`,'day');
  const [sortKey, setSortKey] = useUiSessionState<SortKey>(`transactions.sort:${viewKey}`,'date');
  const [sortDir, setSortDir] = useUiSessionState<SortDir>(`transactions.direction:${viewKey}`,'desc');
  const [period, setPeriod] = useUiSessionState<PeriodFilter>(`transactions.period:${viewKey}`,'all');
  const [projView, setProjView] = useUiSessionState<ProjView>(`transactions.projected:${viewKey}`,PROJ_DEFAULT);
  // Removing a URL criterion remounts this route. Carry the current display
  // state into that exact destination before navigation, without turning every
  // deep link into a shared global selection. The provider discards this RAM
  // on user/version changes.
  const clearCriteria = (keys: string[], reset?: { period?: PeriodFilter; type?: TransactionType | 'all'; projected?: ProjView }) => {
    const next = new URLSearchParams(searchParams);
    keys.forEach(key => next.delete(key));
    if (ui3) {
      const display = { search, searchOpen, type: reset?.type ?? typeFilter,
        group: groupMode, sort: sortKey, direction: sortDir,
        period: reset?.period ?? period, projected: reset?.projected ?? projView };
      for (const [name, value] of Object.entries(display)) session?.set(`transactions.${name}:${next.toString()}`, value);
    }
    setSearchParams(next, { replace: true });
  };
  const resetCriteria = () => {
    setTypeFilter('all'); setPeriod('all'); setProjView(PROJ_DEFAULT);
    clearCriteria(['cat', 'investment', 'account', 'series', 'date', 'from', 'to', 'type'], { type: 'all', period: 'all', projected: PROJ_DEFAULT });
  };
  const searchInput = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setSearch(''); searchInput.current?.focus({ preventScroll: true }); };
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanel = useRef<HTMLDivElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const hadFiltersOpen = useRef(false);
  const closeFilters = useCallback(() => setFilterOpen(false), []);
  useLayoutEffect(() => {
    if (!ui3) return;
    if (filterOpen) hadFiltersOpen.current = true;
    else if (hadFiltersOpen.current) {
      filterTrigger.current?.focus({preventScroll:true});
      hadFiltersOpen.current = false;
    }
  }, [filterOpen, ui3]);
  useLayoutEffect(() => {
    if (!filterOpen || !ui3) return;
    const resize = () => {
      const panel = filterPanel.current;
      if (!panel) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
      const reserved = innerWidth < 768 ? 100 : 24;
      panel.style.maxHeight = `${Math.max(120, Math.min(innerHeight * .78, bottom - panel.getBoundingClientRect().top - reserved))}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); };
  }, [filterOpen, ui3]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<'category' | 'account' | null>(null);
  const [bulkBusy,setBulkBusy]=useState(false),[bulkError,setBulkError]=useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Series display support for the rows: instances don't carry the recurring
  // rule, so resolve each series' frequency from its (visible) template; for
  // installments, number every recorded rata by its position in the plan.
  const { seriesFreqById, installmentIndexById } = useMemo(() => {
    const freq = new Map<string, NonNullable<Transaction['recurring']>['freq']>();
    const bySeries = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (t.projected) continue;
      if (t.recurring) { freq.set(t.seriesId ?? t.id, t.recurring.freq); continue; }
      if (t.seriesId && t.seriesMeta?.kind === 'installment') {
        const list = bySeries.get(t.seriesId) ?? [];
        list.push(t);
        bySeries.set(t.seriesId, list);
      }
    }
    const idx = new Map<string, number>();
    for (const list of bySeries.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
      list.forEach((t, i) => idx.set(t.id, i + 1));
    }
    return { seriesFreqById: freq, installmentIndexById: idx };
  }, [transactions]);

  // Esc chiude il pannello filtri; finché è aperto blocca lo scroll di sfondo.
  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFilters(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [filterOpen, closeFilters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const cutoff = explicitRange ? null : periodCutoff(period, now);
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
      .filter(t => !catFilter || t.category === catFilter)
      .filter(t => !investFilter || t.category === investFilter)
      .filter(t => !accFilter || t.account === accFilter || t.toAccount === accFilter)
      .filter(t => !seriesFilter || t.seriesId === seriesFilter || t.id === seriesFilter)
      .filter(t => !dateFilter || t.date === dateFilter)
      .filter(t => !rangeFrom || t.date >= rangeFrom)
      .filter(t => !rangeTo || t.date <= rangeTo)
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
  }, [transactions, projected, projView, typeFilter, period, search, sortKey, sortDir, categories, accounts, catFilter, accFilter, seriesFilter, investFilter, dateFilter, rangeFrom, rangeTo]);

  const lastEdited = useRef<{ tx: Transaction; snapshot: Transaction[] } | null>(null);
  const [editNotice, setEditNotice] = useState('');
  const openMovement = (tx: Transaction) => {
    setEditNotice('');
    if (ui3 && !tx.projected) lastEdited.current = { tx, snapshot: transactions };
    onEdit(tx);
  };
  useEffect(() => {
    const previous = lastEdited.current;
    if (!ui3 || !previous || previous.snapshot === transactions) return;
    const current = transactions.find(tx => tx.id === previous.tx.id);
    // Firestore may emit unrelated snapshots while the editor is open.
    if (current && JSON.stringify(current) === JSON.stringify(previous.tx)) return;
    const stillVisible = filtered.some(tx => tx.id === previous.tx.id ||
      (previous.tx.groupId && tx.groupId === previous.tx.groupId && tx.type === previous.tx.type));
    if (!stillVisible) setEditNotice('Il movimento modificato non rientra nei criteri attuali. Ricerca e filtri sono conservati.');
    lastEdited.current = null;
  }, [transactions, ui3]);

  // Human name for the active series filter pill ("Serie: Netflix").
  const seriesFilterLabel = seriesFilter
    ? (transactions.find(t => t.seriesId === seriesFilter || t.id === seriesFilter)?.description ?? 'serie')
    : null;

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = groupMode === 'month' ? t.date.slice(0, 7) : groupMode === 'account' ? t.account : groupMode === 'type' ? t.type : t.category;
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return Array.from(map.entries());
  }, [filtered, groupMode]);

  // Vista per giorno: due livelli (mese → giorno) sulle stesse righe filtrate.
  const monthSections = useMemo(
    () => (groupMode === 'day' ? buildMonthSections(filtered, isUpcoming) : []),
    [filtered, groupMode],
  );

  const groupTitle = (key: string) =>
    groupMode === 'month' ? capitalize(formatMonthLong(key))
      : groupMode === 'account' ? `${getAcc(key).icon} ${getAcc(key).label}`
      : groupMode === 'type' ? TYPE_META[key as TransactionType].label
      : `${getCat(key).icon} ${getCat(key).label}`;

  // Subtotals are STATISTICAL: a refund is neutral here because it has already
  // reduced the original expense through refundedTotal / ownShare. Cash balances
  // keep using netFlowDelta elsewhere, with the real debit/credit dates.
  const signed = (t: Transaction) => statisticalNetDelta(t);
  const groupSum = (txs: Transaction[]) =>
    txs.filter(t => !isUpcoming(t)).reduce((s, t) => s + signed(t), 0);
  const groupHasReal = (txs: Transaction[]) => txs.some(t => !isUpcoming(t));
  const groupProjectedSum = (txs: Transaction[]) =>
    txs.filter(isUpcoming).reduce((s, t) => s + signed(t), 0);
  // Flow breakdown for the ⓘ on a group subtotal (realized rows only), shown
  // when the group contains investment movements.
  const groupFlowLines = (txs: Transaction[]): FlowInfoLine[] => {
    const realized = txs.filter(t => !isUpcoming(t));
    const f = aggregateFlow(realized);
    const expenses = realized
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + ownShare(t), 0);
    return [
      ...(f.ordinaryIncome > 0 ? [{ label: 'Entrate', value: f.ordinaryIncome, valueClass: 'text-green' }] : []),
      ...(expenses > 0 ? [{ label: 'Spese', value: -expenses }] : []),
      ...(f.investedFromAccounts > 0 ? [{ label: 'Investimenti dai conti', value: -f.investedFromAccounts, valueClass: 'text-gold' }] : []),
      ...(f.externalContributions > 0 ? [{ label: 'Apporti esterni', value: f.externalContributions, valueClass: 'text-gold' }] : []),
      ...(f.capitalReturned > 0 ? [{ label: 'Rientri da disinvestimenti', value: f.capitalReturned, valueClass: 'text-gold' }] : []),
      ...(f.tfrExcluded > 0 ? [{ label: 'TFR escluso', value: f.tfrExcluded, valueClass: 'text-secondary' }] : []),
    ];
  };
  const groupHasInvestment = (txs: Transaction[]) =>
    txs.some(t => !isUpcoming(t) && t.type === 'investment');

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

  const exitSelect = () => { if(bulkBusy)return;setBulkError('');setSelectMode(false); setSelected(new Set()); setConfirmDelete(false); };

  const usedTypes = TYPE_ORDER.filter(t => transactions.some(tx => tx.type === t));
  // There are forecasts to govern if we have recurring projections OR any
  // future-dated one-off "previsti" — both feed the "Previsti" horizon filter.
  const hasUpcoming = projected.length > 0 || transactions.some(t => isPending(t, TODAY_ISO));
  const ids = [...selected];

  const runBulk = async (action:()=>void|Promise<void>) => {
    if(bulkBusy)return;
    setBulkBusy(true);setBulkError('');
    try { await action();setPicker(null);setSelectMode(false);setSelected(new Set());setConfirmDelete(false); }
    catch(e){setBulkError((e as Error).message||'Operazione non riuscita. La selezione è conservata: riprova.');}
    finally{setBulkBusy(false);}
  };
  const applyPatch = (patch: TransactionPatch) => { void runBulk(()=>onBulkUpdate(ids, patch)); };
  const selectedTypes=new Set(transactions.filter(t=>selected.has(t.id)).map(t=>t.type));
  const categoryOptions=categories.filter(c=>!c.archived&&selectedTypes.size===1&&selectedTypes.has(c.kind));

  const criteriaActive = typeFilter !== 'all' || period !== 'all' || projView !== PROJ_DEFAULT || !!(catFilter || accFilter || seriesFilter || investFilter || dateFilter || explicitRange);
  const filterActive = period !== 'all' || sortKey !== 'date' || sortDir !== 'desc' || projView !== PROJ_DEFAULT || groupMode !== 'day';
  const periodLabel = PERIOD_OPTS.find(o => o.value === period)!.label;
  const projLabel = PROJ_OPTS.find(o => o.value === projView)!.label;
  const dirLabels: [SortDir, string][] = sortKey === 'amount'
    ? [['desc', 'Più alto'], ['asc', 'Più basso']]
    : [['desc', 'Più recenti'], ['asc', 'Meno recenti']];

  const filterButton = <PillBtn active={(ui3 && criteriaActive) || filterActive || filterOpen} buttonRef={filterTrigger} expanded={ui3 ? filterOpen : undefined} controls={ui3 ? 'transaction-filters' : undefined} onClick={() => filterOpen ? closeFilters() : setFilterOpen(true)}
    icon={<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>}>Filtri</PillBtn>;

  return (
    <div className={ui3 ? 'ui31-ledger pb-28' : 'pb-28'} aria-busy={bulkBusy} onClickCapture={e=>{if(bulkBusy){e.preventDefault();e.stopPropagation();}}}>
      <PageToolbar title="Movimenti">        <div className="flex items-center gap-1 flex-none" onClickCapture={e=>{if(bulkBusy){e.preventDefault();e.stopPropagation();}}}>
          {!ui3 && <HeaderIconBtn
            active={searchOpen || !!search}
            label={searchOpen ? 'Chiudi la ricerca' : 'Cerca'}
            onClick={() => { if (searchOpen) setSearch(''); setSearchOpen(o => !o); }}>
            {searchOpen ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
              </svg>
            )}
          </HeaderIconBtn>}
          <HeaderIconBtn active={selectMode} label={selectMode ? 'Annulla selezione' : 'Seleziona'}
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <path d="m14 17.5 2 2 4-4"/>
            </svg>
          </HeaderIconBtn>
        </div></PageToolbar>
      {!ui3&&searchOpen&&(          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome, importo, data, conto…"
              className="w-full bg-card rounded-2xl pl-9 pr-3 py-2.5 text-sm text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40"
            />
          </div>)}

      {ui3 && <div className="ui31-ledger-search">
        <label htmlFor="movement-search" className="text-sm font-medium text-secondary">Cerca movimenti</label>
        <div className="flex items-center gap-2">
          <input ref={searchInput} id="movement-search" type="search" aria-label="Cerca movimenti" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, importo, data, conto…" className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3 text-primary" />
          {search && <button type="button" aria-label="Cancella ricerca" onClick={clearSearch} className="ui31-ledger-clear text-secondary">Cancella ricerca</button>}
        </div>
      </div>}

      {/* Una riga sola di filtri. Il pannello vive FUORI dallo scroller
          orizzontale, altrimenti verrebbe tagliato dall'overflow. */}
      <div className={ui3 ? "ui31-ledger-toolbar relative" : "relative"}>
        <div className="ui31-ledger-types flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 py-1">
          <PillBtn active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
            Tutte · {filtered.length}
          </PillBtn>
          {usedTypes.map(t => (
            <PillBtn key={t} active={typeFilter === t} dot={typeColor(t, theme)}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
              {TYPE_META[t].label}
            </PillBtn>
          ))}
          {!ui3 && filterButton}
        </div>
        {ui3 && filterButton}
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => closeFilters()} />
                <div ref={filterPanel} id="transaction-filters" aria-label="Opzioni movimenti" role="region" className="ui-transaction-filters absolute right-0 top-full mt-1 w-56 z-50 glass-elevated rounded-2xl shadow-float p-2.5 max-h-[70dvh] overflow-y-auto overscroll-contain animate-fade-in-fast">
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
                    {([['day', 'Giorno'], ['month', 'Mese'], ['account', 'Conto'], ['category', 'Categoria'], ...(ui3 ? [['type', 'Tipo movimento']] : [])] as [GroupMode, string][]).map(([m, lbl]) => (
                      <button key={m} onClick={() => { changeGroup(m); closeFilters(); }}
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
                  {groupMode !== 'day' && groups.length > 1 && (
                    <button onClick={() => { toggleAll(); closeFilters(); }}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-[13px] text-primary hover:bg-card transition-colors mb-2.5">
                      {allCollapsed ? 'Espandi tutti i gruppi' : 'Comprimi tutti i gruppi'}
                    </button>
                  )}
                  <p className="label-caps text-secondary mb-1.5 px-1">Periodo</p>
                  <div className="space-y-1">
                    {PERIOD_OPTS.map(opt => (
                      <button key={opt.value} onClick={() => { if (ui3 && (explicitRange || dateFilter)) clearCriteria(['date', 'from', 'to'], { period: opt.value }); setPeriod(opt.value); closeFilters(); }}
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
                          <button key={opt.value} onClick={() => { setProjView(opt.value); closeFilters(); }}
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
                  {ui3 && (sortKey !== 'date' || sortDir !== 'desc' || groupMode !== 'day') && <button className="w-full px-3 py-2 text-sm text-secondary" onClick={() => { setSortKey('date'); setSortDir('desc'); changeGroup('day'); }}>Ripristina ordine e gruppi</button>}
                </div>
              </>
            )}
      </div>

      {ui3 && <div className="ui31-ledger-context text-sm text-secondary">
        <span>{explicitRange ? `${formatDateFull(explicitRange.from)} – ${formatDateFull(explicitRange.to)}` : dateFilter ? formatDateFull(dateFilter) : periodLabel}</span>
        <span>{filtered.length} {filtered.length === 1 ? 'movimento' : 'movimenti'}</span>
        {criteriaActive && <button type="button" onClick={resetCriteria} className="text-gold font-medium">Azzera filtri</button>}
      </div>}
      {ui3 && selectMode && <p className="ui31-ledger-selection text-sm text-secondary" role="status">Selezione multipla · {selected.size} selezionati. Le proiezioni non sono selezionabili. Categoria modificabile per movimenti dello stesso tipo.</p>}
      {/* Filtri attivi — pill rimovibili */}
        {(period !== 'all' || projView !== PROJ_DEFAULT || catFilter || accFilter || seriesFilter || investFilter || dateFilter || explicitRange) && (
          <div className={ui3 ? "ui31-ledger-criteria flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
            {investFilter && (
              <button aria-label={ui3 ? 'Rimuovi investimento' : undefined} onClick={clearInvestFilter}
                className="inline-flex items-center gap-1.5 bg-gold/10 text-gold rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                📈 Investimento: {getCat(investFilter).icon} {getCat(investFilter).label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            {seriesFilter && (
              <button aria-label={ui3 ? 'Rimuovi serie' : undefined} onClick={clearSeriesFilter}
                className="inline-flex items-center gap-1.5 bg-gold/10 text-gold rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                🔁 Serie: {seriesFilterLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            {explicitRange&&<button className="px-3 py-2 rounded-full bg-elevated text-sm" onClick={()=>clearCriteria(['from', 'to'])} aria-label="Azzera periodo">{formatDateFull(explicitRange.from)} – {formatDateFull(explicitRange.to)} ✕</button>}
            {dateFilter && (
              <button aria-label={ui3 ? 'Rimuovi giorno' : undefined} onClick={clearDateFilter}
                className="inline-flex items-center gap-1.5 bg-gold/10 text-gold rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                📅 {formatDateFull(dateFilter)}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            {catFilter && (
              <button aria-label={ui3 ? 'Rimuovi categoria' : undefined} onClick={clearCatFilter}
                className="inline-flex items-center gap-1.5 bg-gold/10 text-gold rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                {getCat(catFilter).icon} {getCat(catFilter).label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            {accFilter && (
              <button aria-label={ui3 ? 'Rimuovi conto' : undefined} onClick={clearAccFilter}
                className="inline-flex items-center gap-1.5 bg-gold/10 text-gold rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                {getAcc(accFilter).icon} {getAcc(accFilter).label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
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

      {ui3 && editNotice && <p role="status" className="ui31-ledger-selection text-sm text-secondary">{editNotice}</p>}

      {/* Vista di default: mese → giorno. Gli altri raggruppamenti restano
          disponibili dal pannello filtri e usano la lista collassabile. */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center mt-3">
          <p className="text-3xl mb-3 opacity-60">🔍</p>
          <p className="text-sm text-secondary">{search ? `Nessun risultato per "${search}"` : 'Nessuna transazione'}</p>
          {ui3 && search && <button onClick={clearSearch} className="mt-3 px-3 py-2 text-sm font-medium text-gold">Cancella ricerca</button>}
          {ui3 && criteriaActive && <p className="mt-2 text-sm text-secondary">Puoi rimuovere un criterio qui sopra o aprire Filtri.</p>}
          {!search && <button onClick={onAdd} className="mt-3 text-sm font-medium text-gold">+ Aggiungi</button>}
        </div>
      ) : groupMode === 'day' ? (
        <div className="space-y-6 mt-1">
          {monthSections.map(sec => (
            <section key={sec.ym}>
              <MonthSummaryHeader
                ym={sec.ym} realized={sec.txs.filter(t => !isUpcoming(t))}
                realizedCount={sec.realizedCount} upcomingCount={sec.upcomingCount}
                net={groupSum(sec.txs)}
              />
              <div className="mt-3.5 space-y-3.5">
                {sec.days.map(day => {
                  const total = day.upcoming ? groupProjectedSum(day.txs) : groupSum(day.txs);
                  return (
                    <div key={day.iso}>
                      <div className="flex items-center gap-2 px-1 mb-1.5">
                        {selectMode && groupHasReal(day.txs) && (
                          <button onClick={() => toggleGroup(day.txs)} aria-label="Seleziona il giorno"
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-none transition-colors ${
                              groupAllSelected(day.txs) ? 'bg-gold border-gold' : 'border-divider'
                            }`}>
                            {groupAllSelected(day.txs) && <span className="text-bg text-xs font-bold">✓</span>}
                          </button>
                        )}
                        <p className={`text-[12px] font-semibold flex-1 min-w-0 truncate ${
                          day.upcoming ? 'text-gold' : 'text-secondary'}`}>
                          {day.upcoming ? `Programmato · ${longDayLabel(day.iso)}` : dayLabel(day.iso, TODAY_ISO)}
                        </p>
                        <p className={`balance-num text-[12px] font-semibold flex-none ${
                          day.upcoming ? 'text-gold' : 'text-secondary'}`}>
                          {formatCurrency(total, { sign: true })}
                        </p>
                      </div>
                      <div className={`ui-open-section rounded-[18px] px-3.5 divide-y divide-divider ${
                        day.upcoming
                          ? 'border border-dashed border-gold/50'
                          : 'glass-card shadow-elev-1'}`}>
                        {day.txs.map(tx => (
                          <TransactionRow key={tx.id} tx={tx} upcoming={isUpcoming(tx)} hideDate todayISO={TODAY_ISO}
                            seriesFreq={tx.seriesId ? seriesFreqById.get(tx.seriesId) : undefined}
                            installmentPaid={installmentIndexById.get(tx.id)}
                            selectable={selectMode && !tx.projected} selected={selected.has(tx.id)}
                            onToggle={toggle} onClick={openMovement} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* Gli altri raggruppamenti (mese, conto, categoria) hanno lo stesso
           ASPETTO della vista per giorno: intestazione fuori dalla card, righe
           dentro una card con divisori. Cambia solo cosa raggruppa — e la data
           resta nella riga, perché lì non è nell'intestazione. */
        <div className="space-y-3.5 mt-1">
        {groups.map(([key, txs], groupIndex) => {
          const isCollapsed = collapsed.has(key);
          const hasReal = groupHasReal(txs);
          const realized = txs.filter(t => !isUpcoming(t));
          const rowsId = `transaction-group-${groupMode}-${groupIndex}`;
          return (
            <div key={key}>
              {ui3 ? <div className="flex items-start gap-2 mb-2" data-transaction-group-summary>
                {selectMode && hasReal && <button onClick={() => toggleGroup(txs)} aria-label="Seleziona gruppo"
                  className={`mt-4 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-none ${groupAllSelected(txs) ? 'bg-gold border-gold' : 'border-divider'}`}>
                  {groupAllSelected(txs) && <span className="text-bg text-xs font-bold">✓</span>}
                </button>}
                <div className="flex-1 min-w-0">
                  <MonthSummaryHeader title={groupTitle(key)} realized={realized}
                    realizedCount={realized.length} upcomingCount={txs.length - realized.length}
                    net={groupSum(txs)} projectedNet={groupProjectedSum(txs)}
                    onToggle={() => toggleCollapse(key)} expanded={!isCollapsed} controls={rowsId}
                    action={hasReal && groupHasInvestment(txs) ? <OutflowInfo ariaLabel="Dettaglio flusso" lines={groupFlowLines(txs)} /> : undefined} />
                </div>
              </div> : <div className="flex items-center gap-2 px-1 mb-1.5">
                {selectMode && hasReal && (
                  <button onClick={() => toggleGroup(txs)} aria-label="Seleziona gruppo"
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-none transition-colors ${
                      groupAllSelected(txs) ? 'bg-gold border-gold' : 'border-divider'
                    }`}>
                    {groupAllSelected(txs) && <span className="text-bg text-xs font-bold">✓</span>}
                  </button>
                )}
                <button onClick={() => toggleCollapse(key)} aria-expanded={!isCollapsed}
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`text-tertiary flex-none transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <span className="text-[12px] font-semibold text-secondary truncate">{groupTitle(key)}</span>
                  <span className="text-[11px] text-tertiary flex-none">· {txs.length}</span>
                </button>
                {hasReal ? (
                  <span className="flex items-center gap-1 flex-none">
                    {groupHasInvestment(txs) && (
                      <OutflowInfo ariaLabel="Dettaglio flusso" lines={groupFlowLines(txs)} />
                    )}
                    <span className={`balance-num text-[12px] font-semibold ${
                      groupSum(txs) >= 0 ? 'text-green' : 'text-secondary'}`}>
                      {formatCurrency(groupSum(txs), { sign: true })}
                    </span>
                  </span>
                ) : (
                  <span className="balance-num text-[12px] font-semibold text-gold flex-none">
                    {formatCurrency(groupProjectedSum(txs), { sign: true })}
                  </span>
                )}
              </div>}
              <div id={rowsId} hidden={isCollapsed}>
              {!isCollapsed && (
                <div className={`ui-open-section rounded-[18px] px-3.5 divide-y divide-divider ${
                  hasReal ? 'glass-card shadow-elev-1' : 'border border-dashed border-gold/50'}`}>
                  {txs.map(tx => (
                    <TransactionRow key={tx.id} tx={tx} upcoming={isUpcoming(tx)} todayISO={TODAY_ISO}
                      seriesFreq={tx.seriesId ? seriesFreqById.get(tx.seriesId) : undefined}
                      installmentPaid={installmentIndexById.get(tx.id)}
                      selectable={selectMode && !tx.projected} selected={selected.has(tx.id)}
                      onToggle={toggle} onClick={openMovement} />
                  ))}
                </div>
              )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {bulkError&&<p role="alert" className="text-red p-3">{bulkError} Riprova mantenendo la selezione.</p>}
      {bulkBusy&&<p role="status">Salvataggio in corso…</p>}
      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className={`${ui3 ? "ui31-ledger-bulk " : ""}fixed bottom-0 inset-x-0 z-40 p-3 safe-bottom animate-sheet-up`}>
          <div className="max-w-2xl mx-auto bg-elevated/95 backdrop-blur rounded-2xl shadow-float p-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-primary px-2 whitespace-nowrap">{selected.size} sel.</span>
            <div className="flex-1 flex gap-2 justify-end">
              <BarBtn onClick={() => selectedTypes.size!==1?setBulkError('Seleziona movimenti dello stesso tipo per cambiare categoria.'):setPicker('category')}>Categoria</BarBtn>
              <BarBtn onClick={() => setPicker('account')}>Conto</BarBtn>
              {confirmDelete
                ? <BarBtn danger onClick={() => { void runBulk(()=>onBulkDelete(ids)); }}>Conferma ({selected.size})</BarBtn>
                : <BarBtn danger onClick={() => setConfirmDelete(true)}>Elimina</BarBtn>
              }
            </div>
          </div>
        </div>
      )}

      <OptionSheet
        open={picker === 'category'} title="Sposta in categoria"
        options={categoryOptions}
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

/** Chip della riga filtri: il selezionato è PIENO (non oro al 10%), così la
 *  riga dice a colpo d'occhio dove sei anche scorrendola di lato. */
function PillBtn({ children, active, dot, icon, onClick, buttonRef, expanded, controls }: {
  children: React.ReactNode; active: boolean; dot?: string; icon?: React.ReactNode; onClick: () => void; buttonRef?: React.Ref<HTMLButtonElement>; expanded?: boolean; controls?: string;
}) {
  return (
    <button ref={buttonRef} onClick={onClick} aria-expanded={expanded} aria-controls={controls}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        active ? 'bg-primary text-bg' : 'glass-card text-secondary hover:text-primary'
      }`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />}
      {icon}
      {children}
    </button>
  );
}

function HeaderIconBtn({ children, active, label, onClick }: {
  children: React.ReactNode; active?: boolean; label: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
        active ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary'
      }`}>
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
