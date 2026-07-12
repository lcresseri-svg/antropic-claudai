import { describe, it, expect } from 'vitest';
import { Insight } from './insightsEngine';
import { rankInsights, topInsight, classifyDomain } from './insightRankingV2';

const ins = (over: Partial<Insight>): Insight => ({
  icon: '✦', title: 'Titolo', detail: 'Dettaglio', accent: '#fff',
  tone: 'neutral', category: 'habit', ...over,
});

describe('rankInsights', () => {
  it('urgent alerts outrank habits and highlights', () => {
    const ranked = rankInsights([
      ins({ title: 'Abitudine', category: 'habit' }),
      ins({ title: 'Pagamento in scadenza', category: 'alert', urgent: true }),
      ins({ title: 'Curiosità', category: 'highlight' }),
    ]);
    expect(ranked[0].insight.title).toBe('Pagamento in scadenza');
    expect(ranked[0].total).toBeGreaterThan(ranked[1].total);
    expect(ranked[ranked.length - 1].insight.category).toBe('highlight');
  });

  it('deduplicates families and identical titles (no contradictions)', () => {
    const ranked = rankInsights([
      ins({ title: 'Proiezione A', category: 'forecast', _family: 'eom-projection' }),
      ins({ title: 'Proiezione B', category: 'forecast', _family: 'eom-projection' }),
      ins({ title: 'Doppione', category: 'trend' }),
      ins({ title: 'Doppione', category: 'trend' }),
    ]);
    expect(ranked.filter(r => r.insight._family === 'eom-projection')).toHaveLength(1);
    expect(ranked.filter(r => r.insight.title === 'Doppione')).toHaveLength(1);
  });

  it('novelty: seen titles rank below unseen ones (same insight otherwise)', () => {
    const a = ins({ title: 'Già visto', category: 'trend' });
    const b = ins({ title: 'Nuovo', category: 'trend' });
    const ranked = rankInsights([a, b], { seenTitles: new Set(['Già visto']) });
    expect(ranked[0].insight.title).toBe('Nuovo');
  });

  it('scores are deterministic and coarse (no false precision)', () => {
    const one = rankInsights([ins({ title: 'X', category: 'forecast', urgent: false })]);
    const two = rankInsights([ins({ title: 'X', category: 'forecast', urgent: false })]);
    expect(one[0].total).toBe(two[0].total);
    expect(one[0].total).toBe(Math.round(one[0].total * 10) / 10);
  });
});

describe('classifyDomain', () => {
  it('maps insights onto the six engine domains', () => {
    expect(classifyDomain(ins({ title: 'Quota investita in ETF' }))).toBe('investimenti');
    expect(classifyDomain(ins({ title: 'Patrimonio in crescita' }))).toBe('patrimonio');
    expect(classifyDomain(ins({ title: 'Abbonamenti in aumento' }))).toBe('ricorrenti');
    expect(classifyDomain(ins({ title: 'Budget di spesa superato' }))).toBe('budget');
    expect(classifyDomain(ins({ title: 'Ricordati di registrare le spese' }))).toBe('qualita_dati');
    expect(classifyDomain(ins({ title: 'Uscite sopra la media' }))).toBe('cashflow');
  });
});

describe('topInsight', () => {
  it('returns exactly one prioritized insight for the home, or null', () => {
    expect(topInsight([])).toBeNull();
    const top = topInsight([
      ins({ title: 'B', category: 'trend' }),
      ins({ title: 'A', category: 'alert', urgent: true }),
    ]);
    expect(top!.insight.title).toBe('A');
  });
});
