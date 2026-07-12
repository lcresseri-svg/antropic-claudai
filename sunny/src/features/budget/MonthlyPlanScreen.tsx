// Piano mensile V2 (admin-only, flag `monthly_plan_v2`): il PIANO del mese —
// entrate attese, obiettivi, budget categoria, eventi — sempre distinto dal
// consuntivo e dal forecast. Semina da mese precedente o da ricorrenti, con
// conferma esplicita. Logica nei moduli puri monthlyPlanV2.ts.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatMonthLong } from '../../utils';
import {
  MonthlyPlanV2, planMonthKey, prevPlanMonth,
  buildPlanFromRecurring, copyPlanFromPrevious, confirmPlan, comparePlan,
} from './monthlyPlanV2';
import { loadMonthlyPlan, saveMonthlyPlan } from './monthlyPlanStore';
import { computeUnifiedForecast } from '../forecast/service/forecastService';

interface Props {
  user: User;
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyInvestments: number;
}

const SOURCE_LABEL: Record<MonthlyPlanV2['source'], string> = {
  manual: 'modificato a mano',
  copied_from_previous_month: 'copiato dal mese precedente',
  from_recurring: 'generato da ricorrenti e stagionalità',
  auto: 'inizializzato automaticamente',
};

export function MonthlyPlanScreen({ user, transactions, monthlyIncome, monthlyInvestments }: Props) {
  const navigate = useNavigate();
  const { visibleCategories, getCat } = useSettings();
  const [plan, setPlan] = useState<MonthlyPlanV2 | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const month = planMonthKey(now);
  const todayISO = now.toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    loadMonthlyPlan(user.uid, month)
      .then(p => { if (!cancelled) { setPlan(p); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [user.uid, month]);

  const forecast = useMemo(() => computeUnifiedForecast('v3', {
    transactions,
    expenseCategories: visibleCategories.filter(c => c.kind === 'expense'),
    monthlyIncome,
    monthlyInvestments,
    now,
  }), [transactions, visibleCategories, monthlyIncome, monthlyInvestments, now]);

  const comparison = useMemo(
    () => (plan ? comparePlan(plan, transactions, todayISO, forecast.central) : null),
    [plan, transactions, todayISO, forecast.central],
  );

  const persist = async (next: MonthlyPlanV2, note: string) => {
    setBusy(true); setMsg(null);
    try {
      await saveMonthlyPlan(user.uid, next);
      setPlan(next);
      setMsg(note);
    } catch {
      setMsg('Salvataggio non riuscito. Riprova.');
    } finally { setBusy(false); }
  };

  const seedFromRecurring = () => persist(
    buildPlanFromRecurring(transactions, visibleCategories.filter(c => c.kind === 'expense').map(c => c.id), month, todayISO),
    'Piano generato da ricorrenti e stagionalità (bozza).',
  );

  const seedFromPrevious = async () => {
    setBusy(true); setMsg(null);
    try {
      const prev = await loadMonthlyPlan(user.uid, prevPlanMonth(month));
      if (!prev) { setMsg('Nessun piano del mese precedente da copiare.'); setBusy(false); return; }
      await persist(copyPlanFromPrevious(prev, month), 'Piano copiato dal mese precedente (bozza).');
    } catch {
      setMsg('Copia non riuscita. Riprova.');
      setBusy(false);
    }
  };

  const confirm = () => plan && persist(confirmPlan(plan), 'Piano confermato per questo mese.');

  return (
    <div className="pb-32 space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Indietro"
          className="w-11 h-11 -ml-2 flex items-center justify-center text-secondary hover:text-primary rounded-full">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Piano di {formatMonthLong(month)}</h1>
          <p className="text-xs text-secondary">Anteprima admin · piano ≠ consuntivo ≠ previsione</p>
        </div>
      </div>

      {!loaded ? (
        <p className="text-sm text-secondary" role="status">Caricamento…</p>
      ) : !plan ? (
        <section className="bg-card rounded-2xl p-5 space-y-3">
          <p className="text-sm text-secondary">Nessun piano per questo mese. Crealo da una delle due basi:</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={seedFromPrevious}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-elevated text-sm font-medium text-primary disabled:opacity-50">
              Copia dal mese precedente
            </button>
            <button type="button" disabled={busy} onClick={seedFromRecurring}
              className="px-4 py-2.5 min-h-[44px] rounded-xl glass-cta-gold text-sm font-semibold disabled:opacity-50">
              Genera da ricorrenti
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="bg-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-primary">Stato</h2>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                plan.status === 'confirmed' ? 'bg-green/15 text-green' : 'bg-gold/15 text-gold'
              }`}>{plan.status === 'confirmed' ? 'confermato' : 'bozza'}</span>
            </div>
            <p className="text-[11px] text-secondary">
              Origine: {SOURCE_LABEL[plan.source]}{plan.copiedFrom ? ` (${formatMonthLong(plan.copiedFrom)})` : ''}.
            </p>
            <dl className="space-y-2 text-sm mt-3">
              <div className="flex justify-between"><dt className="text-secondary">Entrate attese</dt><dd className="text-primary">{formatCurrency(plan.expectedIncome)}</dd></div>
              <div className="flex justify-between"><dt className="text-secondary">Obiettivo risparmio</dt><dd className="text-primary">{formatCurrency(plan.savingsTarget)}</dd></div>
              <div className="flex justify-between"><dt className="text-secondary">Obiettivo investimenti</dt><dd className="text-primary">{formatCurrency(plan.investmentTarget)}</dd></div>
            </dl>
            {plan.status !== 'confirmed' && (
              <button type="button" disabled={busy} onClick={confirm}
                className="mt-4 px-4 py-2.5 min-h-[44px] rounded-xl glass-cta-gold text-sm font-semibold disabled:opacity-50">
                Conferma piano
              </button>
            )}
          </section>

          <section className="bg-card rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-primary mb-2">Budget per categoria</h2>
            {Object.keys(plan.categoryBudgets).length === 0
              ? <p className="text-xs text-secondary">Nessun budget nel piano.</p>
              : <ul className="space-y-1.5">
                  {Object.entries(plan.categoryBudgets).map(([id, v]) => (
                    <li key={id} className="flex justify-between text-sm">
                      <span className="text-secondary">{getCat(id).icon} {getCat(id).label}</span>
                      <span className="text-primary">{formatCurrency(v)}</span>
                    </li>
                  ))}
                </ul>}
            {plan.plannedEvents.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-primary mt-4 mb-1.5">Eventi pianificati</h3>
                <ul className="space-y-1">
                  {plan.plannedEvents.map(e => (
                    <li key={e.id} className="flex justify-between text-xs text-secondary">
                      <span>{e.date} · {e.description} <span className="opacity-70">({e.kind})</span></span>
                      <span>{formatCurrency(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {comparison && (
            <section className="bg-card rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-primary mb-2">Piano · consuntivo · previsione</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-secondary">Uscite pianificate</dt><dd className="text-primary">{formatCurrency(comparison.plannedExpenses)}</dd></div>
                <div className="flex justify-between"><dt className="text-secondary">Consuntivo (registrato)</dt><dd className="text-primary">{formatCurrency(comparison.actualExpenses)}</dd></div>
                <div className="flex justify-between"><dt className="text-secondary">Previsione fine mese (V3)</dt><dd className="text-primary">{comparison.forecastExpenses != null ? formatCurrency(comparison.forecastExpenses) : '—'}</dd></div>
              </dl>
              <p className="text-[11px] text-secondary mt-2">
                Tre grandezze distinte: il piano non si adatta mai da solo a consuntivo o previsione.
              </p>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={seedFromPrevious}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-elevated text-sm font-medium text-primary disabled:opacity-50">
              Ricopia dal mese precedente
            </button>
            <button type="button" disabled={busy} onClick={seedFromRecurring}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-elevated text-sm font-medium text-primary disabled:opacity-50">
              Rigenera da ricorrenti
            </button>
          </div>
        </>
      )}

      {msg && <p className="text-xs text-secondary" role="status">{msg}</p>}
    </div>
  );
}
