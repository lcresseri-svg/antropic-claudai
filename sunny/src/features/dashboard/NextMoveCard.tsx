// "Prossima mossa" — una sola cosa da fare, al posto del carosello di consigli.
// Il testo non è statico: arriva dal motore insight (`insightsEngine`), che è
// la stessa sorgente della schermata Consigli. Si prende il primo insight
// urgente, poi il primo `alert` / `forecast`, poi il primo disponibile.

import { Insight } from '../insights/insightsEngine';

interface Props {
  insight: Insight;
  onSeeAll: () => void;
}

/** L'insight che merita la home, in ordine di priorità. */
export function pickNextMove(insights: Insight[]): Insight | null {
  return insights.find(i => i.urgent)
    ?? insights.find(i => i.category === 'alert' || i.category === 'forecast')
    ?? insights[0]
    ?? null;
}

export function NextMoveCard({ insight, onSeeAll }: Props) {
  return (
    <button type="button" onClick={onSeeAll}
      className="w-full text-left accent-card rounded-[22px] shadow-elev-1 p-[18px] animate-rise-in
                 active:scale-[0.99] transition-transform"
      style={{ animationDelay: '0.24s' }}>
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="w-[30px] h-[30px] rounded-[11px] bg-gold/[0.14] flex items-center justify-center text-sm flex-none">
          {insight.icon}
        </span>
        <p className="label-caps text-gold">Prossima mossa</p>
      </div>
      <p className="text-[15px] font-medium text-primary leading-[1.4]">{insight.title}</p>
      <p className="mt-2 text-[12.5px] text-secondary leading-relaxed">{insight.detail}</p>
    </button>
  );
}
