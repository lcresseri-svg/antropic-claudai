import {useUiVersion} from '../../shared/providers/UiVersionProvider';
// "Prossima mossa" — una sola cosa da fare, al posto del carosello di consigli.
// Il testo non è statico: arriva dal motore insight (`insightsEngine`), che è
// la stessa sorgente della schermata Consigli. Si prende il primo insight
// urgente, poi il primo `alert` / `forecast`, poi il primo disponibile.

import { Insight } from '../insights/insightsEngine';

interface Props {
  priorityCount?: number;
  insight: Insight;
  onSeeAll: () => void;
  /** Presente solo quando l'insight in evidenza parla di un'uscita già
   *  programmata: lì "e le altre?" è la domanda successiva naturale. Non è una
   *  riga fissa della home. */
  onSeeCommitments?: () => void;
}

/** L'insight che merita la home, in ordine di priorità. */
export function pickNextMove(insights: Insight[], actionableOnly = false): Insight | null {
  if (actionableOnly) return insights.find(i => i.urgent) ?? insights.find(i => i.category === 'alert') ?? null;
  return insights.find(i => i.urgent)
    ?? insights.find(i => i.category === 'alert' || i.category === 'forecast')
    ?? insights[0]
    ?? null;
}

export function NextMoveCard({ insight, onSeeAll, onSeeCommitments, priorityCount=1 }: Props) {
  const ui3=useUiVersion()==='3.0';
  return (
    <div className="accent-card rounded-[22px] shadow-elev-1 p-[18px] animate-rise-in"
      style={{ animationDelay: '0.24s' }}>
      <button type="button" onClick={onSeeAll} className="w-full text-left active:scale-[0.99] transition-transform">
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="w-[30px] h-[30px] rounded-[11px] bg-gold/[0.14] flex items-center justify-center text-sm flex-none">
          {insight.icon}
        </span>
        <p className="label-caps text-gold">{ui3?`Da rivedere${priorityCount>1?` · ${priorityCount}`:''}`:'Prossima mossa'}</p>
      </div>
      <p className="text-[15px] font-medium text-primary leading-[1.4]">{insight.title}</p>
      {!ui3 && <p className="mt-2 text-[12.5px] text-secondary leading-relaxed">{insight.detail}</p>}
      </button>
      {ui3 && <details className="liquid-balance-detail"><summary>Perché questa priorità</summary><p>{insight.detail}</p><button onClick={onSeeAll}>Vedi tutti i consigli ›</button></details>}
      {onSeeCommitments && (
        <button type="button" onClick={onSeeCommitments}
          className="mt-2.5 text-[12px] font-semibold text-gold">
          Tutti gli impegni del mese ›
        </button>
      )}
    </div>
  );
}
