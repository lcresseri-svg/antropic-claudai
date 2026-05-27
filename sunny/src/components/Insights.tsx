import { Transaction } from '../types';
import { formatCurrency } from '../utils';
import { useSettings } from '../settings';

interface Props {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
}

interface Insight { icon: string; title: string; detail: string; accent: string; }

function monthKey(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Insights({ transactions, monthlyIncome, monthlyExpenses, monthlyInvestments }: Props) {
  const { getCat } = useSettings();
  const insights: Insight[] = [];

  // 1 — Estimated savings
  const saved = monthlyIncome - monthlyExpenses - monthlyInvestments;
  if (monthlyIncome > 0) {
    insights.push(saved >= 0
      ? { icon: '✨', title: `Risparmio stimato: ${formatCurrency(saved)}`, detail: `${Math.round((saved / monthlyIncome) * 100)}% delle entrate questo mese`, accent: '#8A9270' }
      : { icon: '⚠️', title: `Sforamento di ${formatCurrency(-saved)}`, detail: 'Le uscite superano le entrate questo mese', accent: '#E08B8B' });
  }

  // 2 — Category change vs last month (biggest mover among expenses)
  const thisM = monthKey(0), lastM = monthKey(1);
  const byCatMonth = (m: string) => {
    const r: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense' && t.date.startsWith(m))
      .forEach(t => { r[t.category] = (r[t.category] ?? 0) + t.amount; });
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

  // 3 — Recurring subscriptions detected
  const norm = (s: string) => s.toLowerCase().trim();
  const months = [monthKey(0), monthKey(1), monthKey(2)];
  const seen: Record<string, Set<string>> = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const m = t.date.slice(0, 7);
    if (!months.includes(m)) return;
    (seen[norm(t.description)] ??= new Set()).add(m);
  });
  const recurring = Object.values(seen).filter(s => s.size >= 2).length;
  if (recurring > 0) {
    insights.push({
      icon: '🔁',
      title: `${recurring} abbonament${recurring === 1 ? 'o' : 'i'} ricorrent${recurring === 1 ? 'e' : 'i'}`,
      detail: 'Pagamenti rilevati su più mesi consecutivi',
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

  return (
    <section>
      <h3 className="text-sm font-semibold text-primary mb-3 px-1">Insight</h3>
      <div className="space-y-2.5">
        {insights.slice(0, 4).map((ins, i) => (
          <div key={i} className="bg-card rounded-2xl p-4 flex items-start gap-3.5 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: ins.accent + '22' }}>
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
