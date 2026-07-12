// Decision Coach (admin-only, flag `decision_coach`): confronto deterministico
// fra acquisto immediato, riduzione spese e rinvio. I numeri vengono SOLO dal
// modulo puro decisionCoach.ts sui dati locali — l'AI (card sottostante) li
// spiega ma non li produce.
import { useMemo, useState } from 'react';
import { Transaction } from '../../types';
import { formatCurrency } from '../../utils';
import { medianMonthlyFlowV3 } from '../forecast/forecastEngineV3';
import { computeAvailableCash, medianMonthlyExpenses } from '../wealth/availableCash';
import { evaluatePurchase, DecisionScenario } from './decisionCoach';

interface Props {
  itemName: string;
  cost: number;
  transactions: Transaction[];
  liquidity: number;
  savingsTarget: number;
}

const RISK_STYLE: Record<DecisionScenario['risk'], string> = {
  basso: 'bg-green/15 text-green',
  medio: 'bg-gold/15 text-gold',
  alto: 'bg-[#E08B8B]/15 text-[#E08B8B]',
};

export function DecisionCoachPanel({ itemName, cost, transactions, liquidity, savingsTarget }: Props) {
  const [reserve, setReserve] = useState(500);
  const now = useMemo(() => new Date(), []);
  const todayISO = now.toISOString().slice(0, 10);

  const analysis = useMemo(() => {
    const medExpenses = medianMonthlyExpenses(transactions, todayISO);
    const medIncome = medianMonthlyFlowV3(transactions, 'income', now);
    const medInvest = medianMonthlyFlowV3(transactions, 'investment', now);
    const committed = computeAvailableCash({ transactions, liquidity, horizon: 30, reserve: 0, now }).committed;
    const monthlySavings = Math.round(medIncome - (medExpenses ?? 0) - medInvest);
    return evaluatePurchase({
      itemName,
      cost,
      liquidity,
      reserve,
      monthlySavings,
      upcomingCommitted30d: committed,
      medianMonthlyExpenses: medExpenses,
      savingsTarget,
      // Conservative, deterministic cut assumption: 15% of the median monthly
      // expenses can realistically be redirected to the purchase.
      monthlyCutPotential: medExpenses != null ? Math.round(medExpenses * 0.15) : 0,
    });
  }, [itemName, cost, transactions, liquidity, reserve, savingsTarget, now, todayISO]);

  return (
    <section className="rounded-2xl bg-card border border-divider px-5 py-5" aria-label="Confronto scenari">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-primary">Scenari a confronto (deterministici)</h2>
        <label className="text-[11px] text-secondary flex items-center gap-1.5">
          Riserva
          <input type="number" min={0} step={50} value={reserve}
            onChange={e => setReserve(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 bg-elevated rounded-lg px-2 py-1 text-right text-primary text-xs" />
        </label>
      </div>
      <p className="text-[11px] text-secondary mb-3">
        Calcolo locale sui tuoi dati — l'AI qui sotto spiega, non decide.
      </p>
      <div className="space-y-2.5">
        {analysis.scenarios.map(s => (
          <div key={s.kind} className={`rounded-xl bg-elevated p-3 ${analysis.recommended === s.kind ? 'ring-1 ring-gold/40' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-primary">
                {s.label}
                {analysis.recommended === s.kind && <span className="ml-2 text-[10px] text-gold font-semibold">consigliato</span>}
              </p>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${RISK_STYLE[s.risk]}`}>rischio {s.risk}</span>
            </div>
            <p className="text-[11px] text-secondary mt-1">
              Liquidità residua {formatCurrency(s.residualLiquidity)}
              {' · '}riserva {s.reserveIntact ? 'intatta' : 'intaccata'}
              {s.autonomyMonthsAfter != null && <> · autonomia ~{s.autonomyMonthsAfter.toLocaleString('it-IT')} mesi</>}
              {s.monthsToPurchase != null && s.monthsToPurchase > 0 && <> · acquisto fra ~{s.monthsToPurchase} mesi</>}
              {s.savingsGoalImpact < 0 && <> · obiettivo risparmio {formatCurrency(s.savingsGoalImpact)}</>}
            </p>
            {s.notes.map((n, i) => <p key={i} className="text-[11px] text-secondary mt-0.5">· {n}</p>)}
          </div>
        ))}
      </div>
      {analysis.missingData.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {analysis.missingData.map((m, i) => <li key={i} className="text-[11px] text-secondary">⚠ {m}</li>)}
        </ul>
      )}
    </section>
  );
}
