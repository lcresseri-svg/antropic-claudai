import { Transaction, RecurrenceRule, ownShare } from '../types';
import { formatCurrency } from '../utils';
import { useSettings } from '../settings';

interface Props {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
}

interface Insight { icon: string; title: string; detail: string; accent: string; urgent?: boolean; }

function monthKey(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addPeriod(dateStr: string, freq: RecurrenceRule['freq']): string {
  const d = new Date(dateStr);
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function Insights({ transactions, monthlyIncome, monthlyExpenses, monthlyInvestments }: Props) {
  const { getCat } = useSettings();
  const insights: Insight[] = [];

  // 0 — Upcoming recurring transactions (highest priority)
  const recurringTx = transactions.filter(t => t.recurring);
  // Group by description+type to find the most recent instance of each series
  const seriesMap = new Map<string, Transaction>();
  for (const t of recurringTx) {
    const key = `${t.description}||${t.type}`;
    const prev = seriesMap.get(key);
    if (!prev || t.date > prev.date) seriesMap.set(key, t);
  }
  for (const [, t] of seriesMap) {
    const rule = t.recurring!;
    if (rule.until && rule.until < new Date().toISOString().slice(0, 10)) continue;
    const nextDue = addPeriod(t.date, rule.freq);
    const days = daysUntil(nextDue);
    if (days > 14 || days < -7) continue;
    const freqLabel = rule.freq === 'weekly' ? 'settimana' : rule.freq === 'monthly' ? 'mese' : 'anno';
    const dueLabel = days < 0
      ? `${Math.abs(days)} giorni fa (non ancora registrato)`
      : days === 0 ? 'oggi' : days === 1 ? 'domani' : `tra ${days} giorni`;
    insights.push({
      icon: '📅',
      title: `${t.description} — scade ${dueLabel}`,
      detail: `${formatCurrency(t.amount)} · ogni ${freqLabel}`,
      accent: days <= 2 ? '#E08B8B' : '#88B0C0',
      urgent: days <= 2,
    });
  }

  // 1 — Estimated savings
  const saved = monthlyIncome - monthlyExpenses - monthlyInvestments;
  if (monthlyIncome > 0) {
    insights.push(saved >= 0
      ? { icon: '✨', title: `Risparmio stimato: ${formatCurrency(saved)}`, detail: `${Math.round((saved / monthlyIncome) * 100)}% delle entrate questo mese`, accent: '#8A9270' }
      : { icon: '⚠️', title: `Sforamento di ${formatCurrency(-saved)}`, detail: 'Le uscite superano le entrate questo mese', accent: '#E08B8B' });
  }

  // 2 — Category change vs last month
  const thisM = monthKey(0), lastM = monthKey(1);
  const byCatMonth = (m: string) => {
    const r: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense' && t.date.startsWith(m))
      .forEach(t => { r[t.category] = (r[t.category] ?? 0) + ownShare(t); });
    return r;
  };
  const cur = byCatMonth(thisM), prev = byCatMonth(lastM);
  let bestCat = '', bestDelta = 0;
  for (const cat of Object.keys(cur)) {
    const p = prev[cat] ?? 0;
    if (p < 10) continue;
    const delta = (cur[cat] - p) / p;
    if (Math.abs(delta) > Math.abs(bestDelta)) { bestDelta = delta; bestCat = cat; }
  }
  if (bestCat && Math.abs(bestDelta) >= 0.12) {
    const up = bestDelta > 0;
    const c = getCat(bestCat);
    insights.push({
      icon: c.icon,
      title: `${up ? '+' : '−'}${Math.abs(Math.round(bestDelta * 100))}% in ${c.label}`,
      detail: `${up ? 'Hai speso più' : 'Hai speso meno'} rispetto al mese scorso`,
      accent: up ? '#E08B8B' : '#8A9270',
    });
  }

  // 3 — Automatically detected recurring (no tag needed)
  const norm = (s: string) => s.toLowerCase().trim();
  const months = [monthKey(0), monthKey(1), monthKey(2)];
  const seen: Record<string, Set<string>> = {};
  transactions.filter(t => t.type === 'expense' && !t.recurring).forEach(t => {
    const m = t.date.slice(0, 7);
    if (!months.includes(m)) return;
    (seen[norm(t.description)] ??= new Set()).add(m);
  });
  const autoRecurring = Object.values(seen).filter(s => s.size >= 2).length;
  if (autoRecurring > 0) {
    insights.push({
      icon: '🔁',
      title: `${autoRecurring} pagament${autoRecurring === 1 ? 'o' : 'i'} ricorrent${autoRecurring === 1 ? 'e' : 'i'} rilevat${autoRecurring === 1 ? 'o' : 'i'}`,
      detail: 'Puoi taggarli come "Ricorrente" per ricevere promemoria',
      accent: '#88B0C0',
    });
  }

  // 4 — Investment rate
  if (monthlyInvestments > 0 && monthlyIncome > 0) {
    insights.push({
      icon: '📈',
      title: `Investito ${Math.round((monthlyInvestments / monthlyIncome) * 100)}% delle entrate`,
      detail: `${formatCurrency(monthlyInvestments)} verso i tuoi investimenti`,
      accent: '#E6B95C',
    });
  }

  if (insights.length === 0) {
    insights.push({ icon: '📊', title: 'Nessun insight ancora', detail: 'Aggiungi transazioni per analisi personalizzate', accent: '#8B8B8B' });
  }

  // Urgent insights first, then the rest (max 5 shown)
  const sorted = [
    ...insights.filter(i => i.urgent),
    ...insights.filter(i => !i.urgent),
  ].slice(0, 5);

  return (
    <section>
      <p className="label-caps text-secondary mb-3 px-1">Insight</p>
      <div className="space-y-2.5">
        {sorted.map((ins, i) => (
          <div key={i} className="bg-card rounded-2xl p-4 flex items-start gap-3.5 animate-fade-in"
            style={{ animationDelay: `${i * 50}ms`, ...(ins.urgent ? { outline: `1px solid ${ins.accent}33` } : {}) }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: ins.accent + '18' }}>
              {ins.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary leading-snug">{ins.title}</p>
              <p className="text-xs text-secondary mt-0.5 leading-snug">{ins.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
