// Patrimonio V2 (admin-only, flag `wealth_v2`): decomposizione del delta,
// composizione, freschezza controvalori, liquidità disponibile e snapshot
// patrimoniali (genera oggi / backfill con dry-run). Tutti i calcoli sono nei
// moduli puri wealthV2 / availableCash / wealthSnapshotCore.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency } from '../../utils';
import { WealthPeriod, WEALTH_PERIOD_OPTS } from '../dashboard/wealthAnalytics';
import { buildWealthV2Summary } from './wealthV2';
import { computeAvailableCash, CashHorizon } from './availableCash';
import {
  buildWealthSnapshot, planWealthBackfill, saveWealthSnapshot,
  applyWealthBackfill, romeDayKey, BackfillPlanEntry,
} from './wealthSnapshots';

interface Props {
  user: User;
  transactions: Transaction[];
  liquidity: number;
}

const EPS = 0.005;
const tone = (d: number) => (d > EPS ? 'text-green' : d < -EPS ? 'text-red' : 'text-secondary');
const sign = (d: number) => `${d > EPS ? '+' : d < -EPS ? '−' : ''}${formatCurrency(Math.abs(d))}`;
const fmtPct = (p: number | null) =>
  p == null ? '—' : `${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

const HORIZONS: { value: CashHorizon; label: string }[] = [
  { value: 7, label: '7 gg' }, { value: 14, label: '14 gg' },
  { value: 30, label: '30 gg' }, { value: 'eom', label: 'Fine mese' },
];

export function WealthV2Screen({ user, transactions, liquidity }: Props) {
  const navigate = useNavigate();
  const { accounts, categories } = useSettings();
  const [period, setPeriod] = useState<WealthPeriod>('3m');
  const [horizon, setHorizon] = useState<CashHorizon>(30);
  const [reserve, setReserve] = useState(500);
  const [snapMsg, setSnapMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<BackfillPlanEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const now = useMemo(() => new Date(), []);
  const summary = useMemo(
    () => buildWealthV2Summary(transactions, accounts, categories, period, { now }),
    [transactions, accounts, categories, period, now],
  );
  const cash = useMemo(
    () => computeAvailableCash({ transactions, liquidity, horizon, reserve, now }),
    [transactions, liquidity, horizon, reserve, now],
  );

  const d = summary.decomposition;
  const m = summary.marketToday;

  const snapshotToday = async () => {
    setBusy(true); setSnapMsg(null);
    try {
      const snap = buildWealthSnapshot(transactions, accounts, categories, romeDayKey());
      await saveWealthSnapshot(user.uid, snap);
      setSnapMsg(`Snapshot di oggi (${snap.dateKey}) salvato: ${formatCurrency(snap.totalNetWorth)}.`);
    } catch {
      setSnapMsg('Salvataggio non riuscito. Riprova.');
    } finally { setBusy(false); }
  };

  const dryRun = () => {
    setPlan(planWealthBackfill(transactions, accounts, categories));
    setSnapMsg(null);
  };

  const applyPlan = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const n = await applyWealthBackfill(user.uid, plan);
      setSnapMsg(`Backfill completato: ${n} snapshot scritti.`);
      setPlan(null);
    } catch {
      setSnapMsg('Backfill non riuscito. Riprova.');
    } finally { setBusy(false); }
  };

  return (
    <div className="pb-32 space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Indietro"
          className="w-11 h-11 -ml-2 flex items-center justify-center text-secondary hover:text-primary rounded-full">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Patrimonio V2</h1>
          <p className="text-xs text-secondary">Anteprima admin · calcoli deterministici</p>
        </div>
      </div>

      {/* Hero: totale + variazione periodo */}
      <section className="bg-card rounded-2xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs text-secondary">Patrimonio totale (versato)</p>
            <p className="text-3xl font-bold text-primary tracking-[-0.03em]">{formatCurrency(summary.base.total.endValue)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-secondary">A controvalore</p>
            <p className="text-lg font-semibold text-primary">{formatCurrency(m.netWorthAtMarket)}</p>
          </div>
        </div>
        <div className="flex gap-1.5 mt-4" role="tablist" aria-label="Periodo">
          {WEALTH_PERIOD_OPTS.map(o => (
            <button key={o.value} type="button" role="tab" aria-selected={period === o.value}
              onClick={() => setPeriod(o.value)}
              className={`px-3 py-2 min-h-[36px] rounded-xl text-xs font-medium transition-colors ${
                period === o.value ? 'bg-gold/12 text-gold' : 'text-secondary hover:text-primary bg-elevated'
              }`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          {([summary.base.total, summary.base.liquidity, summary.base.investments]).map(ms => (
            <div key={ms.metric} className="bg-elevated rounded-xl p-3">
              <p className="text-[11px] text-secondary">{ms.label}</p>
              <p className={`text-sm font-semibold ${tone(ms.delta)}`}>{sign(ms.delta)}</p>
              <p className="text-[11px] text-secondary">{fmtPct(ms.deltaPct)}</p>
              <p className="text-[11px] text-secondary mt-1">{formatCurrency(ms.startValue)} → {formatCurrency(ms.endValue)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Decomposizione */}
      <section className="bg-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-primary mb-3">Da cosa dipende la variazione</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-secondary">Risparmio (entrate − uscite)</dt><dd className={tone(d.netSavings)}>{sign(d.netSavings)}</dd></div>
          <div className="flex justify-between"><dt className="text-secondary">Apporti esterni (senza conto)</dt><dd className={tone(d.externalContributions)}>{sign(d.externalContributions)}</dd></div>
          <div className="flex justify-between"><dt className="text-secondary">TFR</dt><dd className={tone(d.tfrContributions)}>{sign(d.tfrContributions)}</dd></div>
          <div className="flex justify-between"><dt className="text-secondary">Rendimento investimenti (storicizzato)</dt><dd className={tone(d.investmentReturn)}>{sign(d.investmentReturn)}</dd></div>
          <div className="flex justify-between"><dt className="text-secondary">Rettifiche</dt><dd className={tone(d.adjustments)}>{sign(d.adjustments)}</dd></div>
          <div className="flex justify-between border-t border-divider pt-2 font-semibold"><dt className="text-primary">Δ patrimonio</dt><dd className={tone(d.deltaTotal)}>{sign(d.deltaTotal)}</dd></div>
        </dl>
        <p className="text-[11px] text-secondary mt-3">
          Versamenti netti del periodo: {sign(d.investmentFlows)} — la quota finanziata dai conti sposta
          liquidità in investimenti senza cambiare il totale; apporti esterni e TFR restano componenti
          separate e non sono mai contati come rendimento né come risparmio.
          Rendimento latente a oggi: <span className={tone(m.marketGain)}>{sign(m.marketGain)}</span> ({fmtPct(m.marketGainPct)}).
        </p>
      </section>

      {/* Composizione + freschezza */}
      <section className="bg-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-primary mb-3">Composizione</h2>
        <p className="text-[11px] text-secondary mb-1.5">Liquidità per conto</p>
        <ul className="space-y-1.5 mb-4">
          {summary.composition.accounts.map(a => (
            <li key={a.id} className="flex justify-between text-sm">
              <span className="text-secondary">{a.label}</span>
              <span className="text-primary">{formatCurrency(a.value)} <span className="text-[11px] text-secondary">({Math.round(a.share * 100)}%)</span></span>
            </li>
          ))}
          {summary.composition.accounts.length === 0 && <li className="text-xs text-secondary">Nessun conto con saldo.</li>}
        </ul>
        <p className="text-[11px] text-secondary mb-1.5">Investimenti (controvalore dove disponibile)</p>
        <ul className="space-y-1.5">
          {summary.composition.investments.map(i => (
            <li key={i.id} className="flex justify-between text-sm">
              <span className="text-secondary">
                {i.label}
                {i.stale && <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-gold/15 text-gold text-[10px] font-medium">{i.hasMarketValue ? 'da aggiornare' : 'solo versato'}</span>}
              </span>
              <span className="text-primary">{formatCurrency(i.value)} <span className="text-[11px] text-secondary">({Math.round(i.share * 100)}%)</span></span>
            </li>
          ))}
          {summary.composition.investments.length === 0 && <li className="text-xs text-secondary">Nessun investimento.</li>}
        </ul>
        {summary.warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {summary.warnings.map((w, i) => <li key={i} className="text-[11px] text-secondary">· {w}</li>)}
          </ul>
        )}
      </section>

      {/* Liquidità disponibile */}
      <section className="bg-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-primary mb-3">Liquidità disponibile</h2>
        <div className="flex gap-1.5 mb-3" role="tablist" aria-label="Orizzonte">
          {HORIZONS.map(h => (
            <button key={String(h.value)} type="button" role="tab" aria-selected={horizon === h.value}
              onClick={() => setHorizon(h.value)}
              className={`px-3 py-2 min-h-[36px] rounded-xl text-xs font-medium transition-colors ${
                horizon === h.value ? 'bg-gold/12 text-gold' : 'text-secondary hover:text-primary bg-elevated'
              }`}>
              {h.label}
            </button>
          ))}
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-secondary">Liquidità</dt><dd className="text-primary">{formatCurrency(cash.liquidity)}</dd></div>
          <div className="flex justify-between"><dt className="text-secondary">Impegni entro l'orizzonte</dt><dd className="text-primary">−{formatCurrency(cash.committed)}</dd></div>
          <div className="flex justify-between items-center">
            <dt className="text-secondary">Riserva</dt>
            <dd>
              <label className="sr-only" htmlFor="reserve">Riserva di sicurezza in euro</label>
              <input id="reserve" type="number" min={0} step={50} value={reserve}
                onChange={e => setReserve(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 bg-elevated rounded-lg px-2 py-1.5 text-right text-primary text-sm" />
            </dd>
          </div>
          <div className="flex justify-between border-t border-divider pt-2 font-semibold">
            <dt className="text-primary">Disponibile</dt>
            <dd className={tone(cash.available)}>{formatCurrency(cash.available)}</dd>
          </div>
          <div className="flex justify-between"><dt className="text-secondary">Autonomia</dt>
            <dd className="text-primary">{cash.monthsOfAutonomy != null ? `~${cash.monthsOfAutonomy.toLocaleString('it-IT')} mesi` : '—'}</dd></div>
        </dl>
        {cash.committedItems.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-gold cursor-pointer">Impegni considerati ({cash.committedItems.length})</summary>
            <ul className="mt-2 space-y-1">
              {cash.committedItems.map((i, k) => (
                <li key={k} className="flex justify-between text-xs text-secondary">
                  <span>{i.date} · {i.description} <span className="opacity-70">({i.kind})</span></span>
                  <span>{formatCurrency(i.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <ul className="mt-3 space-y-1">
          {cash.explanation.map((e, i) => <li key={i} className="text-[11px] text-secondary">· {e}</li>)}
        </ul>
      </section>

      {/* Snapshot patrimoniali */}
      <section className="bg-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-primary mb-2">Snapshot patrimoniali</h2>
        <p className="text-[11px] text-secondary mb-3">
          Un documento per giorno (Europe/Rome), idempotente: rigenerare lo stesso giorno
          sovrascrive lo stesso snapshot. Il backfill non inventa controvalori storici.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={snapshotToday}
            className="px-4 py-2.5 min-h-[44px] rounded-xl glass-cta-gold text-sm font-semibold disabled:opacity-50">
            Genera snapshot di oggi
          </button>
          <button type="button" disabled={busy} onClick={dryRun}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-elevated text-sm font-medium text-primary disabled:opacity-50">
            Backfill (dry-run)
          </button>
        </div>
        {snapMsg && <p className="text-xs text-secondary mt-3" role="status">{snapMsg}</p>}
        {plan && (
          <div className="mt-3">
            <p className="text-xs text-secondary mb-2">
              Piano: {plan.length} mesi — {plan.filter(p => p.quality === 'real').length} reali,{' '}
              {plan.filter(p => p.quality === 'estimated').length} stimati,{' '}
              {plan.filter(p => p.quality === 'missing').length} mancanti. Nessuna scrittura eseguita.
            </p>
            <ul className="max-h-40 overflow-y-auto space-y-1 mb-3">
              {plan.map(p => (
                <li key={p.dateKey} className="flex justify-between text-xs text-secondary">
                  <span>{p.dateKey} · {p.quality}</span>
                  <span>{p.snapshot ? formatCurrency(p.snapshot.totalNetWorth) : '—'}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={applyPlan}
                className="px-4 py-2.5 min-h-[44px] rounded-xl glass-cta-gold text-sm font-semibold disabled:opacity-50">
                Applica backfill
              </button>
              <button type="button" disabled={busy} onClick={() => setPlan(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-elevated text-sm font-medium text-primary disabled:opacity-50">
                Annulla
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
